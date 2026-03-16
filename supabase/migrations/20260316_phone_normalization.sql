-- ============================================================
-- Migration: Database-level phone normalization for Paraguay
-- Date: 2026-03-16
--
-- Creates:
--   1. normalize_py_phone() SQL function
--   2. Data cleanup (re-normalize + invalid→NULL)
--   3. Duplicate phone resolution in customers
--   4. BEFORE INSERT/UPDATE triggers on customers, profiles, suppliers
--   5. CHECK constraint on customers.phone
--   6. UNIQUE partial index on customers.phone
-- ============================================================

-- ============================================================
-- 1. FUNCTION: normalize_py_phone(text) → text
-- ============================================================

CREATE OR REPLACE FUNCTION normalize_py_phone(raw text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT
AS $$
DECLARE
    clean text;
BEGIN
    -- NULL in → NULL out (STRICT already handles this, but be explicit)
    IF raw IS NULL THEN RETURN NULL; END IF;

    -- Strip everything that isn't a digit
    clean := regexp_replace(raw, '[^0-9]', '', 'g');

    -- Empty after stripping → NULL
    IF clean = '' THEN RETURN NULL; END IF;

    -- Local format: leading 0 → replace with country code
    IF left(clean, 1) = '0' THEN
        clean := '595' || substring(clean from 2);
    END IF;

    -- If it doesn't start with 595, prepend country code
    IF left(clean, 3) <> '595' THEN
        clean := '595' || clean;
    END IF;

    -- If result is just '595' with no subscriber digits → NULL
    IF clean = '595' THEN RETURN NULL; END IF;

    -- Validate final length: 595 + 9-10 digits = 12-13 chars
    IF clean !~ '^595[0-9]{9,10}$' THEN
        RAISE NOTICE 'normalize_py_phone: invalid phone after normalization: % → %', raw, clean;
        RETURN NULL;
    END IF;

    RETURN clean;
END;
$$;

-- ============================================================
-- 2. DATA CLEANUP: re-normalize all existing phone columns
-- ============================================================

-- 2a. customers.phone
UPDATE customers
SET phone = normalize_py_phone(phone)
WHERE phone IS NOT NULL;

-- Log records that became NULL
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT id, full_name FROM customers
        WHERE phone IS NULL
          AND id IN (
              SELECT id FROM customers
              WHERE phone IS NOT NULL
          )
    LOOP
        RAISE NOTICE 'customers: phone set to NULL for id=%, name=%', r.id, r.full_name;
    END LOOP;
END $$;

-- 2b. profiles.phone_number
UPDATE profiles
SET phone_number = normalize_py_phone(phone_number)
WHERE phone_number IS NOT NULL;

-- 2c. suppliers.phone
UPDATE suppliers
SET phone = normalize_py_phone(phone)
WHERE phone IS NOT NULL;

-- 2d. mother_accounts.supplier_phone
UPDATE mother_accounts
SET supplier_phone = normalize_py_phone(supplier_phone)
WHERE supplier_phone IS NOT NULL;

-- 2e. whatsapp_send_log.phone
UPDATE whatsapp_send_log
SET phone = normalize_py_phone(phone)
WHERE phone IS NOT NULL
  AND phone !~ '^595[0-9]{9,10}$';

-- ============================================================
-- 3. DUPLICATE RESOLUTION for customers.phone
--    Keep the OLDEST customer's phone; NULL the rest.
-- ============================================================

DO $$
DECLARE
    dup record;
    keep_id uuid;
    victim record;
BEGIN
    FOR dup IN
        SELECT phone, count(*) AS cnt
        FROM customers
        WHERE phone IS NOT NULL
        GROUP BY phone
        HAVING count(*) > 1
    LOOP
        RAISE NOTICE 'Duplicate phone found: % (% records)', dup.phone, dup.cnt;

        -- Keep the oldest (by created_at) customer
        SELECT id INTO keep_id
        FROM customers
        WHERE phone = dup.phone
        ORDER BY created_at ASC
        LIMIT 1;

        -- NULL out the phone on all other duplicates
        FOR victim IN
            SELECT id, full_name
            FROM customers
            WHERE phone = dup.phone AND id <> keep_id
        LOOP
            RAISE NOTICE '  → NULLing phone for id=%, name=%', victim.id, victim.full_name;
            UPDATE customers SET phone = NULL WHERE id = victim.id;
        END LOOP;
    END LOOP;
END $$;

-- ============================================================
-- 4. TRIGGERS: auto-normalize on INSERT/UPDATE
-- ============================================================

-- 4a. customers.phone
CREATE OR REPLACE FUNCTION trg_normalize_customer_phone()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.phone IS NOT NULL THEN
        NEW.phone := normalize_py_phone(NEW.phone);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_normalize_phone ON customers;
CREATE TRIGGER trg_customers_normalize_phone
    BEFORE INSERT OR UPDATE OF phone ON customers
    FOR EACH ROW
    EXECUTE FUNCTION trg_normalize_customer_phone();

-- 4b. profiles.phone_number
CREATE OR REPLACE FUNCTION trg_normalize_profile_phone()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.phone_number IS NOT NULL THEN
        NEW.phone_number := normalize_py_phone(NEW.phone_number);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_normalize_phone ON profiles;
CREATE TRIGGER trg_profiles_normalize_phone
    BEFORE INSERT OR UPDATE OF phone_number ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION trg_normalize_profile_phone();

-- 4c. suppliers.phone
CREATE OR REPLACE FUNCTION trg_normalize_supplier_phone()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.phone IS NOT NULL THEN
        NEW.phone := normalize_py_phone(NEW.phone);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suppliers_normalize_phone ON suppliers;
CREATE TRIGGER trg_suppliers_normalize_phone
    BEFORE INSERT OR UPDATE OF phone ON suppliers
    FOR EACH ROW
    EXECUTE FUNCTION trg_normalize_supplier_phone();

-- ============================================================
-- 5. CHECK CONSTRAINT: customers.phone format
-- ============================================================

-- Drop if it already exists (idempotent)
ALTER TABLE customers DROP CONSTRAINT IF EXISTS chk_customers_phone_format;
ALTER TABLE customers
    ADD CONSTRAINT chk_customers_phone_format
    CHECK (phone IS NULL OR phone ~ '^595[0-9]{9,10}$');

-- ============================================================
-- 6. UNIQUE PARTIAL INDEX: customers.phone (non-null only)
-- ============================================================

-- Drop the old plain index if it exists (was not unique-constrained)
DROP INDEX IF EXISTS idx_customers_phone;

-- The original schema had a UNIQUE constraint on the column itself;
-- replace with a partial unique index to allow multiple NULLs.
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_phone_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_unique
    ON customers(phone)
    WHERE phone IS NOT NULL;

-- ============================================================
-- 7. VERIFICATION QUERIES
-- ============================================================

-- Should return 0 rows if everything is clean
SELECT 'invalid_customers' AS check_type, count(*)
FROM customers
WHERE phone IS NOT NULL AND phone !~ '^595[0-9]{9,10}$'
UNION ALL
SELECT 'invalid_profiles', count(*)
FROM profiles
WHERE phone_number IS NOT NULL AND phone_number !~ '^595[0-9]{9,10}$'
UNION ALL
SELECT 'invalid_suppliers', count(*)
FROM suppliers
WHERE phone IS NOT NULL AND phone !~ '^595[0-9]{9,10}$';
