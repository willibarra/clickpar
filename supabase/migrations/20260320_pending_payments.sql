-- ============================================================
-- pending_payments: tracks QR payment orders before confirmation
-- Created for N8N WhatsApp automation flow
-- ============================================================

CREATE TABLE IF NOT EXISTS pending_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        TEXT UNIQUE NOT NULL,         -- ID de orden en PagoPar/Bancard
  customer_id     UUID REFERENCES customers(id) ON DELETE CASCADE,
  sale_id         UUID NULL,                    -- null si es venta nueva (no renovación)
  amount_gs       INTEGER NOT NULL,             -- Monto en guaraníes
  concept         TEXT,                         -- Ej: "Renovación Netflix - Perfil 2"
  platform        TEXT,                         -- Ej: 'Netflix', 'Disney+'
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'paid' | 'expired' | 'failed'
  qr_url          TEXT,                         -- URL de la imagen QR
  qr_image_base64 TEXT,                         -- QR en base64 para enviar por WhatsApp
  payment_gateway TEXT NOT NULL DEFAULT 'pagopar',  -- 'pagopar' | 'bancard'
  gateway_token   TEXT,                         -- Token de seguridad para validar webhook
  expires_at      TIMESTAMPTZ,                  -- Cuándo expira el QR
  paid_at         TIMESTAMPTZ,                  -- Cuándo se confirmó el pago
  whatsapp_sent   BOOLEAN DEFAULT false,        -- Si el QR fue enviado por WhatsApp
  n8n_session_id  TEXT,                         -- Referencia a la sesión de N8N
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index para buscar por order_id rápido (webhook de pago)
CREATE INDEX IF NOT EXISTS idx_pending_payments_order_id ON pending_payments(order_id);

-- Index para buscar pagos pendientes por cliente
CREATE INDEX IF NOT EXISTS idx_pending_payments_customer ON pending_payments(customer_id, status);

-- RLS: solo lectura mediante service role (acceso desde API routes con admin client)
ALTER TABLE pending_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON pending_payments
  FOR ALL USING (true);

COMMENT ON TABLE pending_payments IS 'QR payment orders generated via N8N WhatsApp automation. Tracks payment lifecycle from QR generation to sale creation.';
