-- simple migrations for shopping cart (copied into src/scripts for container path)
-- Cart table
CREATE TABLE IF NOT EXISTS Cart (
  userId INTEGER PRIMARY KEY,
  totalPriceCents BIGINT DEFAULT 0,
  currency VARCHAR(8) DEFAULT 'USD',
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS CartItem (
  userId INTEGER REFERENCES Cart(userId) ON DELETE CASCADE,
  itemId INTEGER NOT NULL,
  sku TEXT,
  name TEXT,
  priceCents BIGINT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  metadata JSONB,
  createdAt TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT PK_CartItem PRIMARY KEY (userId, itemId)
);

-- indexes
CREATE INDEX IF NOT EXISTS IdxCartItemUserId ON CartItem(userId);

-- Item table: store product snapshots from Jumpseller
CREATE TABLE IF NOT EXISTS Item (
  id INTEGER PRIMARY KEY,
  name TEXT,
  price BIGINT,
  stock INTEGER,
  metadata JSONB,
  updatedAt TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- triggers
CREATE OR REPLACE FUNCTION CartItemInsertTriggerFunction()
    RETURNS TRIGGER
    LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE Cart SET totalPriceCents = totalPriceCents
        + NEW.priceCents * NEW.quantity
        WHERE userId = NEW.userId;

    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS CartItemInsertTrigger ON CartItem;
CREATE TRIGGER CartItemInsertTrigger AFTER INSERT ON CartItem
    FOR EACH ROW EXECUTE PROCEDURE CartItemInsertTriggerFunction();


CREATE OR REPLACE FUNCTION CartItemUpdateTriggerFunction()
    RETURNS TRIGGER
    LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE Cart SET totalPriceCents = totalPriceCents
        - OLD.priceCents * OLD.quantity
        + NEW.priceCents * NEW.quantity
        WHERE userId = NEW.userId;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS CartItemUpdateTrigger ON CartItem;
CREATE TRIGGER CartItemUpdateTrigger BEFORE UPDATE ON CartItem
    FOR EACH ROW EXECUTE PROCEDURE CartItemUpdateTriggerFunction();


CREATE OR REPLACE FUNCTION CartItemDeleteTriggerFunction()
    RETURNS TRIGGER
    LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE Cart SET totalPriceCents = totalPriceCents
        - OLD.priceCents * OLD.quantity
        WHERE userId = OLD.userId;

    RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS CartItemDeleteTrigger ON CartItem;
CREATE TRIGGER CartItemDeleteTrigger BEFORE DELETE ON CartItem
    FOR EACH ROW EXECUTE PROCEDURE CartItemDeleteTriggerFunction();
