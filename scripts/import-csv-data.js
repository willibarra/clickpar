/*
 * Script FINAL para importar datos del CSV a la base de datos de ClickPar
 * 
 * Decisiones confirmadas con el usuario:
 * - Mapeo de plataformas: CRUNCHYROLL→Crunchyroll, HBOMAX→HBO Max, PARAMOUNT→Paramount+, FLUJOTV→FLUJOTV (nueva)
 * - Estado "Congelado" → mapped a 'review' (accounts) / 'reserved' (slots) 
 * - Clientes sin nombre → "Cliente XXXX" (últimos 4 dígitos del teléfono)
 * - purchase_cost_gs solo desde filas PAGO CUENTA COMPLETA
 * - Proveedor guardado en provider_name/provider_phone de mother_accounts
 * - Precio Comprada en filas de Perfil se ignora
 */

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

// ===== MAPEOS =====

const PLATFORM_MAP = {
    'CRUNCHYROLL': 'Crunchyroll',
    'HBOMAX': 'HBO Max',
    'PARAMOUNT': 'Paramount+',
    'FLUJOTV': 'FLUJOTV',
};

function mapPlatform(csvPlatform) {
    return PLATFORM_MAP[csvPlatform] || csvPlatform;
}

function mapAccountStatus(estado) {
    if (estado.includes('Activo')) return 'active';
    if (estado.includes('Caducado')) return 'expired';
    if (estado.includes('Congelado')) return 'review';
    if (estado.includes('Disponible') || estado.includes('Venta')) return 'active';
    return 'active';
}

function mapSlotStatus(estado) {
    if (estado.includes('Activo')) return 'sold';
    if (estado.includes('Disponible') || estado.includes('Venta')) return 'available';
    if (estado.includes('Congelado')) return 'reserved';
    if (estado.includes('Caducado')) return 'sold';
    return 'available';
}

function normalizePin(pin) {
    if (!pin || pin === '0' || pin === '') return 'NO REQUIERE';
    const cleaned = pin.trim().toUpperCase();
    if (['NO REQUIERE', 'NO REQUIERE PIN', 'NO REQUIERO PIN', 'NA', 'N/A'].includes(cleaned)) return 'NO REQUIERE';
    if (cleaned.startsWith('MEMBRESIA') || cleaned.startsWith('SUSPENDIDA') || cleaned.startsWith('UTILIZAR')) {
        return 'NO REQUIERE'; // These are notes, not PINs
    }
    return pin.trim();
}

// ===== CSV PARSER =====

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

function parseCSV(content) {
    const lines = content.split('\n');
    // Map by position index (column A=0, B=1, ... P=15)
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim().replace(/\r$/, '');
        if (!line) continue;
        const v = parseCSVLine(line);
        rows.push({
            Estado: (v[0] || '').trim(),
            FechaVencimiento: (v[1] || '').trim(),
            DiasRestantes: (v[2] || '').trim(),
            Plataforma: (v[3] || '').trim(),
            Usuario: (v[4] || '').trim(),
            Clave: (v[5] || '').trim(),
            Pantalla: (v[6] || '').trim(),
            PIN: (v[7] || '').trim(),
            FechaEntrega: (v[8] || '').trim(),
            DiasServicio: (v[9] || '').trim(),
            CelProveedor: (v[10] || '').trim(),
            NombreProveedor: (v[11] || '').trim(),
            CelCliente: (v[12] || '').trim(),
            NumPantallas: (v[13] || '').trim(),
            PrecioVenta: (v[14] || '').trim(),
            PrecioComprada: (v[15] || '').trim(),
        });
    }
    return rows;
}

// ===== MAIN =====

