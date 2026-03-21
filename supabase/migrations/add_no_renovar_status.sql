-- Agregar el valor 'no_renovar' al enum account_status
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'no_renovar';
