import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSupabaseClient } from '../__mocks__/supabase';

const { mock, client } = createMockSupabaseClient();

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(() => client),
  createClient: vi.fn(() => client),
}));

const { bulkRenewSubscriptions } = await import('@/lib/actions/renewals');

describe('bulkRenewSubscriptions', () => {
  beforeEach(() => {
    mock.reset();
    vi.clearAllMocks();
  });

  it('calculates new end_date from today + daysToExtend', async () => {
    // Sale lookup
    mock.setResponse('sales', 'select', {
      data: { id: 'sale-1', start_date: '2026-02-01', customer_id: 'cust-1', amount_gs: 50000 },
      error: null,
    });

    // Sale update
    mock.setResponse('sales', 'update', { data: null, error: null });

    const daysToExtend = 30;
    const result = await bulkRenewSubscriptions(['sale-1'], 50000, daysToExtend);

    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('renewed', 1);

    // Verify the updated end_date
    const updateCalls = mock.getCalls().filter(
      (c) => c.table === 'sales' && c.operation === 'update'
    );
    expect(updateCalls.length).toBeGreaterThan(0);

    const updatePayload = updateCalls[0].args[0];
    expect(updatePayload).toHaveProperty('end_date');
    expect(updatePayload).toHaveProperty('is_active', true);

    // Verify date is approximately today + 30 days
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() + daysToExtend);
    const expectedStr = expectedDate.toISOString().split('T')[0];
    expect(updatePayload.end_date).toBe(expectedStr);
  });

  it('renews multiple sales', async () => {
    // Sale 1
    mock.setResponse('sales', 'select', {
      data: { id: 'sale-1', start_date: '2026-01-01', customer_id: 'c1', amount_gs: 40000 },
      error: null,
    });
    mock.setResponse('sales', 'update', { data: null, error: null });

    // Sale 2
    mock.setResponse('sales', 'select', {
      data: { id: 'sale-2', start_date: '2026-01-15', customer_id: 'c2', amount_gs: 60000 },
      error: null,
    });
    mock.setResponse('sales', 'update', { data: null, error: null });

    const result = await bulkRenewSubscriptions(['sale-1', 'sale-2'], 50000, 30);

    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('renewed', 2);
  });

  it('continues on error and reports failures', async () => {
    // Sale 1 → not found
    mock.setResponse('sales', 'select', { data: null, error: null });

    // Sale 2 → success
    mock.setResponse('sales', 'select', {
      data: { id: 'sale-2', start_date: '2026-01-01', customer_id: 'c2', amount_gs: 50000 },
      error: null,
    });
    mock.setResponse('sales', 'update', { data: null, error: null });

    const result = await bulkRenewSubscriptions(['sale-missing', 'sale-2'], 50000, 30);

    // Should report error for the missing sale
    expect(result).toHaveProperty('error');
    expect(result.details).toBeDefined();
    expect(result.details!.length).toBe(1);
  });

  it('uses provided amountGs when specified', async () => {
    mock.setResponse('sales', 'select', {
      data: { id: 'sale-1', start_date: '2026-02-01', customer_id: 'c1', amount_gs: 40000 },
      error: null,
    });
    mock.setResponse('sales', 'update', { data: null, error: null });

    const newAmount = 60000;
    await bulkRenewSubscriptions(['sale-1'], newAmount, 30);

    const updateCalls = mock.getCalls().filter(
      (c) => c.table === 'sales' && c.operation === 'update'
    );
    const payload = updateCalls[0].args[0];
    expect(payload.amount_gs).toBe(newAmount);
  });

  it('falls back to original amount_gs when amountGs is 0', async () => {
    const originalAmount = 45000;
    mock.setResponse('sales', 'select', {
      data: { id: 'sale-1', start_date: '2026-02-01', customer_id: 'c1', amount_gs: originalAmount },
      error: null,
    });
    mock.setResponse('sales', 'update', { data: null, error: null });

    await bulkRenewSubscriptions(['sale-1'], 0, 30);

    const updateCalls = mock.getCalls().filter(
      (c) => c.table === 'sales' && c.operation === 'update'
    );
    const payload = updateCalls[0].args[0];
    // When amountGs is 0 (falsy), should use sale.amount_gs
    expect(payload.amount_gs).toBe(originalAmount);
  });
});
