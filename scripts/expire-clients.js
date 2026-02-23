#!/usr/bin/env node

/**
 * Script para "vencer" 3 clientes de prueba.
 * Cambia el start_date de 3 ventas activas a hace 45 días,
 * así start_date + 30 = hace 15 días → aparecen como VENCIDOS.
 *
 * Ejecutar: node scripts/expire-clients.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const [key, ...values] = line.split('=');
    if (key && values.length) {
        envVars[key.trim()] = values.join('=').trim();
    }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function expireClients() {
    console.log('🔴 Expirando 3 clientes de prueba...\n');

    // 1. Fetch 3 active sales
    const { data: activeSales, error } = await supabase
        .from('sales')
        .select('id, start_date, amount_gs, is_active, customer_id, slot_id')
        .eq('is_active', true)
        .limit(3);

    if (error) {
        console.error('❌ Error fetching sales:', error.message);
        process.exit(1);
    }

    if (!activeSales || activeSales.length === 0) {
        console.log('⚠️ No hay ventas activas para vencer');
        process.exit(0);
    }

    console.log(`📋 Encontradas ${activeSales.length} ventas para vencer:\n`);

    // 2. Update each sale's start_date to 45 days ago
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - 45);
    const expiredDateStr = expiredDate.toISOString().split('T')[0];

    for (const sale of activeSales) {
        // Get customer name
        let customerName = 'N/A';
        if (sale.customer_id) {
            const { data: cust } = await supabase
                .from('customers')
                .select('full_name')
                .eq('id', sale.customer_id)
                .single();
            if (cust) customerName = cust.full_name;
        }

        // Get platform info
        let platformInfo = 'N/A';
        if (sale.slot_id) {
            const { data: slot } = await supabase
                .from('sale_slots')
                .select('slot_identifier, mother_account_id')
                .eq('id', sale.slot_id)
                .single();
            if (slot && slot.mother_account_id) {
                const { data: ma } = await supabase
                    .from('mother_accounts')
                    .select('platform, email')
                    .eq('id', slot.mother_account_id)
                    .single();
                if (ma) platformInfo = `${ma.platform} (${ma.email})`;
            }
        }

        const { error: updateError } = await supabase
            .from('sales')
            .update({ start_date: expiredDateStr })
            .eq('id', sale.id);

        if (updateError) {
            console.error(`  ❌ Error en venta ${sale.id}:`, updateError.message);
        } else {
            console.log(`  ✅ ${customerName} | ${platformInfo}`);
            console.log(`     start_date: ${sale.start_date} → ${expiredDateStr} (vence: ${getExpiryDate(expiredDateStr)})`);
            console.log('');
        }
    }

    console.log(`\n✨ ¡Completado! ${activeSales.length} cliente(s) ahora aparecen como VENCIDOS.`);
    console.log('   Verifica en: /customers y /renewals (tab Clientes)');
}

function getExpiryDate(startDate) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
}

expireClients()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
