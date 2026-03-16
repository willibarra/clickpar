/**
 * Strip everything that isn't a digit from a phone string.
 * Useful for cleaning user input before storing or comparing.
 *
 *   "+595 981 123-456" → "595981123456"
 *   "0981 123 456"     → "0981123456"
 */
export function cleanPhone(input: string): string {
    return input.replace(/\D/g, '');
}

/**
 * Normalize a phone number for storage.
 *
 * Paraguayan numbers are normalized to the international format (595...):
 *   0973442773    → 595973442773
 *   +595973442773 → 595973442773
 *   595973442773  → 595973442773 (no-op)
 *   973442773     → 595973442773
 *
 * Non-Paraguayan numbers (e.g. Brazilian 55...) are stored as clean digits
 * without modification — we don't force 595 on foreign numbers.
 *
 * Very short inputs (< 6 digits) throw an error.
 */
export function normalizePhone(input: string): string {
    // Strip everything that isn't a digit
    let clean = input.replace(/\D/g, '');

    if (clean.length < 6) {
        throw new Error(`Phone number too short: "${input}"`);
    }

    // Local format: leading 0 → replace with Paraguayan country code
    if (clean.startsWith('0')) {
        clean = '595' + clean.substring(1);
    }

    // If it looks Paraguayan (starts with 595 or 9-digit local), normalize
    if (clean.startsWith('595')) {
        // Already has country code — validate length
        if (/^595\d{9,10}$/.test(clean)) {
            return clean;
        }
        // If it starts with 595 but wrong length, still return cleaned
        return clean;
    }

    // Numbers starting with 9 and exactly 9-10 digits are likely Paraguayan local
    if (/^9\d{8,9}$/.test(clean)) {
        return '595' + clean;
    }

    // For any other number (international), just return clean digits
    return clean;
}

/**
 * Safe wrapper around normalizePhone() that returns null instead of
 * throwing on invalid input. Ideal for webhooks, imports, and any
 * context where bad phone data should be silently skipped.
 */
export function safeNormalizePhone(input: string): string | null {
    try {
        return normalizePhone(input);
    } catch {
        return null;
    }
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

    const normalized = safeNormalizePhone(digits);
    if (!normalized) return null;

    // Build the local variant: 0 + number without country code (only for 595)
    if (normalized.startsWith('595')) {
        const local = '0' + normalized.substring(3);
        return [normalized, local];
    }

    return [normalized];
}

