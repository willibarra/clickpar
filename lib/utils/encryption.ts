import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function getKey(): Buffer {
    const key = process.env.PORTAL_ENCRYPTION_KEY;
    if (!key) {
        throw new Error('PORTAL_ENCRYPTION_KEY not set in environment variables');
    }
    // Key must be 32 bytes (64 hex chars) for AES-256
    return Buffer.from(key, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-CBC.
 * Returns format: `iv_hex:ciphertext_hex`
 */
export function encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a ciphertext string (format: `iv_hex:ciphertext_hex`).
 * Returns the original plaintext.
 */
export function decrypt(ciphertext: string): string {
    const [ivHex, encryptedHex] = ciphertext.split(':');
    if (!ivHex || !encryptedHex) {
        throw new Error('Invalid ciphertext format');
    }
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

/**
 * Check if a string looks like an encrypted value (iv:ciphertext hex format).
 */
export function isEncrypted(value: string): boolean {
    return /^[0-9a-f]{32}:[0-9a-f]+$/i.test(value);
}
