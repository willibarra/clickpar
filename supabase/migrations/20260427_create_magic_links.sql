-- Magic Links table for shortened URL-based passwordless authentication
-- Used by /api/admin/generate-magic-link to store short token → Supabase token_hash mappings
-- Used by /m/{token} to look up and validate magic links

CREATE TABLE IF NOT EXISTS public.magic_links (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    token VARCHAR(32) UNIQUE NOT NULL,           -- Short token for URL (12 chars, base64url)
    token_hash TEXT NOT NULL,                     -- Supabase OTP token_hash from admin.generateLink
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    created_by UUID,                              -- Admin user who generated the link
    expires_at TIMESTAMPTZ NOT NULL,              -- When the link expires (default: 30 min)
    used_at TIMESTAMPTZ,                          -- NULL = not yet used
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for fast token lookups (the primary access pattern)
CREATE INDEX IF NOT EXISTS idx_magic_links_token ON public.magic_links(token);

-- Index for finding active links by customer (for invalidation)
CREATE INDEX IF NOT EXISTS idx_magic_links_customer_unused
    ON public.magic_links(customer_id) WHERE used_at IS NULL;

-- Enable RLS (access controlled via service_role key in API routes)
ALTER TABLE public.magic_links ENABLE ROW LEVEL SECURITY;

-- No public RLS policies needed — all access is through service_role (admin) client
-- This ensures the table is completely locked down from direct client access

COMMENT ON TABLE public.magic_links IS 'Shortened magic link tokens for passwordless portal authentication';
COMMENT ON COLUMN public.magic_links.token IS 'Short URL-safe token (12 chars) used in /m/{token} redirects';
COMMENT ON COLUMN public.magic_links.token_hash IS 'Supabase auth OTP token_hash returned by admin.generateLink';
COMMENT ON COLUMN public.magic_links.used_at IS 'Set when the link is consumed; NULL means unused';
