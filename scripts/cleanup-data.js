#!/usr/bin/env node
/**
 * CLEANUP: Delete all customers, sales, sale_slots, and mother_accounts
 * Keeps: platforms, settings, users/profiles, whatsapp config
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function cleanup() {
    console.log('🗑️  Iniciando limpieza de datos...\n');

    // Order matters because of foreign key constraints
    const steps = [
        { table: 'whatsapp_send_log', label: 'Log de WhatsApp' },
        { table: 'audit_log', label: 'Audit log' },
        { table: 'sales', label: 'Ventas' },
        { table: 'sale_slots', label: 'Slots / Perfiles' },
        { table: 'mother_accounts', label: 'Cuentas Madre' },
        { table: 'customers', label: 'Clientes' },
    ];

    for (const step of steps) {
        const { error, count } = await (supabase.from(step.table)).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) {
            console.error(`❌ Error al limpiar ${step.label}: ${error.message}`);
        } else {
            console.log(`✅ ${step.label} eliminados`);
        }
    }

    // Verify
    console.log('\n📊 Verificando...');
    for (const step of steps) {
        const { count } = await supabase.from(step.table).select('*', { count: 'exact', head: true });
        console.log(`   ${step.label}: ${count ?? '?'} registros restantes`);
    }

    console.log('\n✅ Limpieza completada.');
}

cleanup().catch(console.error);
