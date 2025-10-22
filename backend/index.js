const express = require('express');
const cors = require('cors');
const { db, initDb } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize database when server starts
initDb();

// Utility function to format item data
function toItem(row) {
  return { id: row.id, name: row.name, price: row.price, stock: row.stock };
}

// GET /api/items - Get all products
app.get('/api/items', (req, res) => {
  db.all('SELECT id, name, price, stock FROM items', (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(rows.map(toItem));
  });
});

// GET /api/cart - Get cart summary with totals
app.get('/api/cart', (req, res) => {
  const sql = `
    SELECT ci.item_id as id, i.name, i.price, ci.quantity
    FROM cart_items ci
    JOIN items i ON i.id = ci.item_id
  `;
  db.all(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    const items = rows.map(r => ({
      id: r.id,
      name: r.name,
      unitPrice: r.price,
      quantity: r.quantity,
      lineTotal: r.price * r.quantity
    }));
    const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
    // Simple shipping & discount logic for demo
    const shipping = subtotal > 5000 || subtotal === 0 ? 0 : 500; // Free shipping over $50
    const discount = subtotal >= 10000 ? Math.round(subtotal * 0.1) : 0; // 10% off over $100
    const total = subtotal + shipping - discount;
    res.json({ items, subtotal, shipping, discount, total });
  });
});

// POST /api/cart - Add item to cart
app.post('/api/cart', (req, res) => {
  const { itemId, quantity } = req.body;
  if (!itemId || !Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: 'Invalid payload. Provide itemId and quantity >= 1.' });
  }

  // Check if item exists and has enough stock
  db.get('SELECT stock FROM items WHERE id = ?', [itemId], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Item not found' });
    if (quantity > row.stock) {
      return res.status(409).json({ error: 'Insufficient stock', actionable: `Only ${row.stock} left in stock` });
    }

    // Check if item already in cart
    db.get('SELECT id, quantity FROM cart_items WHERE item_id = ?', [itemId], (err2, existing) => {
      if (err2) return res.status(500).json({ error: 'DB error' });
      if (existing) {
        // Update existing cart item
        const newQty = existing.quantity + quantity;
        if (newQty > row.stock) {
          return res.status(409).json({ error: 'Insufficient stock for requested total quantity', actionable: `Max available: ${row.stock}` });
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
  });
});

// PUT /api/cart/:itemId - Update item quantity in cart
app.put('/api/cart/:itemId', (req, res) => {
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

  // Check stock availability
  db.get('SELECT stock FROM items WHERE id = ?', [itemId], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Item not found' });
    if (quantity > row.stock) {
      return res.status(409).json({ error: 'Insufficient stock', actionable: `Only ${row.stock} left in stock` });
    }
    db.run('UPDATE cart_items SET quantity = ? WHERE item_id = ?', [quantity, itemId], function (uerr) {
      if (uerr) return res.status(500).json({ error: 'DB error' });
      return res.json({ success: true });
    });
  });
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
app.post('/api/checkout', (req, res) => {
  const { address } = req.body;
  if (!address || !address.line1) {
    return res.status(400).json({ error: 'Invalid address', actionable: 'Provide a valid shipping address' });
  }

  // Get all cart items with stock info
  const sql = `
    SELECT ci.item_id as id, ci.quantity, i.stock, i.name
    FROM cart_items ci
    JOIN items i ON i.id = ci.item_id
  `;
  db.all(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Empty cart', actionable: 'Add items to cart before checkout' });
    }
    
    // Check for stock issues
    const problems = rows.filter(r => r.quantity > r.stock).map(r => ({
      itemId: r.id,
      name: r.name,
      requested: r.quantity,
      available: r.stock,
      actionable: `Reduce quantity to ${r.stock} or remove item`
    }));
    if (problems.length > 0) {
      return res.status(409).json({ error: 'Stock issues', details: problems });
    }

    // Process order: deduct stock and clear cart
    db.serialize(() => {
      const updateStmt = db.prepare('UPDATE items SET stock = stock - ? WHERE id = ?');
      rows.forEach(r => updateStmt.run(r.quantity, r.id));
      updateStmt.finalize(err2 => {
        if (err2) return res.status(500).json({ error: 'DB error during stock update' });
        db.run('DELETE FROM cart_items', dErr => {
          if (dErr) return res.status(500).json({ error: 'DB error clearing cart' });
          return res.json({ success: true, message: 'Order confirmed' });
        });
      });
    });
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend listening on ${PORT}`);
});