-- ============================================
-- CLICKPAR — ATOMIC SALES & AUTO-HEALING
-- Transacciones atómicas para ventas, 
-- logging de cambios de slot, y detección de huérfanos.
-- ============================================

-- ============================================
-- 1. TABLA slot_status_log
-- Registra cada cambio de status en sale_slots
-- ============================================

CREATE TABLE IF NOT EXISTS slot_status_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slot_id UUID NOT NULL REFERENCES sale_slots(id) ON DELETE CASCADE,
    old_status TEXT,
    new_status TEXT,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    changed_by TEXT DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_slot_status_log_slot ON slot_status_log(slot_id);
CREATE INDEX IF NOT EXISTS idx_slot_status_log_changed ON slot_status_log(changed_at);

ALTER TABLE slot_status_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all slot_status_log" ON slot_status_log;
CREATE POLICY "Allow all slot_status_log" ON slot_status_log FOR ALL USING (true);

-- ============================================
-- 2. TRIGGER: auto-log status changes
-- ============================================

CREATE OR REPLACE FUNCTION trg_log_slot_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO slot_status_log (slot_id, old_status, new_status)
        VALUES (NEW.id, OLD.status::TEXT, NEW.status::TEXT);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_slot_status_log ON sale_slots;
CREATE TRIGGER trg_slot_status_log
    AFTER UPDATE ON sale_slots
    FOR EACH ROW
    EXECUTE FUNCTION trg_log_slot_status_change();

-- ============================================
-- 3. VIEW: orphan_slots
-- Slots marcados como 'sold' sin venta activa
-- ============================================

CREATE OR REPLACE VIEW orphan_slots AS
SELECT
    ss.id AS slot_id,
    ss.slot_identifier,
    ss.status,
    ss.mother_account_id,
    ma.platform,
    ma.email AS account_email
FROM sale_slots ss
JOIN mother_accounts ma ON ma.id = ss.mother_account_id
WHERE ss.status = 'sold'
  AND NOT EXISTS (
      SELECT 1 FROM sales s
      WHERE s.slot_id = ss.id
        AND s.is_active = true
  );

-- ============================================
-- 4. RPC: create_sale_atomic
-- Verifica slot available con FOR UPDATE,
-- inserta venta, marca slot sold. Todo en 1 tx.
-- ============================================

