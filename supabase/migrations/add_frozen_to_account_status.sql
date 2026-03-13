-- Agregar el valor 'frozen' al enum account_status
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'frozen';
