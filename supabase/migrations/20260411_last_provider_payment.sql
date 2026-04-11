-- Migration: Add last_provider_payment_at to mother_accounts
-- This column tracks WHEN the account was last paid/renewed with the provider.
-- Previously, the UI showed created_at which is the account creation date, not the last payment.

-- 1. Add the column
ALTER TABLE mother_accounts 
ADD COLUMN IF NOT EXISTS last_provider_payment_at TIMESTAMPTZ;

-- 2. Backfill from expenses table (most recent renewal expense per account)
UPDATE mother_accounts ma
SET last_provider_payment_at = sub.latest_expense
FROM (
    SELECT mother_account_id, MAX(expense_date) AS latest_expense
    FROM expenses
    WHERE expense_type = 'renewal'
    GROUP BY mother_account_id
) sub
WHERE ma.id = sub.mother_account_id;

-- 3. For accounts with no expense records, fallback to created_at
UPDATE mother_accounts
SET last_provider_payment_at = created_at
WHERE last_provider_payment_at IS NULL;
