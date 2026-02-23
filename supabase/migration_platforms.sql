-- ============================================
-- MIGRACIÓN: Tabla de Plataformas Dinámicas
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- Crear enum para tipo de modelo de negocio
DO $$ BEGIN
    CREATE TYPE platform_business_type AS ENUM ('family_account', 'profile_sharing');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Crear tabla de plataformas
CREATE TABLE IF NOT EXISTS platforms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE, -- para URLs y referencias internas
  business_type platform_business_type NOT NULL DEFAULT 'profile_sharing',
  icon_color TEXT DEFAULT '#666666', -- Color hexadecimal para la UI
  default_max_slots INT DEFAULT 5,
  default_slot_price_gs DECIMAL(15, 2) DEFAULT 30000,
  slot_label TEXT DEFAULT 'Perfil', -- "Perfil" para Netflix, "Miembro" para Spotify
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar plataformas por defecto
INSERT INTO platforms (name, slug, business_type, icon_color, default_max_slots, slot_label) VALUES
  ('Netflix', 'netflix', 'profile_sharing', '#E50914', 5, 'Perfil'),
  ('Spotify', 'spotify', 'family_account', '#1DB954', 6, 'Miembro'),
  ('HBO Max', 'hbo-max', 'profile_sharing', '#5c16c5', 5, 'Perfil'),
  ('Disney+', 'disney-plus', 'profile_sharing', '#0063e5', 4, 'Perfil'),
  ('Amazon Prime', 'amazon-prime', 'profile_sharing', '#00a8e1', 3, 'Perfil'),
  ('YouTube Premium', 'youtube-premium', 'family_account', '#ff0000', 6, 'Miembro'),
  ('Apple TV+', 'apple-tv', 'family_account', '#000000', 6, 'Miembro'),
  ('Crunchyroll', 'crunchyroll', 'profile_sharing', '#F47521', 4, 'Perfil'),
  ('Paramount+', 'paramount-plus', 'profile_sharing', '#0064FF', 4, 'Perfil'),
  ('Star+', 'star-plus', 'profile_sharing', '#C724B1', 4, 'Perfil')
ON CONFLICT (slug) DO NOTHING;

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_platforms_active ON platforms(is_active);
CREATE INDEX IF NOT EXISTS idx_platforms_slug ON platforms(slug);

-- Habilitar RLS
ALTER TABLE platforms ENABLE ROW LEVEL SECURITY;

-- Política: Solo admins pueden gestionar plataformas
CREATE POLICY "Admins can manage platforms" ON platforms
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('super_admin', 'staff')
    )
  );

-- Política: Todos los usuarios autenticados pueden ver plataformas
CREATE POLICY "Authenticated users can view platforms" ON platforms
  FOR SELECT USING (auth.role() = 'authenticated');
