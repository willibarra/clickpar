-- =============================================
-- ClickPar Internal CRM — Conversations module
-- =============================================

-- Conversation thread per customer (one per customer is enough, or open multiple)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'open',           -- open | resolved | waiting | spam
    assigned_to TEXT,                               -- staff user email
    last_message_at TIMESTAMPTZ DEFAULT now(),
    last_message_preview TEXT,
    unread_count INTEGER NOT NULL DEFAULT 0,        -- unread inbound messages for staff
    channel TEXT NOT NULL DEFAULT 'whatsapp',       -- whatsapp | panel
    wa_phone TEXT,                                  -- phone number used for this conversation
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by customer and status
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(last_message_at DESC);

-- Individual messages in a conversation
CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    direction TEXT NOT NULL,                        -- inbound | outbound
    sender TEXT NOT NULL DEFAULT 'staff',           -- customer | staff | bot
    sender_name TEXT,                               -- display name
    message TEXT NOT NULL,
    wa_message_id TEXT,                             -- Evolution API message ID (delivery tracking)
    wa_status TEXT DEFAULT 'sent',                  -- sent | delivered | read | failed
    template_key TEXT,                              -- whatsapp template used (if any)
    is_automated BOOLEAN DEFAULT false,             -- true if sent by cron/bot
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast chat load
CREATE INDEX IF NOT EXISTS idx_conv_messages_conv ON conversation_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_conv_messages_wa_id ON conversation_messages(wa_message_id) WHERE wa_message_id IS NOT NULL;

-- RLS policies (admin service role bypasses these, but set for safety)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service_role_conversations" ON conversations
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_conv_messages" ON conversation_messages
    FOR ALL USING (true) WITH CHECK (true);
