const express = require('express');
const { validateHmac } = require('../lib/hmac');
const { upsertProductFromJumpseller } = require('../db');
const { publish } = require('../../events/pubsubPublisher');

const router = express.Router();

// Use raw body for HMAC validation. The server should mount this router with a raw body parser
router.post('/jumpseller', express.raw({ type: '*/*' }), async (req, res) => {
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
    // Simple mapping: Jumpseller payload may contain `product` or be the product itself
    const product = payload.product || payload;
    // Upsert product into local DB
    await upsertProductFromJumpseller(product);
    // Publish a product update event to Pub/Sub emulator or real Pub/Sub
    await publish(process.env.PUBSUB_TOPIC_PRODUCT_UPDATES || 'product_updates', product);
    return res.status(204).end();
  } catch (err) {
    console.error('Webhook handling error:', err);
    return res.status(500).json({ error: 'failed to process webhook' });
  }
});

module.exports = router;
