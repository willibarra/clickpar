import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/test/telegram-click
 * 
 * Test endpoint to debug inline button clicking with the Telegram bot.
 * Sends /start, finds the button, tries to click it, then sends "will".
 */
export async function POST() {
    const logs: string[] = [];
    const log = (msg: string) => {
        console.log(`[TG-TEST] ${msg}`);
        logs.push(`${new Date().toISOString().substring(11, 19)} ${msg}`);
    };

    try {
        // 1. Get session from DB
        log('Getting Telegram session from DB...');
        const admin = await createAdminClient();
        const { data: session } = await (admin.from('telegram_sessions') as any)
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!session) {
            return NextResponse.json({ success: false, logs, error: 'No active Telegram session' });
        }
        log(`Session found: phone=${session.phone_number}`);

        // 2. Connect
        log('Connecting to Telegram...');
        const stringSession = new StringSession(session.session_string);
        const client = new TelegramClient(stringSession, session.api_id, session.api_hash, {
            connectionRetries: 3,
            retryDelay: 1000,
        });
        await client.connect();
        log('Connected ✅');

        // 3. Resolve bot
        log('Resolving @autocodestream_bot...');
        const botEntity = await client.getEntity('autocodestream_bot') as Api.User;
        log(`Bot resolved: ${botEntity.firstName} (ID: ${botEntity.id})`);

        // 4. Send /start
        log('Sending /start...');
        await client.sendMessage(botEntity, { message: '/start' });
        log('/start sent ✅');

        // 5. Wait for reply
        log('Waiting 3s for bot reply...');
        await new Promise(r => setTimeout(r, 3000));

        // 6. Get messages and inspect
        log('Fetching last 5 messages...');
        const messages = await client.getMessages(botEntity, { limit: 5 });
        
        for (const msg of messages) {
            if (!msg) continue;
            const isIncoming = !msg.out;
            const direction = isIncoming ? '← BOT' : '→ YOU';
            log(`${direction}: "${msg.text?.substring(0, 100) || '(no text)'}"`);
            log(`  - Message ID: ${msg.id}`);
            log(`  - Has replyMarkup: ${!!msg.replyMarkup}`);
            
            if (msg.replyMarkup) {
                const rm = msg.replyMarkup as any;
                const markupType = rm.className || rm.constructor?.name || typeof rm;
                log(`  - Markup type: ${markupType}`);
                
                if ('rows' in msg.replyMarkup) {
                    const rows = (msg.replyMarkup as any).rows || [];
                    for (let i = 0; i < rows.length; i++) {
                        const buttons = rows[i].buttons || [];
                        for (let j = 0; j < buttons.length; j++) {
                            const btn = buttons[j];
                            const btnType = btn.className || btn.constructor?.name || typeof btn;
                            log(`  - Button [${i},${j}]: "${btn.text}" type=${btnType} hasData=${!!btn.data}`);
                        }
                    }
                }
            }
        }

        // 7. Find the message with buttons and try to click
        log('Looking for "Soy cliente" button...');
        let clicked = false;
        
        for (const msg of messages) {
            if (!msg?.replyMarkup || !('rows' in msg.replyMarkup)) continue;
            
            const rows = (msg.replyMarkup as any).rows || [];
            for (let i = 0; i < rows.length; i++) {
                const buttons = rows[i].buttons || [];
                for (let j = 0; j < buttons.length; j++) {
                    if (buttons[j].text?.toLowerCase().includes('soy cliente')) {
                        log(`Found button at [${i},${j}]: "${buttons[j].text}"`);
                        
                        // Try .click() method
                        log('Attempting message.click()...');
                        try {
                            const clickResult = await Promise.race([
                                (msg as any).click(i, j).then((r: any) => {
                                    log(`click() resolved: ${JSON.stringify(r)?.substring(0, 200)}`);
                                    return r;
                                }),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('click timeout 8s')), 8000)),
                            ]);
                            log(`Click result: ${JSON.stringify(clickResult)?.substring(0, 200)}`);
                            clicked = true;
                        } catch (err: any) {
                            log(`click() error: ${err.message}`);
                        }
                        
                        if (!clicked) {
                            // Try manual callback
                            log('Trying manual GetBotCallbackAnswer...');
                            try {
                                const btn = buttons[j];
                                if (btn.data) {
                                    log(`Button data (hex): ${Buffer.from(btn.data).toString('hex')}`);
                                    const cbResult = await Promise.race([
                                        client.invoke(new Api.messages.GetBotCallbackAnswer({
                                            peer: msg.peerId!,
                                            msgId: msg.id,
                                            data: btn.data,
                                        })).then((r: any) => {
                                            log(`Callback resolved: ${JSON.stringify(r)?.substring(0, 200)}`);
                                            return r;
                                        }),
                                        new Promise((_, reject) => setTimeout(() => reject(new Error('callback timeout 8s')), 8000)),
                                    ]);
                                    clicked = true;
                                } else {
                                    log('Button has no data!');
                                }
                            } catch (err: any) {
                                log(`Callback error: ${err.message}`);
                            }
                        }
                        
                        break;
                    }
                }
                if (clicked) break;
            }
            if (clicked) break;
        }

        if (!clicked) {
            log('❌ Could not click any button');
        } else {
            // 8. Wait and send "will"
            log('Waiting 3s then sending "will"...');
            await new Promise(r => setTimeout(r, 3000));
            await client.sendMessage(botEntity, { message: 'will' });
            log('"will" sent ✅');
        }

        // 9. Final state — get latest messages
        log('Waiting 2s, fetching final messages...');
        await new Promise(r => setTimeout(r, 2000));
        const finalMsgs = await client.getMessages(botEntity, { limit: 3 });
        for (const msg of finalMsgs) {
            if (!msg) continue;
            const direction = !msg.out ? '← BOT' : '→ YOU';
            log(`FINAL ${direction}: "${msg.text?.substring(0, 200) || '(no text)'}"`);
        }

        await client.disconnect();
        log('Disconnected');

        return NextResponse.json({ success: true, clicked, logs });
    } catch (err: any) {
        log(`FATAL ERROR: ${err.message}`);
        return NextResponse.json({ success: false, error: err.message, logs });
    }
}
