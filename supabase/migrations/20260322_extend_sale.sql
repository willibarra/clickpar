-- ============================================
-- CLICKPAR — EXTEND SALE ATOMIC
-- Cierra la venta activa y crea una nueva
-- preservando el slot (no se libera).
-- La nueva venta comienza desde end_date
-- de la venta anterior (no desde hoy).
-- ============================================

CREATE OR REPLACE FUNCTION extend_sale_atomic(
    p_sale_id     UUID,
    p_extra_days  INT,
    p_amount_gs   NUMERIC,
    p_notes       TEXT DEFAULT NULL
)
RETURNS TABLE (
    new_sale_id  UUID,
    new_end_date DATE
) AS $$
DECLARE
    v_customer_id       UUID;
    v_slot_id           UUID;
    v_old_end_date      DATE;
    v_new_start_date    DATE;
    v_new_end_date      DATE;
    v_new_sale_id       UUID;
    v_payment_method    TEXT;
    v_is_active         BOOLEAN;
BEGIN
    -- 1. Lock and read the existing sale
    SELECT s.customer_id, s.slot_id, s.end_date, s.payment_method, s.is_active
    INTO v_customer_id, v_slot_id, v_old_end_date, v_payment_method, v_is_active
    FROM sales s
    WHERE s.id = p_sale_id
    FOR UPDATE;

    IF v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Venta % no encontrada', p_sale_id;
    END IF;

    IF NOT v_is_active THEN
        RAISE EXCEPTION 'La venta % ya no está activa', p_sale_id;
    END IF;

    IF v_old_end_date IS NULL THEN
        -- Si no tiene end_date, empezar desde hoy
        v_new_start_date := CURRENT_DATE;
    ELSE
        v_new_start_date := v_old_end_date;
    END IF;

    v_new_end_date := v_new_start_date + p_extra_days;

    -- 2. Deactivate old sale (keep for financial history)
    UPDATE sales
    SET is_active = false
    WHERE id = p_sale_id;

    -- 3. Create new sale (slot stays 'sold' — no change needed)
    INSERT INTO sales (
        customer_id,
        slot_id,
        amount_gs,
        original_price_gs,
        override_price,
        start_date,
        end_date,
        is_active,
        payment_method
    ) VALUES (
        v_customer_id,
        v_slot_id,
        p_amount_gs,
        p_amount_gs,
        false,
        v_new_start_date,
        v_new_end_date,
        true,
        COALESCE(v_payment_method, 'cash')
    )
    RETURNING id INTO v_new_sale_id;

    RETURN QUERY SELECT v_new_sale_id, v_new_end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'Migración extend_sale completada' AS resultado;
SELECT COUNT(*) > 0 AS extend_fn_exists
FROM information_schema.routines
WHERE routine_name = 'extend_sale_atomic';
