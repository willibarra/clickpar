/**
 * ClickPar - Script de Importación Universal de CSV
 * ===================================================
 * Formato esperado del CSV (columnas en cualquier orden):
 *
 * Estado, Fecha Vencimiento, Dias Restantes, Plataforma, Usuario, Clave,
 * Pantalla, PIN, Instrucciones, Enviar Instrucciones, Fecha de Entrega,
 * Días de Servicio, Celular Proveedor, Nombre Proveedor, Celular Cliente,
 * Vendido, Número de Pantallas, Precio de Venta, Precio Comprada
 *
 * Reglas de importación (Netflix):
 * - Pantalla = "PAGO CUENTA COMPLETA" → es la fila de la madre (no crea slot)
 * - Estado = "Activo" + Celular Cliente real → slot vendido con venta
 * - Estado = "A la Venta / Disponible" → slot libre (available)
 * - -0001-12-30 y -740050 → null / vacío
 * - PIN = "NO REQUIERE", "NO REQUIERE PIN", "R$ 0.00", "$0.00", "CONTRASEÑA INCORRECTA" → null
 * - Plataforma: tomar solo el nombre antes del " - " para matchear (ej: "NETFLIX - 1 ᴘᴇʀꜰɪʟ" → "Netflix")
 * - Precio de Venta → amount_gs de la venta
 * - Precio Comprada → purchase_cost_gs de la madre
 *
 * Reglas Proveedor Netflix:
 * - Normalizar TODO a "POP PREMIUM" EXCEPTO: CLICKPAR, Vivas Play, Ommi,
 *   Majozka, Blackmerry, Servicios Digitales NVR (estos se guardan tal cual)
 * - "CLICKPAR - AUTOPAY" → proveedor = "CLICKPAR" + is_autopay = true en madre
 * - "CLICKPAR - COCOS" → proveedor = "CLICKPAR" + instructions = "COCOS" en madre
 * - CLICKPAR con instrucciones largas en PIN → guardar en instructions de madre
 *
 * Huérfanas: sin fila PAGO, Congelado, sin teléfono → NO importar
 * Perfil 4 Niños / perfil 3 minúscula → tratar como Perfil normal
 * Dias Restantes no numérico → ignorar (parsear como int, null si falla)
 *
 * Casos especiales ya resueltos en CSVs limpios (NCLEAN_*):
 * - net60@clickpar.net le falta Perfil 3 → ya agregado
 * - casareposa25+nn y maxime-3fr con 2 clientes en mismo slot → solo el más reciente
 * - design.audits.2v 2do cliente Perfil 5 → movido a Perfil 4
 * - mtalaf.64us 2do cliente Perfil 5 → movido a Perfil 3
 * - nivel.madera.01 2do cliente Perfil 2 → movido a Perfil 4
 *
 * Uso:
 *   node datos/import_csv.mjs --file="datos/NCLEAN_NETT1.csv"
 *   node datos/import_csv.mjs --file="datos/NCLEAN_NETT1.csv" --clean
 *   --clean  →  limpia mother_accounts, sale_slots, sales, customers antes de importar
 *   --dry-run → simula sin escribir en BD
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
const dryRun = args.includes('--dry-run');

if (!fileArg) {
    console.error('❌ Especificá el archivo: --file="datos/NCLEAN_NETT1.csv"');
    process.exit(1);
}

const csvPath = resolve(ROOT, fileArg);
if (dryRun) console.log('⚠️  MODO DRY-RUN: no se escribirá en la BD');

// ── Proveedores que NO se normalizan a POP PREMIUM ─────────────────────────
// Estos se guardan tal cual (o con transformación especial como AUTOPAY/COCOS)
const KEEP_AS_IS_PROVIDERS = [
    'clickpar',
    'vivas play',
    'ommi',
    'majozka',
    'blackmerry',
    'servicios digitales nvr',
];

/**
 * Normaliza el nombre de proveedor según las reglas acordadas.
 * Retorna: { name: string, isAutopay: bool, extraInstructions: string|null }
 */
