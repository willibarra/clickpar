-- Soft Delete para cuentas madres (Papelera)
-- Agrega deleted_at y deleted_data para guardar snapshot al eliminar

ALTER TABLE mother_accounts
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Índice para acelerar la consulta de eliminadas
CREATE INDEX IF NOT EXISTS idx_mother_accounts_deleted_at
  ON mother_accounts (deleted_at)
  WHERE deleted_at IS NOT NULL;
