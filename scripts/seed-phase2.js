// Script para cargar datos de prueba completos - Fase 2
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper para fechas
const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result.toISOString().split('T')[0];
};

const today = new Date().toISOString().split('T')[0];
const tomorrow = addDays(new Date(), 1);
const in2Days = addDays(new Date(), 2);
const in3Days = addDays(new Date(), 3);
const in7Days = addDays(new Date(), 7);
const in30Days = addDays(new Date(), 30);

async function seedPhase2() {
    console.log('🚀 Iniciando Data Seeding Fase 2...\n');

    // 1. Actualizar algunas cuentas madre con fechas de vencimiento próximas
    console.log('📅 Configurando cuentas con vencimientos próximos...');

    // Obtener IDs de cuentas existentes
    const { data: accounts } = await supabase
        .from('mother_accounts')
        .select('id, platform')
        .limit(10);

    if (accounts && accounts.length > 0) {
        // Cuenta que vence HOY
        await supabase
            .from('mother_accounts')
            .update({ renewal_date: today, slot_price_gs: 35000, notes: '⚠️ VENCE HOY' })
            .eq('id', accounts[0].id);
        console.log(`   🔴 ${accounts[0].platform} -> Vence HOY`);

        // Cuenta que vence MAÑANA
        if (accounts[1]) {
            await supabase
                .from('mother_accounts')
                .update({ renewal_date: tomorrow, slot_price_gs: 30000, notes: '⚠️ VENCE MAÑANA' })
                .eq('id', accounts[1].id);
            console.log(`   🟠 ${accounts[1].platform} -> Vence MAÑANA`);
        }

        // Cuenta que vence en 2 días
        if (accounts[2]) {
            await supabase
                .from('mother_accounts')
                .update({ renewal_date: in2Days, slot_price_gs: 25000 })
                .eq('id', accounts[2].id);
            console.log(`   🟡 ${accounts[2].platform} -> Vence en 2 días`);
        }

        // Cuenta que vence en 3 días
        if (accounts[3]) {
            await supabase
                .from('mother_accounts')
                .update({ renewal_date: in3Days, slot_price_gs: 25000 })
                .eq('id', accounts[3].id);
            console.log(`   🟡 ${accounts[3].platform} -> Vence en 3 días`);
        }

        // Resto con fechas normales
        for (let i = 4; i < accounts.length; i++) {
            await supabase
                .from('mother_accounts')
                .update({
                    renewal_date: addDays(new Date(), 15 + (i * 5)),
                    slot_price_gs: 20000 + (Math.random() * 20000)
                })
                .eq('id', accounts[i].id);
        }
    }
    console.log('   ✅ Vencimientos configurados\n');

    // 2. Crear Bundles/Combos
    console.log('📦 Creando Bundles/Combos...');

    const bundles = [
        {
            name: 'Pack Streaming Full',
            description: 'Netflix + Disney+ + HBO Max',
            price_gs: 75000,
            original_price_gs: 90000,
            discount_percent: 17
        },
        {
            name: 'Combo Música',
            description: 'Spotify + YouTube Premium',
            price_gs: 28000,
            original_price_gs: 33000,
            discount_percent: 15
        },
        {
            name: 'Pack Familiar',
            description: 'Netflix + Spotify + Disney+',
            price_gs: 65000,
            original_price_gs: 75000,
            discount_percent: 13
        },
        {
            name: 'Pack Gamer',
            description: 'Crunchyroll + YouTube Premium',
            price_gs: 30000,
            original_price_gs: 35000,
            discount_percent: 14
        },
    ];

    for (const bundle of bundles) {
        const { data: inserted, error } = await supabase
            .from('bundles')
            .insert(bundle)
            .select()
            .single();

        if (!error && inserted) {
            // Agregar items al bundle
            const platforms = bundle.description.split(' + ').map(p => p.trim());
            for (const platform of platforms) {
                await supabase.from('bundle_items').insert({
                    bundle_id: inserted.id,
                    platform: platform,
                    slot_count: 1
                });
            }
            console.log(`   ✅ ${bundle.name}: Gs. ${bundle.price_gs.toLocaleString()}`);
        }
    }
    console.log('');

    // 3. Crear gastos de ejemplo
    console.log('💸 Creando gastos de renovación...');

    const { data: existingAccounts } = await supabase
        .from('mother_accounts')
        .select('id, platform, purchase_cost_gs')
        .limit(5);

    if (existingAccounts) {
        for (const acc of existingAccounts) {
            await supabase.from('expenses').insert({
                mother_account_id: acc.id,
                description: `Renovación ${acc.platform}`,
                amount_gs: acc.purchase_cost_gs || (15 + Math.random() * 10) * 1000,
                expense_type: 'renewal',
                expense_date: addDays(new Date(), -Math.floor(Math.random() * 30))
            });
        }
        console.log(`   ✅ ${existingAccounts.length} gastos creados\n`);
    }

    // 4. Actualizar ventas con datos adicionales
    console.log('💰 Actualizando ventas existentes...');

    const { data: sales } = await supabase.from('sales').select('id').limit(30);
    if (sales) {
        let updated = 0;
        for (let i = 0; i < sales.length; i++) {
            const originalPrice = 25000 + Math.floor(Math.random() * 15000);
            await supabase
                .from('sales')
                .update({
                    original_price_gs: originalPrice,
                    override_price: i % 5 === 0,  // 20% con precio modificado
                    notes: i % 3 === 0 ? 'Descuento especial' : null
                })
                .eq('id', sales[i].id);
            updated++;
        }
        console.log(`   ✅ ${updated} ventas actualizadas\n`);
    }

    // 5. Verificación final
    console.log('📊 RESUMEN FINAL:');

    const stats = await Promise.all([
        supabase.from('platforms').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('mother_accounts').select('*', { count: 'exact', head: true }),
        supabase.from('sale_slots').select('*', { count: 'exact', head: true }),
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        supabase.from('sales').select('*', { count: 'exact', head: true }),
        supabase.from('bundles').select('*', { count: 'exact', head: true }),
        supabase.from('expenses').select('*', { count: 'exact', head: true }),
        supabase.from('mother_accounts').select('*', { count: 'exact', head: true })
            .gte('renewal_date', today)
            .lte('renewal_date', in3Days),
    ]);

    console.log(`   📺 Plataformas: ${stats[0].count}`);
    console.log(`   🔐 Cuentas Madre: ${stats[1].count}`);
    console.log(`   🎫 Slots: ${stats[2].count}`);
    console.log(`   👥 Clientes: ${stats[3].count}`);
    console.log(`   💰 Ventas: ${stats[4].count}`);
    console.log(`   📦 Bundles: ${stats[5].count}`);
    console.log(`   💸 Gastos: ${stats[6].count}`);
    console.log(`   ⚠️  Por vencer (3 días): ${stats[7].count}`);

    console.log('\n✅ Data Seeding Fase 2 completado!');
}

seedPhase2().catch(console.error);
