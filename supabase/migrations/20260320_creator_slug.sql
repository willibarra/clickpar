-- Add creator_slug to customers table
-- Used to personalize the creator's public URL: clickpar.net/{slug}
ALTER TABLE customers ADD COLUMN IF NOT EXISTS creator_slug TEXT UNIQUE;
