-- ============================================================
-- CLICKPAR — Telegram UserBot Sessions (Fase 2)
-- ============================================================

CREATE TABLE IF NOT EXISTS telegram_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    label TEXT NOT NULL DEFAULT 'ClickPar',          -- friendly name
    phone_number TEXT NOT NULL,
    session_string TEXT NOT NULL,                     -- GramJS StringSession (encrypted at app level)
    api_id INTEGER NOT NULL,
    api_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only allow admins to see sessions
ALTER TABLE telegram_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY telegram_sessions_admin ON telegram_sessions
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('super_admin')
        )
    );
