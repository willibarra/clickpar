-- ============================================
-- CLICKPAR - Migración: Panel de Revendedores
-- Ejecutar en el SQL Editor de Supabase
-- Fecha: 2026-03-27
-- ============================================

-- 1. Agregar 'reseller' al enum user_role
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'reseller';

-- ============================================
-- 2. NUEVAS TABLAS
-- ============================================

-- Stock asignado a cada revendedor (qué slots tiene para vender)
CREATE TABLE IF NOT EXISTS reseller_stock (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  slot_id UUID REFERENCES sale_slots(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL,           -- plataforma (desnormalizado para queries rápidas)
  slot_identifier TEXT NOT NULL,    -- identificador del perfil (NO email/password)
  sale_price_gs DECIMAL(15,2),      -- precio al que el revendedor debe vender (fijado por ClickPar)
  status TEXT DEFAULT 'available',  -- 'available' | 'sold'
  assigned_by UUID REFERENCES profiles(id), -- admin que asignó
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(slot_id) -- un slot solo puede estar en un revendedor a la vez
);

-- Ventas del revendedor a sus clientes finales
CREATE TABLE IF NOT EXISTS reseller_sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_id UUID REFERENCES profiles(id) ON DELETE RESTRICT NOT NULL,
  reseller_stock_id UUID REFERENCES reseller_stock(id) ON DELETE RESTRICT NOT NULL,
  cliente_nombre TEXT NOT NULL,
  cliente_telefono TEXT,
  plataforma TEXT NOT NULL,
  slot_identifier TEXT NOT NULL,    -- identificador del perfil vendido
  fecha_venta TIMESTAMPTZ DEFAULT NOW(),
  precio_venta_gs DECIMAL(15,2) NOT NULL,
  end_date DATE,                    -- fecha de vencimiento del perfil para el cliente final
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comisiones calculadas automáticamente por cada venta
CREATE TABLE IF NOT EXISTS reseller_commissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_id UUID REFERENCES profiles(id) ON DELETE RESTRICT NOT NULL,
  reseller_sale_id UUID REFERENCES reseller_sales(id) ON DELETE CASCADE NOT NULL,
  commission_percent DECIMAL(5,2) NOT NULL,
  base_amount_gs DECIMAL(15,2) NOT NULL,  -- precio de venta
  commission_gs DECIMAL(15,2) NOT NULL,   -- monto calculado
  status TEXT DEFAULT 'pending',          -- 'pending' | 'paid'
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Configuración de comisión por revendedor (% personalizado)
CREATE TABLE IF NOT EXISTS reseller_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  commission_percent DECIMAL(5,2) DEFAULT 10.00,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Solicitudes de más stock enviadas por revendedores al admin
CREATE TABLE IF NOT EXISTS reseller_stock_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL,
  quantity_requested INT NOT NULL CHECK (quantity_requested > 0),
  notes TEXT,
  status TEXT DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  admin_notes TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. ÍNDICES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_reseller_stock_reseller ON reseller_stock(reseller_id);
CREATE INDEX IF NOT EXISTS idx_reseller_stock_status ON reseller_stock(status);
CREATE INDEX IF NOT EXISTS idx_reseller_sales_reseller ON reseller_sales(reseller_id);
CREATE INDEX IF NOT EXISTS idx_reseller_sales_active ON reseller_sales(is_active);
CREATE INDEX IF NOT EXISTS idx_reseller_sales_end_date ON reseller_sales(end_date);
CREATE INDEX IF NOT EXISTS idx_reseller_commissions_reseller ON reseller_commissions(reseller_id);
CREATE INDEX IF NOT EXISTS idx_reseller_commissions_status ON reseller_commissions(status);
CREATE INDEX IF NOT EXISTS idx_reseller_requests_status ON reseller_stock_requests(status);
CREATE INDEX IF NOT EXISTS idx_reseller_requests_reseller ON reseller_stock_requests(reseller_id);

-- ============================================
-- 4. TRIGGERS
-- ============================================

-- Trigger: crear comisión automáticamente al insertar una venta de revendedor
CREATE OR REPLACE FUNCTION auto_create_reseller_commission()
RETURNS TRIGGER AS $$
DECLARE
  v_commission_percent DECIMAL(5,2);
BEGIN
  -- Obtener % de comisión configurado para el revendedor
  SELECT commission_percent INTO v_commission_percent
  FROM reseller_config
  WHERE reseller_id = NEW.reseller_id;
  
  -- Default al 10% si no está configurado
  IF v_commission_percent IS NULL THEN
    v_commission_percent := 10.00;
  END IF;
  
  -- Insertar registro de comisión
  INSERT INTO reseller_commissions (
    reseller_id,
    reseller_sale_id,
    commission_percent,
    base_amount_gs,
    commission_gs
  ) VALUES (
    NEW.reseller_id,
    NEW.id,
    v_commission_percent,
    NEW.precio_venta_gs,
    ROUND(NEW.precio_venta_gs * v_commission_percent / 100.0, 0)
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_reseller_commission ON reseller_sales;
CREATE TRIGGER trigger_reseller_commission
  AFTER INSERT ON reseller_sales
  FOR EACH ROW EXECUTE FUNCTION auto_create_reseller_commission();

-- Trigger: marcar slot como 'sold' al registrar una venta
CREATE OR REPLACE FUNCTION mark_reseller_stock_sold()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE reseller_stock
  SET status = 'sold', updated_at = NOW()
  WHERE id = NEW.reseller_stock_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_mark_stock_sold ON reseller_sales;
CREATE TRIGGER trigger_mark_stock_sold
  AFTER INSERT ON reseller_sales
  FOR EACH ROW EXECUTE FUNCTION mark_reseller_stock_sold();

-- Trigger: actualizar updated_at en reseller_stock
DROP TRIGGER IF EXISTS update_reseller_stock_updated_at ON reseller_stock;
CREATE TRIGGER update_reseller_stock_updated_at
  BEFORE UPDATE ON reseller_stock
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: actualizar updated_at en reseller_config
DROP TRIGGER IF EXISTS update_reseller_config_updated_at ON reseller_config;
CREATE TRIGGER update_reseller_config_updated_at
  BEFORE UPDATE ON reseller_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: actualizar updated_at en reseller_stock_requests
DROP TRIGGER IF EXISTS update_reseller_requests_updated_at ON reseller_stock_requests;
CREATE TRIGGER update_reseller_requests_updated_at
  BEFORE UPDATE ON reseller_stock_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE reseller_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE reseller_stock_requests ENABLE ROW LEVEL SECURITY;

-- Revendedor: solo ve su propio stock
CREATE POLICY "Reseller sees own stock" ON reseller_stock
  FOR SELECT USING (reseller_id = auth.uid());

-- Revendedor: ve y gestiona sus propias ventas
CREATE POLICY "Reseller manages own sales" ON reseller_sales
  FOR ALL USING (reseller_id = auth.uid());

-- Revendedor: ve sus propias comisiones
CREATE POLICY "Reseller sees own commissions" ON reseller_commissions
  FOR SELECT USING (reseller_id = auth.uid());

-- Revendedor: gestiona sus solicitudes de stock
CREATE POLICY "Reseller manages own requests" ON reseller_stock_requests
  FOR ALL USING (reseller_id = auth.uid());

-- Revendedor: ve su config de comisión
CREATE POLICY "Reseller sees own config" ON reseller_config
  FOR SELECT USING (reseller_id = auth.uid());

-- Admin: acceso total a todas las tablas de revendedor
CREATE POLICY "Admins manage all reseller_stock" ON reseller_stock
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'staff'))
  );

CREATE POLICY "Admins manage all reseller_sales" ON reseller_sales
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'staff'))
  );

CREATE POLICY "Admins manage all commissions" ON reseller_commissions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'staff'))
  );

CREATE POLICY "Admins manage reseller_config" ON reseller_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'staff'))
  );

CREATE POLICY "Admins manage stock_requests" ON reseller_stock_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'staff'))
  );
