/**
 * Script de actualización para datos de FLUJOTV
 * Limpia y reimporta SOLO los registros de FLUJOTV usando Fecha Vencimiento como end_date
 * NO usa Fecha de Entrega (start_date = null)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const envContent = readFileSync(resolve(ROOT, '.env.local'), 'utf-8');
const env = Object.fromEntries(
    envContent.split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => { const idx = l.indexOf('='); return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]; })
);

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

function parseDate(raw) {
    if (!raw || raw.trim() === '' || raw.includes('-0001') || raw.includes('-740050')) return null;
    const ddmm = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmm) return `${ddmm[3]}-${String(ddmm[2]).padStart(2, '0')}-${String(ddmm[1]).padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return null;
}

function normalizePhone(raw) {
    if (!raw || raw.trim() === '') return null;
    let p = String(raw).replace(/\D/g, '');
    if (!p) return null;
    if (p.startsWith('0')) return '595' + p.slice(1);
    if (p.length >= 10) return p;
    return '595' + p;
}

function parseCSV(content) {
    const lines = content.replace(/\r/g, '').split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const values = line.split(',');
        const row = {};
        headers.forEach((h, i) => { row[h] = (values[i] || '').trim(); });
        return row;
    });
}

const csvPath = resolve(ROOT, 'datos/FLUJOTV.csv');
const content = readFileSync(csvPath, 'utf-8');
const rows = parseCSV(content);

console.log(`\n📂 FLUJOTV.csv — ${rows.length} filas\n`);

// 1. Limpiar solo datos de FLUJO
console.log('🧹 Limpiando registros FLUJOTV...');
const { data: flujaMothers } = await supabase
    .from('mother_accounts')
    .select('id')
    .eq('platform', 'FLUJOTV');

const flujoIds = (flujaMothers || []).map(m => m.id);
console.log(`   Encontradas ${flujoIds.length} cuentas madre FLUJOTV`);

if (flujoIds.length > 0) {
    // Borrar ventas de slots FLUJO
    const { data: flujoSlots } = await supabase.from('sale_slots').select('id').in('mother_account_id', flujoIds);
    const flujoSlotIds = (flujoSlots || []).map(s => s.id);
    if (flujoSlotIds.length > 0) {
        await supabase.from('sales').delete().in('slot_id', flujoSlotIds);
        console.log(`   ✅ Ventas FLUJO eliminadas`);
        await supabase.from('sale_slots').delete().in('mother_account_id', flujoIds);
        console.log(`   ✅ Slots FLUJO eliminados`);
    }
    await supabase.from('mother_accounts').delete().in('id', flujoIds);
    console.log(`   ✅ Cuentas madre FLUJO eliminadas`);
}

// 2. Obtener plataforma FLUJOTV
let { data: platforms } = await supabase.from('platforms').select('id, name');
let platformList = platforms || [];
let flujoPlat = platformList.find(p => p.name.toLowerCase().includes('flujo'));
if (!flujoPlat) {
    const { data: np } = await supabase.from('platforms')
        .insert({ name: 'FLUJOTV', price: 0, is_active: true })
        .select('id, name').single();
    flujoPlat = np;
    console.log('   ✅ Plataforma FLUJOTV creada');
}
console.log(`   📺 Plataforma: ${flujoPlat.name} (id: ${flujoPlat.id})`);

// 3. Crear cuentas madre FLUJO
console.log('\n📦 Creando cuentas madre FLUJOTV...');
const motherRows = rows.filter(r => r['Pantalla']?.trim() === 'PAGO CUENTA COMPLETA');
const motherMap = {}; // email → id

for (const row of motherRows) {
    const email = row['Usuario']?.trim();
    const password = row['Clave']?.trim();
    const renewalDate = parseDate(row['Fecha Vencimiento']);
    const maxSlots = parseInt(row['Número de Pantallas']) || 3;
    const dias = parseInt(row['Dias Restantes']) || 0;
    const status = dias < 0 ? 'expired' : 'active';
    const supplier = row['Nombre Proveedor']?.trim() || null;
    const supplierPhone = row['Celular Proveedor']?.trim() || null;

    const { data: ma, error } = await supabase.from('mother_accounts').insert({
        platform: flujoPlat.name,
        email, password,
        renewal_date: renewalDate,
        supplier_name: supplier,
        supplier_phone: supplierPhone,
        purchase_cost_gs: 0, purchase_cost_usdt: 0, sale_price_gs: 0,
        max_slots: maxSlots, status, sale_type: 'profile',
    }).select('id').single();

    if (error) { console.error(`   ❌ Error: ${email} — ${error.message}`); continue; }

    motherMap[email.toLowerCase()] = ma.id;

    const slots = Array.from({ length: maxSlots }, (_, i) => ({
        mother_account_id: ma.id,
        slot_identifier: `Perfil ${i + 1}`,
        pin_code: null, status: 'available',
    }));
    await supabase.from('sale_slots').insert(slots);
    console.log(`   ✅ ${email} — ${maxSlots} slots | vence: ${renewalDate} | ${status}`);
}

// 4. Importar ventas FLUJO — solo Fecha Vencimiento (sin Fecha de Entrega)
console.log('\n👥 Importando ventas FLUJOTV...');
const slotRows = rows.filter(r => {
    const p = r['Pantalla']?.trim();
    const e = r['Estado']?.trim();
    return p !== 'PAGO CUENTA COMPLETA' && (e === 'Activo' || e === 'Congelado');
});

let salesOk = 0, errors = 0;

for (const row of slotRows) {
    const email = row['Usuario']?.trim();
    const slotIdentifier = row['Pantalla']?.trim();
    const clientPhone = normalizePhone(row['Celular Cliente']);
    // Solo usar Fecha Vencimiento — ignorar Fecha de Entrega
    const endDate = parseDate(row['Fecha Vencimiento']);
    const diasRestantes = parseInt(row['Dias Restantes']) || 0;
    const isCongelado = row['Estado']?.trim() === 'Congelado';
    const isActive = !isCongelado && diasRestantes > 0;

    if (!clientPhone) {
        console.log(`   ⚠️ ${slotIdentifier} sin teléfono — omitido`);
        continue;
    }

    const maId = motherMap[email?.toLowerCase()];
    if (!maId) {
        console.log(`   ⚠️ Sin cuenta madre para ${email} — ${slotIdentifier}`);
        errors++;
        continue;
    }

    // Encontrar o crear cliente
    let customerId;
    const { data: existing } = await supabase.from('customers').select('id').eq('phone', clientPhone).maybeSingle();
    if (existing) {
        customerId = existing.id;
    } else {
        const { data: nc, error: ce } = await supabase.from('customers')
            .insert({ full_name: clientPhone, phone: clientPhone })
            .select('id').single();
        if (ce) { console.error(`   ❌ Cliente ${clientPhone}: ${ce.message}`); errors++; continue; }
        customerId = nc.id;
    }

    // Encontrar slot por prefijo (ej "Perfil 1 - Nombre" → "Perfil 1")
    const prefix = slotIdentifier.split(' - ')[0].trim();
    let slot = null;
    const { data: s1 } = await supabase.from('sale_slots').select('id').eq('mother_account_id', maId).eq('slot_identifier', slotIdentifier).maybeSingle();
    if (s1) slot = s1;
    else {
        const { data: s2 } = await supabase.from('sale_slots').select('id').eq('mother_account_id', maId).eq('slot_identifier', prefix).maybeSingle();
        if (s2) slot = s2;
    }

    if (!slot) { console.error(`   ❌ Slot "${slotIdentifier}" no encontrado para ${email}`); errors++; continue; }

    // Crear venta — start_date null (ignorar Fecha de Entrega)
    const { error: saleErr } = await supabase.from('sales').insert({
        customer_id: customerId,
        slot_id: slot.id,
        amount_gs: 0,
        original_price_gs: 0,
        override_price: false,
        start_date: null,       // ← ignorado según pedido
        end_date: endDate,      // ← solo Fecha Vencimiento
        is_active: isActive,
        payment_method: 'cash',
    });

    if (saleErr) { console.error(`   ❌ Venta ${clientPhone}: ${saleErr.message}`); errors++; continue; }

    const slotStatus = isActive ? 'sold' : 'expired';
    await supabase.from('sale_slots').update({ status: slotStatus }).eq('id', slot.id);
    salesOk++;
    const tag = isCongelado ? ' [CONGELADO]' : (!isActive ? ' [VENCIDO]' : '');
    console.log(`   ✅${tag} ${clientPhone} → ${email} | ${slotIdentifier} | vence: ${endDate}`);
}

console.log('\n════════════════════════════════════');
console.log('📋 RESUMEN FLUJOTV');
console.log('════════════════════════════════════');
console.log(`✅ Cuentas madre: ${motherRows.length}`);
console.log(`✅ Ventas:        ${salesOk}`);
console.log(`❌ Errores:       ${errors}`);
console.log('════════════════════════════════════\n');
