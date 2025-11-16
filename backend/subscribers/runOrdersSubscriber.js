const { startOrdersSubscriber } = require('./ordersSubscriber');

(async () => {
  try {
    startOrdersSubscriber();
    console.log('Orders subscriber started (runOrdersSubscriber)');
  } catch (err) {
    console.error('Failed to start orders subscriber:', err);
    process.exit(1);
  }
})();
