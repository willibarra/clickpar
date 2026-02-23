-- ============================================
-- SCRIPT DE DATOS DE PRUEBA - ClickPar
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- 1. LIMPIAR DATOS EXISTENTES (opcional - comentar si no quieres borrar)
-- DELETE FROM sale_slots;
-- DELETE FROM mother_accounts;
-- DELETE FROM platforms WHERE name NOT IN ('Netflix', 'Spotify', 'Disney+', 'HBO Max');

-- ============================================
-- 2. PLATAFORMAS (30 plataformas)
-- ============================================

INSERT INTO platforms (name, slug, business_type, icon_color, default_max_slots, is_active)
VALUES 
    -- Streaming Video (profile_sharing)
    ('Netflix', 'netflix', 'profile_sharing', '#E50914', 5, true),
    ('Disney+', 'disney-plus', 'profile_sharing', '#0063e5', 4, true),
    ('HBO Max', 'hbo-max', 'profile_sharing', '#5c16c5', 5, true),
    ('Amazon Prime Video', 'amazon-prime-video', 'profile_sharing', '#00a8e1', 6, true),
    ('Apple TV+', 'apple-tv-plus', 'profile_sharing', '#000000', 6, true),
    ('Paramount+', 'paramount-plus', 'profile_sharing', '#0064FF', 6, true),
    ('Star+', 'star-plus', 'profile_sharing', '#C724B1', 4, true),
    ('Peacock', 'peacock', 'profile_sharing', '#000000', 6, true),
    ('Crunchyroll', 'crunchyroll', 'profile_sharing', '#F47521', 4, true),
    ('Funimation', 'funimation', 'profile_sharing', '#410099', 4, true),
    ('MUBI', 'mubi', 'profile_sharing', '#0066FF', 1, true),
    ('Curiosity Stream', 'curiosity-stream', 'profile_sharing', '#FF6B00', 4, true),
    ('Shudder', 'shudder', 'profile_sharing', '#000000', 5, true),
    ('BritBox', 'britbox', 'profile_sharing', '#D4145A', 4, true),
    ('MGM+', 'mgm-plus', 'profile_sharing', '#FFD700', 5, true),
    
    -- Streaming Música (family_account)
    ('Spotify', 'spotify', 'family_account', '#1DB954', 6, true),
    ('Apple Music', 'apple-music', 'family_account', '#FC3C44', 6, true),
    ('YouTube Music', 'youtube-music', 'family_account', '#FF0000', 6, true),
    ('Tidal', 'tidal', 'family_account', '#000000', 6, true),
    ('Deezer', 'deezer', 'family_account', '#FEAA2D', 6, true),
    ('Amazon Music', 'amazon-music', 'family_account', '#25D1DA', 6, true),
    
    -- Gaming & Apps (family_account)
    ('Xbox Game Pass', 'xbox-game-pass', 'family_account', '#107C10', 5, true),
    ('PlayStation Plus', 'playstation-plus', 'family_account', '#003791', 2, true),
    ('Nintendo Online', 'nintendo-online', 'family_account', '#E60012', 8, true),
    ('EA Play', 'ea-play', 'profile_sharing', '#000000', 1, true),
    
    -- Productividad (family_account)
    ('Microsoft 365', 'microsoft-365', 'family_account', '#0078D4', 6, true),
    ('Google One', 'google-one', 'family_account', '#4285F4', 5, true),
    ('Dropbox', 'dropbox', 'family_account', '#0061FF', 6, true),
    ('1Password', '1password', 'family_account', '#0094F5', 5, true),
    ('NordVPN', 'nordvpn', 'family_account', '#4687FF', 6, true)
ON CONFLICT (name) DO UPDATE SET 
    icon_color = EXCLUDED.icon_color,
    is_active = true;

-- ============================================
-- 3. CUENTAS MADRE (20 cuentas con slots)
-- ============================================

