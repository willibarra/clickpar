-- ============================================
-- CLICKPAR - SQL Schema para Supabase
-- Ejecutar este script en el SQL Editor de Supabase
-- ============================================

-- 1. Eliminación de objetos existentes (ejecutar si necesitas resetear)
-- ADVERTENCIA: Esto eliminará todos los datos existentes
-- DROP TABLE IF EXISTS affiliate_codes CASCADE;
-- DROP TABLE IF EXISTS transactions CASCADE;
-- DROP TABLE IF EXISTS subscriptions CASCADE;
-- DROP TABLE IF EXISTS sale_slots CASCADE;
-- DROP TABLE IF EXISTS mother_accounts CASCADE;
-- DROP TABLE IF EXISTS suppliers CASCADE;
-- DROP TABLE IF EXISTS profiles CASCADE;
-- DROP TYPE IF EXISTS user_role CASCADE;
-- DROP TYPE IF EXISTS account_status CASCADE;
-- DROP TYPE IF EXISTS slot_status CASCADE;
-- DROP TYPE IF EXISTS payment_method CASCADE;

-- ============================================
-- 2. CREAR TIPOS ENUM
-- ============================================

CREATE TYPE user_role AS ENUM ('super_admin', 'staff', 'customer', 'affiliate');
CREATE TYPE account_status AS ENUM ('active', 'review', 'dead', 'expired');
CREATE TYPE slot_status AS ENUM ('available', 'sold', 'reserved', 'warranty_claim');
CREATE TYPE payment_method AS ENUM ('bank_transfer', 'tigo_money', 'binance', 'cash');

-- ============================================
-- 3. CREAR TABLAS
-- ============================================

-- PERFILES DE USUARIO (Extiende auth.users de Supabase)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  phone_number TEXT UNIQUE, -- Clave para integración con WhatsApp
  role user_role DEFAULT 'customer',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PROVEEDORES Y GASTOS (Origen del Activo)
CREATE TABLE suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_info TEXT,
  payment_method_preferred TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INVENTARIO: CUENTAS MADRE (El Activo)
CREATE TABLE mother_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID REFERENCES suppliers(id),
  platform TEXT NOT NULL, -- 'Netflix', 'HBO', 'Spotify'
  email TEXT NOT NULL,
  password TEXT NOT NULL, -- Encriptar si es posible, o manejar con RLS estricto
  purchase_cost_usdt DECIMAL(10, 2), -- Costo en Dólares
  purchase_cost_gs DECIMAL(15, 2),   -- Costo en Guaraníes
  renewal_date DATE NOT NULL,        -- Cuándo vence la cuenta con el proveedor
  target_billing_day INT CHECK (target_billing_day BETWEEN 1 AND 31), -- Para lógica "Tetris"
  max_slots INT DEFAULT 5,
  status account_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INVENTARIO: SLOTS DE VENTA (El Producto)
CREATE TABLE sale_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mother_account_id UUID REFERENCES mother_accounts(id) ON DELETE CASCADE,
  slot_identifier TEXT, -- Ej: "Perfil 1", "Pin 1234", "Link Invitación"
  pin_code TEXT,        -- Pin específico del perfil (Netflix)
  status slot_status DEFAULT 'available',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SUSCRIPCIONES ACTIVAS (Relación Cliente-Producto)
CREATE TABLE subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES profiles(id),
  slot_id UUID REFERENCES sale_slots(id),
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL,
  sale_price_gs DECIMAL(15, 2) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  auto_renew BOOLEAN DEFAULT FALSE,
  affiliate_referral_id UUID REFERENCES profiles(id), -- Si vino por un creador
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TRANSACCIONES Y PAGOS (Híbrido Automático/Manual)
CREATE TABLE transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES profiles(id),
  amount DECIMAL(15, 2) NOT NULL,
  currency TEXT DEFAULT 'PYG',
  reference_code TEXT, -- Código del SMS bancario o Hash de transacción
  proof_image_url TEXT, -- URL en Supabase Storage (si es manual)
  status TEXT DEFAULT 'pending', -- 'verified', 'rejected'
  origin_source TEXT DEFAULT 'manual', -- 'android_sms_gateway', 'manual_upload'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AFILIADOS Y REFERIDOS
