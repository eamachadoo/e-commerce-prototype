let pubsubClient = null;
let usingRealPubsub = false;
try {
  const { PubSub } = require('@google-cloud/pubsub');
  const projectId = process.env.PUBSUB_PROJECT || 'test-project';
  pubsubClient = new PubSub({ projectId });
  usingRealPubsub = true;
} catch (e) {
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

module.exports = { publish };