function normalizeSupplier(raw) {
    if (!raw || raw.trim() === '') {
        return { name: 'POP PREMIUM', isAutopay: false, extraInstructions: null };
    }
    const trimmed = raw.trim();
    const lower = trimmed.toLowerCase();

    // CLICKPAR - AUTOPAY → is_autopay = true
    if (lower === 'clickpar - autopay' || lower === 'clickpar - posible autopay') {
        return { name: 'CLICKPAR', isAutopay: true, extraInstructions: null };
    }

    // CLICKPAR - COCOS → instructions = "COCOS"
    if (lower === 'clickpar - cocos') {
        return { name: 'CLICKPAR', isAutopay: false, extraInstructions: 'COCOS' };
    }

    // Otros CLICKPAR - XXX → normalizar a CLICKPAR
    if (lower.startsWith('clickpar')) {
        return { name: 'CLICKPAR', isAutopay: false, extraInstructions: null };
    }

    // Ver si es uno de los que se conservan
    const keep = KEEP_AS_IS_PROVIDERS.some(p => lower.includes(p));
    if (keep) {
        // Canonicalizar capitalización
        const canonical = KEEP_AS_IS_PROVIDERS.find(p => lower.includes(p));
        const names = {
            'clickpar': 'CLICKPAR',
            'vivas play': 'Vivas Play',
            'ommi': 'Ommi',
            'majozka': 'Majozka',
            'blackmerry': 'Blackmerry',
            'servicios digitales nvr': 'Servicios Digitales NVR',
        };
        return { name: names[canonical] || trimmed, isAutopay: false, extraInstructions: null };
    }

    // Todo lo demás → POP PREMIUM
    return { name: 'POP PREMIUM', isAutopay: false, extraInstructions: null };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function parseDate(raw) {
    if (!raw || raw.trim() === '' || raw.includes('-0001') || raw.includes('-740050')) return null;
    // Formato dd/MM/yyyy
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
    if (p.startsWith('0')) return '595' + p.slice(1);
    if (p.length >= 10) return p;
    return '595' + p;
}

function storePhone(raw) {
    if (!raw || raw.trim() === '') return null;
    return String(raw).trim();
}

/**
 * Parsea PIN. Retorna null si es un PIN "vacío" o texto especial.
 * PINs especiales: NO REQUIERE, NO REQUIERE PIN, R$ 0.00, $0.00, CONTRASEÑA INCORRECTA, etc.
 */
function parsePin(raw) {
    if (!raw || raw.trim() === '') return null;
    const u = raw.trim().toUpperCase();
    const nullPins = [
        'NO REQUIERE', 'NO REQUIERE PIN', 'NA', '0', '-',
        'AGREGAR PERFIL', 'PIDE COD DE INICIO', 'CONTRASEÑA INCORRECTA',
        'NO EXISTE CUENTA', 'BLOQUEADO', 'NO ESTA PREMIUM', 'CANJE',
        'AUTOPAY', 'R$ 0.00', '$0.00', 'R$0.00',
    ];
    if (nullPins.includes(u)) return null;
    if (u.startsWith('CREAR PERFIL')) return null;
    if (u.startsWith('AGREGAR')) return null;
    if (u.startsWith('PIDE')) return null;
    if (u.startsWith('R$')) return null;   // cualquier valor en reales
    if (u.startsWith('$0')) return null;   // cualquier $0.xx
    return raw.trim();
}

/**
 * Detecta si el valor del campo PIN de PAGO CUENTA COMPLETA es una
 * "instrucción larga" (texto descriptivo para guardar en mother_account).
 */
function isLongInstruction(raw) {
    if (!raw || raw.trim() === '') return false;
    const u = raw.trim().toUpperCase();
    // Si es un PIN numérico corto o un PIN especial ya manejado → no es instrucción
    if (parsePin(raw) === null) return false;
    // Si tiene más de 20 caracteres y no es numérico → instrucción
    if (raw.trim().length > 20 && /\D/.test(raw.trim())) return true;
    return false;
}

function parsePlatformName(raw) {
    if (!raw) return null;
    const idx = raw.indexOf(' - ');
    return idx > 0 ? raw.slice(0, idx).trim() : raw.trim();
}

/**
 * Parsea Dias Restantes. Retorna número entero o null si no es número.
 * Maneja basura como "₲ 2" → ignorar.
 */
function parseDias(raw) {
    if (!raw || raw.trim() === '') return null;
    // Extraer solo dígitos y signo
    const match = raw.trim().match(/^(-?\d+)/);
    if (!match) return null;
    return parseInt(match[1], 10);
}

/**
 * Parsea precio. Retorna número entero o 0 si vacío/inválido.
 */
function parsePrice(raw) {
    if (!raw || raw.trim() === '') return 0;
    const cleaned = String(raw).replace(/[^\d.-]/g, '');
    const n = parseInt(cleaned, 10);
    return isNaN(n) ? 0 : n;
}

/**
 * Normaliza slot_identifier: 
 * - "Perfil 4 - Niños" → "Perfil 4"
 * - "perfil 3" → "Perfil 3"
 * - "Perfil 3 - ..." → "Perfil 3"
 */
function normalizeSlotIdentifier(raw) {
    if (!raw) return raw;
    // Tomar solo la parte antes del " - "
    const base = raw.trim().split(' - ')[0].trim();
    // Capitalizar "perfil X" → "Perfil X"
    return base.replace(/^(perfil)\s+(\d+)$/i, (_, p, n) => `Perfil ${n}`);
}

function parseCSV(content) {
    const lines = content.replace(/\r/g, '').split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        // Parseo simple (sin campos con comas como en JSON)
        const values = line.split(',');
        const row = {};
        headers.forEach((h, i) => { row[h] = (values[i] || '').trim(); });
        return row;
    });
}

