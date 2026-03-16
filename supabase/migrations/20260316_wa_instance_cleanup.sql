-- WhatsApp Instance Cleanup: complete migration from sales to customers
-- Index for customer WhatsApp instance lookups
CREATE INDEX IF NOT EXISTS idx_customers_wa_instance ON customers(whatsapp_instance);

-- Drop legacy column from sales (data already migrated to customers)
ALTER TABLE sales DROP COLUMN IF EXISTS whatsapp_instance;
