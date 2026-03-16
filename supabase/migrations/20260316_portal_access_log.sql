-- Portal Access Log
-- Tracks login events and credential views for audit purposes
CREATE TABLE IF NOT EXISTS portal_access_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- 'login', 'view_credentials', 'view_code', 'admin_view_password'
    ip_address TEXT,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_access_log_customer ON portal_access_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_portal_access_log_event ON portal_access_log(event_type);
CREATE INDEX IF NOT EXISTS idx_portal_access_log_created ON portal_access_log(created_at DESC);

-- Allow service_role full access (no RLS needed for server-side inserts)
ALTER TABLE portal_access_log ENABLE ROW LEVEL SECURITY;
