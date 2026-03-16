/**
 * Global test setup — mocks server-only modules so that
 * server actions can be imported without Next.js runtime.
 */
import { vi } from 'vitest';

// ─── Next.js stubs ────────────────────────────────────────────
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    getAll: () => [],
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  })),
}));

// ─── External services (no-op) ───────────────────────────────
vi.mock('@/lib/kommo', () => ({
  createKommoLead: vi.fn().mockResolvedValue({ leadId: null }),
  addNoteToLead: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/whatsapp', () => ({
  sendSaleCredentials: vi.fn().mockResolvedValue({ success: true }),
  sendFamilyCredentials: vi.fn().mockResolvedValue({ success: true }),
  sendFamilyInvite: vi.fn().mockResolvedValue({ success: true }),
  getWhatsAppSettings: vi.fn().mockResolvedValue({ auto_send_credentials: false }),
  renderTemplate: vi.fn().mockReturnValue('mocked-template'),
  sendText: vi.fn().mockResolvedValue({ success: true }),
  sendPreExpiryReminder: vi.fn().mockResolvedValue({ success: true }),
  sendExpiryNotification: vi.fn().mockResolvedValue({ success: true }),
  sendExpiredNotification: vi.fn().mockResolvedValue({ success: true }),
  getPlatformDisplayName: vi.fn().mockResolvedValue('Platform'),
  getRenderedTemplate: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/actions/audit', () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/actions/notifications', () => ({
  checkPasswordRotation: vi.fn().mockResolvedValue(undefined),
}));
