-- Add creator_slug to customers table
-- Used to personalize the creator's public URL: clickpar.net/{slug}
ALTER TABLE customers ADD COLUMN IF NOT EXISTS creator_slug TEXT UNIQUE;

-- Tracking table: one row per click on a creator link
CREATE TABLE IF NOT EXISTS creator_clicks (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug        TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  clicked_at  TIMESTAMPTZ DEFAULT NOW(),
  referrer    TEXT,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_creator_clicks_slug ON creator_clicks(slug);
CREATE INDEX IF NOT EXISTS idx_creator_clicks_date ON creator_clicks(clicked_at DESC);

-- RLS: allow service_role to insert (server-side) and read
ALTER TABLE creator_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON creator_clicks
  FOR ALL TO service_role USING (true) WITH CHECK (true);
