-- ============================================================
-- CLICKPAR — IMAP: Agregar filtros de asunto y vinculación a provider_support_config
-- ============================================================

-- 1. Extender imap_email_accounts con filtros de búsqueda
ALTER TABLE imap_email_accounts
  ADD COLUMN IF NOT EXISTS subject_filter TEXT,        -- Asunto parcial a buscar (ej: "código de acceso")
  ADD COLUMN IF NOT EXISTS sender_filter  TEXT,        -- Remitente del correo (ej: "noreply@disneyplus.com")
  ADD COLUMN IF NOT EXISTS platform       TEXT,        -- Plataforma (ej: "Disney+")
  ADD COLUMN IF NOT EXISTS supplier_name  TEXT,        -- Proveedor (ej: "IMPERIO MILLONARIO")
  ADD COLUMN IF NOT EXISTS lookback_minutes INTEGER NOT NULL DEFAULT 15; -- Cuántos minutos hacia atrás buscar

-- 2. Vincular provider_support_config a una cuenta IMAP
ALTER TABLE provider_support_config
  ADD COLUMN IF NOT EXISTS imap_account_id UUID REFERENCES imap_email_accounts(id) ON DELETE SET NULL;

-- 3. Asegurar que code_source puede tener valor 'imap'
-- (ya existe el campo, solo documentamos los valores posibles: 'manual', 'telegram_userbot', 'imap')
COMMENT ON COLUMN provider_support_config.code_source IS
  'Fuente del código: manual | telegram_userbot | imap';

-- 4. Actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_imap_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_imap_accounts_updated_at ON imap_email_accounts;
CREATE TRIGGER trg_imap_accounts_updated_at
  BEFORE UPDATE ON imap_email_accounts
  FOR EACH ROW EXECUTE FUNCTION update_imap_accounts_updated_at();
