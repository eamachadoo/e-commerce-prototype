/* Simple integration-style test script for the Jumpseller webhook endpoint.
   This script:
   - ensures DB initialized
   - starts the server (index.js starts server on require)
   - posts a sample webhook payload
   - verifies that the `items` table has been inserted/updated

   Run: `node backend/scripts/test_webhook.js`
*/
require('dotenv').config();
const fetch = require('node-fetch');
const { initDb, db, upsertProductFromJumpseller } = require('../db');

// Start server by requiring index.js
console.log('Starting server (index.js)');
require('../index');

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  initDb();
  // Wait a bit for server and DB initialization
  await delay(500);

  const sample = {
    product: {
      id: 'js-1001',
      title: 'Webhook Test Product',
      price: 1999,
      stock: 42
    }
  };

  const url = `http://localhost:${process.env.PORT || 4000}/api/webhooks/jumpseller`;
  console.log('Posting sample webhook to', url);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sample)
  });

  console.log('Webhook POST status:', res.status);
  if (res.status >= 400) {
    const txt = await res.text();
    console.error('Webhook response body:', txt);
    process.exit(2);
  }

  // Wait for DB write
  await delay(200);

  db.get('SELECT id, name, price, stock FROM Item WHERE name = ?', [sample.product.title], (err, row) => {
    if (err) {
      console.error('DB error querying items:', err);
      process.exit(3);
    }
    if (!row) {
      console.error('Test failed: product not found in Item table');
      process.exit(4);
    }
    console.log('Found product in DB:', row);
    console.log('Webhook test succeeded');
    process.exit(0);
  });
}

run().catch(e => {
  console.error('Test script error:', e);
  process.exit(1);
});
