const path = require('path');
const { migrate, pool } = require('../src/db');

async function run() {
  try {
    console.log('Running migrations...');
    await migrate();
    console.log('Migrations applied successfully');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
