const fs = require('fs');
const path = require('path');
const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const request = require('supertest');

// Ensure a clean DB for the test (only once across loaded test files)
const DB_PATH = path.join(__dirname, '..', 'store.db');
if (!global.__dbCleaned) {
  try { fs.unlinkSync(DB_PATH); } catch (e) { /* ignore */ }
  global.__dbCleaned = true;
}

// Require publisher and stub it to capture calls
const pubsub = require('../events/pubsubPublisher');
let published = [];
const originalPublish = pubsub.publish;
pubsub.publish = async (topic, payload) => {
  published.push({ topic, payload });
  return 'test-id';
};

// Start the app in before() to avoid top-level side-effects
let app;

describe('Jumpseller webhook integration', function () {
  this.timeout(5000);

  before(() => {
    app = require('../index');
  });

  it('accepts product webhook, upserts DB and publishes event', async () => {
    const product = { id: 12345, title: 'Test Product', price: 1999, stock: 7 };

    await request(app)
      .post('/api/webhooks/jumpseller')
      // send as text so global express.json() middleware doesn't consume the stream
      .set('Content-Type', 'text/plain')
      .send(JSON.stringify({ product }))
      .expect(204);

    // Check DB row exists
    const db = new sqlite3.Database(DB_PATH);
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT name, price, stock FROM items WHERE name = ?', [product.title], (err, r) => {
        if (err) return reject(err);
        resolve(r);
      });
    });

    assert.ok(row, 'expected product row in items table');
    assert.strictEqual(row.price, 1999);
    assert.strictEqual(row.stock, 7);

    // Check publish was called
    assert.ok(published.length > 0, 'expected at least one publish call');
    const p = published[published.length - 1];
    assert.strictEqual(p.topic, process.env.PUBSUB_TOPIC_PRODUCT_UPDATES || 'product_updates');
    assert.ok(p.payload && p.payload.id === product.id);

    db.close();
  });
});