CREATE OR REPLACE FUNCTION create_sale_atomic(
    p_customer_id UUID,
    p_slot_id UUID,
    p_amount_gs NUMERIC,
    p_start_date DATE,
    p_end_date DATE DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'cash',
    p_original_price_gs NUMERIC DEFAULT NULL,
    p_override_price BOOLEAN DEFAULT FALSE,
    p_bundle_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_sale_id UUID;
    v_slot_status TEXT;
BEGIN
    -- Lock the slot row to prevent concurrent sales
    SELECT status INTO v_slot_status
    FROM sale_slots
    WHERE id = p_slot_id
    FOR UPDATE;

    IF v_slot_status IS NULL THEN
        RAISE EXCEPTION 'Slot % no encontrado', p_slot_id;
    END IF;

    IF v_slot_status <> 'available' THEN
        RAISE EXCEPTION 'Slot % no está disponible (status actual: %)', p_slot_id, v_slot_status;
    END IF;

    -- Insert the sale
    INSERT INTO sales (
        customer_id, slot_id, amount_gs, original_price_gs,
        override_price, start_date, end_date,
        is_active, payment_method, bundle_id
    ) VALUES (
        p_customer_id, p_slot_id, p_amount_gs,
        COALESCE(p_original_price_gs, p_amount_gs),
        p_override_price, p_start_date, p_end_date,
        true, p_payment_method, p_bundle_id
    )
    RETURNING id INTO v_sale_id;

    -- Mark slot as sold
    UPDATE sale_slots
    SET status = 'sold'
    WHERE id = p_slot_id;

    RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. RPC: cancel_sale_atomic
-- Desactiva venta + libera slot atómicamente.
-- Returns slot_id and mother_account_id for 
-- downstream use (password rotation, etc.).
-- ============================================

CREATE OR REPLACE FUNCTION cancel_sale_atomic(
    p_sale_id UUID
)
RETURNS TABLE (
    slot_id UUID,
    mother_account_id UUID
) AS $$
DECLARE
    v_slot_id UUID;
    v_mother_account_id UUID;
BEGIN
    -- Get and lock the sale
    SELECT s.slot_id INTO v_slot_id
    FROM sales s
    WHERE s.id = p_sale_id
    FOR UPDATE;

    IF v_slot_id IS NULL THEN
        RAISE EXCEPTION 'Venta % no encontrada', p_sale_id;
    END IF;

    -- Deactivate the sale
    UPDATE sales
    SET is_active = false
    WHERE id = p_sale_id;

    -- Lock and free the slot
    SELECT ss.mother_account_id INTO v_mother_account_id
    FROM sale_slots ss
    WHERE ss.id = v_slot_id
    FOR UPDATE;

    UPDATE sale_slots
    SET status = 'available'
    WHERE id = v_slot_id;

    RETURN QUERY SELECT v_slot_id, v_mother_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. RPC: swap_sale_atomic
-- Desactiva venta vieja, libera slot viejo,
-- crea nueva venta, marca nuevo slot sold.
-- Todo atómico.
-- ============================================

CREATE OR REPLACE FUNCTION swap_sale_atomic(
    p_old_sale_id UUID,
    p_new_slot_id UUID,
    p_customer_id UUID,
    p_preserve_dates BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
    new_sale_id UUID,
    old_slot_id UUID,
    old_mother_account_id UUID,
    new_mother_account_id UUID
) AS $$
DECLARE
    v_old_slot_id UUID;
    v_old_mother_account_id UUID;
    v_new_mother_account_id UUID;
    v_new_sale_id UUID;
    v_amount_gs NUMERIC;
    v_start_date DATE;
    v_end_date DATE;
    v_new_slot_status TEXT;
BEGIN
    -- 1. Lock and read the old sale
    SELECT s.slot_id, s.amount_gs, s.start_date, s.end_date
    INTO v_old_slot_id, v_amount_gs, v_start_date, v_end_date
    FROM sales s
    WHERE s.id = p_old_sale_id
    FOR UPDATE;

    IF v_old_slot_id IS NULL THEN
        RAISE EXCEPTION 'Venta original % no encontrada', p_old_sale_id;
    END IF;

    -- 2. Deactivate old sale
    UPDATE sales SET is_active = false WHERE id = p_old_sale_id;

    -- 3. Free old slot (get mother_account_id first)
    SELECT ss.mother_account_id INTO v_old_mother_account_id
    FROM sale_slots ss WHERE ss.id = v_old_slot_id FOR UPDATE;

    UPDATE sale_slots SET status = 'available' WHERE id = v_old_slot_id;

    -- 4. Lock new slot and verify available
    SELECT ss.status, ss.mother_account_id
    INTO v_new_slot_status, v_new_mother_account_id
    FROM sale_slots ss
    WHERE ss.id = p_new_slot_id
    FOR UPDATE;

    IF v_new_slot_status IS NULL THEN
        RAISE EXCEPTION 'Nuevo slot % no encontrado', p_new_slot_id;
    END IF;

    IF v_new_slot_status <> 'available' THEN
        RAISE EXCEPTION 'Nuevo slot % no está disponible (status: %)', p_new_slot_id, v_new_slot_status;
    END IF;

    -- 5. Create new sale
    IF NOT p_preserve_dates THEN
        v_start_date := CURRENT_DATE;
        v_end_date := CURRENT_DATE + INTERVAL '30 days';
    END IF;

    INSERT INTO sales (
        customer_id, slot_id, amount_gs, original_price_gs,
        override_price, start_date, end_date,
        is_active, payment_method
    ) VALUES (
        p_customer_id, p_new_slot_id, v_amount_gs, v_amount_gs,
        false, v_start_date, v_end_date,
        true, 'cash'
    )
    RETURNING id INTO v_new_sale_id;

    -- 6. Mark new slot as sold
    UPDATE sale_slots SET status = 'sold' WHERE id = p_new_slot_id;

    RETURN QUERY SELECT v_new_sale_id, v_old_slot_id, v_old_mother_account_id, v_new_mother_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VERIFICATION
-- ============================================

SELECT 'Migración atomic_sales completada' AS resultado;
SELECT
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'slot_status_log') AS slot_status_log_table,
    (SELECT COUNT(*) FROM pg_trigger WHERE tgname = 'trg_slot_status_log') AS trigger_exists,
    (SELECT COUNT(*) FROM information_schema.views WHERE table_name = 'orphan_slots') AS orphan_view,
    (SELECT COUNT(*) FROM information_schema.routines WHERE routine_name = 'create_sale_atomic') AS create_fn,
    (SELECT COUNT(*) FROM information_schema.routines WHERE routine_name = 'cancel_sale_atomic') AS cancel_fn,
    (SELECT COUNT(*) FROM information_schema.routines WHERE routine_name = 'swap_sale_atomic') AS swap_fn;
