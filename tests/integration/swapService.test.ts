import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSupabaseClient } from '../__mocks__/supabase';

const { mock, client } = createMockSupabaseClient();

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(() => client),
  createClient: vi.fn(() => client),
}));

const { swapService } = await import('@/lib/actions/sales');

describe('swapService', () => {
  beforeEach(() => {
    mock.reset();
    vi.clearAllMocks();
  });

  it('preserves original dates and frees old slot', async () => {
    const originalStartDate = '2026-02-15';
    const originalEndDate = '2026-03-17';

    // 1. Get old sale info
    mock.setResponse('sales', 'select', {
      data: {
        amount_gs: 50000,
        customer_id: 'cust-1',
        slot_id: 'old-slot',
        start_date: originalStartDate,
        end_date: originalEndDate,
      },
      error: null,
    });

    // 2. Get old slot info (mother account)
    mock.setResponse('sale_slots', 'select', {
      data: {
        mother_account_id: 'ma-1',
        mother_accounts: { platform: 'Netflix' },
      },
      error: null,
    });

    // 3. Deactivate old sale
    mock.setResponse('sales', 'update', { data: null, error: null });

    // 4. Free old slot
    mock.setResponse('sale_slots', 'update', { data: null, error: null });

    // 5. Get new slot (specific)
    mock.setResponse('sale_slots', 'select', {
      data: {
        id: 'new-slot-1',
        status: 'available',
        mother_accounts: { platform: 'Netflix' },
      },
      error: null,
    });

    // 6. Create new sale
    mock.setResponse('sales', 'insert', { data: null, error: null });

    // 7. Mark new slot as sold
    mock.setResponse('sale_slots', 'update', { data: null, error: null });

    const result = await swapService({
      oldSaleId: 'old-sale-1',
      oldSlotId: 'old-slot',
      customerId: 'cust-1',
      newSlotId: 'new-slot-1',
    });

    expect(result).toHaveProperty('success', true);

    // Verify the new sale was created with ORIGINAL dates
    const saleInserts = mock.getCalls().filter(
      (c) => c.table === 'sales' && c.operation === 'insert'
    );
    expect(saleInserts.length).toBeGreaterThan(0);

    const insertedData = saleInserts[0].args[0];
    expect(insertedData.start_date).toBe(originalStartDate);
    expect(insertedData.end_date).toBe(originalEndDate);

    // Verify old slot was freed and new slot sold
    const slotUpdateCalls = mock.getCalls().filter(
      (c) => c.table === 'sale_slots' && c.operation === 'update' && c.method === 'update'
    );
    // Should have two update calls: free old slot + mark new slot sold
    expect(slotUpdateCalls.length).toBe(2);

    // Extract the payload objects passed to update()
    const updatePayloads = slotUpdateCalls.map((c) => c.args[0]);
    expect(updatePayloads).toContainEqual({ status: 'available' });
    expect(updatePayloads).toContainEqual({ status: 'sold' });

    // Verify old sale was deactivated
    const saleUpdates = mock.getCalls().filter(
      (c) => c.table === 'sales' && c.operation === 'update'
    );
    expect(saleUpdates.length).toBeGreaterThan(0);
    expect(saleUpdates[0].args[0]).toEqual({ is_active: false });
  });

  it('returns error when old sale not found', async () => {
    mock.setResponse('sales', 'select', { data: null, error: null });

    const result = await swapService({
      oldSaleId: 'nonexistent',
      oldSlotId: 'slot-1',
      customerId: 'cust-1',
      newSlotId: 'new-slot-1',
    });

    expect(result).toHaveProperty('error');
    expect(result.error).toContain('Venta original no encontrada');
  });

  it('returns error when new slot is not available', async () => {
    // Old sale exists
    mock.setResponse('sales', 'select', {
      data: { amount_gs: 50000, customer_id: 'c1', slot_id: 's1', start_date: '2026-01-01', end_date: '2026-02-01' },
      error: null,
    });

    // Old slot info
    mock.setResponse('sale_slots', 'select', {
      data: { mother_account_id: 'ma-1', mother_accounts: { platform: 'HBO' } },
      error: null,
    });

    // Deactivate old sale
    mock.setResponse('sales', 'update', { data: null, error: null });

    // Free old slot
    mock.setResponse('sale_slots', 'update', { data: null, error: null });

    // New slot → already sold
    mock.setResponse('sale_slots', 'select', {
      data: { id: 'new-slot', status: 'sold', mother_accounts: { platform: 'HBO' } },
      error: null,
    });

    const result = await swapService({
      oldSaleId: 'sale-1',
      oldSlotId: 'slot-old',
      customerId: 'cust-1',
      newSlotId: 'new-slot',
    });

    expect(result).toHaveProperty('error');
    expect(result.error).toContain('ya no está disponible');
  });

  it('returns error when neither newSlotId nor targetPlatform specified', async () => {
    // Old sale
    mock.setResponse('sales', 'select', {
      data: { amount_gs: 50000, customer_id: 'c1', slot_id: 's1', start_date: '2026-01-01', end_date: '2026-02-01' },
      error: null,
    });

    // Old slot info
    mock.setResponse('sale_slots', 'select', {
      data: { mother_account_id: 'ma-1', mother_accounts: { platform: 'X' } },
      error: null,
    });

    // Deactivate old sale
    mock.setResponse('sales', 'update', { data: null, error: null });

    // Free old slot
    mock.setResponse('sale_slots', 'update', { data: null, error: null });

    const result = await swapService({
      oldSaleId: 'sale-1',
      oldSlotId: 'slot-old',
      customerId: 'cust-1',
      // no newSlotId, no targetPlatform
    });

    expect(result).toHaveProperty('error');
    expect(result.error).toContain('Debe especificar');
  });
});
