-- Migración IMAP accounts: columnas para filtros de búsqueda
-- Idempotente — se puede ejecutar sobre una DB que ya tenga las columnas anteriores

ALTER TABLE imap_email_accounts
  ADD COLUMN IF NOT EXISTS subject_filter TEXT,
  ADD COLUMN IF NOT EXISTS sender_filter TEXT,
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS lookback_minutes INTEGER NOT NULL DEFAULT 15,
  -- Soporte de múltiples asuntos por cuenta: array de filtros de subject
  ADD COLUMN IF NOT EXISTS subject_filters TEXT[] DEFAULT '{}';

-- Si la columna subject_filter ya tenía valor, migrarlo al array
UPDATE imap_email_accounts
  SET subject_filters = ARRAY[subject_filter]
  WHERE subject_filter IS NOT NULL
    AND (subject_filters IS NULL OR array_length(subject_filters, 1) IS NULL);

ALTER TABLE provider_support_config
  ADD COLUMN IF NOT EXISTS imap_account_id UUID REFERENCES imap_email_accounts(id) ON DELETE SET NULL;
