-- ============================================================
-- whatsapp_conversations: tracks AI conversation sessions
-- Groups messages by phone number to maintain context windows
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           TEXT NOT NULL,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),       -- Last activity timestamp
  last_message    TEXT,                            -- Last message text (preview)
  turn_count      INTEGER DEFAULT 0,               -- Total turns in this session
  ai_handled      BOOLEAN DEFAULT false,           -- Whether AI is actively managing
  needs_human     BOOLEAN DEFAULT false,           -- Escalated to human
  status          TEXT DEFAULT 'active',           -- active | resolved | escalated
  customer_id     UUID REFERENCES customers(id),  -- Linked customer if found
  metadata        JSONB DEFAULT '{}'::jsonb,       -- Extra data (last intent, etc.)
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_conv_phone ON whatsapp_conversations(phone);
CREATE INDEX IF NOT EXISTS idx_wa_conv_status ON whatsapp_conversations(status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_needs_human ON whatsapp_conversations(needs_human) WHERE needs_human = true;

ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON whatsapp_conversations
  FOR ALL USING (true);

-- Add n8n_handled update column to incoming log if missing
ALTER TABLE whatsapp_incoming_log 
  ADD COLUMN IF NOT EXISTS ai_response TEXT,         -- What the AI responded
  ADD COLUMN IF NOT EXISTS intent TEXT;              -- Detected intent (renewal, support, greeting, etc.)

COMMENT ON TABLE whatsapp_conversations IS 'Active WhatsApp conversation sessions with customers, tracked for AI context and human escalation.';
