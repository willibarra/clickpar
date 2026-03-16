/**
 * One-time script to encrypt existing plaintext portal_password values.
 * Run: npx tsx scripts/encrypt-existing-passwords.ts
 */
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// -- Config --
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ENCRYPTION_KEY = process.env.PORTAL_ENCRYPTION_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENCRYPTION_KEY) {
    console.error('Missing env vars. Run with: npx tsx -r dotenv/config scripts/encrypt-existing-passwords.ts');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function encrypt(text: string): string {
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

function isEncrypted(value: string): boolean {
    return /^[0-9a-f]{32}:[0-9a-f]+$/i.test(value);
}

async function main() {
    console.log('🔐 Encrypting existing portal passwords...\n');

    const { data: customers, error } = await supabase
        .from('customers')
        .select('id, full_name, portal_password')
        .not('portal_password', 'is', null);

    if (error) {
        console.error('Error fetching customers:', error.message);
        process.exit(1);
    }

    if (!customers || customers.length === 0) {
        console.log('No customers with portal passwords found.');
        return;
    }

    let encrypted = 0;
    let skipped = 0;

    for (const customer of customers) {
        if (!customer.portal_password) continue;

        if (isEncrypted(customer.portal_password)) {
            console.log(`  ⏭ ${customer.full_name || customer.id} — already encrypted`);
            skipped++;
            continue;
        }

        const encryptedPassword = encrypt(customer.portal_password);

        const { error: updateError } = await supabase
            .from('customers')
            .update({ portal_password: encryptedPassword })
            .eq('id', customer.id);

        if (updateError) {
            console.error(`  ❌ ${customer.full_name || customer.id} — ${updateError.message}`);
        } else {
            console.log(`  ✅ ${customer.full_name || customer.id} — encrypted`);
            encrypted++;
        }
    }

    console.log(`\n📊 Done! Encrypted: ${encrypted}, Skipped: ${skipped}, Total: ${customers.length}`);
}

main();
