-- Payment Methods table for N8N renewal flow
-- Stores payment method details that get sent to customers via WhatsApp

CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,           -- 'Tigo Money', 'Billetera Personal', 'Transferencia Bancaria'
  key TEXT UNIQUE NOT NULL,     -- 'tigo_money', 'personal', 'banco', 'binance'
  instructions TEXT NOT NULL,   -- Payment instructions (account number, etc)
  emoji TEXT DEFAULT '💳',
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with common Paraguayan payment methods (update instructions later)
INSERT INTO payment_methods (name, key, instructions, emoji, sort_order) VALUES
  ('Tigo Money', 'tigo_money', '📱 *Tigo Money*\nEnviar a: 0981 XXX XXX\nTitular: ClickPar\n\n⚠️ Enviá la captura del comprobante por este mismo chat.', '📱', 1),
  ('Billetera Personal', 'personal', '📲 *Billetera Personal*\nEnviar a: 0971 XXX XXX\nTitular: ClickPar\n\n⚠️ Enviá la captura del comprobante por este mismo chat.', '📲', 2),
  ('Transferencia Bancaria', 'banco', '🏦 *Transferencia Bancaria*\nBanco: XXX\nCuenta: XXX-XXX-XXX\nTitular: XXX\nCI: XXX\n\n⚠️ Enviá la captura del comprobante por este mismo chat.', '🏦', 3),
  ('Binance Pay', 'binance', '💰 *Binance Pay*\nBinance ID: XXX\nMonto USDT: Consultá el equivalente\n\n⚠️ Enviá la captura del comprobante por este mismo chat.', '💰', 4)
ON CONFLICT (key) DO NOTHING;
