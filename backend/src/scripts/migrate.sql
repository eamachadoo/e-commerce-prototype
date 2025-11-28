-- simple migrations for shopping cart (copied into src/scripts for container path)
-- carts table
CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY,
  user_id TEXT,
  total_price_cents BIGINT DEFAULT 0,
  currency VARCHAR(8) DEFAULT 'USD',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY,
  cart_id UUID REFERENCES carts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  sku TEXT,
  name TEXT,
  unit_price_cents BIGINT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id);

-- items table: store product snapshots from Jumpseller
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT,
  price BIGINT,
  stock INTEGER,
  metadata JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
