// Script para agregar columna end_date a la tabla sales
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Cargar variables de entorno
const envPath = path.resolve(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) envVars[key.trim()] = vals.join('=').trim();
});

const supabase = createClient(
    envVars.NEXT_PUBLIC_SUPABASE_URL,
    envVars.SUPABASE_SERVICE_ROLE_KEY
);

async function addEndDate() {
    console.log('Adding end_date column to sales table...');

    const { error } = await supabase.rpc('exec_sql', {
        query: 'ALTER TABLE sales ADD COLUMN IF NOT EXISTS end_date DATE;'
    });

    if (error) {
        // Si no existe la función exec_sql, intentar directamente
        console.log('RPC not available, trying direct approach...');

        // Intentar insertar y actualizar para verificar
        const { data, error: testError } = await supabase
            .from('sales')
            .select('end_date')
            .limit(1);

        if (testError && testError.message.includes('end_date')) {
            console.log('Column does not exist. Please run this SQL in Supabase Dashboard:');
            console.log('');
            console.log('  ALTER TABLE sales ADD COLUMN IF NOT EXISTS end_date DATE;');
            console.log('');
            console.log('Go to: Supabase Dashboard > SQL Editor > paste the above > Run');
        } else if (testError) {
            console.error('Other error:', testError.message);
        } else {
            console.log('✅ Column end_date already exists!');
        }
    } else {
        console.log('✅ Column added successfully!');
    }
}

addEndDate();
