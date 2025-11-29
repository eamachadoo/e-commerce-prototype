require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
  console.log('[db] Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Query wrapper for easier use
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log('[db] Executed query', { text, duration, rows: res.rowCount });
  return res;
}

/**
 * Run database migrations
 */
async function migrate() {
  console.log('[db] Running migrations...');

  const migrationPath = path.join(__dirname, '../scripts/migrate.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  try {
    await pool.query(sql);
    console.log('[db] Migrations completed successfully');
  } catch (error) {
    console.error('[db] Migration failed:', error);
    throw error;
  }
}

/**
 * Upsert a cart (create or update)
 * @param {Object} cartData - Cart data
 * @param {string} cartData.cart_id - Cart UUID
 * @param {string} cartData.user_id - User ID
 * @param {Array} cartData.items - Array of cart items
 * @param {number} cartData.total_price_cents - Total price in cents
 * @param {string} cartData.currency - Currency code (default: EUR)
 * @returns {Promise<string>} - Returns the cart_id
 */
async function upsertCart(cartData) {
  const { cart_id, user_id, items, total_price_cents, currency = 'EUR' } = cartData;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Upsert cart metadata
    await client.query(
      `INSERT INTO carts (id, user_id, total_price_cents, currency, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (id) 
       DO UPDATE SET 
         user_id = EXCLUDED.user_id,
         total_price_cents = EXCLUDED.total_price_cents,
         currency = EXCLUDED.currency,
         updated_at = NOW()`,
      [cart_id, user_id, total_price_cents, currency]
    );

    // Delete existing cart items
    await client.query('DELETE FROM cart_items WHERE cart_id = $1', [cart_id]);

    // Insert new cart items
    for (const item of items) {
      const crypto = require('crypto');
      const itemId = crypto.randomUUID();

      await client.query(
        `INSERT INTO cart_items (id, cart_id, product_id, name, quantity, unit_price_cents, sku, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          itemId,
          cart_id,
          item.product_id,
          item.name || null,
          item.quantity,
          item.unit_price_cents || 0,
          item.sku || null,
          item.metadata ? JSON.stringify(item.metadata) : null
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`[db] Cart upserted: ${cart_id}`);
    return cart_id;

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[db] Error upserting cart:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get a cart by ID
 * @param {string} cart_id - Cart UUID
 * @returns {Promise<Object|null>} - Cart object with items, or null if not found
 */
async function getCart(cart_id) {
  try {
    // Get cart metadata
    const cartResult = await pool.query(
      'SELECT id, user_id, total_price_cents, currency, updated_at FROM carts WHERE id = $1',
      [cart_id]
    );

    if (cartResult.rows.length === 0) {
      return null;
    }

    const cart = cartResult.rows[0];

    // Get cart items
    const itemsResult = await pool.query(
      'SELECT product_id, sku, name, unit_price_cents, quantity, metadata FROM cart_items WHERE cart_id = $1',
      [cart_id]
    );

    return {
      cart_id: cart.id,
      user_id: cart.user_id,
      total_price_cents: cart.total_price_cents,
      currency: cart.currency,
      updated_at: cart.updated_at,
      items: itemsResult.rows.map(item => ({
        product_id: item.product_id,
        sku: item.sku,
        name: item.name,
        unit_price_cents: item.unit_price_cents,
        quantity: item.quantity,
        metadata: item.metadata
      }))
    };

  } catch (error) {
    console.error('[db] Error getting cart:', error);
    throw error;
  }
}

module.exports = {
  pool,
  query,
  migrate,
  upsertCart,
  getCart
};