-- Message Queue for WhatsApp/Kommo notification pipeline
-- Supports 3-phase processing: Queue → Compose → Send

CREATE TABLE IF NOT EXISTS message_queue (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     uuid REFERENCES customers(id) ON DELETE SET NULL,
    sale_id         uuid,
    message_type    text NOT NULL,          -- pre_expiry, expiry_today, expired_yesterday, cancelled
    channel         text NOT NULL,          -- whatsapp, kommo
    phone           text,
    customer_name   text,
    platform        text,
    template_key    text,                   -- e.g. pre_vencimiento, vencimiento_hoy
    message_body    text,                   -- null until composed
    compose_method  text,                   -- template, ai_n8n
    status          text NOT NULL DEFAULT 'pending',  -- pending → composed → sending → sent / failed / skipped
    instance_name   text,                   -- WhatsApp instance to use
    scheduled_at    timestamptz NOT NULL DEFAULT now(),
    sent_at         timestamptz,
    error           text,
    retry_count     int NOT NULL DEFAULT 0,
    max_retries     int NOT NULL DEFAULT 3,
    idempotency_key text NOT NULL UNIQUE,   -- {sale_id}:{message_type}:{channel}:{date}
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Fast lookups for compose/send phases
CREATE INDEX idx_mq_status_scheduled ON message_queue (status, scheduled_at);

-- Idempotency already enforced by UNIQUE constraint, but explicit index for clarity
-- (PostgreSQL auto-creates a unique index for UNIQUE columns, so this is implicit)

COMMENT ON TABLE message_queue IS 'Queue for batched WhatsApp/Kommo notification sending';
COMMENT ON COLUMN message_queue.idempotency_key IS 'Format: {sale_id}:{message_type}:{channel}:{YYYY-MM-DD}';
COMMENT ON COLUMN message_queue.compose_method IS 'template = static WA template, ai_n8n = AI-generated via N8N webhook';
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
-- Add creator_slug to customers table
-- Used to personalize the creator's public URL: clickpar.net/{slug}
ALTER TABLE customers ADD COLUMN IF NOT EXISTS creator_slug TEXT UNIQUE;
-- Tabla de configuración general de la app
CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    label TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tipo de cambio USD/PYG por defecto
INSERT INTO app_config (key, value, label)
VALUES ('usd_to_pyg_rate', '7800', 'Tipo de cambio USD → Gs.')
ON CONFLICT (key) DO NOTHING;
-- Agregar columna is_canje a la tabla sales
-- Indica si la venta es un canje (para clientes tipo "creador")
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_canje boolean NOT NULL DEFAULT false;

-- Índice para facilitar consultas por is_canje
CREATE INDEX IF NOT EXISTS sales_is_canje_idx ON sales(is_canje);
-- Agregar el valor 'frozen' al enum account_status
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'frozen';
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
-- WhatsApp Instance Cleanup: complete migration from sales to customers
-- Index for customer WhatsApp instance lookups
CREATE INDEX IF NOT EXISTS idx_customers_wa_instance ON customers(whatsapp_instance);

-- Drop legacy column from sales (data already migrated to customers)
ALTER TABLE sales DROP COLUMN IF EXISTS whatsapp_instance;
-- Add enriched help columns to provider_support_config
ALTER TABLE provider_support_config
  ADD COLUMN IF NOT EXISTS help_steps jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS faq_items jsonb DEFAULT '[]'::jsonb;

-- Update existing providers with personalized help content

-- Netflix - POP PREMIUM
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a netflix.com con el correo y contraseña de tu panel",
  "Seleccioná el perfil que te fue asignado",
  "Si te pide código hogar, seleccioná \"estoy de viaje\" (TV) o \"ver temporalmente\" (Cel)",
  "Seleccioná \"Enviar Email\"",
  "Volvé a tu panel ClickPar → botón \"Consultar Código\"",
  "Colocá el correo de tu Netflix → CONSULTAR",
  "Ingresá el código que aparece. ⚠️ SOLO 1 DISPOSITIVO a la vez"
]'::jsonb,
    faq_items = '[
  {"q": "¿Me pide código hogar, qué hago?", "a": "Seguí los pasos de ayuda arriba. Usá el botón \"Consultar Código\" en tu panel. ⚠️ Solo podés activar 1 dispositivo."},
  {"q": "¿Puedo usar en Smart TV y celular a la vez?", "a": "No, solo podés usar 1 dispositivo a la vez con tu perfil."},
  {"q": "¿Cambió la contraseña?", "a": "Las contraseñas pueden cambiar periódicamente. Siempre consultá tu panel para ver la contraseña actualizada."},
  {"q": "¿Cuándo vence mi servicio?", "a": "Revisá tu panel en la sección \"Servicios\", ahí aparece la fecha de vencimiento."}
]'::jsonb
WHERE platform = 'Netflix' AND supplier_name = 'POP PREMIUM';

