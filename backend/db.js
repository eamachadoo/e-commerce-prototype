const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'store.db');
const db = new sqlite3.Database(dbPath);

function initDb() {
  db.serialize(() => {
    // Create items table (products in your store)
    db.run(`
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Create cart_items table (what users add to cart)
    // Note: item_id stores external product IDs (from Jumpseller). We don't enforce a foreign key here
    // because products are sourced from the external API.
    db.run(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL
      )
    `);

    // Seed sample data if table is empty
    db.get('SELECT COUNT(1) as count FROM items', (err, row) => {
      if (err) return console.error('initDb count error:', err);
      if (row && row.count === 0) {
        const stmt = db.prepare('INSERT INTO items (name, price, stock) VALUES (?, ?, ?)');
        const sample = [
          ['T-shirt', 1999, 10],         // $19.99
          ['Mug', 1299, 5],              // $12.99
          ['Sticker Pack', 499, 50],     // $4.99
          ['Laptop', 99999, 3],          // $999.99
          ['Phone Case', 2499, 20]       // $24.99
        ];
        sample.forEach(s => stmt.run(s[0], s[1], s[2]));
        stmt.finalize();
        console.log('Seeded items table');
      }
    });
  });
}

// Upsert a product payload from Jumpseller into the local `items` table.
// Strategy: try to match by `external_id` (if present) or `name`. If not found, insert.
function upsertProductFromJumpseller(product) {
  return new Promise((resolve, reject) => {
    const { id: externalId, title: name, price, stock } = product;
    // Normalize price: Jumpseller may send cents or float; expect cents integer or a number
    const priceInt = Number.isInteger(price) ? price : Math.round((price || 0) * 100);

    // If the table doesn't have external_id column, fallback to matching by name.
    db.get("PRAGMA table_info(items)", (pragmaErr) => {
      // Try simple upsert by name
      db.get('SELECT id FROM items WHERE name = ?', [name], (gErr, row) => {
        if (gErr) return reject(gErr);
        if (row) {
          db.run('UPDATE items SET price = ?, stock = ? WHERE id = ?', [priceInt, stock || 0, row.id], function (uErr) {
            if (uErr) return reject(uErr);
            return resolve({ updated: true, id: row.id });
          });
        } else {
          db.run('INSERT INTO items (name, price, stock) VALUES (?, ?, ?)', [name, priceInt, stock || 0], function (iErr) {
            if (iErr) return reject(iErr);
            return resolve({ inserted: true, id: this.lastID });
          });
        }
      });
    });
  });
}

module.exports = { db, initDb, upsertProductFromJumpseller };