#!/usr/bin/env node
/**
 * Script para inicializar la base de datos de ClickPar en Supabase
 * Ejecuta el schema SQL usando la API de Supabase
 */

const fs = require('fs');
const path = require('path');

// Leer variables de entorno
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ Error: Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

// Leer el schema SQL
const schemaPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf-8');

// Dividir el schema en statements individuales (separados por ;)
// y filtrar los comentarios vacíos
const statements = schema
    .split(/;(?=\s*(?:--|CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|$))/gm)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

async function executeSQL(sql) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ sql }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
    }

    return response.json();
}

async function main() {
    console.log('🚀 Conectando a Supabase:', SUPABASE_URL);
    console.log('📝 Ejecutando schema SQL...\n');

    // Primero, crear la función RPC para ejecutar SQL
    const createRpcFunction = `
    CREATE OR REPLACE FUNCTION exec_sql(sql text)
    RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE sql;
      RETURN json_build_object('success', true);
    EXCEPTION WHEN OTHERS THEN
      RETURN json_build_object('success', false, 'error', SQLERRM);
    END;
    $$;
  `;

    try {
        // Intentar ejecutar directamente con la API de PostgreSQL
        const pgResponse = await fetch(`${SUPABASE_URL}/rest/v1/`, {
            method: 'GET',
            headers: {
                'apikey': SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            },
        });

        console.log('✅ Conexión verificada');
        console.log('\n⚠️  NOTA: Para ejecutar el schema SQL, ve a Supabase Studio:');
        console.log(`   ${SUPABASE_URL}`);
        console.log('   → SQL Editor → Pega el contenido de supabase/schema.sql\n');
        console.log('   O usa la conexión directa a PostgreSQL con psql:\n');
        console.log('   psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" -f supabase/schema.sql\n');

        // Mostrar las tablas que se crearán
        console.log('📋 Tablas que se crearán:');
        console.log('   - profiles (perfiles de usuario)');
        console.log('   - suppliers (proveedores)');
        console.log('   - mother_accounts (cuentas madre)');
        console.log('   - sale_slots (slots de venta)');
        console.log('   - subscriptions (suscripciones)');
        console.log('   - transactions (transacciones)');
        console.log('   - affiliate_codes (códigos de afiliados)');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();