-- Netflix - CLICKPAR
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a netflix.com con el correo y contraseña de tu panel",
  "Seleccioná el perfil asignado",
  "Si tenés algún problema, contactá soporte por WhatsApp"
]'::jsonb,
    faq_items = '[
  {"q": "¿La contraseña no funciona?", "a": "Las contraseñas pueden actualizarse. Revisá tu panel para la contraseña actual. Si sigue sin funcionar, escribinos por WhatsApp."},
  {"q": "¿Cuándo vence mi servicio?", "a": "Revisá tu panel en la sección \"Servicios\", ahí aparece la fecha de vencimiento."}
]'::jsonb
WHERE platform = 'Netflix' AND supplier_name = 'CLICKPAR';

-- Netflix - Vivas Play
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a netflix.com con el correo y contraseña de tu panel",
  "Seleccioná el perfil asignado",
  "Si tenés algún problema, contactá soporte por WhatsApp"
]'::jsonb,
    faq_items = '[
  {"q": "¿La contraseña no funciona?", "a": "Revisá tu panel para la contraseña actual. Si sigue sin funcionar, contactá soporte."}
]'::jsonb
WHERE platform = 'Netflix' AND supplier_name = 'Vivas Play';

-- Disney+ - POP PREMIUM
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a disneyplus.com con el correo y contraseña de tu panel",
  "Seleccioná tu perfil asignado",
  "Si te pide código de verificación, usá el botón \"Consultar Código\" en tu panel"
]'::jsonb,
    faq_items = '[
  {"q": "¿Me pide verificación?", "a": "Usá el botón \"Consultar Código\" en tu panel para obtener el código."},
  {"q": "¿Puedo descargar contenido?", "a": "Sí, podés descargar dentro de tu perfil asignado."}
]'::jsonb
WHERE platform = 'Disney+' AND supplier_name = 'POP PREMIUM';

-- HBO Max - POP PREMIUM
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a max.com con el correo y contraseña de tu panel",
  "Seleccioná tu perfil asignado",
  "Si tenés problemas, contactá soporte por WhatsApp"
]'::jsonb,
    faq_items = '[
  {"q": "¿HBO Max o Max?", "a": "HBO Max ahora se llama Max. Ingresá a max.com con las mismas credenciales."},
  {"q": "¿Puedo usar en varios dispositivos?", "a": "Solo podés usar 1 dispositivo a la vez con tu perfil."}
]'::jsonb
WHERE platform = 'HBO Max' AND supplier_name = 'POP PREMIUM';

