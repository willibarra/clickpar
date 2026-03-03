/**
 * Normalize a Paraguayan phone number to the international format (595...).
 *
 * Handles common local formats:
 *   0973442773   → 595973442773
 *   +595973442773 → 595973442773
 *   595973442773  → 595973442773 (no-op)
 *   973442773    → 595973442773
 */
export function normalizePhone(input: string): string {
    // Strip everything that isn't a digit
    let clean = input.replace(/\D/g, '');

    // Local format: leading 0 → replace with country code
    if (clean.startsWith('0')) {
        clean = '595' + clean.substring(1);
    }

    // If it still doesn't start with the country code, prepend it
    if (!clean.startsWith('595')) {
        clean = '595' + clean;
    }

    return clean;
}

/**
 * Given a raw search term that looks like a phone number, return an array
 * with both the international (595…) and local (0…) representations so
 * that an `ilike` search can match either stored format.
 *
 * If the input doesn't look like a phone number, returns null.
 */
export function phoneSearchVariants(raw: string): string[] | null {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 6) return null;          // too short to be a phone
    if (!/^\+?\d+$/.test(raw.trim())) return null; // contains letters

    const normalized = normalizePhone(digits);

    // Build the local variant: 0 + number without country code
    const local = '0' + normalized.substring(3);

    return [normalized, local];
}
