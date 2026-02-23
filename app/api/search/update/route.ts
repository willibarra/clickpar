import { createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/search/update
 * Updates fields on sales, sale_slots, or mother_accounts
 * Body: { type: 'sale'|'slot'|'account', id: string, fields: Record<string, any> }
 */
export async function POST(request: NextRequest) {
    const supabase = await createAdminClient();

    try {
        const body = await request.json();
        const { type, id, fields } = body;

        if (!type || !id || !fields || Object.keys(fields).length === 0) {
            return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 });
        }

        let tableName: string;
        switch (type) {
            case 'sale':
                tableName = 'sales';
                break;
            case 'slot':
                tableName = 'sale_slots';
                break;
            case 'account':
                tableName = 'mother_accounts';
                break;
            default:
                return NextResponse.json({ error: `Tipo "${type}" no válido` }, { status: 400 });
        }

        const { error } = await (supabase.from(tableName) as any)
            .update(fields)
            .eq('id', id);

        if (error) {
            console.error(`[Update ${type}] Error:`, error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[Update] Error:', error);
        return NextResponse.json({ error: error.message || 'Error al actualizar' }, { status: 500 });
    }
}
