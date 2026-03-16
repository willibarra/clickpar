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
