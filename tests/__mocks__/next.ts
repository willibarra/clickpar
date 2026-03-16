/**
 * Mocks for Next.js server-only modules used by server actions.
 */
import { vi } from 'vitest';

// next/cache
export const revalidatePath = vi.fn();

// next/headers
export const cookies = vi.fn(() => ({
  getAll: () => [],
  set: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
}));
