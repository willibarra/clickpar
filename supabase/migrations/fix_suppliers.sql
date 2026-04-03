-- ============================================================
-- MIGRACIÓN: Centralizar y completar proveedores
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Crear proveedor "SIN PROVEEDOR" con UUID fijo conocido
INSERT INTO suppliers (id, name, contact_info, payment_method_preferred, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'SIN PROVEEDOR',
  'Cuentas sin proveedor asignado',
  null,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 2. Asignar todas las mother_accounts con supplier_id NULL al proveedor "SIN PROVEEDOR"
UPDATE mother_accounts
SET 
  supplier_id = '00000000-0000-0000-0000-000000000001',
  supplier_name = 'SIN PROVEEDOR'
WHERE supplier_id IS NULL
  AND (deleted_at IS NULL);

-- 3. Para cuentas que tienen supplier_name pero no supplier_id, intentar vincular por nombre exacto
-- Primero ver qué supplier_names únicos existen sin supplier_id
-- UPDATE mother_accounts ma
-- SET supplier_id = s.id
-- FROM suppliers s
-- WHERE LOWER(TRIM(ma.supplier_name)) = LOWER(TRIM(s.name))
--   AND ma.supplier_id IS NULL
--   AND ma.deleted_at IS NULL;

-- 4. Verificar resultado
SELECT 
  s.name as proveedor,
  COUNT(ma.id) as total_cuentas,
  SUM(ma.purchase_cost_gs) as costo_total_gs
FROM suppliers s
LEFT JOIN mother_accounts ma ON ma.supplier_id = s.id AND ma.deleted_at IS NULL
GROUP BY s.id, s.name
ORDER BY total_cuentas DESC;