-- Netflix Cuentas
INSERT INTO mother_accounts (platform, email, password, max_slots, renewal_date, purchase_cost_gs, slot_price_gs, status)
VALUES 
    ('Netflix', 'netflix.cuenta1@gmail.com', 'Pass2024Nf!', 5, '2026-02-15', 120000, 35000, 'active'),
    ('Netflix', 'netflix.cuenta2@gmail.com', 'SecureNf#22', 5, '2026-02-20', 120000, 35000, 'active'),
    ('Netflix', 'netflix.premium3@gmail.com', 'NetPrem!99', 5, '2026-03-01', 120000, 35000, 'active');

-- Disney+ Cuentas
INSERT INTO mother_accounts (platform, email, password, max_slots, renewal_date, purchase_cost_gs, slot_price_gs, status)
VALUES 
    ('Disney+', 'disney.familia1@gmail.com', 'DisneyMag!c1', 4, '2026-02-10', 80000, 25000, 'active'),
    ('Disney+', 'disney.plus2@gmail.com', 'DPlus2024#', 4, '2026-02-25', 80000, 25000, 'active');

-- HBO Max Cuentas  
INSERT INTO mother_accounts (platform, email, password, max_slots, renewal_date, purchase_cost_gs, slot_price_gs, status)
VALUES 
    ('HBO Max', 'hbo.cuenta1@gmail.com', 'HboMax!2024', 5, '2026-02-18', 100000, 30000, 'active'),
    ('HBO Max', 'hbomax.premium@gmail.com', 'Premium#Hbo', 5, '2026-03-05', 100000, 30000, 'active');

-- Spotify Cuentas (Family)
INSERT INTO mother_accounts (platform, email, password, max_slots, renewal_date, purchase_cost_gs, slot_price_gs, status)
VALUES 
    ('Spotify', 'spotify.familia1@gmail.com', 'SpotFam!2024', 6, '2026-02-12', 75000, 20000, 'active'),
    ('Spotify', 'spotify.familia2@gmail.com', 'FamSpot#99', 6, '2026-02-28', 75000, 20000, 'active'),
    ('Spotify', 'spotify.premium3@gmail.com', 'SpotPrem!1', 6, '2026-03-10', 75000, 20000, 'active');

-- YouTube Music Cuentas
INSERT INTO mother_accounts (platform, email, password, max_slots, renewal_date, purchase_cost_gs, slot_price_gs, status)
VALUES 
    ('YouTube Music', 'youtube.familia@gmail.com', 'YtMusic!24', 6, '2026-02-22', 70000, 18000, 'active');

-- Amazon Prime Video
INSERT INTO mother_accounts (platform, email, password, max_slots, renewal_date, purchase_cost_gs, slot_price_gs, status)
VALUES 
    ('Amazon Prime Video', 'amazon.prime1@gmail.com', 'Prime2024!', 6, '2026-03-15', 90000, 22000, 'active');

-- Crunchyroll
INSERT INTO mother_accounts (platform, email, password, max_slots, renewal_date, purchase_cost_gs, slot_price_gs, status)
VALUES 
    ('Crunchyroll', 'crunchy.anime@gmail.com', 'Anime!2024', 4, '2026-02-08', 50000, 18000, 'active');

-- Xbox Game Pass
INSERT INTO mother_accounts (platform, email, password, max_slots, renewal_date, purchase_cost_gs, slot_price_gs, status)
VALUES 
    ('Xbox Game Pass', 'xbox.gamer@gmail.com', 'XboxGP!24', 5, '2026-03-01', 120000, 40000, 'active');

-- Microsoft 365
INSERT INTO mother_accounts (platform, email, password, max_slots, renewal_date, purchase_cost_gs, slot_price_gs, status)
VALUES 
    ('Microsoft 365', 'office.familia@gmail.com', 'Office365!', 6, '2026-04-01', 150000, 35000, 'active');

