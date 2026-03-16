import { describe, it, expect } from 'vitest';
import { normalizePhone, safeNormalizePhone, phoneSearchVariants } from '@/lib/utils/phone';

describe('normalizePhone', () => {
  it('converts local format 0973... → 595973...', () => {
    expect(normalizePhone('0973442773')).toBe('595973442773');
  });

  it('strips + from +595973442773', () => {
    expect(normalizePhone('+595973442773')).toBe('595973442773');
  });

  it('leaves already-normalized 595973442773 unchanged', () => {
    expect(normalizePhone('595973442773')).toBe('595973442773');
  });

  it('prepends 595 when no country code present (973442773)', () => {
    expect(normalizePhone('973442773')).toBe('595973442773');
  });

  it('strips non-digit characters: (0973) 442-773', () => {
    expect(normalizePhone('(0973) 442-773')).toBe('595973442773');
  });

  it('strips spaces and dashes: 0973 442 773', () => {
    expect(normalizePhone('0973 442 773')).toBe('595973442773');
  });

  it('throws on empty string', () => {
    expect(() => normalizePhone('')).toThrow('Invalid Paraguayan phone');
  });

  it('handles number with dots: 0973.442.773', () => {
    expect(normalizePhone('0973.442.773')).toBe('595973442773');
  });

  it('handles 10-digit local numbers (landlines): 0215551234', () => {
    expect(normalizePhone('0215551234')).toBe('595215551234');
  });

  it('throws on too-short input (e.g. "123")', () => {
    expect(() => normalizePhone('123')).toThrow('Invalid Paraguayan phone');
  });

  it('throws on too-long input', () => {
    expect(() => normalizePhone('59597344277399999')).toThrow('Invalid Paraguayan phone');
  });
});

describe('safeNormalizePhone', () => {
  it('returns normalized phone for valid input', () => {
    expect(safeNormalizePhone('0973442773')).toBe('595973442773');
  });

  it('returns null for empty string', () => {
    expect(safeNormalizePhone('')).toBeNull();
  });

  it('returns null for too-short input', () => {
    expect(safeNormalizePhone('123')).toBeNull();
  });

  it('returns null for too-long input', () => {
    expect(safeNormalizePhone('59597344277399999')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(safeNormalizePhone('abc')).toBeNull();
  });
});

describe('phoneSearchVariants', () => {
  it('returns both international and local variants', () => {
    const result = phoneSearchVariants('0973442773');
    expect(result).toEqual(['595973442773', '0973442773']);
  });

  it('returns null for short input (< 6 digits)', () => {
    expect(phoneSearchVariants('123')).toBeNull();
  });

  it('returns null for non-phone input', () => {
    expect(phoneSearchVariants('abc123def')).toBeNull();
  });

  it('works with already-normalized input', () => {
    const result = phoneSearchVariants('595973442773');
    expect(result).toEqual(['595973442773', '0973442773']);
  });
});
