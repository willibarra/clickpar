-- ============================================================
-- CLICKPAR - Wallet Hardening: Funciones RPC atómicas
-- Fecha: 2026-04-06
-- Resuelve: Race conditions en balance, slots y top-ups
-- ============================================================

-- ============================================================
-- 1. purchase_from_store — Compra atómica desde la tienda
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
    v_slot_id UUID;
    v_slot_identifier TEXT;
    v_pin_code TEXT;
    v_sale_id UUID;
    v_current_balance DECIMAL(15,2);
BEGIN
    -- 1. Bloquear la fila del customer (SELECT FOR UPDATE evita race conditions)
    SELECT wallet_balance INTO v_current_balance
    FROM customers WHERE id = p_customer_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cliente no encontrado');
    END IF;

    -- 2. Obtener precio y plataforma de la cuenta madre
    SELECT slot_price_gs, platform INTO v_price, v_platform
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

    -- 4. Seleccionar un slot disponible con FOR UPDATE SKIP LOCKED
    --    (evita que dos transacciones concurrentes tomen el mismo slot)
    SELECT id, slot_identifier, pin_code
    INTO v_slot_id, v_slot_identifier, v_pin_code
    FROM sale_slots
    WHERE mother_account_id = p_account_id AND status = 'available'
    FOR UPDATE SKIP LOCKED
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

-- ============================================================
-- 2. credit_wallet — Acreditación atómica de saldo
-- ============================================================

CREATE OR REPLACE FUNCTION credit_wallet(
    p_customer_id UUID,
    p_amount DECIMAL(15,2),
    p_concept TEXT,
    p_reference_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_balance DECIMAL(15,2);
BEGIN
    -- Validar monto positivo
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El monto debe ser positivo');
    END IF;

    -- Bloquear fila y acreditar atómicamente
    UPDATE customers
    SET wallet_balance = wallet_balance + p_amount
    WHERE id = p_customer_id
    RETURNING wallet_balance INTO v_new_balance;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cliente no encontrado');
    END IF;

    -- Insertar movimiento en el ledger
    INSERT INTO wallet_transactions (customer_id, amount, type, concept, reference_id)
    VALUES (p_customer_id, p_amount, 'credit', p_concept, p_reference_id);

    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_balance,
        'credited', p_amount
    );
END;
$$;

-- ============================================================
-- 3. UNIQUE index en portal_user_id
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_portal_user_id
    ON customers(portal_user_id)
    WHERE portal_user_id IS NOT NULL;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

SELECT
    (SELECT COUNT(*) FROM pg_proc WHERE proname = 'purchase_from_store') AS purchase_fn_exists,
    (SELECT COUNT(*) FROM pg_proc WHERE proname = 'credit_wallet') AS credit_fn_exists;
