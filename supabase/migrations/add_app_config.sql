-- Tabla de configuración general de la app
CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    label TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tipo de cambio USD/PYG por defecto
INSERT INTO app_config (key, value, label)
VALUES ('usd_to_pyg_rate', '7800', 'Tipo de cambio USD → Gs.')
ON CONFLICT (key) DO NOTHING;
