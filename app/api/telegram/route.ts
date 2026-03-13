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
    | { step: 'vender_confirmar'; platform: string; phone: string; customerName: string; precio: number };

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
            `👋 Hola *${firstName}*! Soy el bot de *ClickPar*.

¿Qué querés hacer?`,
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
        await sendMessage(chatId, '🔍 Ingresá el *nombre o teléfono* del cliente:\n\n_(Escribí /cancelar para volver)_');
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
        await sendMessage(chatId, `📱 Ahora ingresá el *teléfono* de *${text}*:\n\n_(Ej: 0971123456 o 595971123456)_\n_(Escribí /cancelar para volver)_`);
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
            await sendMessage(chatId, '⚠️ Ingresá un precio válido en Guaraníes (solo números):\n\n_(Ej: 40000)_');
            return;
        }
        setState(chatId, { step: 'vender_confirmar', platform: state.platform, phone: state.phone, customerName: state.customerName, precio });
        await sendMessage(chatId,
            `✅ *Confirmá la venta:*\n\n` +
            `📺 Plataforma: *${state.platform}*\n` +
            `👤 Cliente: *${state.customerName}*\n` +
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

    // Default: show menu
    await sendMessage(chatId,
        `Usá los botones del menú o escribí un comando como /inventario, /vencimientos, /ventas.`,
        { buttons: MAIN_MENU_BUTTONS }
    );
}

// ==========================================
// Callback Handler (botones inline)
// ==========================================