CREATE TABLE affiliate_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_user_id UUID REFERENCES profiles(id),
  code TEXT UNIQUE NOT NULL, -- Ej: "WILL10"
  discount_percent INT DEFAULT 0,
  commission_percent INT DEFAULT 10,
  total_earnings DECIMAL(15, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RENOVACIONES DE CUENTAS (Historial Financiero)
CREATE TABLE renewals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mother_account_id UUID REFERENCES mother_accounts(id) ON DELETE CASCADE,
  renewal_date DATE NOT NULL,
  purchase_cost_gs DECIMAL(15, 2) NOT NULL,
  expected_slot_price_gs DECIMAL(15, 2) NOT NULL,
  projected_profit_gs DECIMAL(15, 2) NOT NULL,
  actual_profit_gs DECIMAL(15, 2), -- Se calcula al final del ciclo
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. ÍNDICES PARA PERFORMANCE
-- ============================================

CREATE INDEX idx_mother_accounts_platform ON mother_accounts(platform);
CREATE INDEX idx_mother_accounts_status ON mother_accounts(status);
CREATE INDEX idx_mother_accounts_billing_day ON mother_accounts(target_billing_day);
CREATE INDEX idx_sale_slots_status ON sale_slots(status);
CREATE INDEX idx_sale_slots_mother ON sale_slots(mother_account_id);
CREATE INDEX idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_active ON subscriptions(is_active);
CREATE INDEX idx_subscriptions_end_date ON subscriptions(end_date);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_customer ON transactions(customer_id);
CREATE INDEX idx_profiles_phone ON profiles(phone_number);

-- ============================================
-- 5. TRIGGERS PARA AUTO-UPDATE
-- ============================================

-- Función para actualizar updated_at en sale_slots
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sale_slots_updated_at
  BEFORE UPDATE ON sale_slots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mother_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_codes ENABLE ROW LEVEL SECURITY;

-- Políticas para PROFILES
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'staff')
    )
  );

-- Políticas para MOTHER_ACCOUNTS (solo admin/staff)
CREATE POLICY "Admins can manage mother_accounts" ON mother_accounts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'staff')
    )
  );

-- Políticas para SALE_SLOTS (solo admin/staff)
CREATE POLICY "Admins can manage sale_slots" ON sale_slots
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'staff')
    )
  );

-- Políticas para SUBSCRIPTIONS
CREATE POLICY "Customers can view own subscriptions" ON subscriptions
  FOR SELECT USING (customer_id = auth.uid());

CREATE POLICY "Admins can manage subscriptions" ON subscriptions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'staff')
    )
  );

-- Políticas para TRANSACTIONS
CREATE POLICY "Customers can view own transactions" ON transactions
  FOR SELECT USING (customer_id = auth.uid());

CREATE POLICY "Customers can insert transactions" ON transactions
  FOR INSERT WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Admins can manage transactions" ON transactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'staff')
    )
  );

-- Políticas para SUPPLIERS (solo super_admin)
CREATE POLICY "Super admins can manage suppliers" ON suppliers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role = 'super_admin'
    )
  );

-- Políticas para AFFILIATE_CODES
CREATE POLICY "Affiliates can view own codes" ON affiliate_codes
  FOR SELECT USING (affiliate_user_id = auth.uid());

CREATE POLICY "Admins can manage affiliate_codes" ON affiliate_codes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'staff')
    )
  );

-- ============================================
-- 7. TRIGGER PARA CREAR PERFIL AUTOMÁTICAMENTE
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 8. SISTEMA DE TICKETS DE SOPORTE
-- ============================================

-- Enums para tickets
CREATE TYPE ticket_type AS ENUM ('cuenta_caida', 'no_conecta', 'cambio_correo', 'pin_olvidado', 'otro');
CREATE TYPE ticket_status AS ENUM ('abierto', 'en_proceso', 'resuelto', 'cerrado');
CREATE TYPE ticket_channel AS ENUM ('whatsapp', 'panel', 'sistema_automatico');

-- Tabla de tickets
CREATE TABLE support_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES profiles(id),
  subscription_id UUID REFERENCES subscriptions(id),
  mother_account_id UUID REFERENCES mother_accounts(id),
  tipo ticket_type NOT NULL DEFAULT 'otro',
  descripcion TEXT,
  estado ticket_status DEFAULT 'abierto',
  canal_origen ticket_channel DEFAULT 'panel',
  staff_asignado_id UUID REFERENCES profiles(id),
  resolucion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Índices
CREATE INDEX idx_tickets_customer ON support_tickets(customer_id);
CREATE INDEX idx_tickets_estado ON support_tickets(estado);
CREATE INDEX idx_tickets_tipo ON support_tickets(tipo);
CREATE INDEX idx_tickets_created ON support_tickets(created_at DESC);
CREATE INDEX idx_tickets_mother ON support_tickets(mother_account_id);

-- Trigger updated_at
CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view own tickets" ON support_tickets
  FOR SELECT USING (customer_id = auth.uid());

CREATE POLICY "Customers can insert own tickets" ON support_tickets
  FOR INSERT WITH CHECK (customer_id = auth.uid());

CREATE POLICY "Admins can manage tickets" ON support_tickets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'staff'))
  );

-- Service role bypass (para cron jobs y webhooks)
CREATE POLICY "Service role bypass tickets" ON support_tickets
  FOR ALL USING (auth.role() = 'service_role');
