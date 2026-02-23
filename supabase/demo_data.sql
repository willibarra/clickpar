-- ============================================
-- CLICKPAR - DATOS DEMO
-- Ejecutar después de crear los usuarios
-- ============================================

-- 1. PROVEEDOR DEMO
INSERT INTO suppliers (id, name, contact_info, payment_method_preferred) VALUES
  ('11111111-1111-1111-1111-111111111111', 'StreamMax Wholesale', 'WhatsApp: +595991234567', 'binance');

-- 2. CUENTAS MADRE NETFLIX (2 cuentas)
INSERT INTO mother_accounts (id, supplier_id, platform, email, password, purchase_cost_usdt, purchase_cost_gs, renewal_date, target_billing_day, max_slots, status) VALUES
  ('aaaa1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Netflix', 'netflix.cuenta1@gmail.com', 'Netflix2024!', 12.00, 90000.00, '2026-02-15', 15, 5, 'active'),
  ('aaaa2222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Netflix', 'netflix.cuenta2@gmail.com', 'Netflix2024#', 12.00, 90000.00, '2026-02-20', 20, 5, 'active');

-- 3. CUENTAS MADRE SPOTIFY PREMIUM (2 cuentas)
INSERT INTO mother_accounts (id, supplier_id, platform, email, password, purchase_cost_usdt, purchase_cost_gs, renewal_date, target_billing_day, max_slots, status) VALUES
  ('bbbb1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Spotify', 'spotify.familia1@gmail.com', 'Spotify2024!', 8.00, 60000.00, '2026-02-10', 10, 6, 'active'),
  ('bbbb2222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Spotify', 'spotify.familia2@gmail.com', 'Spotify2024#', 8.00, 60000.00, '2026-02-25', 25, 6, 'active');

-- 4. SLOTS PARA NETFLIX CUENTA 1 (5 perfiles)
INSERT INTO sale_slots (id, mother_account_id, slot_identifier, pin_code, status) VALUES
  ('cccc0001-0001-0001-0001-000000000001', 'aaaa1111-1111-1111-1111-111111111111', 'Perfil 1', '1234', 'sold'),
  ('cccc0001-0001-0001-0001-000000000002', 'aaaa1111-1111-1111-1111-111111111111', 'Perfil 2', '5678', 'available'),
  ('cccc0001-0001-0001-0001-000000000003', 'aaaa1111-1111-1111-1111-111111111111', 'Perfil 3', '9012', 'available'),
  ('cccc0001-0001-0001-0001-000000000004', 'aaaa1111-1111-1111-1111-111111111111', 'Perfil 4', '3456', 'reserved'),
  ('cccc0001-0001-0001-0001-000000000005', 'aaaa1111-1111-1111-1111-111111111111', 'Perfil 5', '7890', 'available');

-- 5. SLOTS PARA NETFLIX CUENTA 2 (5 perfiles)
INSERT INTO sale_slots (id, mother_account_id, slot_identifier, pin_code, status) VALUES
  ('cccc0002-0002-0002-0002-000000000001', 'aaaa2222-2222-2222-2222-222222222222', 'Perfil 1', '1111', 'available'),
  ('cccc0002-0002-0002-0002-000000000002', 'aaaa2222-2222-2222-2222-222222222222', 'Perfil 2', '2222', 'available'),
  ('cccc0002-0002-0002-0002-000000000003', 'aaaa2222-2222-2222-2222-222222222222', 'Perfil 3', '3333', 'sold'),
  ('cccc0002-0002-0002-0002-000000000004', 'aaaa2222-2222-2222-2222-222222222222', 'Perfil 4', '4444', 'available'),
  ('cccc0002-0002-0002-0002-000000000005', 'aaaa2222-2222-2222-2222-222222222222', 'Perfil 5', '5555', 'available');

-- 6. SLOTS PARA SPOTIFY CUENTA 1 (6 miembros familia)
INSERT INTO sale_slots (id, mother_account_id, slot_identifier, status) VALUES
  ('dddd0001-0001-0001-0001-000000000001', 'bbbb1111-1111-1111-1111-111111111111', 'Miembro 1 (Admin)', 'sold'),
  ('dddd0001-0001-0001-0001-000000000002', 'bbbb1111-1111-1111-1111-111111111111', 'Miembro 2', 'sold'),
  ('dddd0001-0001-0001-0001-000000000003', 'bbbb1111-1111-1111-1111-111111111111', 'Miembro 3', 'available'),
  ('dddd0001-0001-0001-0001-000000000004', 'bbbb1111-1111-1111-1111-111111111111', 'Miembro 4', 'available'),
  ('dddd0001-0001-0001-0001-000000000005', 'bbbb1111-1111-1111-1111-111111111111', 'Miembro 5', 'available'),
  ('dddd0001-0001-0001-0001-000000000006', 'bbbb1111-1111-1111-1111-111111111111', 'Miembro 6', 'available');

-- 7. SLOTS PARA SPOTIFY CUENTA 2 (6 miembros familia)
INSERT INTO sale_slots (id, mother_account_id, slot_identifier, status) VALUES
  ('dddd0002-0002-0002-0002-000000000001', 'bbbb2222-2222-2222-2222-222222222222', 'Miembro 1 (Admin)', 'sold'),
  ('dddd0002-0002-0002-0002-000000000002', 'bbbb2222-2222-2222-2222-222222222222', 'Miembro 2', 'available'),
  ('dddd0002-0002-0002-0002-000000000003', 'bbbb2222-2222-2222-2222-222222222222', 'Miembro 3', 'available'),
  ('dddd0002-0002-0002-0002-000000000004', 'bbbb2222-2222-2222-2222-222222222222', 'Miembro 4', 'available'),
  ('dddd0002-0002-0002-0002-000000000005', 'bbbb2222-2222-2222-2222-222222222222', 'Miembro 5', 'available'),
  ('dddd0002-0002-0002-0002-000000000006', 'bbbb2222-2222-2222-2222-222222222222', 'Miembro 6', 'available');
