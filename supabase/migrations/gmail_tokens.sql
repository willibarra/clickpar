-- Create gmail_tokens table for storing OAuth2 tokens
CREATE TABLE IF NOT EXISTS gmail_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    refresh_token TEXT NOT NULL,
    access_token TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Allow service_role full access (no RLS needed, admin-only)
ALTER TABLE gmail_tokens ENABLE ROW LEVEL SECURITY;
