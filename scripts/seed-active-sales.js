#!/usr/bin/env node

/**
 * Script para generar ventas activas de prueba vinculadas a cuentas existentes
 * Ejecutar: node scripts/seed-active-sales.js
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

// Nombres y teléfonos de clientes de ejemplo
const sampleCustomers = [
    { full_name: 'Carlos García', phone: '+595981111111' },
    { full_name: 'Ana Martínez', phone: '+595982222222' },
    { full_name: 'Luis Fernández', phone: '+595983333333' },
    { full_name: 'María López', phone: '+595984444444' },
    { full_name: 'Pedro Ramírez', phone: '+595985555555' },
    { full_name: 'Sofía Benítez', phone: '+595986666666' },
    { full_name: 'Diego Ortega', phone: '+595987777777' },
    { full_name: 'Laura Gómez', phone: '+595988888888' },
    { full_name: 'Roberto Silva', phone: '+595989999999' },
    { full_name: 'Carmen Díaz', phone: '+595980000000' },
];

async function seedActiveSales() {
    console.log('🚀 Iniciando generación de ventas activas...\n');

    try {
        // 1. Obtener slots disponibles con sus cuentas madre
        const { data: availableSlots, error: slotsError } = await supabase
            .from('sale_slots')
            .select(`
                id,
                slot_identifier,
                pin_code,
                status,
                mother_account_id,
                mother_accounts (
                    id,
                    email,
                    platform
                )
            `)
            .eq('status', 'available')
            .limit(15);

        if (slotsError) throw slotsError;

        if (!availableSlots || availableSlots.length === 0) {
            console.log('⚠️ No hay slots disponibles para crear ventas');
            return;
        }

        console.log(`📦 Encontrados ${availableSlots.length} slots disponibles\n`);

        // 2. Crear clientes si no existen
        console.log('👥 Creando/verificando clientes...');
        const customerIds = [];

        for (const customer of sampleCustomers) {
            // Verificar si existe
            const { data: existing } = await supabase
                .from('customers')
                .select('id')
                .eq('phone', customer.phone)
                .single();

            if (existing) {
                customerIds.push(existing.id);
            } else {
                const { data: newCustomer, error: createError } = await supabase
                    .from('customers')
                    .insert({
                        full_name: customer.full_name,
                        phone: customer.phone,
                        notes: 'Cliente de prueba'
                    })
                    .select('id')
                    .single();

                if (createError) {
                    console.error(`Error creando cliente ${customer.full_name}:`, createError.message);
                } else {
                    customerIds.push(newCustomer.id);
                    console.log(`  ✅ Creado: ${customer.full_name}`);
                }
            }
        }

        console.log(`\n📊 ${customerIds.length} clientes listos\n`);

        // 3. Crear ventas activas
        console.log('💳 Creando ventas activas...\n');
        let salesCreated = 0;

        for (let i = 0; i < Math.min(availableSlots.length, customerIds.length); i++) {
            const slot = availableSlots[i];
            const customerId = customerIds[i % customerIds.length];
            const account = slot.mother_accounts;

            // Calcular fechas
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - Math.floor(Math.random() * 15)); // Empezó hace 0-15 días

            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 30); // 30 días de duración

            // Precio base según plataforma
            const platformPrices = {
                'Netflix': 30000,
                'Spotify': 18000,
                'HBO': 25000,
                'Disney+': 22000,
                'YouTube Premium': 15000,
                'Crunchyroll': 20000,
                'Amazon Prime': 20000,
                'Paramount+': 18000
            };
            const basePrice = platformPrices[account?.platform] || 25000;

            // Crear la venta
            const { data: sale, error: saleError } = await supabase
                .from('sales')
                .insert({
                    customer_id: customerId,
                    slot_id: slot.id,
                    amount_gs: basePrice,
                    is_active: true
                })
                .select('id')
                .single();

            if (saleError) {
                console.error(`  ❌ Error en slot ${slot.id}:`, saleError.message);
                continue;
            }

            // Marcar slot como vendido
            const { error: updateError } = await supabase
                .from('sale_slots')
                .update({
                    status: 'sold'
                })
                .eq('id', slot.id);

            if (updateError) {
                console.error(`  ⚠️ Error actualizando slot ${slot.id}:`, updateError.message);
            }

            salesCreated++;
            const customerName = sampleCustomers[i % sampleCustomers.length]?.full_name || 'Cliente';
            console.log(`  ✅ ${account?.platform || 'Servicio'} (${account?.email}) → ${customerName} | Gs. ${basePrice.toLocaleString()}`);
        }

        console.log(`\n✨ ¡Completado! Se crearon ${salesCreated} ventas activas.\n`);

        // 4. Resumen final
        const { count: totalSales } = await supabase
            .from('sales')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        const { count: soldSlots } = await supabase
            .from('sale_slots')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'sold');

        console.log('📈 Estado actual del sistema:');
        console.log(`   - Ventas activas totales: ${totalSales}`);
        console.log(`   - Slots vendidos: ${soldSlots}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

seedActiveSales()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
