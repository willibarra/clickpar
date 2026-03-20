-- ============================================================
-- whatsapp_incoming_log: stores incoming WhatsApp messages
-- Used by N8N to track conversation context and AI responses
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_incoming_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   TEXT,                           -- Evolution API message ID
  phone        TEXT NOT NULL,                  -- Normalized phone (595...)
  raw_jid      TEXT,                           -- Raw JID from Evolution API
  instance_name TEXT,                          -- Which WhatsApp instance received it
  text         TEXT,                           -- Message text content
  n8n_handled  BOOLEAN DEFAULT false,          -- Whether N8N picked it up
  raw_payload  JSONB,                          -- Full Evolution API payload
  received_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_incoming_phone ON whatsapp_incoming_log(phone, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_incoming_message_id ON whatsapp_incoming_log(message_id);

ALTER TABLE whatsapp_incoming_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON whatsapp_incoming_log
  FOR ALL USING (true);

COMMENT ON TABLE whatsapp_incoming_log IS 'Incoming WhatsApp messages received via Evolution API webhook, forwarded to N8N for AI processing.';
