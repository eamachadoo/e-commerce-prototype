let pubsubClient = null;
let usingRealPubsub = false;
let proto = null;

try {
  // Load generated protobuf classes
  // proto = require('../gen/shopping_cart.js');
  proto = null

  // Init PubSub client
  const { PubSub } = require('@google-cloud/pubsub');
  const projectId = process.env.PUBSUB_PROJECT || 'test-project';

  // If emulator is running, use its host
  const apiEndpoint = process.env.PUBSUB_EMULATOR_HOST || undefined;

  pubsubClient = new PubSub({ projectId, apiEndpoint });

  usingRealPubsub = true;
} catch (e) {
  console.error("Error in PUB/SUB:", e.message);
  if (e.code === 'MODULE_NOT_FOUND') {
    console.error("Tip: Check if you ran 'npm install @google-cloud/pubsub'.");
  }
  
  // @google-cloud/pubsub not installed — fall back to a no-op publisher that logs messages.
  // This keeps local tests lightweight when the dependency isn't present.
  console.warn('Warning: @google-cloud/pubsub not available, falling back to console publisher.');
}

async function publish(topicName, payload) {
  if (usingRealPubsub && pubsubClient) {
    const topic = pubsubClient.topic(topicName);
    const message = { data: Buffer.from(JSON.stringify(payload)) };
    const [messageId] = await topic.publishMessage(message);
    return messageId;
  }

  // Fallback: log and resolve with a fake id
  console.log('[pubsub-fallback] publish to', topicName, 'payload:', payload);
  return `fallback-${Date.now()}`;
}

/**
 * Publish a ShoppingCartWrapper protobuf message to topic "shopping_cart".
 * The "wrapper" argument must be a JS object compatible with the proto schema.
 */
async function publishShoppingCart(wrapper) {
  if (usingRealPubsub && pubsubClient && proto) {
    try {
      const topic = pubsubClient.topic('shopping_cart');

      // Serialize protobuf → binary buffer
      const buffer = proto.priv_msgs.v1.ShoppingCartWrapper.encode(wrapper).finish();

      // Publish with retries
      const maxRetries = 3;
      for (let i = 0; i < maxRetries; i++) {
        try {
          const messageId = await topic.publish(buffer);
          return messageId;
        } catch (err) {
          console.error(`[pubsub] publish attempt ${i + 1} failed:`, err);
          if (i === maxRetries - 1) throw err;
        }
      }
    } catch (e) {
      console.error('[pubsub] Fatal error publishing ShoppingCartWrapper:', e);
    }
  }

  // Fallback behavior (no PubSub available)
  console.log('[pubsub-fallback] publish shopping_cart:', wrapper);
  return `fallback-${Date.now()}`;
}

module.exports = {
  publish,
  publishShoppingCart
};
