import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSupabaseClient } from '../__mocks__/supabase';

const { mock, client } = createMockSupabaseClient();

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(() => client),
  createClient: vi.fn(() => client),
}));

const { cancelSubscription } = await import('@/lib/actions/sales');

describe('cancelSubscription', () => {
  beforeEach(() => {
    mock.reset();
    vi.clearAllMocks();
  });

  it('deactivates sale AND frees slot (no orphans)', async () => {
    // Sale update → success
    mock.setResponse('sales', 'update', { data: null, error: null });

    // Slot update → success
    mock.setResponse('sale_slots', 'update', { data: null, error: null });

    const result = await cancelSubscription('sale-123', 'slot-456');

    expect(result).toHaveProperty('success', true);

    // Verify BOTH operations happened
    const saleUpdates = mock.getCalls().filter(
      (c) => c.table === 'sales' && c.operation === 'update'
    );
    const slotUpdates = mock.getCalls().filter(
      (c) => c.table === 'sale_slots' && c.operation === 'update'
    );

    expect(saleUpdates.length).toBeGreaterThan(0);
    expect(slotUpdates.length).toBeGreaterThan(0);

    // Verify sale was set to inactive
    const saleUpdateArgs = saleUpdates[0].args;
    expect(saleUpdateArgs[0]).toEqual({ is_active: false });

    // Verify slot was set to available
    const slotUpdateArgs = slotUpdates[0].args;
    expect(slotUpdateArgs[0]).toEqual({ status: 'available' });
  });

  it('returns error when sale update fails', async () => {
    // Sale update → fails
    mock.setResponse('sales', 'update', {
      data: null,
      error: { message: 'DB error' },
    });

    const result = await cancelSubscription('sale-bad', 'slot-456');

    expect(result).toHaveProperty('error');
    expect(result.error).toContain('Error cancelando venta');
  });

  it('returns error when slot update fails', async () => {
    // Sale update → success
    mock.setResponse('sales', 'update', { data: null, error: null });

    // Slot update → fails
    mock.setResponse('sale_slots', 'update', {
      data: null,
      error: { message: 'Slot DB error' },
    });

    const result = await cancelSubscription('sale-123', 'slot-bad');

    expect(result).toHaveProperty('error');
    expect(result.error).toContain('Error liberando slot');
  });
});
