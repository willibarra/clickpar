-- ============================================================
-- CLICKPAR — Cuentas IMAP para consulta automática de códigos
-- ============================================================

-- 1. Tabla de cuentas de correo IMAP (proveedores)
-- Almacena las credenciales de los correos que reciben códigos de verificación
CREATE TABLE IF NOT EXISTS imap_email_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    imap_host TEXT NOT NULL DEFAULT 'outlook.office365.com',
    imap_port INTEGER NOT NULL DEFAULT 993,
    imap_secure BOOLEAN NOT NULL DEFAULT true,
    label TEXT,                         -- Etiqueta descriptiva (ej: "Hotmail Principal", "cPanel Netflix")
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_checked_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_imap_accounts_active ON imap_email_accounts(is_active) WHERE is_active = true;

-- 2. Agregar campo imap_account_id a provider_support_config
-- Permite vincular un proveedor+plataforma a una o varias cuentas IMAP
ALTER TABLE provider_support_config
ADD COLUMN IF NOT EXISTS imap_account_ids UUID[] DEFAULT '{}';

-- 3. Habilitar RLS
ALTER TABLE imap_email_accounts ENABLE ROW LEVEL SECURITY;

-- Solo admins
CREATE POLICY imap_accounts_admin_all ON imap_email_accounts
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super_admin', 'staff')
        )
    );

-- 4. Tabla de "bridge": qué cuenta IMAP recibe correos para qué account_email (madre)
-- Esto resuelve el caso: "mis 50 hotmails redireccionan todo a 1 correo Gmail"
-- o "este correo de Netflix llega directamente a este Hotmail"
CREATE TABLE IF NOT EXISTS imap_email_routing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_email TEXT NOT NULL,       -- El email de la cuenta madre (netflix, disney, etc.)
    imap_account_id UUID NOT NULL REFERENCES imap_email_accounts(id) ON DELETE CASCADE,
    platform TEXT,                      -- Filtro opcional por plataforma
    supplier_name TEXT,                -- Filtro opcional por proveedor
    is_catchall BOOLEAN DEFAULT false, -- Si es true, esta cuenta IMAP recibe TODO para cualquier account_email
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(account_email, imap_account_id)
);

CREATE INDEX IF NOT EXISTS idx_imap_routing_email ON imap_email_routing(account_email);
CREATE INDEX IF NOT EXISTS idx_imap_routing_catchall ON imap_email_routing(is_catchall) WHERE is_catchall = true;

ALTER TABLE imap_email_routing ENABLE ROW LEVEL SECURITY;

CREATE POLICY imap_routing_admin_all ON imap_email_routing
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super_admin', 'staff')
        )
    );
