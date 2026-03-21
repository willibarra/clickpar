-- Agregar el valor 'possible_autopay' al enum account_status
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'possible_autopay';
