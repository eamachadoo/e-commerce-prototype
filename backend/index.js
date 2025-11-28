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

// Cart routes (migrated to src/routes for Postgres support with sqlite fallback)
const cartRouter = require('./src/routes/cart');
app.use('/api/cart', cartRouter);

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend listening on ${PORT}`);
  });
}

module.exports = app;