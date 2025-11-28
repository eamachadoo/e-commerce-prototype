const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const sqlite3 = require('sqlite3').verbose();
const request = require('supertest');

// Ensure clean DB for this test (only once across loaded test files)
const DB_PATH = path.join(__dirname, '..', 'store.db');
if (!global.__dbCleaned) {
  try { fs.unlinkSync(DB_PATH); } catch (e) { /* ignore */ }
  global.__dbCleaned = true;
}

// Stubs and app will be initialized in before() to avoid top-level side-effects
let app;
let published = [];
const pubsub = require('../events/pubsubPublisher');
pubsub.publish = async (topic, payload) => {
  published.push({ topic, payload });
  return 'test-id';
};

describe('Jumpseller webhook HMAC validation', function () {
  this.timeout(5000);
  const __prev_jumpseller_secret = process.env.JUMPSELLER_SECRET;

  before(() => {
    process.env.JUMPSELLER_SECRET = 'test-secret-123';
    // require app after env is set
    app = require('../index');
  });
  it('accepts request with valid HMAC signature', async () => {
    const product = { id: 9999, title: 'HMAC Product', price: 500, stock: 2 };
    const payload = JSON.stringify({ product });
    const sig = 'sha256=' + crypto.createHmac('sha256', process.env.JUMPSELLER_SECRET).update(Buffer.from(payload, 'utf8')).digest('hex');

    await request(app)
      .post('/api/webhooks/jumpseller')
      .set('Content-Type', 'text/plain')
      .set('X-Jumpseller-Signature', sig)
      .send(payload)
      .expect(204);

    // Verify DB row exists
    const db = new sqlite3.Database(DB_PATH);
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT name, price, stock FROM items WHERE name = ?', [product.title], (err, r) => {
        if (err) return reject(err);
        resolve(r);
      });
    });
    assert.ok(row, 'expected product row in items table');
    db.close();
  });

  it('rejects request with invalid HMAC signature', async () => {
    const product = { id: 8888, title: 'Bad Sig Product', price: 100, stock: 1 };
    const payload = JSON.stringify({ product });
    const badSig = 'sha256=deadbeefdeadbeef';

    await request(app)
      .post('/api/webhooks/jumpseller')
      .set('Content-Type', 'text/plain')
      .set('X-Jumpseller-Signature', badSig)
      .send(payload)
      .expect(401);
  });
  after(() => {
    if (typeof __prev_jumpseller_secret === 'undefined') delete process.env.JUMPSELLER_SECRET;
    else process.env.JUMPSELLER_SECRET = __prev_jumpseller_secret;
  });
});
