-- ============================================================
-- CLICKPAR - Funcionalidad Tienda Asíncrona & Cuentas Completas
-- ============================================================

-- 1. Crear tabla para activaciones pendientes (Cuentas Familiares o Bajo Demanda)
CREATE TABLE IF NOT EXISTS pending_activations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    activation_type TEXT NOT NULL, -- 'own_email' or 'new_email'
    email TEXT,
    password TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indice para facilitar consultas de panel admin
CREATE INDEX IF NOT EXISTS idx_pending_activations_status ON pending_activations(status);

-- 2. Modificar función existente para soportar compras asíncronas
CREATE OR REPLACE FUNCTION purchase_async_from_store(
    p_customer_id UUID,
    p_account_id UUID,
    p_user_id UUID,
    p_activation_type TEXT,
    p_email TEXT,
    p_password TEXT,
    p_is_full_account BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_price DECIMAL(15,2);
    v_platform TEXT;
    v_slot_id UUID;
    v_sale_id UUID;
    v_current_balance DECIMAL(15,2);
    v_max_slots INTEGER;
    v_available_slots INTEGER;
BEGIN
    -- 1. Bloquear la fila del customer (SELECT FOR UPDATE evita race conditions)
    SELECT wallet_balance INTO v_current_balance
    FROM customers WHERE id = p_customer_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cliente no encontrado');
    END IF;

    -- 2. Obtener datos de la cuenta madre
    SELECT slot_price_gs, platform, max_slots INTO v_price, v_platform, v_max_slots
    FROM mother_accounts
    WHERE id = p_account_id AND show_in_store = TRUE AND status = 'active';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Producto no disponible en la tienda');
    END IF;

    v_price := COALESCE(v_price, 25000);

    -- Si es cuenta completa, calcular importe total y ver disponibilidad
    IF p_is_full_account THEN
        v_price := v_price * v_max_slots;
        
        -- Contar slots disponibles
        SELECT COUNT(*) INTO v_available_slots
        FROM sale_slots
        WHERE mother_account_id = p_account_id AND status = 'available';

        IF v_available_slots < v_max_slots THEN
             RETURN jsonb_build_object('success', false, 'error', 'La cuenta ya no está completamente disponible.');
        END IF;

        -- Bloquear y tomar el primer slot como representativo de la venta
        SELECT id
        INTO v_slot_id
        FROM sale_slots
        WHERE mother_account_id = p_account_id AND status = 'available'
        ORDER BY slot_identifier ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1;

        IF v_slot_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Error al asignar la cuenta. Intente de nuevo.');
        END IF;
    ELSE
        -- 3. Seleccionar UN slot disponible con FOR UPDATE SKIP LOCKED
        SELECT id
        INTO v_slot_id
        FROM sale_slots
        WHERE mother_account_id = p_account_id AND status = 'available'
        FOR UPDATE SKIP LOCKED
        LIMIT 1;

        IF v_slot_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'No hay slots disponibles en este momento.');
        END IF;
    END IF;

    -- 4. Verificar saldo
    IF v_current_balance < v_price THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Saldo insuficiente',
            'code', 'INSUFFICIENT_BALANCE',
            'required', v_price,
            'available', v_current_balance
        );
    END IF;

    -- 5. Deducir saldo
    UPDATE customers
    SET wallet_balance = wallet_balance - v_price
    WHERE id = p_customer_id;

    -- 6. Marcar slot(s) como vendido(s)
    IF p_is_full_account THEN
        UPDATE sale_slots SET status = 'sold' WHERE mother_account_id = p_account_id;
    ELSE
        UPDATE sale_slots SET status = 'sold' WHERE id = v_slot_id;
    END IF;

    -- 7. Crear registro de venta (estado INACTIVO por ser asíncrono)
    INSERT INTO sales (slot_id, customer_id, amount_gs, payment_method, start_date, end_date, is_active, sold_by)
    VALUES (v_slot_id, p_customer_id, v_price, 'wallet', NOW(), NOW() + INTERVAL '30 days', FALSE, p_user_id)
    RETURNING id INTO v_sale_id;

    -- 8. Insertar movimiento en el ledger de billetera
    INSERT INTO wallet_transactions (customer_id, amount, type, concept, reference_id)
    VALUES (p_customer_id, -v_price, 'debit', 'Reserva ' || v_platform || ' — Tienda ClickPar', v_sale_id);

    -- 9. Registrar la activación pendiente
    INSERT INTO pending_activations (sale_id, customer_id, platform, activation_type, email, password)
    VALUES (v_sale_id, p_customer_id, v_platform, p_activation_type, p_email, p_password);

    -- Todo OK: retornar resultado
    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'platform', v_platform,
        'amount', v_price,
        'new_balance', v_current_balance - v_price,
        'is_async', true
    );
END;
$$;
