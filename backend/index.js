require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { db, initDb } = require('./db');
const productService = require('./productService');

const app = express();
app.use(cors());
app.use(express.json());

// Webhooks (mounted after json/raw middleware as needed)
const webhooksRouter = require('./src/routes/webhooks');
app.use('/api/webhooks', webhooksRouter);

// Also mount a direct webhook endpoint for reliability in this branch (raw JSON body)
const { upsertProductFromJumpseller } = require('./db');
const { publish } = require('./events/pubsubPublisher');
const { validateHmac } = require('./src/lib/hmac');

app.post('/api/webhooks/jumpseller', express.raw({ type: '*/*' }), async (req, res) => {
  const raw = req.body;
  const sig = req.get('X-Jumpseller-Signature') || req.get('X-Hub-Signature') || req.get('X-Signature');
  const secret = process.env.JUMPSELLER_SECRET;

  if (secret) {
    const ok = validateHmac(raw, secret, sig);
    if (!ok) return res.status(401).json({ error: 'invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    return res.status(400).json({ error: 'invalid json' });
  }

  try {
    const product = payload.product || payload;
    await upsertProductFromJumpseller(product);
    await publish(process.env.PUBSUB_TOPIC_PRODUCT_UPDATES || 'product_updates', product);
    return res.status(204).end();
  } catch (err) {
    console.error('Webhook handling error (index):', err);
    return res.status(500).json({ error: 'failed to process webhook' });
  }
});

// Initialize database when server starts
initDb();

// Note: this backend uses the external product API (Jumpseller) as the single source of truth
// for product data. Cart storage keeps item_id and quantity, but product details are always
// fetched from the product service.
// Utility function to format item data
function toItem(row) {
  return { id: row.id, name: row.name, price: row.price, stock: row.stock };
}

// GET /api/items - Get all products
app.get('/api/items', async (req, res) => {
  try {
    // Fetch from Jumpseller API (single source of truth)
    const apiProducts = await productService.getProducts();
    if (!apiProducts) {
      return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });
    }
    return res.json(apiProducts);
  } catch (error) {
    console.error('Error in /api/items:', error);
    res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });
  }
});

// GET /api/cart - Get cart summary with totals
app.get('/api/cart', async (req, res) => {
  try {
    // Get cart items from database
    db.all('SELECT item_id, quantity FROM cart_items', async (err, cartRows) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      
      if (cartRows.length === 0) {
        return res.json({ items: [], subtotal: 0, shipping: 0, discount: 0, total: 0 });
      }
      
      // Get product details from ProductService (strict: API only)
      let products = null;
      try {
        products = await productService.getProducts();
      } catch (e) {
        console.error('Product service error in /api/cart:', e.message || e);
        return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });
      }

      if (!products) {
        return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });
      }

      // Ensure all cart item ids exist in API response
      const missing = cartRows.map(r => r.item_id).filter(id => !products.some(p => p.id === id));
      if (missing.length > 0) {
        return res.status(400).json({ error: 'Some cart items are not available in product service', missing });
      }

      const items = cartRows.map(cartItem => {
        const product = products.find(p => p.id === cartItem.item_id);
        return {
          id: product.id,
          name: product.name,
          unitPrice: product.price,
          quantity: cartItem.quantity,
          lineTotal: product.price * cartItem.quantity
        };
      });
      
      const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
      // Simple shipping & discount logic for demo
      const shipping = subtotal > 5000 || subtotal === 0 ? 0 : 500; // Free shipping over $50
      const discount = subtotal >= 10000 ? Math.round(subtotal * 0.1) : 0; // 10% off over $100
      const total = subtotal + shipping - discount;
      res.json({ items, subtotal, shipping, discount, total });
    });
  } catch (error) {
    console.error('Error in /api/cart:', error);
    res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// POST /api/cart - Add item to cart
app.post('/api/cart', async (req, res) => {
  const { itemId, quantity } = req.body;
  if (!itemId || !Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: 'Invalid payload. Provide itemId and quantity >= 1.' });
  }

  try {
    // Strictly use ProductService for product validation
    let products;
    try {
      products = await productService.getProducts();
    } catch (e) {
      console.error('Product service error in POST /api/cart:', e.message || e);
      return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });
    }

    if (!products) {
      return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });
    }

    const item = products.find(p => p.id === itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (quantity > item.stock) {
      return res.status(409).json({ error: 'Insufficient stock', actionable: `Only ${item.stock} left in stock` });
    }

    // Check if item already in cart
    db.get('SELECT id, quantity FROM cart_items WHERE item_id = ?', [itemId], (err2, existing) => {
      if (err2) return res.status(500).json({ error: 'DB error' });
      if (existing) {
        // Update existing cart item
        const newQty = existing.quantity + quantity;
        if (newQty > item.stock) {
          return res.status(409).json({ error: 'Insufficient stock for requested total quantity', actionable: `Max available: ${item.stock}` });
        }
        db.run('UPDATE cart_items SET quantity = ? WHERE id = ?', [newQty, existing.id], function (uerr) {
          if (uerr) return res.status(500).json({ error: 'DB error' });
          return res.json({ success: true });
        });
      } else {
        // Add new cart item
        db.run('INSERT INTO cart_items (item_id, quantity) VALUES (?, ?)', [itemId, quantity], function (ierr) {
          if (ierr) return res.status(500).json({ error: 'DB error' });
          return res.json({ success: true });
        });
      }
    });
  } catch (error) {
    console.error('Error in addToCart:', error);
    return res.status(500).json({ error: 'Failed to add item to cart' });
  }
});

