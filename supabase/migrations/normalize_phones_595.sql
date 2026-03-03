-- Migration: Normalize all phone numbers to 595 format
-- Converts 0XXXXXXXXX → 595XXXXXXXXX in all phone columns

-- 1. customers.phone
UPDATE customers
SET phone = '595' || substring(phone from 2)
WHERE phone LIKE '0%' AND phone NOT LIKE '595%';

-- 2. profiles.phone_number
UPDATE profiles
SET phone_number = '595' || substring(phone_number from 2)
WHERE phone_number LIKE '0%' AND phone_number NOT LIKE '595%';

-- 3. mother_accounts.supplier_phone
UPDATE mother_accounts
SET supplier_phone = '595' || substring(supplier_phone from 2)
WHERE supplier_phone LIKE '0%' AND supplier_phone NOT LIKE '595%';

-- 4. suppliers.phone
UPDATE suppliers
SET phone = '595' || substring(phone from 2)
WHERE phone LIKE '0%' AND phone NOT LIKE '595%';

-- 5. whatsapp_send_log.phone
UPDATE whatsapp_send_log
SET phone = '595' || substring(phone from 2)
WHERE phone LIKE '0%' AND phone NOT LIKE '595%';
