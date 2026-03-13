/**
 * sync_customer_names_from_wa.mjs
 *
 * Busca en Evolution API todos los contactos/chats y actualiza en Supabase los nombres.
 *
 * Ejecutar:  node datos/sync_customer_names_from_wa.mjs
 * Opciones:
 *   --dry-run   → muestra qué cambiaría sin guardar nada
 *   --force     → actualiza TODOS los clientes (aunque ya tengan nombre)
 *   --instance=clickpar-2  → usar otra instancia
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');   // actualiza aunque ya tenga nombre
const INSTANCE = process.argv.find(a => a.startsWith('--instance='))?.split('=')[1] || 'clickpar-1';

// ── Leer .env.local ──────────────────────────────────────────────────────────
const ROOT = '/Applications/ClickPar';
const env = Object.fromEntries(
    readFileSync(resolve(ROOT, '.env.local'), 'utf-8').split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const EVO_URL = env['EVOLUTION_API_URL'];
const EVO_KEY = env['EVOLUTION_API_KEY'];
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

if (!EVO_URL || !EVO_KEY) {
    console.error('❌ Faltan EVOLUTION_API_URL o EVOLUTION_API_KEY en .env.local');
    process.exit(1);
}

// ── Normalizar número: quitar +, espacios, guiones → 595XXXXXXXXX ──────────
function normalizePhone(raw) {
    if (!raw) return '';
    let p = String(raw).replace(/[^\d]/g, '');
    if (p.startsWith('0')) p = '595' + p.slice(1);
    if (!p.startsWith('595') && p.length === 9) p = '595' + p;
    return p;
}

// ── Detectar si el nombre parece un número de teléfono ──────────────────────
function nameIsPhoneNumber(name) {
    if (!name) return true;
    // Si tiene 7+ dígitos y el resto son +, espacios o guiones → es número
    return /^[\d\s\+\-]{7,}$/.test(name.trim());
}

// ── Helpers para extraer nombre y número de un objeto de la API ─────────────
function extractEntry(obj) {
    const jid = obj.remoteJid || obj.id || '';
    const rawNumber = jid.replace(/@s\.whatsapp\.net|@c\.us/, '');
    const normalized = normalizePhone(rawNumber);
    // pushName = nombre que el usuario puso en su propio WhatsApp
    // verifiedName/name = nombre guardado en tus contactos
    const name = obj.pushName || obj.verifiedName || obj.name || '';
    return { normalized, name: name.trim() };
}

async function fetchAll(endpoint) {
    try {
        const res = await fetch(`${EVO_URL}/${endpoint}/${INSTANCE}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
            body: JSON.stringify({}),
        });
        if (!res.ok) { console.warn(`⚠️  ${endpoint}: ${res.status}`); return []; }
        return await res.json();
    } catch (err) {
        console.warn(`⚠️  ${endpoint}: ${err.message}`);
        return [];
    }
}

// ── 1. Obtener contactos + chats de Evolution API ────────────────────────────
console.log(`\n📡 Conectando a Evolution API (instancia: ${INSTANCE})...`);

const [contacts, chats] = await Promise.all([
    fetchAll('chat/findContacts'),  // contactos guardados
    fetchAll('chat/findChats'),     // todos los chats (incluye pushName de no guardados)
]);

console.log(`✅ ${contacts.length} contactos guardados`);
console.log(`💬 ${chats.length} chats encontrados`);

// Construir mapa: número normalizado → nombre
// Prioridad: contacto guardado > pushName del chat
const waNames = new Map();

// Primero los chats (pushName del propio usuario, menor prioridad)
for (const c of chats) {
    const { normalized, name } = extractEntry(c);
    if (normalized && name) waNames.set(normalized, name);
}

// Luego los contactos guardados (sobreescribe con el nombre que vos pusiste)
for (const c of contacts) {
    const { normalized, name } = extractEntry(c);
    if (normalized && name) waNames.set(normalized, name);
}

console.log(`📇 ${waNames.size} números con nombre válido en total\n`);

// ── 2. Obtener clientes con nombre = número ──────────────────────────────────
const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('id, full_name, phone')
    .not('phone', 'is', null);

if (custErr) {
    console.error('❌ Error al leer clientes:', custErr.message);
    process.exit(1);
}

console.log(`👥 ${customers.length} clientes en la base de datos`);

// Filtrar clientes a actualizar
const toUpdate = [];
for (const c of customers) {
    const normalized = normalizePhone(c.phone);
    const newName = waNames.get(normalized);
    if (!newName) continue;                           // WA no tiene este número
    if (!FORCE && !nameIsPhoneNumber(c.full_name)) continue; // ya tiene nombre real
    if (newName === c.full_name) continue;            // ya es el mismo, skip

    toUpdate.push({ id: c.id, phone: c.phone, oldName: c.full_name, newName });
}

console.log(`\n🔍 Clientes a actualizar: ${toUpdate.length}`);

if (toUpdate.length === 0) {
    console.log('✅ No hay nada que actualizar.');
    process.exit(0);
}

// ── 3. Mostrar preview ───────────────────────────────────────────────────────
console.log('\n📋 Preview de cambios:');
console.log('─'.repeat(70));
for (const u of toUpdate.slice(0, 20)) {
    console.log(`  📱 ${u.phone.padEnd(15)} "${u.oldName}" → "${u.newName}"`);
}
if (toUpdate.length > 20) {
    console.log(`  ... y ${toUpdate.length - 20} más`);
}
console.log('─'.repeat(70));

if (DRY_RUN) {
    console.log('\n⚠️  Modo --dry-run: no se guardaron cambios.');
    process.exit(0);
}

// ── 4. Actualizar en Supabase ────────────────────────────────────────────────
console.log('\n💾 Guardando cambios...');
let updated = 0;
let failed = 0;

for (const u of toUpdate) {
    const { error } = await supabase
        .from('customers')
        .update({ full_name: u.newName })
        .eq('id', u.id);

    if (error) {
        console.error(`  ❌ Error al actualizar ${u.phone}: ${error.message}`);
        failed++;
    } else {
        updated++;
    }
}

console.log(`\n✅ Actualizados: ${updated}`);
if (failed > 0) console.log(`❌ Fallidos:     ${failed}`);
console.log('\n🎉 Sincronización completada.');
