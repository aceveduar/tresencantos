-- Create products table
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  category_label TEXT NOT NULL,
  price NUMERIC NOT NULL,
  description TEXT NOT NULL,
  image TEXT NOT NULL,
  badge TEXT,
  badge_type TEXT,
  featured BOOLEAN DEFAULT FALSE,
  out_of_stock BOOLEAN DEFAULT FALSE,
  original_price NUMERIC,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create config table (for revista and other settings)
CREATE TABLE config (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default revista URL
INSERT INTO config (id, value) VALUES ('revista_url', 'https://www.natura.com.mx/catalogos-digitales');

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Policy: everyone can read products
CREATE POLICY "Products are viewable by everyone" ON products
  FOR SELECT USING (true);

-- Policy: only authenticated users can modify products
CREATE POLICY "Products are modifiable by authenticated users" ON products
  FOR ALL USING (auth.role() = 'authenticated');

-- Policy: everyone can read config
CREATE POLICY "Config is viewable by everyone" ON config
  FOR SELECT USING (true);

-- Policy: only authenticated users can modify config
CREATE POLICY "Config is modifiable by authenticated users" ON config
  FOR ALL USING (auth.role() = 'authenticated');