-- Apple Music
INSERT INTO mother_accounts (platform, email, password, max_slots, renewal_date, purchase_cost_gs, slot_price_gs, status)
VALUES 
    ('Apple Music', 'apple.familia@icloud.com', 'AppleM!24', 6, '2026-02-14', 72000, 18000, 'active');

-- Paramount+
INSERT INTO mother_accounts (platform, email, password, max_slots, renewal_date, purchase_cost_gs, slot_price_gs, status)
VALUES 
    ('Paramount+', 'paramount.cuenta@gmail.com', 'Para2024!', 6, '2026-02-20', 65000, 15000, 'active');

-- Star+
INSERT INTO mother_accounts (platform, email, password, max_slots, renewal_date, purchase_cost_gs, slot_price_gs, status)
VALUES 
    ('Star+', 'starplus.cuenta@gmail.com', 'Star!2024', 4, '2026-02-28', 70000, 22000, 'active');

-- NordVPN
INSERT INTO mother_accounts (platform, email, password, max_slots, renewal_date, purchase_cost_gs, slot_price_gs, status)
VALUES 
    ('NordVPN', 'nordvpn.familia@gmail.com', 'Nord!VPN24', 6, '2026-06-01', 200000, 45000, 'active');

-- ============================================
-- 4. GENERAR SLOTS PARA TODAS LAS CUENTAS
-- ============================================

-- Crear slots para cada cuenta madre
DO $$
DECLARE
    acc RECORD;
    i INT;
    slot_prefix TEXT;
BEGIN
    FOR acc IN SELECT id, platform, max_slots FROM mother_accounts LOOP
        -- Determinar prefijo según tipo
        IF acc.platform IN ('Spotify', 'Apple Music', 'YouTube Music', 'Tidal', 'Deezer', 'Amazon Music', 
                            'Xbox Game Pass', 'PlayStation Plus', 'Nintendo Online', 
                            'Microsoft 365', 'Google One', 'Dropbox', '1Password', 'NordVPN') THEN
            slot_prefix := 'Miembro ';
        ELSE
            slot_prefix := 'Perfil ';
        END IF;
        
        FOR i IN 1..acc.max_slots LOOP
            INSERT INTO sale_slots (mother_account_id, slot_identifier, status, pin_code)
            VALUES (
                acc.id,
                slot_prefix || i,
                CASE 
                    WHEN i = 1 THEN 'sold'  -- Primer slot siempre vendido (admin)
                    WHEN random() < 0.4 THEN 'sold'
                    WHEN random() < 0.1 THEN 'reserved'
                    ELSE 'available'
                END,
                CASE WHEN random() < 0.3 THEN LPAD(FLOOR(random() * 10000)::TEXT, 4, '0') ELSE NULL END
            );
        END LOOP;
    END LOOP;
END $$;

-- ============================================
-- 5. CLIENTES (50 clientes)
-- ============================================