async function main() {
    console.log('📋 Leyendo CSV...');
    const csvPath = path.resolve(__dirname, '..', 'datos para agregar a la bd - Hoja 31.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const rows = parseCSV(csvContent);
    console.log(`   Total filas: ${rows.length}`);

    // Separar tipos de filas
    const madreRows = rows.filter(r => r.Pantalla === 'PAGO CUENTA COMPLETA');
    const slotRows = rows.filter(r => r.Pantalla !== 'PAGO CUENTA COMPLETA' && r.Pantalla !== '');

    console.log(`   Cuentas madre: ${madreRows.length}`);
    console.log(`   Slots/Perfiles: ${slotRows.length}`);

    // ===== PASO 0: Agregar columnas faltantes =====
    console.log('\n🔧 Verificando columnas en la BD...');

    // Intentamos agregar las columnas provider_name y provider_phone
    // Si ya existen, no pasa nada
    const addColQueries = [
        'ALTER TABLE mother_accounts ADD COLUMN IF NOT EXISTS provider_name TEXT',
        'ALTER TABLE mother_accounts ADD COLUMN IF NOT EXISTS provider_phone TEXT',
    ];

    for (const sql of addColQueries) {
        const { error } = await supabase.rpc('exec_sql', { query: sql });
        if (error) {
            console.log(`   ⚠️ No se pudo ejecutar RPC, necesitás ejecutar manualmente en Supabase SQL Editor:`);
            console.log(`   ${sql};`);
        }
    }
    console.log('   Verificadas (si hubo error arriba, ejecutá el SQL manualmente antes de continuar)');

    // ===== PASO 1: Limpiar datos existentes =====
    console.log('\n🧹 Limpiando tablas...');
    await supabase.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('sale_slots').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('mother_accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('customers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    console.log('   ✅ Tablas limpiadas');

    // ===== PASO 2: Crear plataforma FLUJOTV si no existe =====
    console.log('\n🏷️ Verificando plataformas...');
    const { data: existingFlujo } = await supabase.from('platforms').select('id').eq('name', 'FLUJOTV').single();
    if (!existingFlujo) {
        const { error } = await supabase.from('platforms').insert({
            name: 'FLUJOTV',
            slug: 'flujotv',
            business_type: 'profile_sharing',
            icon_color: '#FF6B00',
            default_max_slots: 5,
            default_slot_price_gs: 100000,
            slot_label: 'Perfil',
            is_active: true,
        });
        if (error) console.log(`   ⚠️ Error creando FLUJOTV: ${error.message}`);
        else console.log('   ✅ Plataforma FLUJOTV creada');
    } else {
        console.log('   ✓ FLUJOTV ya existe');
    }

    // ===== PASO 3: Insertar cuentas madre =====
    console.log('\n🏦 Insertando cuentas madre...');
    const motherMap = new Map(); // "email::platform" → uuid
    let maCount = 0, maErrors = 0;

    for (const row of madreRows) {
        const email = row.Usuario;
        if (!email) continue;

        const platform = mapPlatform(row.Plataforma);
        const key = `${email}::${platform}`;
        if (motherMap.has(key)) continue;

        const fechaVenc = row.FechaVencimiento;
        let renewalDate;
        if (fechaVenc && fechaVenc.match(/^\d{4}-\d{2}-\d{2}$/)) {
            renewalDate = fechaVenc;
        } else {
            const d = new Date(); d.setDate(d.getDate() + 30);
            renewalDate = d.toISOString().split('T')[0];
        }

        const precioCompra = parseInt(row.PrecioComprada || '0') || 0;

        const insertData = {
            email,
            password: row.Clave || '',
            platform,
            status: mapAccountStatus(row.Estado),
            renewal_date: renewalDate,
            purchase_cost_gs: precioCompra > 0 ? precioCompra : null,
            max_slots: 5,
            provider_name: row.NombreProveedor || null,
            provider_phone: row.CelProveedor || null,
        };

        const { data, error } = await supabase
            .from('mother_accounts')
            .insert(insertData)
            .select('id')
            .single();

        if (error) {
            console.log(`   ⚠️ [${platform}] ${email}: ${error.message}`);
            maErrors++;
        } else {
            motherMap.set(key, data.id);
            maCount++;
        }
    }
    console.log(`   ✅ ${maCount} cuentas madre insertadas (${maErrors} errores)`);

    // ===== PASO 4: Insertar slots, customers, y sales =====
    console.log('\n🎰 Insertando slots + clientes + ventas...');
    let slotCount = 0, custCount = 0, saleCount = 0, slotErrors = 0;
    const customerMap = new Map(); // phone → uuid

    for (const row of slotRows) {
        const email = row.Usuario;
        const platform = mapPlatform(row.Plataforma);
        const key = `${email}::${platform}`;

        // Si la cuenta madre no existe, crearla al vuelo
        if (!motherMap.has(key)) {
            const fechaVenc = row.FechaVencimiento;
            let renewalDate;
            if (fechaVenc && fechaVenc.match(/^\d{4}-\d{2}-\d{2}$/)) {
                renewalDate = fechaVenc;
            } else {
                const d = new Date(); d.setDate(d.getDate() + 30);
                renewalDate = d.toISOString().split('T')[0];
            }

            const { data, error } = await supabase
                .from('mother_accounts')
                .insert({
                    email,
                    password: row.Clave || '',
                    platform,
                    status: mapAccountStatus(row.Estado),
                    renewal_date: renewalDate,
                    max_slots: 5,
                    provider_name: row.NombreProveedor || null,
                    provider_phone: row.CelProveedor || null,
                })
                .select('id')
                .single();

            if (error) {
                console.log(`   ⚠️ Madre al vuelo [${platform}] ${email}: ${error.message}`);
                slotErrors++;
                continue;
            }
            motherMap.set(key, data.id);
            maCount++;
        }

        const maId = motherMap.get(key);

        // Extraer slot identifier limpio (manejar "Perfil 1 - Nombre Persona")
        let slotIdentifier = row.Pantalla.trim();
        let slotNotes = '';
        if (slotIdentifier.includes(' - ')) {
            const parts = slotIdentifier.split(' - ');
            slotIdentifier = parts[0].trim();
            slotNotes = parts.slice(1).join(' - ').trim();
        }

        // Insertar slot
        const { data: slotData, error: slotError } = await supabase
            .from('sale_slots')
            .insert({
                mother_account_id: maId,
                slot_identifier: slotIdentifier,
                pin_code: normalizePin(row.PIN),
                status: mapSlotStatus(row.Estado),
            })
            .select('id')
            .single();

        if (slotError) {
            console.log(`   ⚠️ Slot [${platform}] ${email}/${slotIdentifier}: ${slotError.message}`);
            slotErrors++;
            continue;
        }
        slotCount++;

        // Si tiene cliente con teléfono y está Activo/Caducado, crear customer + sale
        const celCliente = row.CelCliente;
        if (celCliente && (row.Estado.includes('Activo') || row.Estado.includes('Caducado'))) {
            // Normalizar teléfono
            let phone = celCliente.replace(/\D/g, '');

            // Buscar o crear customer
            if (!customerMap.has(phone)) {
                const { data: existing } = await supabase
                    .from('customers')
                    .select('id')
                    .eq('phone', phone)
                    .single();

                if (existing) {
                    customerMap.set(phone, existing.id);
                } else {
                    const { data: newCust, error: custErr } = await supabase
                        .from('customers')
                        .insert({
                            full_name: `Cliente ${phone.slice(-4)}`,
                            phone,
                        })
                        .select('id')
                        .single();

                    if (custErr) {
                        console.log(`   ⚠️ Cliente ${phone}: ${custErr.message}`);
                        continue;
                    }
                    customerMap.set(phone, newCust.id);
                    custCount++;
                }
            }

            const customerId = customerMap.get(phone);
            const precioVenta = parseInt(row.PrecioVenta || '0') || 0;
            const diasServicio = parseInt(row.DiasServicio || '30') || 30;
            const fechaEntrega = row.FechaEntrega;

            // Calcular fechas
            let startDate, endDate;
            if (fechaEntrega && fechaEntrega.match(/^\d{4}-\d{2}-\d{2}$/)) {
                startDate = fechaEntrega;
                const end = new Date(fechaEntrega);
                end.setDate(end.getDate() + diasServicio);
                endDate = end.toISOString().split('T')[0];
            } else {
                startDate = new Date().toISOString().split('T')[0];
                const end = new Date();
                end.setDate(end.getDate() + diasServicio);
                endDate = end.toISOString().split('T')[0];
            }

            const { error: saleErr } = await supabase
                .from('sales')
                .insert({
                    customer_id: customerId,
                    slot_id: slotData.id,
                    amount_gs: precioVenta,
                    original_price_gs: precioVenta,
                    start_date: startDate,
                    end_date: endDate,
                    is_active: row.Estado.includes('Activo'),
                    payment_method: 'cash',
                });

            if (saleErr) {
                console.log(`   ⚠️ Venta: ${saleErr.message}`);
            } else {
                saleCount++;
            }
        }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ IMPORTACIÓN COMPLETADA`);
    console.log(`${'='.repeat(50)}`);
    console.log(`   🏦 Cuentas madre: ${maCount}`);
    console.log(`   🎰 Slots:         ${slotCount}`);
    console.log(`   👤 Clientes:      ${custCount}`);
    console.log(`   💰 Ventas:        ${saleCount}`);
    console.log(`   ⚠️  Errores:       ${slotErrors + maErrors}`);
    console.log(`${'='.repeat(50)}`);
}

main().catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});