async function handleCallback(chatId: number, data: string, firstName: string) {
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
            await sendMessage(chatId, '🔍 Ingresá el *nombre o teléfono* del cliente:\n\n_(Escribí /cancelar para volver)_');
            return;
        case 'cmd:nuevo_cliente':
            setState(chatId, { step: 'nuevo_cliente_nombre' });
            await sendMessage(chatId, '👤 Ingresá el *nombre completo* del nuevo cliente:\n\n_(Escribí /cancelar para volver)_');
            return;
        case 'cmd:vender':
            await handleVenderMenu(chatId);
            return;
        case 'cmd:menu':
            resetState(chatId);
            await sendMessage(chatId,
                `👋 Hola *${firstName}*! ¿Qué querés hacer?`,
                { buttons: MAIN_MENU_BUTTONS }
            );
            return;
    }

    // Platform selected for sale
    if (data.startsWith('vender:plataforma:')) {
        const platform = decodeURIComponent(data.replace('vender:plataforma:', ''));
        setState(chatId, { step: 'vender_telefono', platform });
        await sendMessage(chatId,
            `📺 Venta de *${platform}*\n\n📱 Ingresá el *teléfono* del cliente:\n_(Ej: 0971123456)_\n_(Escribí /cancelar para volver)_`
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

    // Back to menu
    if (data === 'menu') {
        resetState(chatId);
        await sendMessage(chatId, '¿Qué más querés hacer?', { buttons: MAIN_MENU_BUTTONS });
        return;
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
        .map(([platform, count]) => `• *${platform}*: ${count} slot${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}`);

    await sendMessage(chatId,
        `📦 *Inventario disponible*\n\n${lines.join('\n')}\n\n_Total: ${slots.length} slots_`,
        { buttons: BACK_BUTTON }
    );
}

async function handleVencimientos(chatId: number) {
    const supabase = await createAdminClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in7days = new Date(today);
    in7days.setDate(in7days.getDate() + 7);

    const { data, error } = await (supabase
        .from('sales') as any)
        .select(`
            id,
            end_date,
            amount_gs,
            customers:customer_id (full_name, phone),
            sale_slots:slot_id (
                slot_identifier,
                mother_accounts:mother_account_id (platform)
            )
        `)
        .eq('is_active', true)
        .lte('end_date', in7days.toISOString().split('T')[0])
        .order('end_date', { ascending: true });

    if (error) {
        await sendMessage(chatId, '⚠️ Error al obtener los vencimientos.');
        return;
    }

    const sales = data || [];

    if (sales.length === 0) {
        await sendMessage(chatId, '📅 *Vencimientos*\n\n✅ No hay vencimientos en los próximos 7 días.', { buttons: BACK_BUTTON });
        return;
    }

    const lines: string[] = [];
    for (const sale of sales) {
        const days = daysUntil(sale.end_date);
        const platform = sale.sale_slots?.mother_accounts?.platform || 'Plataforma';
        const customer = sale.customers?.full_name || sale.customers?.phone || 'Sin nombre';
        const emoji = days < 0 ? '🔴' : days === 0 ? '🟠' : days <= 2 ? '🟡' : '🟢';
        const dayLabel = days < 0 ? `venció hace ${Math.abs(days)} día${Math.abs(days) > 1 ? 's' : ''}` :
            days === 0 ? 'vence HOY' : `vence en ${days} día${days > 1 ? 's' : ''}`;
        lines.push(`${emoji} *${customer}* — ${platform}\n   _${dayLabel}_ · ${formatDate(sale.end_date)}`);
    }

    await sendMessage(chatId,
        `📅 *Próximos vencimientos (7 días)*

${lines.join('\n\n')}`,
        { buttons: BACK_BUTTON }
    );
}

async function handleResumenDia(chatId: number) {
    const supabase = await createAdminClient();
    const today = new Date().toISOString().split('T')[0];

    const { data: sales, error } = await (supabase
        .from('sales') as any)
        .select('id, amount_gs, start_date, customers:customer_id(full_name), sale_slots:slot_id(mother_accounts:mother_account_id(platform))')
        .eq('start_date', today)
        .eq('is_active', true);

    if (error) {
        await sendMessage(chatId, '⚠️ Error al obtener el resumen.');
        return;
    }

    const list = sales || [];
    const total = list.reduce((sum: number, s: any) => sum + (s.amount_gs || 0), 0);

    if (list.length === 0) {
        await sendMessage(chatId, `📊 *Resumen de hoy* (${formatDate(today)})

_No hay ventas registradas hoy._`, { buttons: BACK_BUTTON });
        return;
    }

    const lines = list.map((s: any) => {
        const customer = s.customers?.full_name || 'Sin nombre';
        const platform = s.sale_slots?.mother_accounts?.platform || '?';
        return `• ${customer} — ${platform} · ${formatGs(s.amount_gs || 0)}`;
    });

    await sendMessage(chatId,
        `📊 *Resumen de hoy* (${formatDate(today)})

` +
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
        const nombre = customer.full_name || 'Sin nombre';
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

    const { data: sales, error } = await (supabase
        .from('sales') as any)
        .select(`
            id,
            amount_gs,
            start_date,
            end_date,
            sale_slots:slot_id (
                slot_identifier,
                pin_code,
                mother_accounts:mother_account_id (
                    platform
                )
            )
        `)
        .eq('customer_id', customerId)
        .eq('is_active', true)
        .order('end_date', { ascending: true });

    // Fetch customer name
    const { data: customer } = await (supabase
        .from('customers') as any)
        .select('full_name')
        .eq('id', customerId)
        .single();

    if (error) {
        console.error('[Telegram] handleVerServiciosCliente error:', error);
        await sendMessage(chatId, `⚠️ Error al obtener servicios: ${error.message}`, { buttons: BACK_BUTTON });
        return;
    }
    if (!sales?.length) {
        await sendMessage(chatId, '📋 Este cliente no tiene servicios activos.', { buttons: BACK_BUTTON });
        return;
    }

    const nombre = customer?.full_name || 'Cliente';
    const lines: string[] = [];

    for (const sale of sales) {
        const platform = sale.sale_slots?.mother_accounts?.platform || 'Plataforma';
        const slot = sale.sale_slots?.slot_identifier || 'Perfil';
        const pin = sale.sale_slots?.pin_code ? `🔒 PIN: ${sale.sale_slots.pin_code}\n` : '';
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
            `💰 ${precio} · _${vence}_ (${formatDate(sale.end_date)})`
        );
    }

    await sendMessage(chatId,
        `📋 *Servicios de ${nombre}*\n\n${lines.join('\n\n')}`,
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
            `⚠️ Ya existe un cliente con ese teléfono:\n\n👤 *${existing.full_name}*\n📱 ${phone}`,
            { buttons: BACK_BUTTON }
        );
        return;
    }

    const { error } = await (supabase
        .from('customers') as any)
        .insert({ full_name: nombre, phone, customer_type: 'cliente' });

    if (error) {
        await sendMessage(chatId, `❌ Error al crear el cliente: ${error.message}`, { buttons: BACK_BUTTON });
        return;
    }

    await sendMessage(chatId,
        `✅ *Cliente creado exitosamente!*

👤 *${nombre}*
📱 ${phone}`,
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
        ? `✅ Cliente encontrado: *${customer.full_name}*`
        : `ℹ️ Cliente nuevo (se creará automáticamente)`;

    await sendMessage(chatId,
        `📺 Plataforma: *${platform}*\n` +
        `📱 Teléfono: *${normalizedPhone}*\n` +
        `${customerInfo}\n\n` +
        `💰 Ingresá el *precio* en Guaraníes:\n_(Ej: 40000)_\n_(Escribí /cancelar para volver)_`
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

        const result = await createQuickSale({
            platform,
            customerPhone: phone,
            customerName,
            price: precio,
        });

        if (result.error) {
            await sendMessage(chatId, `❌ *Error al registrar la venta:*\n${result.error}`, { buttons: BACK_BUTTON });
            return;
        }

        await sendMessage(chatId,
            `✅ *¡Venta registrada exitosamente!*

` +
            `📺 *${platform}*
` +
            `👤 ${customerName}
` +
            `📱 ${phone}
` +
            `💰 ${formatGs(precio)}

` +
            `_Las credenciales se enviaron automáticamente por WhatsApp si estaba activado._`,
            { buttons: BACK_BUTTON }
        );
    } catch (err: any) {
        await sendMessage(chatId, `❌ Error inesperado: ${err.message}`, { buttons: BACK_BUTTON });
    }
}
