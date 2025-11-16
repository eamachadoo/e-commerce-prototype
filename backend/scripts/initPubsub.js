const { PubSub } = require('@google-cloud/pubsub');

const projectId = process.env.PUBSUB_PROJECT || 'test-project';

// Fail fast with a helpful message when the Pub/Sub emulator host isn't set.
if (!process.env.PUBSUB_EMULATOR_HOST) {
  console.error('\nPUBSUB_EMULATOR_HOST is not set.\nRun the init script against the local emulator by exporting the emulator host first.\nExample:');
  console.error('  export PUBSUB_EMULATOR_HOST=localhost:8085');
  console.error("  export PUBSUB_PROJECT=test-project\n  node backend/scripts/initPubsub.js\n");
  process.exit(2);
}

const pubsub = new PubSub({ projectId });

async function ensureTopic(name) {
  const topic = pubsub.topic(name);
  const [exists] = await topic.exists();
  if (!exists) {
    console.log(`Creating topic: ${name}`);
    await pubsub.createTopic(name);
  } else {
    console.log(`Topic exists: ${name}`);
  }
}

async function ensureSubscription(topicName, subName) {
  const subscription = pubsub.subscription(subName);
  const [exists] = await subscription.exists();
  if (!exists) {
    console.log(`Creating subscription: ${subName} -> ${topicName}`);
    const topic = pubsub.topic(topicName);
    await topic.createSubscription(subName);
  } else {
    console.log(`Subscription exists: ${subName}`);
  }
}

async function main() {
  try {
    const topicsEnv = process.env.PUBSUB_TOPIC || 'orders,payments,notifications';
    const subsEnv = process.env.PUBSUB_SUBSCRIPTION || 'orders-sub,payments-sub,notifications-sub';

    const topics = topicsEnv.split(',').map(s => s.trim()).filter(Boolean);
    const subs = subsEnv.split(',').map(s => s.trim()).filter(Boolean);

    for (const t of topics) await ensureTopic(t);

    // Pair subscriptions by position to topics
    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i];
      const topic = topics[i] || topics[0];
      await ensureSubscription(topic, sub);
    }

    console.log('Pub/Sub initialization complete');
    process.exit(0);
  } catch (err) {
    console.error('Failed to init Pub/Sub:', err);
    process.exit(1);
  }
}

main();
