import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const EVO_URL = process.env.EVOLUTION_API_URL || '';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';

function normalizePhone(phone: string): string {
    return phone.replace(/[\s\-\(\)\+]/g, '').trim();
}

/** Get the first configured WhatsApp instance from DB settings */
async function getActiveInstance(): Promise<string | null> {
    try {
        const supabase = await createAdminClient();
        const { data } = await (supabase as any)
            .from('app_config')
            .select('value')
            .eq('key', 'whatsapp_settings')
            .single();

        const settings = data?.value ? JSON.parse(data.value) : null;
        return settings?.instance_1_name || settings?.instance_2_name || null;
    } catch {
        return null;
    }
}

/**
 * POST /api/admin/check-whatsapp
 * Body: { phone: string }
 * Returns: { exists: boolean, number?: string, error?: string }
 */
export async function POST(req: NextRequest) {
    try {
        const { phone } = await req.json();

        if (!phone || typeof phone !== 'string') {
            return NextResponse.json({ error: 'Número requerido' }, { status: 400 });
        }

        const normalized = normalizePhone(phone);
        if (normalized.length < 7) {
            return NextResponse.json({ error: 'Número demasiado corto (mínimo 7 dígitos)' }, { status: 400 });
        }

        if (!EVO_URL || !EVO_KEY) {
            return NextResponse.json({ error: 'Evolution API no configurada' }, { status: 503 });
        }

        const instanceName = await getActiveInstance();
        if (!instanceName) {
            return NextResponse.json({ error: 'No hay instancia de WhatsApp configurada' }, { status: 503 });
        }

        const res = await fetch(`${EVO_URL}/chat/whatsappNumbers/${instanceName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: EVO_KEY,
            },
            body: JSON.stringify({ numbers: [normalized] }),
        });

        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                return NextResponse.json({ error: 'API key inválida' }, { status: 503 });
            }
            if (res.status === 404) {
                return NextResponse.json({ error: 'Instancia desconectada o no encontrada' }, { status: 503 });
            }
            return NextResponse.json({ error: `Error de API (${res.status})` }, { status: 502 });
        }

        const data = await res.json();
        const result = Array.isArray(data) ? data[0] : data;

        return NextResponse.json({
            exists: result?.exists === true,
            number: result?.number || normalized,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
    }
}
