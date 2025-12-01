require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Create PostgreSQL connection pool

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000, // 5s\
});

pool.on('connect', () => {
  console.log('[db] Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle client', err);
  process.exit(-1);
});

// Initialize database when server starts
initDb();

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
 * Initialize Database
 */
async function initDb() {
  console.log('[db] Running initialization...');

  const createDbPath = path.join(__dirname, '../scripts/create.sql');
  const sql = fs.readFileSync(createDbPath, 'utf8');

  try {
    await pool.query(sql);
    console.log('[db] Initialization completed successfully');
  } catch (error) {
    console.error('[db] Initialization failed:', error);
    throw error;
  }
}

/**
 * Run database migrations
 */
async function migrate() {
  console.log('[db] Running migrations...');

  const migrationPath = path.join(__dirname, '../scripts/create.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  try {
    await pool.query(sql);
    console.log('[db] Migrations completed successfully');
  } catch (error) {
    console.error('[db] Migration failed:', error);
    throw error;
  }
}

// Upsert a product payload from Jumpseller into the local `items` table.
// Strategy: try to match by `external_id` (if present) or `name`. If not found, insert.
async function upsertProductFromJumpseller(product) {
  const { id: externalId, title: name, price, stock } = product;
  // Normalize price: Jumpseller may send cents or float; expect cents integer or a number
  const priceInt = Number.isInteger(price) ? price : Math.round((price || 0) * 100);

  const res = await pool.query(
    `INSERT INTO Item (name, price, stock, updatedAt)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (name)
     DO UPDATE SET
        price = EXCLUDED.price,
        stock = EXCLUDED.stock,
        updatedAt = NOW()
     RETURNING id`,
    [name, priceInt, stock || 0]
  );

   const wasInserted = res.command === 'INSERT';

  return wasInserted
    ? { inserted: true, id: res.rows[0].id }
    : { updated: true, id: res.rows[0].id };
}

/**
 * Upsert a cart (create or update)
 * @param {Object} cartData - Cart data
 * @param {string} cartData.userId - User ID
 * @param {Array} cartData.items - Array of cart items
 * @param {number} cartData.totalPriceCents - Total price in cents
 * @param {string} cartData.currency - Currency code (default: EUR)
 * @returns {Promise<string>} - Returns the cartId
 */
async function upsertCart(cartData) {
  const { userId, items, currency = 'EUR' } = cartData;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Upsert cart metadata
    await client.query(
      `INSERT INTO Cart (userId, currency, updatedAt)
       VALUES ($1, $2, NOW())
       ON CONFLICT (userId) 
       DO UPDATE SET 
         currency = EXCLUDED.currency,
         updatedAt = NOW()`,
      [userId, currency]
    );

    // Delete existing cart items
    await client.query('DELETE FROM CartItem WHERE userId = $1', [userId]);
    
    for (const item of items) {
      await client.query(
        `INSERT INTO CartItem (userId, itemId, name, quantity, priceCents, sku, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (userId, itemId)
         DO UPDATE SET
           name = EXCLUDED.name,
           quantity = EXCLUDED.quantity,
           priceCents = EXCLUDED.priceCents,
           sku = EXCLUDED.sku,
           metadata = EXCLUDED.metadata`,
        [
          userId,
          item.itemId,
          item.name || null,
          item.quantity,
          item.priceCents || 0,
          item.sku || null,
          item.metadata ? JSON.stringify(item.metadata) : null
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`[db] Cart upserted: ${userId}`);
    return userId;

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
 * @param {string} userId - Cart userId
 * @returns {Promise<Object|null>} - Cart object with items, or null if not found
 */
async function getCart(userId) {
  try {
    // Get cart metadata
    const cartResult = await pool.query(
      'SELECT userId, totalPriceCents, currency, updatedAt FROM Cart WHERE userId = $1',
      [userId]
    );

    if (cartResult.rows.length === 0) {
      return null;
    }

    const cart = cartResult.rows[0];

    // Get cart items
    const itemsResult = await pool.query(
      'SELECT itemId, sku, name, priceCents, quantity, metadata FROM CartItem WHERE userId = $1 ORDER BY createdAt, itemId',
      [userId]
    );

    return {
      userId: cart.userid,
      totalPriceCents: cart.totalpricecents,
      currency: cart.currency,
      updatedAt: cart.updatedat,
      items: itemsResult.rows.map(item => ({
        itemId: item.itemid,
        sku: item.sku,
        name: item.name,
        priceCents: item.pricecents,
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
  initDb,
  migrate,
  upsertCart,
  getCart
};
