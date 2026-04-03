import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
    if (line.trim().startsWith('#') || !line.includes('=')) return;
    const [key, ...vals] = line.split('=');
    envVars[key.trim()] = vals.join('=').trim();
});

const SUPABASE_URL = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_SERVICE_ROLE_KEY = envVars['SUPABASE_SERVICE_ROLE_KEY'];
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data } = await supabase.from('audit_logs').select('*').eq('action', 'update').limit(10);
    console.log("Audit Logs (update):", JSON.stringify(data, null, 2));
}

main();
