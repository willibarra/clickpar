-- ============================================================
-- SEED SUPPLIERS from inventory filter
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Insert all suppliers from the filter image (skip if already exists by name)
INSERT INTO suppliers (name, contact_info) VALUES
  ('SIN PROVEEDOR', 'Cuentas sin proveedor asignado'),
  ('BIGOTES STREAMING', NULL),
  ('BSTORE', NULL),
  ('CITY', NULL),
  ('CLICKPAR', 'Cuentas propias ClickPar'),
  ('CLICKPAR - AUTOPAY', 'Cuentas propias autopagables ClickPar'),
  ('CLICKPAR - COLOMBIA', 'Cuentas ClickPar Colombia'),
  ('CLICKPAR - CREDITO WILL 4553', NULL),
  ('CLICKPAR - UENO WILL', NULL),
  ('CLICKPAR COLOMBIA', NULL),
  ('CITY ENTRETENIMIENTO', NULL),
  ('COMPRAS WEB ECUADOR', NULL),
  ('COVENANT', NULL),
  ('ESTHERCITA', NULL),
  ('G2G', NULL),
  ('G2G - 1772167087732FMU2', NULL),
  ('G2G - 1772640542872VTD1', NULL),
  ('G2G - HYP3RLOOT', NULL),
  ('G2G - TRUSTORIAX', NULL),
  ('G2G 1773778491309FWQ9', NULL),
  ('GLOBAL STORE', NULL),
  ('GWEN TELEGRAM', NULL),
  ('IMPERIO MILLONARIO', NULL),
  ('MERCURIO', NULL),
  ('POP PREMIUM', NULL),
  ('PROVEEDOR: G2G - 1772819079186U1VZ', NULL),
  ('STREAMSHOP', NULL),
  ('VIVAS PLAY', NULL),
  ('DONTVSTORE.COM', NULL)
ON CONFLICT (name) DO NOTHING;

-- 2. Assign orphaned accounts (no supplier_id) to the SIN PROVEEDOR entry
DO $$
DECLARE
  sin_id uuid;
BEGIN
  SELECT id INTO sin_id FROM suppliers WHERE name = 'SIN PROVEEDOR' LIMIT 1;
  IF sin_id IS NOT NULL THEN
    UPDATE mother_accounts
    SET supplier_id = sin_id,
        supplier_name = 'SIN PROVEEDOR'
    WHERE supplier_id IS NULL
      AND deleted_at IS NULL;
  END IF;
END $$;

-- 3. Link existing accounts to suppliers by matching supplier_name (case-insensitive)
-- This fixes accounts that have a supplier_name text but no supplier_id
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT supplier_name
    FROM mother_accounts
    WHERE supplier_id IS NULL
      AND supplier_name IS NOT NULL
      AND deleted_at IS NULL
  LOOP
    UPDATE mother_accounts ma
    SET supplier_id = s.id
    FROM suppliers s
    WHERE UPPER(TRIM(s.name)) = UPPER(TRIM(rec.supplier_name))
      AND ma.supplier_name = rec.supplier_name
      AND ma.supplier_id IS NULL
      AND ma.deleted_at IS NULL;
  END LOOP;
END $$;

-- Summary
SELECT
  s.name,
  COUNT(ma.id) as total_accounts
FROM suppliers s
LEFT JOIN mother_accounts ma ON ma.supplier_id = s.id AND ma.deleted_at IS NULL
GROUP BY s.name
ORDER BY total_accounts DESC;
