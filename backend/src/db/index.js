const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL || null;

let pool = null;
if (connectionString) {
  pool = new Pool({ connectionString });
}

async function query(text, params) {
  if (!pool) throw new Error('No Postgres pool available; set DATABASE_URL to use Postgres');
  const res = await pool.query(text, params);
  return res;
}

async function migrate() {
  if (!pool) throw new Error('No Postgres pool available; set DATABASE_URL to use Postgres');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'migrate.sql'), 'utf8');
  await pool.query(sql);
}

async function upsertProductFromJumpseller(product) {
  // If DATABASE_URL not set, fall back to sqlite implementation in ../../db.js
  if (!connectionString) {
    const legacy = require('../../db');
    if (legacy && typeof legacy.upsertProductFromJumpseller === 'function') {
      return legacy.upsertProductFromJumpseller(product);
    }
    throw new Error('No database available for upsert');
  }
  const externalId = product.id != null ? String(product.id) : null;
  const name = product.title || product.name || null;
  const price = Number.isInteger(product.price) ? product.price : Math.round((product.price || 0) * 100);
  const stock = product.stock != null ? Number(product.stock) : 0;
  const metadata = product.metadata || null;

  if (!externalId) {
    throw new Error('product missing id');
  }

  const sql = `INSERT INTO items (id, name, price, stock, metadata, updated_at)
               VALUES ($1,$2,$3,$4,$5,now())
               ON CONFLICT (id) DO UPDATE SET
                 name = EXCLUDED.name,
                 price = EXCLUDED.price,
                 stock = EXCLUDED.stock,
                 metadata = EXCLUDED.metadata,
                 updated_at = now()`;

  await pool.query(sql, [externalId, name, price, stock, metadata]);
  return { id: externalId };
}

module.exports = { pool, query, migrate, upsertProductFromJumpseller };