INSERT INTO customers (full_name, phone, email, notes)
VALUES 
    ('Juan Carlos Pérez', '+595981123456', 'juancarlos.perez@gmail.com', 'Cliente frecuente'),
    ('María Fernanda López', '+595971234567', 'mariaf.lopez@hotmail.com', NULL),
    ('Roberto Gómez', '+595982345678', 'roberto.gomez@gmail.com', 'Prefiere WhatsApp'),
    ('Ana Sofía Martínez', '+595973456789', 'anasofia.m@gmail.com', 'Estudiante'),
    ('Carlos Eduardo Silva', '+595984567890', 'carlos.silva@outlook.com', NULL),
    ('Patricia Rodríguez', '+595975678901', 'patricia.rod@gmail.com', 'Pago puntual'),
    ('Diego Alejandro Ruiz', '+595986789012', 'diego.ruiz@gmail.com', NULL),
    ('Valentina Torres', '+595977890123', 'vale.torres@hotmail.com', 'Referida por Juan'),
    ('Santiago Morales', '+595988901234', 'santi.morales@gmail.com', NULL),
    ('Camila Herrera', '+595979012345', 'camila.h@gmail.com', 'Pago anticipado'),
    ('Andrés Felipe Castro', '+595980123456', 'andres.castro@gmail.com', NULL),
    ('Luciana Vargas', '+595971234568', 'luciana.v@outlook.com', 'VIP'),
    ('Matías González', '+595982345679', 'matias.gon@gmail.com', NULL),
    ('Isabella Flores', '+595973456780', 'isa.flores@gmail.com', 'Grupo familiar'),
    ('Sebastián Díaz', '+595984567891', 'seba.diaz@hotmail.com', NULL),
    ('Antonella Ramírez', '+595975678902', 'anto.ramirez@gmail.com', 'Solo Netflix'),
    ('Nicolás Jiménez', '+595986789013', 'nico.jimenez@gmail.com', NULL),
    ('Martina Aguirre', '+595977890124', 'martina.a@gmail.com', 'Pago mensual'),
    ('Joaquín Medina', '+595988901235', 'joaco.medina@outlook.com', NULL),
    ('Renata Sánchez', '+595979012346', 'renata.s@gmail.com', 'Estudiante universitaria'),
    ('Emiliano Núñez', '+595980123457', 'emi.nunez@gmail.com', NULL),
    ('Victoria Romero', '+595971234569', 'vicky.romero@gmail.com', 'Referido premium'),
    ('Tomás Acosta', '+595982345680', 'tomas.acosta@hotmail.com', NULL),
    ('Sofía Méndez', '+595973456781', 'sofia.mendez@gmail.com', 'Combo streaming'),
    ('Lucas Benítez', '+595984567892', 'lucas.benitez@gmail.com', NULL),
    ('Abril Ortega', '+595975678903', 'abril.ortega@outlook.com', 'Solo música'),
    ('Benjamín Cabrera', '+595986789014', 'benja.cabrera@gmail.com', NULL),
    ('Mía Delgado', '+595977890125', 'mia.delgado@gmail.com', 'Gamer'),
    ('Maximiliano Vera', '+595988901236', 'maxi.vera@gmail.com', NULL),
    ('Olivia Fernández', '+595979012347', 'olivia.f@hotmail.com', 'Pack completo'),
    ('Thiago Paz', '+595980123458', 'thiago.paz@gmail.com', NULL),
    ('Catalina Ríos', '+595971234570', 'cata.rios@gmail.com', 'Familiar'),
    ('Ian Paredes', '+595982345681', 'ian.paredes@outlook.com', NULL),
    ('Emma Villalba', '+595973456782', 'emma.villalba@gmail.com', 'Pago semanal'),
    ('Facundo Ledesma', '+595984567893', 'facu.ledesma@gmail.com', NULL),
    ('Alma Peralta', '+595975678904', 'alma.peralta@gmail.com', 'Solo Disney'),
    ('Bruno Quintana', '+595986789015', 'bruno.q@hotmail.com', NULL),
    ('Nina Salazar', '+595977890126', 'nina.salazar@gmail.com', 'Combo familiar'),
    ('Gael Figueroa', '+595988901237', 'gael.figueroa@gmail.com', NULL),
    ('Luna Espinoza', '+595979012348', 'luna.espinoza@outlook.com', 'Referida'),
    ('Dylan Maldonado', '+595980123459', 'dylan.m@gmail.com', NULL),
    ('Zoe Guerrero', '+595971234571', 'zoe.guerrero@gmail.com', 'Pack gaming'),
    ('Noah Mendoza', '+595982345682', 'noah.mendoza@gmail.com', NULL),
    ('Bianca Ojeda', '+595973456783', 'bianca.ojeda@hotmail.com', 'Música premium'),
    ('Dante Rivas', '+595984567894', 'dante.rivas@gmail.com', NULL),
    ('Lara Sosa', '+595975678905', 'lara.sosa@gmail.com', 'VIP Gold'),
    ('Elías Franco', '+595986789016', 'elias.franco@outlook.com', NULL),
    ('Kiara Molina', '+595977890127', 'kiara.molina@gmail.com', 'Estudiante'),
    ('Santino Vega', '+595988901238', 'santino.vega@gmail.com', NULL),
    ('Jazmín Campos', '+595979012349', 'jazmin.campos@gmail.com', 'Cliente nuevo')
