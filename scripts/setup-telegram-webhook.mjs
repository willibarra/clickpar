#!/usr/bin/env node
/**
 * Script para registrar el webhook del bot @clickpar_admin_bot en Telegram.
 * Ejecutar una sola vez después de cada deploy.
 *
 * Uso:
 *   node scripts/setup-telegram-webhook.mjs [URL_BASE]
 *
 * Ejemplo:
 *   node scripts/setup-telegram-webhook.mjs https://clickpar.shop
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local manually
let BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
    try {
        const envPath = resolve(process.cwd(), '.env.local');
        const envContent = readFileSync(envPath, 'utf8');
        const match = envContent.match(/^TELEGRAM_BOT_TOKEN=(.+)$/m);
        if (match) BOT_TOKEN = match[1].trim();
    } catch {
        // ignore
    }
}

if (!BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN no encontrado en .env.local');
    process.exit(1);
}

const BASE_URL = process.argv[2] || 'https://clickpar.shop';
const WEBHOOK_URL = `${BASE_URL}/api/telegram`;
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function setup() {
    console.log(`\n🤖 Bot: @clickpar_admin_bot`);
    console.log(`📡 Registrando webhook en: ${WEBHOOK_URL}\n`);

    // 1. Get bot info
    const infoRes = await fetch(`${TG_API}/getMe`);
    const info = await infoRes.json();
    if (!info.ok) {
        console.error('❌ Token inválido:', info.description);
        process.exit(1);
    }
    console.log(`✅ Bot verificado: @${info.result.username} (ID: ${info.result.id})`);

    // 2. Delete old webhook
    await fetch(`${TG_API}/deleteWebhook`);

    // 3. Set new webhook
    const setRes = await fetch(`${TG_API}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            url: WEBHOOK_URL,
            allowed_updates: ['message', 'callback_query'],
            drop_pending_updates: true,
        }),
    });
    const setData = await setRes.json();

    if (!setData.ok) {
        console.error('❌ Error registrando webhook:', setData.description);
        process.exit(1);
    }

    console.log(`✅ Webhook registrado exitosamente!`);

    // 4. Verify
    const infoWh = await fetch(`${TG_API}/getWebhookInfo`);
    const whData = await infoWh.json();
    console.log(`\n📋 Estado del webhook:`);
    console.log(`   URL: ${whData.result?.url}`);
    console.log(`   Updates pendientes: ${whData.result?.pending_update_count ?? 0}`);

    if (whData.result?.last_error_message) {
        console.warn(`   ⚠️ Último error: ${whData.result.last_error_message}`);
    }

    console.log(`\n🎉 Setup completo! Ya podés usar @clickpar_admin_bot en Telegram.\n`);
}

setup().catch(err => {
    console.error('Error inesperado:', err);
    process.exit(1);
});
