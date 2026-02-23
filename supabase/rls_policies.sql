-- ============================================
-- RLS POLICIES - Ejecutar en Supabase SQL Editor
-- ============================================

-- Políticas para PROFILES
-- Cualquier usuario autenticado puede ver perfiles
CREATE POLICY "Read all profiles" ON profiles FOR SELECT TO authenticated USING (true);
-- Solo el usuario puede actualizar su propio perfil
CREATE POLICY "Update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Políticas para SUPPLIERS
-- Staff y Admin pueden ver proveedores
CREATE POLICY "Staff+ read suppliers" ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage suppliers" ON suppliers FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'staff'))
);

-- Políticas para MOTHER_ACCOUNTS
-- Staff y Admin pueden ver cuentas madre
CREATE POLICY "Staff+ read accounts" ON mother_accounts FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'staff'))
);
CREATE POLICY "Admin manage accounts" ON mother_accounts FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'staff'))
);

-- Políticas para SALE_SLOTS
CREATE POLICY "Staff+ read slots" ON sale_slots FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'staff'))
);
CREATE POLICY "Staff+ manage slots" ON sale_slots FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'staff'))
);

-- Políticas para SUBSCRIPTIONS
CREATE POLICY "Staff+ read subs" ON subscriptions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'staff'))
);
-- Cliente puede ver sus propias suscripciones
CREATE POLICY "Customer read own subs" ON subscriptions FOR SELECT TO authenticated USING (customer_id = auth.uid());

-- Políticas para TRANSACTIONS
CREATE POLICY "Staff+ read transactions" ON transactions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'staff'))
);
CREATE POLICY "Customer read own transactions" ON transactions FOR SELECT TO authenticated USING (customer_id = auth.uid());

-- Políticas para AFFILIATE_CODES
CREATE POLICY "Read affiliate codes" ON affiliate_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Affiliate manage own codes" ON affiliate_codes FOR ALL TO authenticated USING (affiliate_user_id = auth.uid());
