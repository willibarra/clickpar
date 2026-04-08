-- ============================================
-- CLICKPAR — COMBO SALES GROUPING
-- Adds combo_id to link sales that belong
-- to the same combo purchase.
-- ============================================

-- 1. New column
ALTER TABLE sales ADD COLUMN IF NOT EXISTS combo_id UUID DEFAULT NULL;

-- 2. Index for fast combo lookups
CREATE INDEX IF NOT EXISTS idx_sales_combo_id ON sales(combo_id) WHERE combo_id IS NOT NULL;

-- 3. Helper: get all sibling sales in a combo
CREATE OR REPLACE FUNCTION get_combo_siblings(p_sale_id UUID)
RETURNS TABLE (
    sale_id      UUID,
    slot_id      UUID,
    customer_id  UUID,
    amount_gs    NUMERIC,
    start_date   DATE,
    end_date     DATE,
    is_active    BOOLEAN,
    combo_id     UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.slot_id, s.customer_id, s.amount_gs,
           s.start_date, s.end_date, s.is_active, s.combo_id
    FROM sales s
    WHERE s.combo_id = (
        SELECT s2.combo_id FROM sales s2 WHERE s2.id = p_sale_id
    )
    AND s.combo_id IS NOT NULL
    ORDER BY s.amount_gs DESC; -- primary (with amount) first
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Extend combo atomically: extends ALL sales in the combo
CREATE OR REPLACE FUNCTION extend_combo_atomic(
    p_any_sale_id  UUID,
    p_extra_days   INT,
    p_amount_gs    NUMERIC,
    p_notes        TEXT DEFAULT NULL
)
RETURNS TABLE (
    new_combo_id   UUID,
    new_end_date   DATE,
    sales_extended INT
) AS $$
DECLARE
    v_combo_id       UUID;
    v_new_combo_id   UUID;
    v_new_end_date   DATE;
    v_count          INT := 0;
    v_primary_done   BOOLEAN := false;
    rec              RECORD;
BEGIN
    -- Get combo_id from the provided sale
    SELECT s.combo_id INTO v_combo_id
    FROM sales s WHERE s.id = p_any_sale_id;

    IF v_combo_id IS NULL THEN
        RAISE EXCEPTION 'La venta % no pertenece a un combo', p_any_sale_id;
    END IF;

    -- Generate new combo_id for the extended group
    v_new_combo_id := gen_random_uuid();

    -- Process each active sale in the combo
    FOR rec IN
        SELECT s.id, s.customer_id, s.slot_id, s.amount_gs,
               s.end_date, s.payment_method
        FROM sales s
        WHERE s.combo_id = v_combo_id AND s.is_active = true
        FOR UPDATE
    LOOP
        -- Calculate new dates
        DECLARE
            v_new_start DATE;
        BEGIN
            IF rec.end_date IS NULL THEN
                v_new_start := CURRENT_DATE;
            ELSE
                v_new_start := rec.end_date;
            END IF;
            v_new_end_date := v_new_start + p_extra_days;

            -- Deactivate old sale
            UPDATE sales SET is_active = false WHERE id = rec.id;

            -- Create new sale — only first one gets the amount
            INSERT INTO sales (
                customer_id, slot_id, amount_gs, original_price_gs,
                override_price, start_date, end_date, is_active,
                payment_method, combo_id
            ) VALUES (
                rec.customer_id, rec.slot_id,
                CASE WHEN NOT v_primary_done THEN p_amount_gs ELSE 0 END,
                p_amount_gs,
                false, v_new_start, v_new_end_date, true,
                COALESCE(rec.payment_method, 'cash'),
                v_new_combo_id
            );

            IF NOT v_primary_done THEN
                v_primary_done := true;
            END IF;
            v_count := v_count + 1;
        END;
    END LOOP;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'No hay ventas activas en el combo %', v_combo_id;
    END IF;

    RETURN QUERY SELECT v_new_combo_id, v_new_end_date, v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'Migración combo_sales completada' AS resultado;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'sales' AND column_name = 'combo_id';
