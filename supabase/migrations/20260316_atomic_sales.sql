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
