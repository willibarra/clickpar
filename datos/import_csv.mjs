/**
 * ClickPar - Script de Importación Universal de CSV
 * ===================================================
 * Formato esperado del CSV (columnas en cualquier orden):
 *
 * Estado, Fecha Vencimiento, Dias Restantes, Plataforma, Usuario, Clave,
 * Pantalla, PIN, Instrucciones, Enviar Instrucciones, Fecha de Entrega,
 * Días de Servicio, Celular Proveedor, Nombre Proveedor, Celular Cliente,
 * Vendido, Número de Pantallas
 *
 * Reglas de importación aprendidas:
 * - Pantalla = "PAGO CUENTA COMPLETA" → es la fila de la madre (no crea slot)
 * - Estado = "Activo" + Celular Cliente real → slot vendido con venta
 * - Estado = "A la Venta / Disponible" → slot libre (available)
 * - -0001-12-30 y -740050 → null / vacío
 * - PIN = "NO REQUIERE" → null
 * - Plataforma: tomar solo el nombre antes del " - " para matchear (ej: "VIX - 1 PERFIL" → "VIX")
 * - Precios: todos 0
 * - Número de Pantallas en fila PAGO CUENTA COMPLETA = max_slots de la madre
 *
 * Uso:
 *   node datos/import_csv.mjs --file="datos/VIX - VIX.csv" --clean
 *   node datos/import_csv.mjs --file="datos/NETFLIX - NETFLIX.csv"
 *   --clean  →  limpia mother_accounts, sale_slots, sales, customers antes de importar
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Config ──────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Leer .env.local manualmente
const envContent = readFileSync(resolve(ROOT, '.env.local'), 'utf-8');
const env = Object.fromEntries(
    envContent.split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => {
            const idx = l.indexOf('=');
            return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        })
);

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌ No se encontraron SUPABASE_URL o SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const fileArg = args.find(a => a.startsWith('--file='))?.replace('--file=', '');
const doClean = args.includes('--clean');

if (!fileArg) {
    console.error('❌ Especificá el archivo: --file="datos/VIX - VIX.csv"');
    process.exit(1);
}

const csvPath = resolve(ROOT, fileArg);

// ── Helpers ─────────────────────────────────────────────────────────────────
function parseDate(raw) {
    if (!raw || raw.trim() === '' || raw.includes('-0001') || raw.includes('-740050')) return null;
    // Intentar formato dd/MM/yyyy
    const ddmm = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmm) {
        return `${ddmm[3]}-${String(ddmm[2]).padStart(2, '0')}-${String(ddmm[1]).padStart(2, '0')}`;
    }
    // Formato yyyy-MM-dd ya está bien
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return null;
}

function normalizePhone(raw) {
    if (!raw || raw.trim() === '') return null;
    let p = String(raw).replace(/\D/g, '');
    if (!p) return null;
    // Solo normalizar si empieza con 0 (formato local paraguayo: 09XXXXXXXX)
    if (p.startsWith('0')) return '595' + p.slice(1);
    // Si ya tiene 10+ dígitos, es probablemente internacional — guardar tal cual
    if (p.length >= 10) return p;
    // Si tiene menos de 10 dígitos, asumir Paraguay
    return '595' + p;
}

// Para teléfonos de PROVEEDOR: almacenar tal cual (pueden ser internacionales)
function storePhone(raw) {
    if (!raw || raw.trim() === '') return null;
    return String(raw).trim();
}

function parsePin(raw) {
    if (!raw || raw.trim() === '') return null;
    const u = raw.trim().toUpperCase();
    // Instrucciones internas o sin pin → null
    const nullPins = [
        'NO REQUIERE', 'NA', '0', '-',
        'AGREGAR PERFIL', 'PIDE COD DE INICIO', 'CONTRASEÑA INCORRECTA',
        'NO EXISTE CUENTA', 'BLOQUEADO', 'NO ESTA PREMIUM', 'CANJE',
    ];
    if (nullPins.includes(u)) return null;
    // "crear perfil X" y similares
    if (u.startsWith('CREAR PERFIL')) return null;
    if (u.startsWith('AGREGAR')) return null;
    if (u.startsWith('PIDE')) return null;
    return raw.trim();
}

// Limpiar nombre de proveedor (quitar prefijo "Proveedor: ")
function cleanSupplier(raw) {
    if (!raw || raw.trim() === '') return null;
    return raw.trim().replace(/^Proveedor:\s*/i, '');
}

