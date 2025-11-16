const { publish } = require('../events/pubsubPublisher');

(async () => {
  try {
    const msg = { test: 'hello from publishTest', ts: Date.now() };
    const id = await publish('orders', msg);
    console.log('Published test message id:', id);
    process.exit(0);
  } catch (err) {
    console.error('Publish test failed:', err);
    process.exit(1);
  }
})();
