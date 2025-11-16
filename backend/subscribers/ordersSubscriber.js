const { PubSub } = require('@google-cloud/pubsub');

const projectId = process.env.PUBSUB_PROJECT || 'test-project';
const subscriptionName = process.env.ORDERS_SUBSCRIPTION || 'orders-sub';

const pubsub = new PubSub({ projectId });

function startOrdersSubscriber() {
  const subscription = pubsub.subscription(subscriptionName);

  console.log(`Orders subscriber starting, listening on subscription: ${subscriptionName}`);
  subscription.on('message', (message) => {
    try {
      const payload = JSON.parse(message.data.toString());
      console.log('orders-sub received:', payload);
      // TODO: implement real handling (notify user, update inventory, etc.)
      message.ack(); // acknowledge on success
    } catch (err) {
      console.error('Subscriber processing error:', err);
      try { message.nack(); } catch (e) { console.error('nack failed', e); }
    }
  });

  subscription.on('error', (err) => {
    console.error('Subscription error:', err);
  });
}

module.exports = { startOrdersSubscriber };