// ── Limpiar tablas ────────────────────────────────────────────────────────────
async function cleanDatabase() {
    console.log('\n🧹 Limpiando base de datos...');
    const tables = ['sales', 'sale_slots', 'mother_accounts', 'customers'];
    for (const table of tables) {
        if (dryRun) { console.log(`   [DRY] DELETE FROM ${table}`); continue; }
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
        const lowerNoSpace = lower.replace(/\s+/g, '');
        const exact = platformList.find(p => p.name.toLowerCase() === lower);
        if (exact) return exact;
        const exactNS = platformList.find(p => p.name.toLowerCase().replace(/\s+/g, '') === lowerNoSpace);
        if (exactNS) return exactNS;
        const contains1 = platformList.find(p => p.name.toLowerCase().includes(lower));
        if (contains1) return contains1;
        const contains2 = platformList.find(p => lower.includes(p.name.toLowerCase()));
        if (contains2) return contains2;
        const words = lower.split(/\s+/).filter(w => w.length > 3);
        return platformList.find(p => words.some(w => p.name.toLowerCase().includes(w))) || null;
    }

    // ── PASO 1: Identificar y crear Mother Accounts ──────────────────────────
    console.log('\n📦 Importando cuentas madre...');
    const motherRows = rows.filter(r => r['Pantalla'] === 'PAGO CUENTA COMPLETA');
    const motherAccountMap = {}; // email.toLowerCase() → id en BD

    for (const row of motherRows) {
        let platName = parsePlatformName(row['Plataforma']);
        const email = row['Usuario']?.trim();
        const password = row['Clave']?.trim();
        const renewalDate = parseDate(row['Fecha Vencimiento']);
        const rawSupplier = row['Nombre Proveedor'] || '';
        const supplierInfo = normalizeSupplier(rawSupplier);
        const supplierPhone = storePhone(row['Celular Proveedor']);
        const maxSlotsFromCSV = parseInt(row['Número de Pantallas']) || 5;
        const purchasePrice = parsePrice(row['Precio Comprada']);

        // PIN en la fila PAGO CUENTA COMPLETA:
        // - Puede ser instrucción larga → guardar en instructions
        // - Puede ser AUTOPAY (ya manejado en normalizeSupplier)
        // - O basura → null
        const rawPin = row['PIN'] || '';
        let motherInstructions = null;
        if (isLongInstruction(rawPin)) {
            motherInstructions = rawPin.trim();
        }
        // Si el proveedor generó extraInstructions (COCOS), combinar
        if (supplierInfo.extraInstructions) {
            motherInstructions = motherInstructions
                ? `${supplierInfo.extraInstructions}\n${motherInstructions}`
                : supplierInfo.extraInstructions;
        }

        const maxSlots = maxSlotsFromCSV > 0 ? maxSlotsFromCSV : 5;

        if (!email || !platName) {
            console.log(`   ⚠️ Fila madre sin email o plataforma — se omite`);
            continue;
        }

        // Verificar que la plataforma existe en el sistema
        let foundPlatform = findPlatform(platName);
        if (!foundPlatform) {
            console.log(`   ⚠️ Plataforma "${platName}" no encontrada. Creándola...`);
            if (!dryRun) {
                const { data: newPlat, error: platError } = await supabase
                    .from('platforms')
                    .insert({ name: platName, sale_price_gs: 0, is_active: true })
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
                console.log(`   [DRY] Se crearía plataforma "${platName}"`);
                foundPlatform = { id: 'dry-run-id', name: platName };
            }
        } else {
            platName = foundPlatform.name;
        }

        const diasRestantes = parseDias(row['Dias Restantes']);
        // Dias=0 significa que vence hoy (o ya venció) → expired
        const maStatus = (diasRestantes !== null && diasRestantes <= 0) ? 'expired' : 'active';

        const motherPayload = {
            platform: platName,
            email,
            password,
            renewal_date: renewalDate,
            supplier_name: supplierInfo.name,
            supplier_phone: supplierPhone,
            purchase_cost_gs: purchasePrice,
            purchase_cost_usdt: 0,
            sale_price_gs: 0,
            max_slots: maxSlots,
            status: maStatus,
            sale_type: 'profile',
            instructions: motherInstructions,
            is_autopay: supplierInfo.isAutopay,
        };

        const autopayTag = supplierInfo.isAutopay ? ' 🔄 AUTOPAY' : '';
        const instructTag = motherInstructions ? ` [instrucciones: ${motherInstructions.substring(0, 30)}...]` : '';

        if (dryRun) {
            console.log(`   [DRY] Madre: ${email} (${platName}) - Proveedor: ${supplierInfo.name}${autopayTag}${instructTag}`);
            motherAccountMap[email.toLowerCase()] = `dry-${email}`;
            continue;
        }

        const { data: ma, error } = await supabase
            .from('mother_accounts')
            .insert(motherPayload)
            .select('id')
            .single();

        if (error) {
            console.error(`   ❌ Error creando madre ${email}: ${error.message}`);
            continue;
        }

        motherAccountMap[email.toLowerCase()] = ma.id;

        // Detectar si es cuenta familia: sus slots son emails del cliente, NO "Perfil X"
        // Ejemplos: Spotify, YouTube
        const FAMILY_PLATFORMS = ['spotify', 'youtube'];
        const isFamilyAccount = FAMILY_PLATFORMS.some(fp => platName.toLowerCase().includes(fp));

        if (isFamilyAccount) {
            // NO pre-crear slots — se crean al vuelo con el email del cliente
            console.log(`   ✅ Madre: ${email} (${platName}) — familia (slots al vuelo) | ${maStatus} | Proveedor: ${supplierInfo.name}${autopayTag}${instructTag}`);
        } else {
            // Crear slots Perfil 1..maxSlots
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
                console.log(`   ✅ Madre: ${email} (${platName}) — ${maxSlots} slots | ${maStatus} | Proveedor: ${supplierInfo.name}${autopayTag}${instructTag}`);
            }
        }
    }

    // ── PASO 2: Importar slots vendidos y congelados ──────────────────────────
    console.log('\n👥 Importando clientes y ventas...');

    const slotRows = rows.filter(r => {
        const p = r['Pantalla']?.trim();
        const e = r['Estado']?.trim();
        const hasClient = !!normalizePhone(r['Celular Cliente']);
        return p !== 'PAGO CUENTA COMPLETA' &&
            (e === 'Activo' || e === 'Congelado' || e === 'Caducado' || (e?.includes('Venta') && hasClient));
    });

    let clientsOk = 0, salesOk = 0, errors = 0, skipped = 0;
    const quarantinedMothers = new Set();

    // Set de madres que aparecen en el CSV con PAGO CUENTA COMPLETA
    const allMotherEmails = new Set(
        motherRows.map(r => r['Usuario']?.trim().toLowerCase()).filter(Boolean)
    );

    for (const row of slotRows) {
        const email = row['Usuario']?.trim();
        const emailLower = email?.toLowerCase();
        const estado = row['Estado']?.trim();
        const clientPhone = normalizePhone(row['Celular Cliente']);
        const slotIdentifier = normalizeSlotIdentifier(row['Pantalla']?.trim() || '');
        const diasRestantes = parseDias(row['Dias Restantes']);

        // Regla: huérfanas sin fila PAGO, Congelado sin cliente, sin teléfono → NO importar
        if (!clientPhone) {
            if (estado === 'Congelado') {
                // Congelado sin cliente → marcar madre para quarantined pero no importar slot
                const maId = motherAccountMap[emailLower];
                if (maId) quarantinedMothers.add(maId);
            } else {
                console.log(`   ⚠️ Slot ${slotIdentifier} sin teléfono (${email}) — omitido`);
            }
            skipped++;
            continue;
        }

        const isCongelado = estado === 'Congelado';
        const isCaducado = estado === 'Caducado';
        const isActive = !isCongelado && !isCaducado && (diasRestantes === null || diasRestantes > 0);

        if (isCongelado) {
            const maId = motherAccountMap[emailLower];
            if (maId) quarantinedMothers.add(maId);
        }

        // Si no hay madre en el mapa → omitir (huérfana sin PAGO CUENTA COMPLETA)
        const maId = motherAccountMap[emailLower];
        if (!maId) {
            console.log(`   ⚠️ Huérfana: sin cuenta madre para ${email} — slot ${slotIdentifier} — omitido`);
            skipped++;
            errors++;
            continue;
        }

        // Precio de venta
        const salePrice = parsePrice(row['Precio de Venta']);

        // PIN del perfil
        const pinCode = parsePin(row['PIN']);

        const startDate = parseDate(row['Fecha de Entrega']);
        const endDate = parseDate(row['Fecha Vencimiento']);

        if (dryRun) {
            const tag = isCongelado ? ' [CONGELADO]' : (!isActive ? ' [VENCIDO]' : '');
            console.log(`   [DRY] Venta${tag}: ${clientPhone} → ${email} (${slotIdentifier}) Gs ${salePrice}`);
            salesOk++;
            continue;
        }

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

        // Buscar slot por identifier normalizado
        let slot = null;

        const { data: slotExact } = await supabase
            .from('sale_slots')
            .select('id, status')
            .eq('mother_account_id', maId)
            .eq('slot_identifier', slotIdentifier)
            .maybeSingle();

        if (slotExact) {
            slot = slotExact;
        } else {
            // ¿Es un slot tipo email (cuenta familia: Spotify, YouTube)?
            // Si el identifier contiene '@' o no es "Perfil X" → crear al vuelo
            const isEmailSlot = slotIdentifier.includes('@');
            const isProfileSlot = /^Perfil \d+$/i.test(slotIdentifier);
            if (isEmailSlot || !isProfileSlot) {
                // Crear slot al vuelo
                const { data: newSlot, error: newSlotErr } = await supabase
                    .from('sale_slots')
                    .insert({
                        mother_account_id: maId,
                        slot_identifier: slotIdentifier,
                        pin_code: null,
                        status: 'available',
                    })
                    .select('id, status')
                    .single();
                if (newSlotErr || !newSlot) {
                    console.error(`   ❌ No se pudo crear slot "${slotIdentifier}" para ${email}: ${newSlotErr?.message}`);
                    errors++;
                    continue;
                }
                slot = newSlot;
            } else {
                // Slot de tipo Perfil X que no existe → error real
                console.log(`   ⚠️ Slot "${slotIdentifier}" no encontrado en madre ${email}`);
                errors++;
                continue;
            }
        }

        // Actualizar PIN en el slot si tenemos uno
        if (pinCode) {
            await supabase.from('sale_slots').update({ pin_code: pinCode }).eq('id', slot.id);
        }

        // Crear venta
        const { error: saleErr } = await supabase.from('sales').insert({
            customer_id: customerId,
            slot_id: slot.id,
            amount_gs: salePrice,
            original_price_gs: salePrice,
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

        // Marcar slot como vendido
        const slotStatus = isActive ? 'sold' : (isCongelado ? 'sold' : 'expired');
        await supabase.from('sale_slots').update({ status: slotStatus }).eq('id', slot.id);

        salesOk++;
        const tag = isCongelado ? ' [CONGELADO]' : (!isActive ? ' [VENCIDO]' : '');
        console.log(`   ✅ Venta${tag}: ${clientPhone} → ${email} (${slotIdentifier}) Gs ${salePrice}`);
    }

    // ── PASO 3: Marcar cuentas madre congeladas como quarantined ─────────────
    if (quarantinedMothers.size > 0) {
        console.log(`\n🧊 Marcando ${quarantinedMothers.size} cuentas como quarantined...`);
        if (!dryRun) {
            for (const maId of quarantinedMothers) {
                await supabase.from('mother_accounts').update({ status: 'quarantined' }).eq('id', maId);
            }
        }
        console.log('   ✅ Cuentas quarantined actualizadas');
    }

    // ── Resumen ──────────────────────────────────────────────────────────────
    console.log('\n════════════════════════════════════');
    console.log('📋 RESUMEN DE IMPORTACIÓN');
    console.log('════════════════════════════════════');
    console.log(`✅ Cuentas madre:    ${motherRows.length}`);
    console.log(`🧊 Quarantined:      ${quarantinedMothers.size}`);
    console.log(`✅ Clientes nuevos:  ${clientsOk}`);
    console.log(`✅ Ventas creadas:   ${salesOk}`);
    console.log(`⏭️  Omitidos:         ${skipped}`);
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
        console.error(err.stack);
        process.exit(1);
    }
})();
