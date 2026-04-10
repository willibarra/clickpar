import { NextRequest, NextResponse } from 'next/server';
import {
    getInstances,
    getInstanceState,
    getInstanceQR,
    createInstance,
    logoutInstance,
    getWhatsAppSettings,
    updateWhatsAppSettings,
    getTemplates,
    updateTemplate,
    toggleTemplate,
    sendText,
    getRotationIndex,
} from '@/lib/whatsapp';
export const dynamic = 'force-dynamic';


// GET /api/whatsapp?action=instances|settings|templates|qr|logs
export async function GET(request: NextRequest) {
    const action = request.nextUrl.searchParams.get('action');
    const instanceName = request.nextUrl.searchParams.get('instance');

    try {
        switch (action) {
            case 'instances': {
                const instances = await getInstances();
                return NextResponse.json({ instances });
            }

            case 'state': {
                if (!instanceName) return NextResponse.json({ error: 'instance required' }, { status: 400 });
                const state = await getInstanceState(instanceName);
                return NextResponse.json({ state });
            }

            case 'qr': {
                if (!instanceName) return NextResponse.json({ error: 'instance required' }, { status: 400 });
                const qr = await getInstanceQR(instanceName);
                return NextResponse.json({ qr });
            }

            case 'settings': {
                const settings = await getWhatsAppSettings();
                return NextResponse.json({ settings });
            }

            case 'templates': {
                const templates = await getTemplates();
                // Fetch rotation indices for each unique key
                const keys = [...new Set(templates.map(t => t.key))];
                const rotations: Record<string, number> = {};
                await Promise.all(keys.map(async (k) => {
                    rotations[k] = await getRotationIndex(k);
                }));
                return NextResponse.json({ templates, rotations });
            }

            case 'logs': {
                const { createAdminClient } = await import('@/lib/supabase/server');
                const supabase = await createAdminClient();
                const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');
                const { data } = await supabase
                    .from('whatsapp_send_log')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(limit);
                return NextResponse.json({ logs: data || [] });
            }

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// POST /api/whatsapp
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action } = body;

        switch (action) {
            case 'create-instance': {
                const result = await createInstance(body.instanceName);
                return NextResponse.json(result);
            }

            case 'logout-instance': {
                const success = await logoutInstance(body.instanceName);
                return NextResponse.json({ success });
            }

            case 'update-settings': {
                const success = await updateWhatsAppSettings(body.settings);
                return NextResponse.json({ success });
            }

            case 'update-template': {
                const success = await updateTemplate(body.templateId, body.message);
                return NextResponse.json({ success });
            }

            case 'toggle-template': {
                const success = await toggleTemplate(body.templateId, body.enabled);
                return NextResponse.json({ success });
            }

            case 'send-test': {
                const result = await sendText(body.phone, body.message, {
                    instanceName: body.instanceName,
                    templateKey: 'test',
                    skipRateLimiting: true,
                });
                return NextResponse.json(result);
            }

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
