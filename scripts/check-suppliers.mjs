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
    console.log("Checking DB directly for what is in supplier_name right now:");
    
    const { data: all_accounts } = await supabase.from('mother_accounts').select('id, supplier_name, supplier_id');
    
    const names = {};
    const ids = {};
    all_accounts.forEach(a => {
        const n = String(a.supplier_name).trim();
        names[n] = (names[n] || 0) + 1;
        
        const i = String(a.supplier_id);
        ids[i] = (ids[i] || 0) + 1;
    });
    
    console.log("Distinct supplier_name values and count:", names);
    console.log("Distinct supplier_id values and count:", ids);
    
    const {data: all_suppliers} = await supabase.from('suppliers').select('*');
    console.log("Suppliers table:", all_suppliers);
}

main();
