-- ============================================================
-- CLICKPAR - Priorizar cuentas frescas en compras de tienda
-- Fecha: 2026-04-06
-- Resuelve: Asignar slots de cuentas madre más recientemente
--           renovadas para vaciar las cuentas viejas primero.
-- ============================================================

CREATE OR REPLACE FUNCTION purchase_from_store(
    p_customer_id UUID,
    p_account_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_price DECIMAL(15,2);
    v_platform TEXT;
    v_sale_type TEXT;
    v_slot_id UUID;
    v_slot_identifier TEXT;
    v_pin_code TEXT;
    v_sale_id UUID;
    v_current_balance DECIMAL(15,2);
    v_actual_account_id UUID;
BEGIN
    -- 1. Bloquear la fila del customer (SELECT FOR UPDATE evita race conditions)
    SELECT wallet_balance INTO v_current_balance
    FROM customers WHERE id = p_customer_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cliente no encontrado');
    END IF;

    -- 2. Obtener platform y sale_type de la cuenta madre de referencia
    --    (la que el frontend envía como representante del producto)
    SELECT platform, COALESCE(sale_type, 'profile'), slot_price_gs
    INTO v_platform, v_sale_type, v_price
    FROM mother_accounts
    WHERE id = p_account_id AND show_in_store = TRUE AND status = 'active';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Producto no disponible en la tienda');
    END IF;

    -- Normalizar precio
    v_price := COALESCE(v_price, 25000);

    -- 3. Verificar saldo suficiente
    IF v_current_balance < v_price THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Saldo insuficiente',
            'code', 'INSUFFICIENT_BALANCE',
            'required', v_price,
            'available', v_current_balance
        );
    END IF;

    -- 4. Seleccionar slot disponible PRIORIZANDO cuentas madre más frescas.
    --    ORDER BY renewal_date DESC NULLS LAST → las cuentas renovadas más
    --    recientemente se asignan primero, vaciando las viejas antes.
    --    FOR UPDATE SKIP LOCKED evita que dos transacciones concurrentes
    --    tomen el mismo slot.
    SELECT ss.id, ss.slot_identifier, ss.pin_code, ss.mother_account_id
    INTO v_slot_id, v_slot_identifier, v_pin_code, v_actual_account_id
    FROM sale_slots ss
    INNER JOIN mother_accounts ma ON ma.id = ss.mother_account_id
    WHERE ma.platform = v_platform
      AND COALESCE(ma.sale_type, 'profile') = v_sale_type
      AND ma.show_in_store = TRUE
      AND ma.status = 'active'
      AND ss.status = 'available'
    ORDER BY ma.renewal_date DESC NULLS LAST
    FOR UPDATE OF ss SKIP LOCKED
    LIMIT 1;

    IF v_slot_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No hay slots disponibles en este plan en este momento.');
    END IF;

    -- 5. Deducir saldo de forma atómica (wallet_balance = wallet_balance - price)
    UPDATE customers
    SET wallet_balance = wallet_balance - v_price
    WHERE id = p_customer_id;

    -- 6. Marcar slot como vendido
    UPDATE sale_slots SET status = 'sold' WHERE id = v_slot_id;

    -- 7. Crear registro de venta
    INSERT INTO sales (slot_id, customer_id, amount_gs, payment_method, start_date, end_date, is_active, sold_by)
    VALUES (v_slot_id, p_customer_id, v_price, 'wallet', NOW(), NOW() + INTERVAL '30 days', TRUE, p_user_id)
    RETURNING id INTO v_sale_id;

    -- 8. Insertar movimiento en el ledger de billetera
    INSERT INTO wallet_transactions (customer_id, amount, type, concept, reference_id)
    VALUES (p_customer_id, -v_price, 'debit', 'Compra ' || v_platform || ' — Tienda ClickPar', v_sale_id);

    -- Todo OK: retornar resultado
    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'platform', v_platform,
        'amount', v_price,
        'new_balance', v_current_balance - v_price
    );
END;
$$;