-- Amazon Prime Video - POP PREMIUM
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a primevideo.com con el correo y contraseña de tu panel",
  "Seleccioná tu perfil asignado",
  "Si tenés problemas, contactá soporte por WhatsApp"
]'::jsonb,
    faq_items = '[
  {"q": "¿Incluye envíos de Amazon?", "a": "No, tu servicio es solo para streaming de Prime Video."},
  {"q": "¿No me deja iniciar sesión?", "a": "Asegurate de usar primevideo.com, no amazon.com. Si sigue fallando, consultá tu panel por la contraseña actualizada."}
]'::jsonb
WHERE platform = 'Amazon Prime Video' AND supplier_name = 'POP PREMIUM';

-- Amazon Prime Video - G2G
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a primevideo.com con el correo y contraseña de tu panel",
  "Si tenés problemas, contactá soporte por WhatsApp"
]'::jsonb,
    faq_items = '[
  {"q": "¿No me deja iniciar sesión?", "a": "Revisá tu panel para la contraseña actual. Si sigue fallando, contactá soporte."}
]'::jsonb
WHERE platform = 'Amazon Prime Video' AND supplier_name = 'G2G';

-- Spotify Premium (all suppliers)
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a open.spotify.com o la app con el correo y contraseña de tu panel",
  "Si no funciona, cerrá sesión completamente y volvé a iniciar",
  "No cambies la contraseña ni los datos de la cuenta"
]'::jsonb,
    faq_items = '[
  {"q": "¿Puedo descargar música?", "a": "Sí, con Spotify Premium podés descargar música para escuchar offline."},
  {"q": "¿Se puede usar en varios dispositivos?", "a": "Sí, pero solo podés reproducir en 1 dispositivo a la vez."}
]'::jsonb
WHERE platform LIKE 'Spotify%';

-- YouTube Premium
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a youtube.com con el correo y contraseña de tu panel",
  "Si no funciona, cerrá sesión y volvé a iniciar",
  "No cambies la contraseña ni los datos de la cuenta"
]'::jsonb,
    faq_items = '[
  {"q": "¿Incluye YouTube Music?", "a": "Sí, YouTube Premium incluye YouTube Music sin anuncios."},
  {"q": "¿Puedo descargar videos?", "a": "Sí, podés descargar videos para ver offline desde la app."}
]'::jsonb
WHERE platform = 'YouTube Premium';

-- Crunchyroll - POP PREMIUM
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a crunchyroll.com con el correo y contraseña de tu panel",
  "Si tenés problemas para iniciar sesión, contactá soporte"
]'::jsonb,
    faq_items = '[
  {"q": "¿Puedo ver en español?", "a": "Sí, Crunchyroll tiene subtítulos y doblaje en español para la mayoría del contenido."}
]'::jsonb
WHERE platform = 'Crunchyroll' AND supplier_name = 'POP PREMIUM';

-- Paramount+ - POP PREMIUM
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a paramountplus.com con el correo y contraseña de tu panel",
  "Seleccioná tu perfil asignado",
  "Si tenés problemas, contactá soporte por WhatsApp"
]'::jsonb,
    faq_items = '[
  {"q": "¿Puedo ver en Smart TV?", "a": "Sí, Paramount+ está disponible en Smart TV, celular, tablet y computadora."}
]'::jsonb
WHERE platform = 'Paramount+' AND supplier_name = 'POP PREMIUM';

-- FLUJO TV
UPDATE provider_support_config
SET help_steps = '[
  "Descargá la app de FLUJO TV en tu dispositivo",
  "Ingresá con las credenciales de tu panel",
  "Si tenés problemas, contactá soporte por WhatsApp"
]'::jsonb,
    faq_items = '[
  {"q": "¿En qué dispositivos funciona?", "a": "FLUJO TV funciona en Smart TV, celular, tablet y TV Box."}
]'::jsonb
WHERE platform = 'FLUJOTV';

-- VIX
UPDATE provider_support_config
SET help_steps = '[
  "Ingresá a vix.com o descargá la app de ViX",
  "Iniciá sesión con el correo y contraseña de tu panel",
  "Si tenés problemas, contactá soporte por WhatsApp"
]'::jsonb,
    faq_items = '[
  {"q": "¿ViX tiene contenido en español?", "a": "Sí, ViX tiene todo su contenido en español."}
]'::jsonb
WHERE platform = 'Vix';
