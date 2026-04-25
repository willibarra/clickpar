-- ============================================================
-- CLICKPAR — Múltiples botones de consulta por config de soporte
-- ============================================================
-- Migrar de campos planos (needs_code, code_url, code_source, telegram_*)
-- a un array JSON `code_buttons` para soportar N botones por configuración.
--
-- Estructura de cada elemento en code_buttons:
-- {
--   "label": "Consultar Código de Inicio",
--   "source": "iframe" | "telegram_bot" | "imap" | "manual",
--   "url": "https://...",
--   "telegram_bot_username": "@bot",
--   "telegram_user_identifier": "user"
-- }

-- 1. Add code_buttons column
ALTER TABLE provider_support_config
ADD COLUMN IF NOT EXISTS code_buttons JSONB DEFAULT '[]'::jsonb;

-- 2. Migrate existing data: convert flat fields → code_buttons array
UPDATE provider_support_config
SET code_buttons = jsonb_build_array(
  jsonb_build_object(
    'label', CASE 
      WHEN code_source = 'iframe' THEN 'Consultar Código'
      WHEN code_source = 'telegram_bot' THEN 'Solicitar Código'
      WHEN code_source = 'imap' THEN 'Consultar Código'
      ELSE 'Consultar Código'
    END,
    'source', COALESCE(code_source, 'manual'),
    'url', code_url,
    'telegram_bot_username', telegram_bot_username,
    'telegram_user_identifier', telegram_user_identifier
  )
)
WHERE needs_code = true
  AND (code_buttons IS NULL OR code_buttons = '[]'::jsonb);
