import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    env[t.slice(0, eq)] = t.slice(eq + 1);
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Try setting an account to quarantine to verify the enum works
const { data: acct } = await sb.from('mother_accounts').select('id').limit(1).single();
console.log('Test account:', acct.id);

const { error } = await sb.from('mother_accounts')
    .update({ status: 'quarantine' })
    .eq('id', acct.id);

if (error) {
    console.log('❌ Still failing:', error.message);
} else {
    console.log('✅ Quarantine status works!');
    // Revert
    await sb.from('mother_accounts').update({ status: 'active' }).eq('id', acct.id);
    console.log('✅ Reverted back to active');
}
