const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const productService = require('../../productService');
const pgdb = require('../db');

// Helper: simple user scoping for demo (single user)
const DEFAULT_USER = 'user1';

function cents(n) {
  return Number(n) || 0;
}

// GET /api/cart -> summary
router.get('/', async (req, res) => {
  try {
    if (pgdb && pgdb.pool) {
      // Postgres path
      const userId = DEFAULT_USER;
      const cartRes = await pgdb.query('SELECT id, user_id, total_price_cents, currency FROM carts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [userId]);
      if (!cartRes.rows || cartRes.rows.length === 0) {
        return res.json({ items: [], subtotal: 0, shipping: 0, discount: 0, total: 0 });
      }
      const cart = cartRes.rows[0];
      const itemsRes = await pgdb.query('SELECT product_id, sku, name, unit_price_cents, quantity FROM cart_items WHERE cart_id = $1', [cart.id]);
      const cartRows = itemsRes.rows || [];

      // Fetch live product info for validation
      let products = null;
      try { products = await productService.getProducts(); } catch (e) { products = null; }
      if (!products) return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });

      const missing = cartRows.map(r => r.product_id).filter(id => !products.some(p => String(p.id) === String(id)));
      if (missing.length > 0) return res.status(400).json({ error: 'Some cart items are not available in product service', missing });

      const items = cartRows.map(ci => {
        const product = products.find(p => String(p.id) === String(ci.product_id));
        const unit = ci.unit_price_cents || (product ? product.price : 0);
        return {
          id: ci.product_id,
          name: ci.name || (product && product.name) || 'Unknown',
          unitPrice: cents(unit),
          quantity: ci.quantity,
          lineTotal: cents(unit) * ci.quantity
        };
      });

      const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
      const shipping = subtotal > 5000 || subtotal === 0 ? 0 : 500;
      const discount = subtotal >= 10000 ? Math.round(subtotal * 0.1) : 0;
      const total = subtotal + shipping - discount;
      return res.json({ items, subtotal, shipping, discount, total });
    }

    // Fallback: sqlite implementation (legacy db)
    const legacy = require('../../db');
    legacy.db.all('SELECT item_id, quantity FROM cart_items', async (err, cartRows) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      if (!cartRows || cartRows.length === 0) return res.json({ items: [], subtotal: 0, shipping: 0, discount: 0, total: 0 });
      let products = null;
      try { products = await productService.getProducts(); } catch (e) { products = null; }
      if (!products) return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });
      const missing = cartRows.map(r => r.item_id).filter(id => !products.some(p => p.id === id));
      if (missing.length > 0) return res.status(400).json({ error: 'Some cart items are not available in product service', missing });
      const items = cartRows.map(cartItem => {
        const product = products.find(p => p.id === cartItem.item_id);
        const unit = product ? product.price : 0;
        return { id: product.id, name: product.name, unitPrice: unit, quantity: cartItem.quantity, lineTotal: unit * cartItem.quantity };
      });
      const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
      const shipping = subtotal > 5000 || subtotal === 0 ? 0 : 500;
      const discount = subtotal >= 10000 ? Math.round(subtotal * 0.1) : 0;
      const total = subtotal + shipping - discount;
      return res.json({ items, subtotal, shipping, discount, total });
    });
  } catch (err) {
    console.error('Error in cart GET:', err);
    return res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// POST /api/cart -> add item
router.post('/', async (req, res) => {
  const { itemId, quantity } = req.body;
  if (!itemId || !Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: 'Invalid payload. Provide itemId and quantity >= 1.' });

  try {
    let products;
    try { products = await productService.getProducts(); } catch (e) { products = null; }
    if (!products) return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });
    const product = products.find(p => String(p.id) === String(itemId));
    if (!product) return res.status(404).json({ error: 'Item not found' });
    if (quantity > product.stock) return res.status(409).json({ error: 'Insufficient stock', actionable: `Only ${product.stock} left in stock` });

    if (pgdb && pgdb.pool) {
      // get or create cart
      const userId = DEFAULT_USER;
      let cart = await pgdb.query('SELECT id FROM carts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [userId]);
      let cartId;
      if (!cart.rows || cart.rows.length === 0) {
        cartId = crypto.randomUUID();
        await pgdb.query('INSERT INTO carts (id, user_id, total_price_cents, currency, updated_at) VALUES ($1,$2,$3,$4,now())', [cartId, userId, 0, 'EUR']);
      } else {
        cartId = cart.rows[0].id;
      }

      // check existing item
      const existing = await pgdb.query('SELECT id, quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2', [cartId, String(itemId)]);
      if (existing.rows && existing.rows.length > 0) {
        const newQty = existing.rows[0].quantity + quantity;
        if (newQty > product.stock) return res.status(409).json({ error: 'Insufficient stock for requested total quantity', actionable: `Max available: ${product.stock}` });
        await pgdb.query('UPDATE cart_items SET quantity = $1 WHERE id = $2', [newQty, existing.rows[0].id]);
        return res.json({ success: true });
      }

      const itemIdUuid = crypto.randomUUID();
      const unitPrice = Number.isInteger(product.price) ? product.price : Math.round((product.price || 0) * 100);
      await pgdb.query('INSERT INTO cart_items (id, cart_id, product_id, sku, name, unit_price_cents, quantity, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [itemIdUuid, cartId, String(itemId), product.sku || null, product.name || null, unitPrice, quantity, null]);
      return res.json({ success: true });
    }

    // sqlite fallback
    const legacy = require('../../db');
    legacy.db.get('SELECT id, quantity FROM cart_items WHERE item_id = ?', [itemId], (err, existing) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      if (existing) {
        const newQty = existing.quantity + quantity;
        if (newQty > product.stock) return res.status(409).json({ error: 'Insufficient stock for requested total quantity', actionable: `Max available: ${product.stock}` });
        legacy.db.run('UPDATE cart_items SET quantity = ? WHERE id = ?', [newQty, existing.id], function (uerr) {
          if (uerr) return res.status(500).json({ error: 'DB error' });
          return res.json({ success: true });
        });
      } else {
        legacy.db.run('INSERT INTO cart_items (item_id, quantity) VALUES (?, ?)', [itemId, quantity], function (ierr) {
          if (ierr) return res.status(500).json({ error: 'DB error' });
          return res.json({ success: true });
        });
      }
    });
  } catch (err) {
    console.error('Error in cart POST:', err);
    return res.status(500).json({ error: 'Failed to add item to cart' });
  }
});

