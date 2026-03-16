import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSupabaseClient } from '../__mocks__/supabase';

// We need to mock the supabase server module BEFORE importing the action
const { mock, client } = createMockSupabaseClient();

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(() => client),
  createClient: vi.fn(() => client),
}));

// Now import the action
const { createQuickSale } = await import('@/lib/actions/sales');

describe('createQuickSale', () => {
  beforeEach(() => {
    mock.reset();
    vi.clearAllMocks();
  });

  it('creates a new customer when no customerId provided and phone not found', async () => {
    // 1. Customer lookup by phone → not found
    mock.setResponse('customers', 'select', { data: null, error: null });

    // 2. Customer create → returns new id
    mock.setResponse('customers', 'insert', {
      data: { id: 'new-customer-123' },
      error: null,
    });

    // 3. Available slots search → one available slot
    mock.setResponse('sale_slots', 'select', {
      data: [
        {
          id: 'slot-abc',
          slot_identifier: 'Perfil 1',
          mother_accounts: { id: 'ma-1', platform: 'Netflix', email: 'test@test.com', renewal_date: '2026-04-01' },
        },
      ],
      error: null,
    });

    // 4. Sale insert → success
    mock.setResponse('sales', 'insert', { data: null, error: null });

    // 5. Slot update → success
    mock.setResponse('sale_slots', 'update', { data: null, error: null });

    // 6. Slot select for instructions
    mock.setResponse('sale_slots', 'select', {
      data: { mother_accounts: null },
      error: null,
    });

    const result = await createQuickSale({
      platform: 'Netflix',
      customerPhone: '0973442773',
      customerName: 'Test User',
      price: 50000,
    });

    expect(result).toHaveProperty('success', true);

    // Verify customer was created
    const insertCalls = mock.getCalls().filter(
      (c) => c.table === 'customers' && c.operation === 'insert'
    );
    expect(insertCalls.length).toBeGreaterThan(0);

    // Verify slot was marked as sold
    const slotUpdateCalls = mock.getCalls().filter(
      (c) => c.table === 'sale_slots' && c.operation === 'update'
    );
    expect(slotUpdateCalls.length).toBeGreaterThan(0);

    // Verify sale was created
    const saleCalls = mock.getCalls().filter(
      (c) => c.table === 'sales' && c.operation === 'insert'
    );
    expect(saleCalls.length).toBeGreaterThan(0);
  });

  it('uses existing customer when found by phone', async () => {
    // 1. Customer lookup → found
    mock.setResponse('customers', 'select', {
      data: { id: 'existing-customer-456' },
      error: null,
    });

    // 2. Available slots
    mock.setResponse('sale_slots', 'select', {
      data: [
        {
          id: 'slot-xyz',
          slot_identifier: 'Perfil 2',
          mother_accounts: { id: 'ma-2', platform: 'Disney+', email: 'd@d.com', renewal_date: '2026-05-01' },
        },
      ],
      error: null,
    });

    // 3. Sale insert
    mock.setResponse('sales', 'insert', { data: null, error: null });

    // 4. Slot update
    mock.setResponse('sale_slots', 'update', { data: null, error: null });

    // 5. Slot select for instructions
    mock.setResponse('sale_slots', 'select', {
      data: { mother_accounts: null },
      error: null,
    });

    const result = await createQuickSale({
      platform: 'Disney+',
      customerPhone: '0973442773',
      price: 40000,
    });

    expect(result).toHaveProperty('success', true);

    // Verify NO customer insert happened (only select)
    const insertCalls = mock.getCalls().filter(
      (c) => c.table === 'customers' && c.operation === 'insert'
    );
    expect(insertCalls.length).toBe(0);
  });

  it('returns error when no slots available for platform', async () => {
    // Customer exists
    mock.setResponse('customers', 'select', {
      data: { id: 'cust-1' },
      error: null,
    });

    // No available slots
    mock.setResponse('sale_slots', 'select', {
      data: [],
      error: null,
    });

    const result = await createQuickSale({
      platform: 'Crunchyroll',
      customerPhone: '0973442773',
      price: 30000,
    });

    expect(result).toHaveProperty('error');
    expect(result.error).toContain('No hay slots disponibles');
  });

  it('uses specific slot when specificSlotId is provided', async () => {
    // Specific slot lookup → available
    mock.setResponse('sale_slots', 'select', {
      data: { id: 'specific-slot-1', mother_account_id: 'ma-1', status: 'available' },
      error: null,
    });

    // Sale insert
    mock.setResponse('sales', 'insert', { data: null, error: null });

    // Slot update
    mock.setResponse('sale_slots', 'update', { data: null, error: null });

    // Slot select for instructions
    mock.setResponse('sale_slots', 'select', {
      data: { mother_accounts: null },
      error: null,
    });

    const result = await createQuickSale({
      platform: 'Netflix',
      customerPhone: '0973442773',
      customerId: 'existing-cust',
      specificSlotId: 'specific-slot-1',
      price: 50000,
    });

    expect(result).toHaveProperty('success', true);
  });
});
