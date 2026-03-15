-- Add whatsapp_instance column to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_instance text DEFAULT NULL;

-- Migrate existing data from sales to customers
-- For each customer, take the whatsapp_instance from the most recent sale that has one
UPDATE customers c
SET whatsapp_instance = sub.whatsapp_instance
FROM (
    SELECT DISTINCT ON (customer_id)
        customer_id,
        whatsapp_instance
    FROM sales
    WHERE whatsapp_instance IS NOT NULL
    ORDER BY customer_id, created_at DESC
) sub
WHERE c.id = sub.customer_id
  AND c.whatsapp_instance IS NULL;

-- NOTE: We keep sales.whatsapp_instance for now as historical reference
-- It can be dropped in a future migration once fully transitioned