// PUT /api/cart/:itemId -> update quantity
router.put('/:itemId', async (req, res) => {
  const itemId = req.params.itemId;
  const { quantity } = req.body;
  if (!Number.isInteger(quantity) || quantity < 0) return res.status(400).json({ error: 'Invalid quantity' });
  if (quantity === 0) {
    if (pgdb && pgdb.pool) {
      const userId = DEFAULT_USER;
      const cartRes = await pgdb.query('SELECT id FROM carts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [userId]);
      if (!cartRes.rows || cartRes.rows.length === 0) return res.json({ success: true });
      const cartId = cartRes.rows[0].id;
      await pgdb.query('DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2', [cartId, String(itemId)]);
      return res.json({ success: true });
    }
    const legacy = require('../../db');
    return legacy.db.run('DELETE FROM cart_items WHERE item_id = ?', [itemId], function (dErr) {
      if (dErr) return res.status(500).json({ error: 'DB error' });
      return res.json({ success: true });
    });
  }

  try {
    let products;
    try { products = await productService.getProducts(); } catch (e) { products = null; }
    if (!products) return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });
    const product = products.find(p => String(p.id) === String(itemId));
    if (!product) return res.status(404).json({ error: 'Item not found' });
    if (quantity > product.stock) return res.status(409).json({ error: 'Insufficient stock', actionable: `Only ${product.stock} left in stock` });

    if (pgdb && pgdb.pool) {
      const userId = DEFAULT_USER;
      const cartRes = await pgdb.query('SELECT id FROM carts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [userId]);
      if (!cartRes.rows || cartRes.rows.length === 0) return res.status(404).json({ error: 'Cart not found' });
      const cartId = cartRes.rows[0].id;
      await pgdb.query('UPDATE cart_items SET quantity = $1 WHERE cart_id = $2 AND product_id = $3', [quantity, cartId, String(itemId)]);
      return res.json({ success: true });
    }

    const legacy = require('../../db');
    legacy.db.run('UPDATE cart_items SET quantity = ? WHERE item_id = ?', [quantity, itemId], function (uerr) {
      if (uerr) return res.status(500).json({ error: 'DB error' });
      return res.json({ success: true });
    });
  } catch (err) {
    console.error('Error in cart PUT:', err);
    return res.status(500).json({ error: 'Failed to update cart item' });
  }
});

