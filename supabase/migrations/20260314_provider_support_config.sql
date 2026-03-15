-- Provider Support Configuration
-- Dynamic URLs for code lookup per platform/supplier combination
CREATE TABLE IF NOT EXISTS provider_support_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  platform text NOT NULL,
  supplier_name text NOT NULL,
  code_url text,
  support_instructions text,
  needs_code boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(platform, supplier_name)
);

-- Seed initial data based on current accounts in the system
INSERT INTO provider_support_config (platform, supplier_name, code_url, needs_code, support_instructions) VALUES
  -- Netflix
  ('Netflix', 'POP PREMIUM', 'https://householdcode.com/es', true, 'Seleccioná "estoy de viaje" (TV) o "ver temporalmente" (Cel). Luego seleccioná "Enviar Email". Ingresá a la sección "Consultar Código" en tu panel y colocá el correo de tu Netflix.'),
  ('Netflix', 'CLICKPAR', NULL, false, 'Contactá soporte por WhatsApp para asistencia.'),
  ('Netflix', 'Vivas Play', NULL, false, 'Contactá soporte por WhatsApp para asistencia.'),
  -- Disney+
  ('Disney+', 'POP PREMIUM', 'https://householdcode.com/es', true, 'Ingresá a la sección "Consultar Código" en tu panel para obtener el código de verificación.'),
  -- HBO Max
  ('HBO Max', 'POP PREMIUM', NULL, false, 'Contactá soporte por WhatsApp para asistencia.'),
  -- Amazon Prime Video
  ('Amazon Prime Video', 'POP PREMIUM', NULL, false, 'Contactá soporte por WhatsApp para asistencia.'),
  ('Amazon Prime Video', 'G2G', NULL, false, 'Contactá soporte por WhatsApp para asistencia.'),
  -- Spotify (no requiere código)
  ('Spotify Premium', 'POP PREMIUM', NULL, false, 'Si no funciona, cerrá sesión y volvé a iniciar con las credenciales del panel.'),
  ('Spotify Premium', 'StreamShop', NULL, false, 'Si no funciona, cerrá sesión y volvé a iniciar con las credenciales del panel.'),
  ('Spotify Premium', 'Proveedor Streamshop', NULL, false, 'Si no funciona, cerrá sesión y volvé a iniciar con las credenciales del panel.'),
  ('Spotify Premium', 'Gwen', NULL, false, 'Si no funciona, cerrá sesión y volvé a iniciar con las credenciales del panel.'),
  -- YouTube Premium (no requiere código)
  ('YouTube Premium', 'CLICKPAR', NULL, false, 'Si no funciona, cerrá sesión y volvé a iniciar con las credenciales del panel.'),
  -- Crunchyroll
  ('Crunchyroll', 'POP PREMIUM', NULL, false, 'Contactá soporte por WhatsApp para asistencia.'),
  -- Paramount+
  ('Paramount+', 'POP PREMIUM', NULL, false, 'Contactá soporte por WhatsApp para asistencia.'),
  -- FLUJO TV
  ('FLUJOTV', 'CLICKPAR', NULL, false, 'Contactá soporte por WhatsApp para asistencia.'),
  -- Vix
  ('Vix', 'CLICKPAR', NULL, false, 'Contactá soporte por WhatsApp para asistencia.')
ON CONFLICT (platform, supplier_name) DO NOTHING;

-- Add send_portal_credentials toggle (OFF by default)
INSERT INTO app_config (key, value)
VALUES ('send_portal_credentials', 'false')
ON CONFLICT (key) DO NOTHING;