function parsePlatformName(raw) {
    // "VIX - 1 ᴘᴇʀꜰɪʟ" → "VIX"
    // "Netflix" → "Netflix"
    if (!raw) return null;
    const idx = raw.indexOf(' - ');
    return idx > 0 ? raw.slice(0, idx).trim() : raw.trim();
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

// ── Limpiar tablas ────────────────────────────────────────────────────────────
async function cleanDatabase() {
    console.log('\n🧹 Limpiando base de datos...');

    // Orden importante: primero las que tienen FK
    const tables = ['sales', 'sale_slots', 'mother_accounts', 'customers'];
    for (const table of tables) {
        const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) {
            console.error(`   ❌ Error limpiando ${table}: ${error.message}`);
        } else {
            console.log(`   ✅ ${table} limpiada`);
        }
    }
}

// ── Importar ──────────────────────────────────────────────────────────────────
async function importCSV(csvPath) {
    const content = readFileSync(csvPath, 'utf-8');
    const rows = parseCSV(content);

    console.log(`\n📂 Archivo: ${csvPath}`);
    console.log(`📊 Filas encontradas: ${rows.length}`);

    // ── Cache de plataformas en el sistema (case-insensitive)
    const { data: platforms } = await supabase.from('platforms').select('id, name');
    const platformList = platforms || [];

    function findPlatform(csvName) {
        const lower = csvName.toLowerCase();
        // 1. Exact match
        const exact = platformList.find(p => p.name.toLowerCase() === lower);
        if (exact) return exact;
        // 2. System name contains CSV name
        const contains1 = platformList.find(p => p.name.toLowerCase().includes(lower));
        if (contains1) return contains1;
        // 3. CSV name contains system name
        const contains2 = platformList.find(p => lower.includes(p.name.toLowerCase()));
        if (contains2) return contains2;
        // 4. Word-based: any significant word in CSV name matches part of system name
        const words = lower.split(/\s+/).filter(w => w.length > 3);
        return platformList.find(p => words.some(w => p.name.toLowerCase().includes(w))) || null;
    }

    // ── PASO 1: Identificar y crear Mother Accounts ──────────────────────────
    console.log('\n📦 Importando cuentas madre...');
    const motherRows = rows.filter(r => r['Pantalla'] === 'PAGO CUENTA COMPLETA');
    const motherAccountMap = {}; // email → id en BD

    for (const row of motherRows) {
        let platName = parsePlatformName(row['Plataforma']);
        const email = row['Usuario']?.trim();
        const password = row['Clave']?.trim();
        const renewalDate = parseDate(row['Fecha Vencimiento']);
        const supplier = cleanSupplier(row['Nombre Proveedor']);
        const supplierPhone = storePhone(row['Celular Proveedor']);
        const instructions = (row['Instrucciones'] && row['Instrucciones'] !== '0') ? row['Instrucciones'] : null;
        const maxSlotsFromCSV = parseInt(row['Número de Pantallas']);
        // Si Número de Pantallas = 0 → cuenta familia (YouTube), 5 slots al vuelo
        const maxSlots = maxSlotsFromCSV > 0 ? maxSlotsFromCSV : 5;
        const isFamilyAccount = maxSlotsFromCSV === 0;

        if (!email || !platName) {
            console.log(`   ⚠️ Fila madre sin email o plataforma — se omite`);
            continue;
        }

        // Verificar que la plataforma existe
        let foundPlatform = findPlatform(platName);
        if (!foundPlatform) {
            console.log(`   ⚠️ Plataforma "${platName}" no encontrada. Creándola...`);
            const { data: newPlat, error: platError } = await supabase
                .from('platforms')
                .insert({ name: platName, price: 0, is_active: true })
                .select('id, name')
                .single();
            if (platError) {
                console.error(`   ❌ Error creando plataforma ${platName}: ${platError.message}`);
                continue;
            }
            platformList.push(newPlat);
            foundPlatform = newPlat;
            console.log(`   ✅ Plataforma "${platName}" creada`);
        } else {
            platName = foundPlatform.name; // usar el nombre canónico del sistema
        }

        const diasRestantes = parseInt(row['Dias Restantes']) || 0;
        const maStatus = diasRestantes < 0 ? 'expired' : 'active';

        // Insertar mother account
        const { data: ma, error } = await supabase
            .from('mother_accounts')
            .insert({
                platform: platName,
                email,
                password,
                renewal_date: renewalDate,
                supplier_name: supplier,
                supplier_phone: supplierPhone,
                purchase_cost_gs: 0,
                purchase_cost_usdt: 0,
                sale_price_gs: 0,
                max_slots: maxSlots,
                status: maStatus,
                sale_type: 'profile',
                instructions: instructions,
            })
            .select('id')
            .single();

        if (error) {
            console.error(`   ❌ Error creando madre ${email}: ${error.message}`);
            continue;
        }

        motherAccountMap[email.toLowerCase()] = ma.id;

        // Para cuentas familia (YouTube) NO pre-crear slots — se crean con email del cliente al vuelo
        if (isFamilyAccount) {
            console.log(`   ✅ Cuenta madre: ${email} (${platName}) — slots al vuelo | estado: ${maStatus}`);
        } else {
            // Crear TODOS los slots Perfil 1..maxSlots
            const slots = Array.from({ length: maxSlots }, (_, i) => ({
                mother_account_id: ma.id,
                slot_identifier: `Perfil ${i + 1}`,
                pin_code: null,
                status: 'available',
            }));
            const { error: slotsErr } = await supabase.from('sale_slots').insert(slots);
            if (slotsErr) {
                console.error(`   ⚠️ Error creando slots para ${email}: ${slotsErr.message}`);
            } else {
                console.log(`   ✅ Cuenta madre: ${email} (${platName}) — ${maxSlots} slots | estado: ${maStatus}`);
            }
        }
    }

    // ── PASO 2: Importar slots vendidos y congelados ──────────────────────────
    console.log('\n👥 Importando clientes y ventas...');
    const slotRows = rows.filter(r => {
        const p = r['Pantalla']?.trim();
        const e = r['Estado']?.trim();
        const hasClient = !!normalizePhone(r['Celular Cliente']);
        // Incluir Activo, Congelado, y A la Venta con cliente (cuenta familia)
        return p !== 'PAGO CUENTA COMPLETA' &&
            (e === 'Activo' || e === 'Congelado' || (e?.includes('Venta') && hasClient));
    });

    let clientsOk = 0, salesOk = 0, errors = 0;
    const quarantinedMothers = new Set(); // madres con slots congelados

    // También buscar slots huérfanos (Activo, sin PAGO CUENTA COMPLETA en el archivo)
    // y crear sus madres si no existen
    const allMotherEmails = new Set(rows
        .filter(r => r['Pantalla']?.trim() === 'PAGO CUENTA COMPLETA')
        .map(r => r['Usuario']?.trim().toLowerCase())
        .filter(Boolean)
    );

    for (const row of slotRows) {
        const email = row['Usuario']?.trim();
        const emailLower = email?.toLowerCase();

        // Si no tiene madre en el archivo → auto-crear
        if (emailLower && !allMotherEmails.has(emailLower) && !motherAccountMap[emailLower]) {
            const platName = parsePlatformName(row['Plataforma']);
            let resolvedPlat = platName;
            let foundPlat = findPlatform(platName);
            if (!foundPlat) {
                const { data: np } = await supabase.from('platforms')
                    .insert({ name: platName, price: 0, is_active: true })
                    .select('id, name').single();
                if (np) { platformList.push(np); foundPlat = np; }
            } else {
                resolvedPlat = foundPlat.name;
            }

            // Calcular max_slots a partir del número de perfil
            const slotNum = parseInt((row['Pantalla'] || '').replace(/\D/g, '')) || 1;
            const autoMaxSlots = Math.max(slotNum, 3);
            const diasMadre = parseInt(row['Dias Restantes']) || 0;
            const autoStatus = diasMadre < 0 ? 'expired' : 'active';

            const { data: autoMa } = await supabase.from('mother_accounts').insert({
                platform: resolvedPlat,
                email: email,
                password: row['Clave']?.trim() || '',
                renewal_date: null,
                supplier_name: cleanSupplier(row['Nombre Proveedor']),
                supplier_phone: storePhone(row['Celular Proveedor']),
                purchase_cost_gs: 0, purchase_cost_usdt: 0, sale_price_gs: 0,
                max_slots: autoMaxSlots, status: autoStatus, sale_type: 'profile',
            }).select('id').single();

            if (autoMa) {
                motherAccountMap[emailLower] = autoMa.id;
                allMotherEmails.add(emailLower);
                const autoSlots = Array.from({ length: autoMaxSlots }, (_, i) => ({
                    mother_account_id: autoMa.id,
                    slot_identifier: `Perfil ${i + 1}`,
                    pin_code: null, status: 'available',
                }));
                await supabase.from('sale_slots').insert(autoSlots);
                console.log(`   🆕 Madre auto-creada: ${email} (${autoMaxSlots} slots)`);
            }
        }

        // Extraer slot_identifier: si es email (cuenta familia), solo el email antes de " - "
        const slotIdentifier = (row['Pantalla']?.trim() || '').split(' - ')[0].trim();
        const clientPhone = normalizePhone(row['Celular Cliente']);
        const startDate = parseDate(row['Fecha de Entrega']);
        const endDate = parseDate(row['Fecha Vencimiento']);
        const diasRestantesSlot = parseInt(row['Dias Restantes']) || 0;
        const estado = row['Estado']?.trim();
        const isCongelado = estado === 'Congelado';
        // Congelado siempre inactivo; Activo depende de dias
        const isActive = !isCongelado && diasRestantesSlot > 0;

        // Si congelado sin cliente → skip (slot queda available), pero registrar madre para quarantine
        if (isCongelado && !clientPhone) {
            const maId = motherAccountMap[emailLower];
            if (maId) quarantinedMothers.add(maId);
            continue;
        }

        if (!clientPhone) {
            console.log(`   ⚠️ Slot ${slotIdentifier} sin teléfono — se omite`);
            continue;
        }

        const maId = motherAccountMap[emailLower];
        if (!maId) {
            console.log(`   ⚠️ Sin cuenta madre para ${email} — slot ${slotIdentifier}`);
            errors++;
            continue;
        }

        if (isCongelado) quarantinedMothers.add(maId);

        // Crear o encontrar cliente
        let customerId;
        const { data: existingCustomer } = await supabase
            .from('customers')
            .select('id')
            .eq('phone', clientPhone)
            .maybeSingle();

        if (existingCustomer) {
            customerId = existingCustomer.id;
        } else {
            const { data: newCustomer, error: custErr } = await supabase
                .from('customers')
                .insert({ full_name: clientPhone, phone: clientPhone })
                .select('id')
                .single();

            if (custErr) {
                console.error(`   ❌ Error creando cliente ${clientPhone}: ${custErr.message}`);
                errors++;
                continue;
            }
            customerId = newCustomer.id;
            clientsOk++;
        }

        // Lookup: exact → prefijo → crear al vuelo
        const prefixIdentifier = slotIdentifier.split(' - ')[0].trim();
        let slot = null;

        const { data: slotExact } = await supabase
            .from('sale_slots')
            .select('id')
            .eq('mother_account_id', maId)
            .eq('slot_identifier', slotIdentifier)
            .maybeSingle();

        if (slotExact) {
            slot = slotExact;
        } else if (prefixIdentifier !== slotIdentifier) {
            // Buscar por el prefijo base ("Perfil 3")
            const { data: slotPrefix } = await supabase
                .from('sale_slots')
                .select('id')
                .eq('mother_account_id', maId)
                .eq('slot_identifier', prefixIdentifier)
                .maybeSingle();
            if (slotPrefix) slot = slotPrefix;
        }

        // Si aún no hay slot → crear al vuelo (cuenta familia)
        if (!slot) {
            const { data: newSlot } = await supabase
                .from('sale_slots')
                .insert({
                    mother_account_id: maId,
                    slot_identifier: slotIdentifier,
                    pin_code: null,
                    status: 'available',
                })
                .select('id')
                .single();
            if (newSlot) {
                slot = newSlot;
            } else {
                console.error(`   ❌ No se pudo crear slot "${slotIdentifier}" para ${email}`);
                errors++;
                continue;
            }
        }

        // Crear venta
        const { error: saleErr } = await supabase.from('sales').insert({
            customer_id: customerId,
            slot_id: slot.id,
            amount_gs: 0,
            original_price_gs: 0,
            override_price: false,
            start_date: startDate,
            end_date: endDate,
            is_active: isActive,
            payment_method: 'cash',
        });

        if (saleErr) {
            console.error(`   ❌ Error creando venta ${clientPhone} → ${slotIdentifier}: ${saleErr.message}`);
            errors++;
            continue;
        }

        // Marcar slot como vendido (o expired si venció)
        const slotStatus = isActive ? 'sold' : (isCongelado ? 'sold' : 'expired');
        await supabase.from('sale_slots').update({ status: slotStatus }).eq('id', slot.id);
        salesOk++;
        const tag = isCongelado ? ' [CONGELADO]' : (!isActive ? ' [VENCIDO]' : '');
        console.log(`   ✅ Venta${tag}: ${clientPhone} → ${email} (${slotIdentifier})`);
    }

    // ── PASO 3: Marcar cuentas madre congeladas como quarantined ─────────────
    if (quarantinedMothers.size > 0) {
        console.log(`\n🧊 Marcando ${quarantinedMothers.size} cuentas como quarantined...`);
        for (const maId of quarantinedMothers) {
            await supabase.from('mother_accounts').update({ status: 'quarantined' }).eq('id', maId);
        }
        console.log('   ✅ Cuentas quarantined actualizadas');
    }

    // ── PASO 3: Resumen ──────────────────────────────────────────────────────
    console.log('\n════════════════════════════════════');
    console.log('📋 RESUMEN DE IMPORTACIÓN');
    console.log('════════════════════════════════════');
    console.log(`✅ Cuentas madre:    ${motherRows.length}`);
    console.log(`🧊 Quarantined:      ${quarantinedMothers.size}`);
    console.log(`✅ Clientes nuevos:  ${clientsOk}`);
    console.log(`✅ Ventas creadas:   ${salesOk}`);
    console.log(`❌ Errores:          ${errors}`);
    console.log('════════════════════════════════════\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
    try {
        if (doClean) {
            await cleanDatabase();
        }
        await importCSV(csvPath);
    } catch (err) {
        console.error('❌ Error fatal:', err.message);
        process.exit(1);
    }
})();
