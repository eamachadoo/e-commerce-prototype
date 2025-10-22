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
    db.run(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        FOREIGN KEY(item_id) REFERENCES items(id)
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

module.exports = { db, initDb };