// DELETE /api/cart/:itemId
router.delete('/:itemId', async (req, res) => {
  const itemId = req.params.itemId;
  try {
    if (pgdb && pgdb.pool) {
      const userId = DEFAULT_USER;
      const cartRes = await pgdb.query('SELECT id FROM carts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [userId]);
      if (!cartRes.rows || cartRes.rows.length === 0) return res.json({ success: true });
      const cartId = cartRes.rows[0].id;
      await pgdb.query('DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2', [cartId, String(itemId)]);
      return res.json({ success: true });
    }
    const legacy = require('../../db');
    legacy.db.run('DELETE FROM cart_items WHERE item_id = ?', [itemId], function (err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      return res.json({ success: true });
    });
  } catch (err) {
    console.error('Error in cart DELETE:', err);
    return res.status(500).json({ error: 'Failed to remove cart item' });
  }
});

// POST /api/cart/checkout
router.post('/checkout', async (req, res) => {
  const { address } = req.body;
  if (!address || !address.line1) return res.status(400).json({ error: 'Invalid address', actionable: 'Provide a valid shipping address' });

  try {
    if (pgdb && pgdb.pool) {
      const userId = DEFAULT_USER;
      const cartRes = await pgdb.query('SELECT id FROM carts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [userId]);
      if (!cartRes.rows || cartRes.rows.length === 0) return res.status(400).json({ error: 'Empty cart', actionable: 'Add items to cart before checkout' });
      const cartId = cartRes.rows[0].id;
      const itemsRes = await pgdb.query('SELECT product_id, quantity FROM cart_items WHERE cart_id = $1', [cartId]);
      const cartRows = itemsRes.rows || [];
      if (cartRows.length === 0) return res.status(400).json({ error: 'Empty cart', actionable: 'Add items to cart before checkout' });

      let products;
      try { products = await productService.getProducts(); } catch (e) { products = null; }
      if (!products) return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });

      const missing = cartRows.map(r => r.product_id).filter(id => !products.some(p => String(p.id) === String(id)));
      if (missing.length > 0) return res.status(400).json({ error: 'Some cart items are not available in product service', missing });

      const cartWithProducts = cartRows.map(cartItem => {
        const product = products.find(p => String(p.id) === String(cartItem.product_id));
        return { id: cartItem.product_id, quantity: cartItem.quantity, name: product ? product.name : 'Unknown Product', stock: product ? product.stock : 0 };
      });

      const problems = cartWithProducts.filter(r => r.quantity > r.stock).map(r => ({ itemId: r.id, name: r.name, requested: r.quantity, available: r.stock, actionable: `Reduce quantity to ${r.stock} or remove item` }));
      if (problems.length > 0) return res.status(409).json({ error: 'Stock issues', details: problems });

      await pgdb.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
      return res.json({ success: true, message: 'Order confirmed' });
    }

    // sqlite fallback
    const legacy = require('../../db');
    legacy.db.all('SELECT item_id, quantity FROM cart_items', async (err, cartRows) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      if (!cartRows || cartRows.length === 0) return res.status(400).json({ error: 'Empty cart', actionable: 'Add items to cart before checkout' });
      let products;
      try { products = await productService.getProducts(); } catch (e) { products = null; }
      if (!products) return res.status(503).json({ error: 'Product service unavailable', actionable: 'Try again later' });
      const missing = cartRows.map(r => r.item_id).filter(id => !products.some(p => p.id === id));
      if (missing.length > 0) return res.status(400).json({ error: 'Some cart items are not available in product service', missing });
      const cartWithProducts = cartRows.map(cartItem => {
        const product = products.find(p => p.id === cartItem.item_id);
        return { id: cartItem.item_id, quantity: cartItem.quantity, name: product ? product.name : 'Unknown Product', stock: product ? product.stock : 0 };
      });
      const problems = cartWithProducts.filter(r => r.quantity > r.stock).map(r => ({ itemId: r.id, name: r.name, requested: r.quantity, available: r.stock, actionable: `Reduce quantity to ${r.stock} or remove item` }));
      if (problems.length > 0) return res.status(409).json({ error: 'Stock issues', details: problems });
      legacy.db.run('DELETE FROM cart_items', dErr => {
        if (dErr) return res.status(500).json({ error: 'DB error clearing cart' });
        return res.json({ success: true, message: 'Order confirmed' });
      });
    });
  } catch (err) {
    console.error('Error in checkout:', err);
    return res.status(500).json({ error: 'Checkout failed' });
  }
});

module.exports = router;
