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

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing Superbase keys in .env.local!");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    console.log("Fetching unique supplier names from mother_accounts...");
    const { data: accounts, error } = await supabase
        .from('mother_accounts')
        .select('id, supplier_name, supplier_id')
        .not('supplier_name', 'is', null)
        .is('deleted_at', null);

    if (error) {
        console.error("Error fetching accounts:", error);
        process.exit(1);
    }

    const unlinked = accounts.filter(a => a.supplier_name && a.supplier_name.trim() !== '');
    console.log(`Found ${unlinked.length} mother_accounts that have a supplier_name text.`);

    const uniqueNames = [...new Set(unlinked.map(a => a.supplier_name.trim().toUpperCase()))];
    console.log(`Unique supplier names to ensure in DB: ${uniqueNames.join(', ')}`);

    for (const name of uniqueNames) {
        if (name === 'SIN PROVEEDOR' || name === '-') continue;

        let { data: existing } = await supabase.from('suppliers').select('id, name').ilike('name', name).maybeSingle();
        
        if (!existing) {
             console.log(`Creating NEW supplier in dropdown: ${name}`);
             const res = await supabase.from('suppliers').insert({ name }).select('id').single();
             if (res.error) console.error("Error creating supplier:", res.error);
             else existing = res.data;
        } else {
             console.log(`Supplier ${name} already exists in dropdown.`);
        }

        if (existing) {
             const toUpdate = unlinked.filter(a => a.supplier_name.trim().toUpperCase() === name && !a.supplier_id);
             if (toUpdate.length > 0) {
                 console.log(`Linking ${toUpdate.length} unlinked accounts to supplier ${name}...`);
                 for (const account of toUpdate) {
                      await supabase.from('mother_accounts').update({ supplier_id: existing.id }).eq('id', account.id);
                 }
             }
        }
    }
    
    console.log("Done checking and merging suppliers into the dropdown!");
}

main().catch(console.error);
