-- ============================================================
-- CHATBOT IA — Complete Setup Migration
-- Run this in your Supabase SQL Editor (db.clickpar.shop)
-- ============================================================

-- 1. whatsapp_incoming_log
CREATE TABLE IF NOT EXISTS whatsapp_incoming_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    TEXT,
  phone         TEXT NOT NULL,
  raw_jid       TEXT,
  instance_name TEXT,
  text          TEXT,
  n8n_handled   BOOLEAN DEFAULT false,
  ai_response   TEXT,
  intent        TEXT,
  raw_payload   JSONB,
  received_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wa_incoming_phone ON whatsapp_incoming_log(phone, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_incoming_message_id ON whatsapp_incoming_log(message_id);
ALTER TABLE whatsapp_incoming_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access" ON whatsapp_incoming_log FOR ALL USING (true);

-- Add columns if table already exists without them
ALTER TABLE whatsapp_incoming_log ADD COLUMN IF NOT EXISTS ai_response TEXT;
ALTER TABLE whatsapp_incoming_log ADD COLUMN IF NOT EXISTS intent TEXT;

-- 2. whatsapp_conversations
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           TEXT NOT NULL,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  last_message    TEXT,
  turn_count      INTEGER DEFAULT 0,
  ai_handled      BOOLEAN DEFAULT false,
  needs_human     BOOLEAN DEFAULT false,
  status          TEXT DEFAULT 'active',
  customer_id     UUID REFERENCES customers(id),
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_conv_phone ON whatsapp_conversations(phone);
CREATE INDEX IF NOT EXISTS idx_wa_conv_status ON whatsapp_conversations(status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_needs_human ON whatsapp_conversations(needs_human) WHERE needs_human = true;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access" ON whatsapp_conversations FOR ALL USING (true);

-- 3. payment_methods
CREATE TABLE IF NOT EXISTS payment_methods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  key        TEXT UNIQUE NOT NULL,
  instructions TEXT NOT NULL,
  emoji      TEXT DEFAULT '💳',
  is_active  BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO payment_methods (name, key, instructions, emoji, sort_order) VALUES
  ('Tigo Money', 'tigo_money', '📱 *Tigo Money*
Enviá a: 0981 XXX XXX
Titular: ClickPar

⚠️ Enviá la captura del comprobante por este mismo chat.', '📱', 1),
  ('Billetera Personal', 'personal', '📲 *Billetera Personal*
Enviá a: 0971 XXX XXX
Titular: ClickPar

⚠️ Enviá la captura del comprobante por este mismo chat.', '📲', 2),
  ('Transferencia Bancaria', 'banco', '🏦 *Transferencia Bancaria*
Banco: XXX
Cuenta: XXX-XXX-XXX
Titular: XXX
CI: XXX

⚠️ Enviá la captura del comprobante por este mismo chat.', '🏦', 3),
  ('Binance Pay', 'binance', '💰 *Binance Pay*
Binance ID: XXX
Monto USDT: Consultá el equivalente

⚠️ Enviá la captura del comprobante por este mismo chat.', '💰', 4)
ON CONFLICT (key) DO NOTHING;

-- 4. pending_payments
CREATE TABLE IF NOT EXISTS pending_payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id),
  sale_id     UUID,
  amount_gs   BIGINT NOT NULL,
  gateway     TEXT DEFAULT 'manual',
  status      TEXT DEFAULT 'pending',
  paid_at     TIMESTAMPTZ,
  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_payments_order ON pending_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_pending_payments_customer ON pending_payments(customer_id);
ALTER TABLE pending_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service role full access" ON pending_payments FOR ALL USING (true);

-- Done!
SELECT 'Chatbot migration complete ✅' AS result;
