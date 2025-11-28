const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'store.db');
const db = new sqlite3.Database(dbPath);
function initDb() {
  // Set a busy timeout to reduce transient IO errors when tests delete/create the DB concurrently
  if (typeof db.configure === 'function') {
    try { db.configure('busyTimeout', 5000); } catch (e) { /* ignore if not supported */ }
  }

  const createItemsSql = `
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0
      )
    `;

  const createCartItemsSql = `
      CREATE TABLE IF NOT EXISTS cart_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL
      )
    `;

  db.serialize(() => {
    db.run(createItemsSql, (err) => {
      if (err) console.error('initDb create items error:', err);
    });

    db.run(createCartItemsSql, (err) => {
      if (err) console.error('initDb create cart_items error:', err);
    });

    // Check that table exists; if SELECT fails, retry creation once more to handle races from tests.
    db.get('SELECT COUNT(1) as count FROM items', (err, row) => {
      if (err) {
        console.error('initDb count error:', err);
        // Attempt one retry to create tables and re-run the count
        db.run(createItemsSql, (err2) => {
          if (err2) return console.error('initDb retry create items failed:', err2);
          db.run(createCartItemsSql, (err3) => {
            if (err3) return console.error('initDb retry create cart_items failed:', err3);
            db.get('SELECT COUNT(1) as count FROM items', (err4, row2) => {
              if (err4) return console.error('initDb count error (retry):', err4);
              if (row2 && row2.count === 0) seedSample();
            });
          });
        });
      } else {
        if (row && row.count === 0) seedSample();
      }
    });
  });

  function seedSample() {
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