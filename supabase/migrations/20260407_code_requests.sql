-- ============================================================
-- CLICKPAR — Solicitudes de Código de Verificación (Telegram/Manual)
-- ============================================================

-- 1. Tabla principal: solicitudes de código
CREATE TABLE IF NOT EXISTS code_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    account_email TEXT NOT NULL,
    supplier_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending','processing','completed','failed','expired'
    code TEXT,
    resolved_by UUID,
    resolved_at TIMESTAMPTZ,
    auto_source TEXT DEFAULT 'manual',       -- 'manual','telegram_userbot','gmail'
    telegram_bot_username TEXT,
    telegram_user_identifier TEXT,
    notes TEXT,
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '15 minutes',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_code_requests_status ON code_requests(status);
CREATE INDEX IF NOT EXISTS idx_code_requests_customer ON code_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_code_requests_pending ON code_requests(status, created_at) WHERE status = 'pending';

-- 2. Agregar campos de Telegram a provider_support_config
ALTER TABLE provider_support_config
ADD COLUMN IF NOT EXISTS telegram_bot_username TEXT,
ADD COLUMN IF NOT EXISTS telegram_user_identifier TEXT,
ADD COLUMN IF NOT EXISTS telegram_account_field TEXT DEFAULT 'email',
ADD COLUMN IF NOT EXISTS code_source TEXT DEFAULT 'manual';

-- 3. Habilitar RLS en code_requests
ALTER TABLE code_requests ENABLE ROW LEVEL SECURITY;

-- Admins tienen acceso total
CREATE POLICY code_requests_admin_all ON code_requests
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super_admin', 'staff')
        )
    );

-- Clientes solo pueden ver sus propias solicitudes
CREATE POLICY code_requests_customer_select ON code_requests
    FOR SELECT
    TO authenticated
    USING (
        customer_id IN (
            SELECT c.id FROM customers c
            JOIN profiles p ON p.phone_number = c.phone
            WHERE p.id = auth.uid()
        )
    );
