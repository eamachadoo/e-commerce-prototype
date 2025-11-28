const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@db:5432/postgres';

const pool = new Pool({ connectionString });

async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'migrate.sql'), 'utf8');
  await pool.query(sql);
}

module.exports = { pool, query, migrate };