ON CONFLICT DO NOTHING;

-- ============================================
-- 6. VENTAS (30 ventas conectando clientes con slots)
-- ============================================

-- Primero, actualizar algunos slots como vendidos y asignar a clientes
-- Esto requiere tener los IDs reales, así que usaremos subconsultas

DO $$
DECLARE
    slot_rec RECORD;
    customer_rec RECORD;
    sale_count INT := 0;
    sale_dates DATE[] := ARRAY[
        '2026-01-05', '2026-01-07', '2026-01-08', '2026-01-10', '2026-01-12',
        '2026-01-13', '2026-01-15', '2026-01-16', '2026-01-18', '2026-01-19',
        '2026-01-20', '2026-01-21', '2026-01-22', '2026-01-23', '2026-01-24',
        '2026-01-25', '2026-01-25', '2026-01-26', '2026-01-26', '2026-01-27',
        '2026-01-27', '2026-01-27', '2026-01-28', '2026-01-28', '2026-01-28',
        '2026-01-28', '2026-01-28', '2026-01-28', '2026-01-28', '2026-01-28'
    ]::DATE[];
BEGIN
    -- Iterar sobre slots vendidos y asignar clientes
    FOR slot_rec IN 
        SELECT ss.id as slot_id, ma.slot_price_gs, ma.platform
        FROM sale_slots ss
        JOIN mother_accounts ma ON ss.mother_account_id = ma.id
        WHERE ss.status = 'sold'
        ORDER BY random()
        LIMIT 30
    LOOP
        -- Obtener un cliente aleatorio que no tenga este slot
        SELECT id INTO customer_rec 
        FROM customers 
        WHERE id NOT IN (
            SELECT customer_id FROM sales WHERE slot_id = slot_rec.slot_id
        )
        ORDER BY random() 
        LIMIT 1;
        
        IF customer_rec.id IS NOT NULL THEN
            sale_count := sale_count + 1;
            
            -- Crear la venta
            INSERT INTO sales (
                slot_id, 
                customer_id, 
                amount_gs, 
                payment_method, 
                billing_cycle_day,
                start_date,
                created_at
            )
            VALUES (
                slot_rec.slot_id,
                customer_rec.id,
                slot_rec.slot_price_gs,
                CASE (sale_count % 4)
                    WHEN 0 THEN 'cash'
                    WHEN 1 THEN 'transfer'
                    WHEN 2 THEN 'qr'
                    ELSE 'other'
                END,
                (sale_count % 28) + 1,  -- Día de facturación 1-28
                sale_dates[LEAST(sale_count, 30)],
                sale_dates[LEAST(sale_count, 30)]::TIMESTAMP
            );
        END IF;
        
        EXIT WHEN sale_count >= 30;
    END LOOP;
    
    RAISE NOTICE 'Se crearon % ventas', sale_count;
END $$;

-- ============================================
-- 7. VERIFICACIÓN
-- ============================================

SELECT 'Plataformas' as tabla, COUNT(*) as total FROM platforms WHERE is_active = true
UNION ALL
SELECT 'Cuentas Madre', COUNT(*) FROM mother_accounts
UNION ALL
SELECT 'Slots', COUNT(*) FROM sale_slots
UNION ALL
SELECT 'Clientes', COUNT(*) FROM customers
UNION ALL
SELECT 'Ventas', COUNT(*) FROM sales;