// PUT /api/cart/:itemId - Update item quantity in cart
app.put('/api/cart/:itemId', async (req, res) => {
  const itemId = Number(req.params.itemId);
  const { quantity } = req.body;
  if (!Number.isInteger(quantity) || quantity < 0) {
    return res.status(400).json({ error: 'Invalid quantity' });
  }
  if (quantity === 0) {
    // Remove item if quantity is 0
    return db.run('DELETE FROM cart_items WHERE item_id = ?', [itemId], function (dErr) {
      if (dErr) return res.status(500).json({ error: 'DB error' });
      return res.json({ success: true });
    });
  }

  try {
    // Strictly use ProductService for product validation
    let products;
    try {
      products = await productService.getProducts();
    } catch (e) {
      console.error('Product service error in PUT /api/cart/:itemId:', e.message || e);
      return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });
    }

    if (!products) {
      return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });
    }

    const item = products.find(p => p.id === itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (quantity > item.stock) {
      return res.status(409).json({ error: 'Insufficient stock', actionable: `Only ${item.stock} left in stock` });
    }

    db.run('UPDATE cart_items SET quantity = ? WHERE item_id = ?', [quantity, itemId], function (uerr) {
      if (uerr) return res.status(500).json({ error: 'DB error' });
      return res.json({ success: true });
    });
  } catch (error) {
    console.error('Error in updateCartItem:', error);
    return res.status(500).json({ error: 'Failed to update cart item' });
  }
});

// DELETE /api/cart/:itemId - Remove item from cart
app.delete('/api/cart/:itemId', (req, res) => {
  const itemId = Number(req.params.itemId);
  db.run('DELETE FROM cart_items WHERE item_id = ?', [itemId], function (err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    return res.json({ success: true });
  });
});

// POST /api/checkout - Process checkout with validation
app.post('/api/checkout', async (req, res) => {
  const { address } = req.body;
  if (!address || !address.line1) {
    return res.status(400).json({ error: 'Invalid address', actionable: 'Provide a valid shipping address' });
  }

  try {
    // Get all cart items
    db.all('SELECT item_id, quantity FROM cart_items', async (err, cartRows) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      if (cartRows.length === 0) {
        return res.status(400).json({ error: 'Empty cart', actionable: 'Add items to cart before checkout' });
      }
      
      // Strictly get product details from ProductService
      let products;
      try {
        products = await productService.getProducts();
      } catch (e) {
        console.error('Product service error in checkout:', e.message || e);
        return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });
      }

      if (!products) {
        return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });
      }

      const missing = cartRows.map(r => r.item_id).filter(id => !products.some(p => p.id === id));
      if (missing.length > 0) {
        return res.status(400).json({ error: 'Some cart items are not available in product service', missing });
      }

      const cartWithProducts = cartRows.map(cartItem => {
        const product = products.find(p => p.id === cartItem.item_id);
        return {
          id: cartItem.item_id,
          quantity: cartItem.quantity,
          name: product ? product.name : 'Unknown Product',
          stock: product ? product.stock : 0
        };
      });
      
      // Check for stock issues
      const problems = cartWithProducts.filter(r => r.quantity > r.stock).map(r => ({
        itemId: r.id,
        name: r.name,
        requested: r.quantity,
        available: r.stock,
        actionable: `Reduce quantity to ${r.stock} or remove item`
      }));
      
      if (problems.length > 0) {
        return res.status(409).json({ error: 'Stock issues', details: problems });
      }

      // For demo purposes, just clear the cart (since we can't actually update Jumpseller stock)
      db.run('DELETE FROM cart_items', dErr => {
        if (dErr) return res.status(500).json({ error: 'DB error clearing cart' });
        return res.json({ success: true, message: 'Order confirmed' });
      });
    });
  } catch (error) {
    console.error('Error in checkout:', error);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend listening on ${PORT}`);
  });
}

module.exports = app;