-- Agregar columna is_canje a la tabla sales
-- Indica si la venta es un canje (para clientes tipo "creador")
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_canje boolean NOT NULL DEFAULT false;

-- Índice para facilitar consultas por is_canje
CREATE INDEX IF NOT EXISTS sales_is_canje_idx ON sales(is_canje);
