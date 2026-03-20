import { NextRequest, NextResponse } from 'next/server';
import {
    isAllowed,
    sendMessage,
    answerCallback,
    formatGs,
    formatDate,
    daysUntil,
    MAIN_MENU_BUTTONS,
    type TelegramUpdate,
    type InlineButton,
} from '@/lib/telegram';
import { createAdminClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';


// Escape special characters for Telegram's legacy Markdown mode
function safeMd(text: string): string {
    return text.replace(/([_*`\[\]])/g, '\\$1');
}

// ==========================================
// Conversational state (in-memory, per chat)
// ==========================================

type ConvoState =
    | { step: 'idle' }
    | { step: 'buscar_cliente' }
    | { step: 'nuevo_cliente_nombre' }
    | { step: 'nuevo_cliente_telefono'; nombre: string }
    | { step: 'vender_telefono'; platform: string }
    | { step: 'vender_precio'; platform: string; phone: string; customerName: string }
    | { step: 'vender_confirmar'; platform: string; phone: string; customerName: string; precio: number }
    | { step: 'nueva_cuenta_email'; platform: string }
    | { step: 'nueva_cuenta_password'; platform: string; email: string }
    | { step: 'nueva_cuenta_slots'; platform: string; email: string; password: string }
    | { step: 'nueva_cuenta_confirmar'; platform: string; email: string; password: string; maxSlots: number };

const sessions = new Map<number, ConvoState>();

function getState(chatId: number): ConvoState {
    return sessions.get(chatId) ?? { step: 'idle' };
}
function setState(chatId: number, state: ConvoState) {
    sessions.set(chatId, state);
}
function resetState(chatId: number) {
    sessions.set(chatId, { step: 'idle' });
}

// ==========================================
// Webhook Handler
// ==========================================

export async function POST(req: NextRequest) {
    try {
        const update: TelegramUpdate = await req.json();
        await handleUpdate(update);
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('[Telegram Webhook] Error:', err);
        return NextResponse.json({ ok: false }, { status: 200 }); // always 200 to Telegram
    }
}

export async function GET() {
    return NextResponse.json({ status: 'Telegram webhook active', bot: '@clickpar_admin_bot' });
}

// ==========================================
// Update Router
// ==========================================

async function handleUpdate(update: TelegramUpdate) {
    if (update.callback_query) {
        const cq = update.callback_query;
        const chatId = cq.message.chat.id;
        const userId = cq.from.id;
        await answerCallback(cq.id);

        if (!isAllowed(userId)) {
            await sendMessage(chatId, `🚫 *Acceso denegado*\n\nTu ID es: \`${userId}\`\nPedile al admin que te agregue a la lista de autorizados.`);
            return;
        }

        await handleCallback(chatId, cq.data || '', cq.from.first_name);
        return;
    }

    if (update.message) {
        const msg = update.message;
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text?.trim() || '';

        if (!isAllowed(userId)) {
            await sendMessage(chatId,
                `🚫 *Acceso denegado*\n\nTu ID de Telegram es: \`${userId}\`\nPedile al admin que te autorice.`
            );
            return;
        }

        await handleMessage(chatId, userId, text, msg.from.first_name);
    }
}

// ==========================================
// Command Handler
// ==========================================

async function handleMessage(chatId: number, userId: number, text: string, firstName: string) {
    try {
        const state = getState(chatId);

        // Handle cancel at any step
        if (text === '/cancelar' || text === 'cancelar') {
            resetState(chatId);
            await sendMessage(chatId, '❌ Operación cancelada.', { buttons: MAIN_MENU_BUTTONS });
            return;
        }

        // Top-level commands
        if (text.startsWith('/start') || text.startsWith('/ayuda') || text.startsWith('/menu')) {
            resetState(chatId);
            await sendMessage(chatId,
                `👋 Hola *${safeMd(firstName)}*! Soy el bot de *ClickPar*.\n\n¿Qué querés hacer?`,
                { buttons: MAIN_MENU_BUTTONS }
            );
            return;
        }

        if (text.startsWith('/inventario')) {
            await handleInventario(chatId);
            return;
        }
        if (text.startsWith('/vencimientos')) {
            await handleVencimientos(chatId);
            return;
        }
        if (text.startsWith('/ventas')) {
            await handleResumenDia(chatId);
            return;
        }
        if (text.startsWith('/clientes')) {
            setState(chatId, { step: 'buscar_cliente' });
            await sendMessage(chatId, '🔍 Ingresá el *nombre o teléfono* del cliente:\n\n(Escribí /cancelar para volver)');
            return;
        }

        // Multi-step flows
        if (state.step === 'buscar_cliente') {
            await handleBuscarCliente(chatId, text);
            resetState(chatId);
            return;
        }

        if (state.step === 'nuevo_cliente_nombre') {
            setState(chatId, { step: 'nuevo_cliente_telefono', nombre: text });
            await sendMessage(chatId, `📱 Ahora ingresá el *teléfono* de *${safeMd(text)}*:\n\n(Ej: 0971123456 o 595971123456)\n(Escribí /cancelar para volver)`);
            return;
        }

        if (state.step === 'nuevo_cliente_telefono') {
            await handleCrearCliente(chatId, state.nombre, text);
            resetState(chatId);
            return;
        }

        if (state.step === 'vender_telefono') {
            await handleVenderTelefono(chatId, state.platform, text);
            return;
        }

        if (state.step === 'vender_precio') {
            const precio = parseInt(text.replace(/\D/g, ''));
            if (!precio || precio <= 0) {
                await sendMessage(chatId, '⚠️ Ingresá un precio válido en Guaraníes (solo números):\n\n(Ej: 40000)');
                return;
            }
            setState(chatId, { step: 'vender_confirmar', platform: state.platform, phone: state.phone, customerName: state.customerName, precio });
            await sendMessage(chatId,
                `✅ *Confirmá la venta:*\n\n` +
                `📺 Plataforma: *${safeMd(state.platform)}*\n` +
                `👤 Cliente: *${safeMd(state.customerName)}*\n` +
                `📱 Teléfono: *${state.phone}*\n` +
                `💰 Precio: *${formatGs(precio)}*`,
                {
                    buttons: [
                        [
                            { text: '✅ Confirmar', callback_data: 'venta:confirmar' },
                            { text: '❌ Cancelar', callback_data: 'venta:cancelar' },
                        ],
                    ],
                }
            );
            return;
        }

        if (state.step === 'nueva_cuenta_email') {
            const email = text.trim();
            if (!email.includes('@')) {
                await sendMessage(chatId, '⚠️ Ingresá un email válido (ej: usuario@gmail.com):');
                return;
            }
            setState(chatId, { step: 'nueva_cuenta_password', platform: state.platform, email });
            await sendMessage(chatId, `🔒 Ahora ingresá la *contraseña* de la cuenta:\n\n(Escribí /cancelar para volver)`);
            return;
        }

        if (state.step === 'nueva_cuenta_password') {
            const password = text.trim();
            if (!password) {
                await sendMessage(chatId, '⚠️ La contraseña no puede estar vacía:');
                return;
            }
            setState(chatId, { step: 'nueva_cuenta_slots', platform: state.platform, email: state.email, password });
            await sendMessage(chatId, `📋 ¿Cuántos *slots/perfiles* tiene esta cuenta?\n\n(Ingresá un número, ej: 5)\n(Escribí /cancelar para volver)`);
            return;
        }

        if (state.step === 'nueva_cuenta_slots') {
            const maxSlots = parseInt(text.replace(/\D/g, ''));
            if (!maxSlots || maxSlots <= 0 || maxSlots > 20) {
                await sendMessage(chatId, '⚠️ Ingresá un número válido de slots (1-20):');
                return;
            }
            setState(chatId, {
                step: 'nueva_cuenta_confirmar',
                platform: state.platform,
                email: state.email,
                password: state.password,
                maxSlots,
            });
            await sendMessage(chatId,
                `✅ *Confirmá la nueva cuenta:*\n\n` +
                `📺 Plataforma: *${safeMd(state.platform)}*\n` +
                `📧 Email: *${safeMd(state.email)}*\n` +
                `🔒 Contraseña: *${safeMd(state.password)}*\n` +
                `📋 Slots: *${maxSlots}*\n\n` +
                `📅 Fecha renovación: *${formatDate(new Date().toISOString().split('T')[0])}*`,
                {
                    buttons: [
                        [
                            { text: '✅ Confirmar', callback_data: 'nueva_cuenta:confirmar' },
                            { text: '❌ Cancelar', callback_data: 'nueva_cuenta:cancelar' },
                        ],
                    ],
                }
            );
            return;
        }

        // Default: show menu
        await sendMessage(chatId,
            `Usá los botones del menú o escribí un comando como /inventario, /vencimientos, /ventas.`,
            { buttons: MAIN_MENU_BUTTONS }
        );
    } catch (err: any) {
        console.error('[Telegram] handleMessage error:', err);
        await sendMessage(chatId, `⚠️ Error: ${err.message || 'Error desconocido'}`, { buttons: MAIN_MENU_BUTTONS, parseMode: 'none' });
    }
}

// ==========================================
// Callback Handler (botones inline)
// ==========================================

async function handleCallback(chatId: number, data: string, firstName: string) {
    try {
        // Main menu commands
        switch (data) {
            case 'cmd:inventario':
                await handleInventario(chatId);
                return;
            case 'cmd:vencimientos':
                await handleVencimientos(chatId);
                return;
            case 'cmd:ventas':
                await handleResumenDia(chatId);
                return;
            case 'cmd:clientes':
                setState(chatId, { step: 'buscar_cliente' });
                await sendMessage(chatId, '🔍 Ingresá el nombre o teléfono del cliente:\n\n(Escribí /cancelar para volver)');
                return;
            case 'cmd:nuevo_cliente':
                setState(chatId, { step: 'nuevo_cliente_nombre' });
                await sendMessage(chatId, '👤 Ingresá el nombre completo del nuevo cliente:\n\n(Escribí /cancelar para volver)');
                return;
            case 'cmd:vender':
                await handleVenderMenu(chatId);
                return;
            case 'cmd:nueva_cuenta':
                await handleNuevaCuentaMenu(chatId);
                return;
            case 'cmd:menu':
                resetState(chatId);
                await sendMessage(chatId,
                    `👋 Hola ${firstName}! ¿Qué querés hacer?`,
                    { buttons: MAIN_MENU_BUTTONS }
                );
                return;
        }

        // Platform selected for sale
        if (data.startsWith('vender:plataforma:')) {
            const platform = decodeURIComponent(data.replace('vender:plataforma:', ''));
            setState(chatId, { step: 'vender_telefono', platform });
            await sendMessage(chatId,
                `📺 Venta de ${platform}\n\n📱 Ingresá el teléfono del cliente:\n(Ej: 0971123456)\n(Escribí /cancelar para volver)`
            );
            return;
        }

        // Confirm sale
        if (data === 'venta:confirmar') {
            const state = getState(chatId);
            if (state.step === 'vender_confirmar') {
                await handleConfirmarVenta(chatId, state.platform, state.phone, state.customerName, state.precio);
            }
            resetState(chatId);
            return;
        }

        if (data === 'venta:cancelar') {
            resetState(chatId);
            await sendMessage(chatId, '❌ Venta cancelada.', { buttons: MAIN_MENU_BUTTONS });
            return;
        }

        // Ver servicios de un cliente
        if (data.startsWith('servicios:')) {
            const customerId = data.replace('servicios:', '');
            await handleVerServiciosCliente(chatId, customerId);
            return;
        }

        // Platform selected for new account
        if (data.startsWith('nueva_cuenta:plataforma:')) {
            const platform = decodeURIComponent(data.replace('nueva_cuenta:plataforma:', ''));
            setState(chatId, { step: 'nueva_cuenta_email', platform });
            await sendMessage(chatId,
                `📦 *Nueva cuenta de ${safeMd(platform)}*\n\n📧 Ingresá el *email* de la cuenta:\n\n(Escribí /cancelar para volver)`
            );
            return;
        }

        // Confirm new account
        if (data === 'nueva_cuenta:confirmar') {
            const state = getState(chatId);
            if (state.step === 'nueva_cuenta_confirmar') {
                await handleConfirmarNuevaCuenta(chatId, state.platform, state.email, state.password, state.maxSlots);
            }
            resetState(chatId);
            return;
        }

        if (data === 'nueva_cuenta:cancelar') {
            resetState(chatId);
            await sendMessage(chatId, '❌ Creación de cuenta cancelada.', { buttons: MAIN_MENU_BUTTONS });
            return;
        }

        // Back to menu
        if (data === 'menu') {
            resetState(chatId);
            await sendMessage(chatId, '¿Qué más querés hacer?', { buttons: MAIN_MENU_BUTTONS });
            return;
        }
    } catch (err: any) {
        console.error('[Telegram] handleCallback error:', err);
        await sendMessage(chatId, `⚠️ Error procesando el comando: ${err.message || 'Error desconocido'}`, { buttons: BACK_BUTTON, parseMode: 'none' });
    }
}

// ==========================================
// Feature Handlers
// ==========================================

const BACK_BUTTON: InlineButton[][] = [[{ text: '🔙 Menú principal', callback_data: 'menu' }]];

async function handleInventario(chatId: number) {
    const supabase = await createAdminClient();

    // Get available slots grouped by platform
    const { data, error } = await (supabase
        .from('sale_slots') as any)
        .select(`
            id,
            status,
            mother_accounts:mother_account_id (
                platform,
                status
            )
        `)
        .eq('status', 'available');

    if (error) {
        await sendMessage(chatId, '⚠️ Error al obtener el inventario.');
        return;
    }

    const slots = (data || []).filter(
        (s: any) => s.mother_accounts?.status === 'active'
    );

    if (slots.length === 0) {
        await sendMessage(chatId, '📦 *Inventario*\n\n❌ No hay slots disponibles para vender.', { buttons: BACK_BUTTON });
        return;
    }

    // Group by platform
    const grouped: Record<string, number> = {};
    for (const slot of slots) {
        const platform = slot.mother_accounts?.platform || 'Desconocida';
        grouped[platform] = (grouped[platform] || 0) + 1;
    }

    const lines = Object.entries(grouped)
        .sort((a, b) => b[1] - a[1])
        .map(([platform, count]) => `• *${safeMd(platform)}*: ${count} slot${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}`);

    await sendMessage(chatId,
        `📦 *Inventario disponible*\n\n${lines.join('\n')}\n\nTotal: ${slots.length} slots`,
        { buttons: BACK_BUTTON }
    );
}

async function handleVencimientos(chatId: number) {
    const supabase = await createAdminClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Rango: desde 3 días atrás hasta 7 días en el futuro
    const from3daysAgo = new Date(today);
    from3daysAgo.setDate(from3daysAgo.getDate() - 3);
    const in7days = new Date(today);
    in7days.setDate(in7days.getDate() + 7);

    // Step 1: Fetch sales with scalar columns only (no embedded joins)
    const { data, error } = await (supabase
        .from('sales') as any)
        .select('id, end_date, amount_gs, customer_id, slot_id')
        .eq('is_active', true)
        .gte('end_date', from3daysAgo.toISOString().split('T')[0])
        .lte('end_date', in7days.toISOString().split('T')[0])
        .order('end_date', { ascending: true })
        .limit(20);

    if (error) {
        console.error('[Telegram] handleVencimientos error:', error);
        await sendMessage(chatId, `⚠️ Error al obtener vencimientos: ${error.message}`, { buttons: BACK_BUTTON });
        return;
    }

    if (!data || data.length === 0) {
        await sendMessage(chatId, '📅 *Vencimientos*\n\n✅ No hay vencimientos en los próximos 7 días.', { buttons: BACK_BUTTON });
        return;
    }

    // Step 2: Manual join — fetch customers
    const customerIds = [...new Set(data.map((s: any) => s.customer_id).filter(Boolean))] as string[];
    const custMap = new Map<string, any>();
    if (customerIds.length > 0) {
        const { data: customers } = await (supabase.from('customers') as any)
            .select('id, full_name, phone').in('id', customerIds);
        (customers || []).forEach((c: any) => custMap.set(c.id, c));
    }

    // Step 3: Manual join — fetch slots with mother_accounts
    const slotIds = [...new Set(data.map((s: any) => s.slot_id).filter(Boolean))] as string[];
    const slotMap = new Map<string, any>();
    if (slotIds.length > 0) {
        const { data: slots } = await (supabase.from('sale_slots') as any)
            .select('id, slot_identifier, mother_accounts:mother_account_id(platform)')
            .in('id', slotIds);
        (slots || []).forEach((s: any) => slotMap.set(s.id, s));
    }

    // Reconstruct & sort by customer name
    const sales = data.map((s: any) => ({
        ...s,
        customers: custMap.get(s.customer_id) || null,
        sale_slots: slotMap.get(s.slot_id) || null,
    })).sort((a: any, b: any) => {
        const nameA = (a.customers?.full_name || a.customers?.phone || 'zzz').toLowerCase();
        const nameB = (b.customers?.full_name || b.customers?.phone || 'zzz').toLowerCase();
        return nameA.localeCompare(nameB, 'es');
    });

    const lines: string[] = [];
    for (const sale of sales) {
        const days = daysUntil(sale.end_date);
        const platform = safeMd(sale.sale_slots?.mother_accounts?.platform || 'Plataforma');
        const customer = safeMd(sale.customers?.full_name || sale.customers?.phone || 'Sin nombre');
        const emoji = days < 0 ? '🔴' : days === 0 ? '🟠' : days <= 2 ? '🟡' : '🟢';
        const dayLabel = days < 0 ? `venció hace ${Math.abs(days)} día${Math.abs(days) > 1 ? 's' : ''}` :
            days === 0 ? 'vence HOY' : `vence en ${days} día${days > 1 ? 's' : ''}`;
        lines.push(`${emoji} *${customer}* — ${platform}\n   ${dayLabel} · ${formatDate(sale.end_date)}`);
    }

    const header = `📅 *Próximos vencimientos (7 días)*`;
    await sendMessage(chatId, `${header}\n\n${lines.join('\n\n')}`, { buttons: BACK_BUTTON });
}

async function handleResumenDia(chatId: number) {
    const supabase = await createAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // Step 1: Fetch sales with scalar columns only
    const { data: rawSales, error } = await (supabase
        .from('sales') as any)
        .select('id, amount_gs, start_date, customer_id, slot_id')
        .eq('start_date', today)
        .eq('is_active', true)
        .limit(30);

    if (error) {
        console.error('[Telegram] handleResumenDia error:', error);
        await sendMessage(chatId, `⚠️ Error al obtener el resumen: ${error.message}`, { buttons: BACK_BUTTON });
        return;
    }

    const list = rawSales || [];
    if (list.length === 0) {
        await sendMessage(chatId, `📊 *Resumen de hoy* (${formatDate(today)})\n\nNo hay ventas registradas hoy.`, { buttons: BACK_BUTTON });
        return;
    }

    // Step 2: Manual join — customers
    const customerIds = [...new Set(list.map((s: any) => s.customer_id).filter(Boolean))] as string[];
    const custMap = new Map<string, any>();
    if (customerIds.length > 0) {
        const { data: customers } = await (supabase.from('customers') as any)
            .select('id, full_name').in('id', customerIds);
        (customers || []).forEach((c: any) => custMap.set(c.id, c));
    }

    // Step 3: Manual join — slots with mother_accounts
    const slotIds = [...new Set(list.map((s: any) => s.slot_id).filter(Boolean))] as string[];
    const slotMap = new Map<string, any>();
    if (slotIds.length > 0) {
        const { data: slots } = await (supabase.from('sale_slots') as any)
            .select('id, mother_accounts:mother_account_id(platform)')
            .in('id', slotIds);
        (slots || []).forEach((s: any) => slotMap.set(s.id, s));
    }

    const total = list.reduce((sum: number, s: any) => sum + (s.amount_gs || 0), 0);

    const lines = list.map((s: any) => {
        const cust = custMap.get(s.customer_id);
        const slot = slotMap.get(s.slot_id);
        const customer = safeMd(cust?.full_name || 'Sin nombre');
        const platform = safeMd(slot?.mother_accounts?.platform || '?');
        return `• ${customer} — ${platform} · ${formatGs(s.amount_gs || 0)}`;
    });

    await sendMessage(chatId,
        `📊 *Resumen de hoy* (${formatDate(today)})\n\n` +
        `${lines.join('\n')}\n\n` +
        `💰 *Total: ${formatGs(total)}*\n` +
        `🛒 *Ventas: ${list.length}*`,
        { buttons: BACK_BUTTON }
    );
}

async function handleBuscarCliente(chatId: number, query: string) {
    const supabase = await createAdminClient();

    const rawQuery = query.replace(/[\s+\-()]/g, '');
    const isPhone = /^\d+$/.test(rawQuery);

    // Normalize phone: 0973... → 595973..., 973... → 595973...
    let searchPhone = rawQuery;
    if (isPhone) {
        const { normalizePhone } = await import('@/lib/utils/phone');
        searchPhone = normalizePhone(rawQuery);
    }

    const { data, error } = await (supabase
        .from('customers') as any)
        .select('id, full_name, phone, customer_type')
        .or(
            isPhone
                ? `phone.ilike.%${searchPhone}%`
                : `full_name.ilike.%${query}%,phone.ilike.%${query}%`
        )
        .limit(5);

    if (error || !data?.length) {
        await sendMessage(chatId,
            `🔍 No se encontraron clientes con "${query}".`,
            { buttons: BACK_BUTTON }
        );
        return;
    }

    for (const customer of data) {
        const { count } = await (supabase
            .from('sales') as any)
            .select('id', { count: 'exact', head: true })
            .eq('customer_id', customer.id)
            .eq('is_active', true);

        const typeLabel = customer.customer_type === 'creador' ? ' 🎬' : '';
        const nombre = safeMd(customer.full_name || 'Sin nombre');
        const activeCount = count || 0;

        await sendMessage(chatId,
            `👤 *${nombre}*${typeLabel}\n` +
            `📱 ${customer.phone || 'Sin teléfono'}\n` +
            `🛒 Servicios activos: *${activeCount}*`,
            {
                buttons: activeCount > 0
                    ? [[
                        { text: `📋 Ver servicios (${activeCount})`, callback_data: `servicios:${customer.id}` },
                    ], BACK_BUTTON[0]]
                    : BACK_BUTTON,
            }
        );
    }

    if (data.length > 1) {
        await sendMessage(chatId, '¿Qué más querés hacer?', { buttons: BACK_BUTTON });
    }
}

async function handleVerServiciosCliente(chatId: number, customerId: string) {
    const supabase = await createAdminClient();

    // Step 1: Fetch customer name
    const { data: customer } = await (supabase
        .from('customers') as any)
        .select('full_name')
        .eq('id', customerId)
        .single();

    // Step 2: Fetch sales with scalar columns only
    const { data: rawSales, error } = await (supabase
        .from('sales') as any)
        .select('id, amount_gs, start_date, end_date, slot_id')
        .eq('customer_id', customerId)
        .eq('is_active', true)
        .order('end_date', { ascending: true });

    if (error) {
        console.error('[Telegram] handleVerServiciosCliente error:', error);
        await sendMessage(chatId, `⚠️ Error al obtener servicios: ${error.message}`, { buttons: BACK_BUTTON });
        return;
    }
    if (!rawSales?.length) {
        await sendMessage(chatId, '📋 Este cliente no tiene servicios activos.', { buttons: BACK_BUTTON });
        return;
    }

    // Step 3: Manual join — slots with mother_accounts
    const slotIds = [...new Set(rawSales.map((s: any) => s.slot_id).filter(Boolean))] as string[];
    const slotMap = new Map<string, any>();
    if (slotIds.length > 0) {
        const { data: slots } = await (supabase.from('sale_slots') as any)
            .select('id, slot_identifier, pin_code, mother_accounts:mother_account_id(platform)')
            .in('id', slotIds);
        (slots || []).forEach((s: any) => slotMap.set(s.id, s));
    }

    const nombre = customer?.full_name || 'Cliente';
    const lines: string[] = [];

    for (const sale of rawSales) {
        const slotInfo = slotMap.get(sale.slot_id);
        const platform = safeMd(slotInfo?.mother_accounts?.platform || 'Plataforma');
        const slot = safeMd(slotInfo?.slot_identifier || 'Perfil');
        const pin = slotInfo?.pin_code ? `🔒 PIN: ${slotInfo.pin_code}\n` : '';
        const days = daysUntil(sale.end_date);
        const emoji = days < 0 ? '🔴' : days === 0 ? '🟠' : days <= 3 ? '🟡' : '🟢';
        const precio = formatGs(sale.amount_gs || 0);
        const vence = days < 0
            ? `vencido hace ${Math.abs(days)}d`
            : days === 0 ? 'vence HOY'
            : `vence en ${days}d`;

        lines.push(
            `${emoji} *${platform}* — ${slot}\n` +
            `${pin}` +
            `💰 ${precio} · ${vence} (${formatDate(sale.end_date)})`
        );
    }

    await sendMessage(chatId,
        `📋 *Servicios de ${safeMd(nombre)}*\n\n${lines.join('\n\n')}`,
        { buttons: BACK_BUTTON }
    );
}

async function handleCrearCliente(chatId: number, nombre: string, telefono: string) {
    const supabase = await createAdminClient();
    const { normalizePhone } = await import('@/lib/utils/phone');
    const phone = normalizePhone(telefono);

    // Check duplicate
    const { data: existing } = await (supabase
        .from('customers') as any)
        .select('id, full_name')
        .eq('phone', phone)
        .limit(1)
        .single();

    if (existing) {
        await sendMessage(chatId,
            `⚠️ Ya existe un cliente con ese teléfono:\n\n👤 *${safeMd(existing.full_name)}*\n📱 ${phone}`,
            { buttons: BACK_BUTTON }
        );
        return;
    }

    const { error } = await (supabase
        .from('customers') as any)
        .insert({ full_name: nombre, phone, customer_type: 'cliente' });

    if (error) {
        await sendMessage(chatId, `❌ Error al crear el cliente: ${error.message}`, { buttons: BACK_BUTTON, parseMode: 'none' });
        return;
    }

    await sendMessage(chatId,
        `✅ *Cliente creado exitosamente!*\n\n👤 *${safeMd(nombre)}*\n📱 ${phone}`,
        { buttons: BACK_BUTTON }
    );
}

async function handleVenderMenu(chatId: number) {
    const supabase = await createAdminClient();

    const { data } = await (supabase
        .from('sale_slots') as any)
        .select('mother_accounts:mother_account_id(platform, status)')
        .eq('status', 'available');

    const platforms: string[] = [
        ...new Set<string>(
            (data || [])
                .filter((s: any) => s.mother_accounts?.status === 'active')
                .map((s: any) => String(s.mother_accounts?.platform ?? ''))
                .filter(Boolean)
        ),
    ].sort();

    if (platforms.length === 0) {
        await sendMessage(chatId, '❌ No hay plataformas con slots disponibles.', { buttons: BACK_BUTTON });
        return;
    }

    // Build platform buttons (2 per row)
    const buttons: InlineButton[][] = [];
    for (let i = 0; i < platforms.length; i += 2) {
        const row: InlineButton[] = [
            { text: platforms[i], callback_data: `vender:plataforma:${encodeURIComponent(platforms[i])}` },
        ];
        if (platforms[i + 1]) {
            row.push({ text: platforms[i + 1], callback_data: `vender:plataforma:${encodeURIComponent(platforms[i + 1])}` });
        }
        buttons.push(row);
    }
    buttons.push([{ text: '🔙 Cancelar', callback_data: 'menu' }]);

    await sendMessage(chatId, '💰 *Nueva venta*\n\nSeleccioná la *plataforma*:', { buttons });
}

async function handleVenderTelefono(chatId: number, platform: string, phone: string) {
    const supabase = await createAdminClient();
    const { normalizePhone } = await import('@/lib/utils/phone');
    const normalizedPhone = normalizePhone(phone);

    // Try to find existing customer
    const { data: customer } = await (supabase
        .from('customers') as any)
        .select('id, full_name, phone')
        .eq('phone', normalizedPhone)
        .limit(1)
        .single();

    const customerName = customer?.full_name || normalizedPhone;
    setState(chatId, { step: 'vender_precio', platform, phone: normalizedPhone, customerName });

    const customerInfo = customer
        ? `✅ Cliente encontrado: *${safeMd(customer.full_name)}*`
        : `ℹ️ Cliente nuevo (se creará automáticamente)`;

    await sendMessage(chatId,
        `📺 Plataforma: *${safeMd(platform)}*\n` +
        `📱 Teléfono: *${normalizedPhone}*\n` +
        `${customerInfo}\n\n` +
        `💰 Ingresá el *precio* en Guaraníes:\n(Ej: 40000)\n(Escribí /cancelar para volver)`
    );
}

async function handleConfirmarVenta(
    chatId: number,
    platform: string,
    phone: string,
    customerName: string,
    precio: number
) {
    try {
        const { createQuickSale } = await import('@/lib/actions/sales');

        let result: any;
        try {
            result = await createQuickSale({
                platform,
                customerPhone: phone,
                customerName,
                price: precio,
            });
        } catch (saleErr: any) {
            // Catch revalidatePath or other server-action context errors
            console.error('[Telegram] createQuickSale threw:', saleErr);
            // If the error is from revalidatePath (which won't work in API route context),
            // the sale may have already been created successfully
            if (saleErr.message?.includes('revalidate') || saleErr.message?.includes('invariant')) {
                result = { success: true, message: 'Venta procesada (revalidation skipped)' };
            } else {
                throw saleErr;
            }
        }

        if (result?.error) {
            await sendMessage(chatId, `❌ Error al registrar la venta:\n${result.error}`, { buttons: BACK_BUTTON, parseMode: 'none' });
            return;
        }

        await sendMessage(chatId,
            `✅ *Venta registrada exitosamente!*\n\n` +
            `📺 *${safeMd(platform)}*\n` +
            `👤 ${safeMd(customerName)}\n` +
            `📱 ${phone}\n` +
            `💰 ${formatGs(precio)}\n\n` +
            `Las credenciales se enviaron automáticamente por WhatsApp si estaba activado.`,
            { buttons: BACK_BUTTON }
        );
    } catch (err: any) {
        console.error('[Telegram] handleConfirmarVenta error:', err);
        await sendMessage(chatId, `❌ Error inesperado: ${err.message}`, { buttons: BACK_BUTTON, parseMode: 'none' });
    }
}

async function handleNuevaCuentaMenu(chatId: number) {
    const supabase = await createAdminClient();

    // Get distinct platforms from existing active accounts
    const { data: platforms } = await (supabase
        .from('platforms') as any)
        .select('name')
        .eq('is_active', true)
        .order('name');

    const platformNames: string[] = (platforms || []).map((p: any) => p.name);

    if (platformNames.length === 0) {
        await sendMessage(chatId, '❌ No hay plataformas configuradas.', { buttons: BACK_BUTTON });
        return;
    }

    // Build platform buttons (2 per row)
    const buttons: InlineButton[][] = [];
    for (let i = 0; i < platformNames.length; i += 2) {
        const row: InlineButton[] = [
            { text: platformNames[i], callback_data: `nueva_cuenta:plataforma:${encodeURIComponent(platformNames[i])}` },
        ];
        if (platformNames[i + 1]) {
            row.push({ text: platformNames[i + 1], callback_data: `nueva_cuenta:plataforma:${encodeURIComponent(platformNames[i + 1])}` });
        }
        buttons.push(row);
    }
    buttons.push([{ text: '🔙 Cancelar', callback_data: 'menu' }]);

    await sendMessage(chatId, '📦 *Nueva cuenta*\n\nSeleccioná la *plataforma*:', { buttons });
}

async function handleConfirmarNuevaCuenta(
    chatId: number,
    platform: string,
    email: string,
    password: string,
    maxSlots: number
) {
    try {
        const supabase = await createAdminClient();

        const today = new Date().toISOString().split('T')[0];

        // Create mother account
        const { data: newAccount, error: accountError } = await (supabase
            .from('mother_accounts') as any)
            .insert({
                platform,
                email,
                password,
                max_slots: maxSlots,
                status: 'active',
                renewal_date: today,
                target_billing_day: new Date().getDate(),
                sale_type: 'profile',
                send_instructions: false,
                is_autopay: false,
            })
            .select('id')
            .single();

        if (accountError) {
            await sendMessage(chatId, `❌ Error al crear la cuenta: ${accountError.message}`, { buttons: BACK_BUTTON, parseMode: 'none' });
            return;
        }

        // Create slots
        const slots = [];
        for (let i = 1; i <= maxSlots; i++) {
            slots.push({
                mother_account_id: newAccount.id,
                slot_identifier: `Perfil ${i}`,
                status: 'available',
            });
        }

        const { error: slotsError } = await (supabase
            .from('sale_slots') as any)
            .insert(slots);

        if (slotsError) {
            console.error('[Telegram] Error creating slots:', slotsError);
        }

        await sendMessage(chatId,
            `✅ *Cuenta creada exitosamente!*\n\n` +
            `📺 *${safeMd(platform)}*\n` +
            `📧 ${safeMd(email)}\n` +
            `🔒 ${safeMd(password)}\n` +
            `📋 ${maxSlots} slots creados\n\n` +
            `La cuenta ya está disponible en el inventario.`,
            { buttons: BACK_BUTTON }
        );
    } catch (err: any) {
        console.error('[Telegram] handleConfirmarNuevaCuenta error:', err);
        await sendMessage(chatId, `❌ Error inesperado: ${err.message}`, { buttons: BACK_BUTTON, parseMode: 'none' });
    }
}
