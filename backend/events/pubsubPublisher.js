const { PubSub } = require('@google-cloud/pubsub');

const projectId = process.env.PUBSUB_PROJECT || 'test-project';

// If an emulator host is provided, the @google-cloud/pubsub library reads
// PUBSUB_EMULATOR_HOST from the environment to connect to the emulator.
if (process.env.PUBSUB_EMULATOR_HOST) {
  process.env.PUBSUB_EMULATOR_HOST = process.env.PUBSUB_EMULATOR_HOST;
}

const pubsub = new PubSub({ projectId });

async function publish(topicName, payload) {
  const topic = pubsub.topic(topicName);
  const message = { data: Buffer.from(JSON.stringify(payload)) };
  const [messageId] = await topic.publishMessage(message);
  return messageId;
}

module.exports = { publish };