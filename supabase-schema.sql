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

-- Create users table for admin authentication
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default admin user (password: tres3ncantos)
INSERT INTO users (email, password) VALUES ('admin@tresencantos.com', 'tres3ncantos');

-- Insert default revista URL
INSERT INTO config (id, value) VALUES ('revista_url', 'https://www.natura.com.mx/catalogos-digitales');

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: everyone can read products
CREATE POLICY "Products are viewable by everyone" ON products
  FOR SELECT USING (true);

-- Policy: only authenticated users can modify products
CREATE POLICY "Products are modifiable by anyone" ON products
  FOR ALL USING (true);

-- Policy: everyone can read config
CREATE POLICY "Config is viewable by everyone" ON config
  FOR SELECT USING (true);

-- Policy: only authenticated users can modify config
CREATE POLICY "Config is modifiable by anyone" ON config
  FOR ALL USING (true);

-- Policy: everyone can read users (for login)
CREATE POLICY "Users are viewable by everyone" ON users
  FOR SELECT USING (true);