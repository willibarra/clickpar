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

const mapping = JSON.parse(fs.readFileSync('datos/recovered_mapping.json', 'utf-8'));

async function main() {
    console.log(`Starting recovery of suppliers for ${Object.keys(mapping).length} loaded emails...`);

    // Fetch all mother accounts
    const { data: accounts, error } = await supabase.from('mother_accounts').select('id, email, supplier_name, supplier_id');
    if (error) {
        console.error(error);
        process.exit(1);
    }
    
    let updatedCount = 0;
    
    // Process unique suppliers from mapping
    const rawNames = Object.values(mapping).map(s => s.trim().toUpperCase());
    const uniqueSuppliers = [...new Set(rawNames)];
    
    console.log(`Ensuring ${uniqueSuppliers.length} unique suppliers exist in the dropdown...`);
    
    const nameToId = {};
    for (const name of uniqueSuppliers) {
        let { data: existing } = await supabase.from('suppliers').select('id').ilike('name', name).maybeSingle();
        if (!existing) {
             const res = await supabase.from('suppliers').insert({ name }).select('id').single();
             if (!res.error) existing = res.data;
        }
        if (existing) {
            nameToId[name] = existing.id;
        }
    }

    console.log("Linking mother accounts back to their original providers...");
    
    for (const account of accounts) {
        const email = account.email.trim().toLowerCase();
        if (mapping[email]) {
            const correctSupplierName = mapping[email].trim().toUpperCase();
            const correctSupplierId = nameToId[correctSupplierName];
            
            // Only update if they differ AND we have a valid correct id
            // (If the user recently changed it via the UI to something else, we might overwrite, but given they are complaining they all say SIN PROVEEDOR, this is fine)
            if (correctSupplierId && (account.supplier_name !== correctSupplierName || account.supplier_id !== correctSupplierId)) {
                await supabase.from('mother_accounts').update({ 
                    supplier_id: correctSupplierId,
                    supplier_name: correctSupplierName 
                }).eq('id', account.id);
                updatedCount++;
            }
        }
    }

    console.log(`Successfully RESTORED original suppliers for ${updatedCount} mother accounts!`);
}

main().catch(console.error);
