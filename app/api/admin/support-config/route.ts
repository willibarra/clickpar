import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';


/**
 * Admin API for managing provider_support_config
 *
 * GET    /api/admin/support-config              → list all configs
 * POST   /api/admin/support-config              → create new config
 * PUT    /api/admin/support-config?id=xxx       → update config
 * DELETE /api/admin/support-config?id=xxx       → delete config
 */

async function getSupabase() {
    return await createAdminClient();
}

export async function GET() {
    try {
        const supabase = await getSupabase();
        const { data, error } = await (supabase as any)
            .from('provider_support_config')
            .select('*')
            .order('platform', { ascending: true })
            .order('supplier_name', { ascending: true });

        if (error) throw error;
        return NextResponse.json({ configs: data || [] });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            platform,
            supplier_name,
            support_instructions = '',
            help_steps = [],
            faq_items = [],
            needs_code = false,
            code_url = null,
            code_source = 'manual',
            telegram_bot_username = null,
            telegram_user_identifier = null,
        } = body;

        if (!platform || !supplier_name) {
            return NextResponse.json(
                { error: 'platform y supplier_name son requeridos' },
                { status: 400 }
            );
        }

        const supabase = await getSupabase();
        const { data, error } = await (supabase as any)
            .from('provider_support_config')
            .insert({
                platform,
                supplier_name,
                support_instructions,
                help_steps,
                faq_items,
                needs_code,
                code_url,
                code_source,
                telegram_bot_username,
                telegram_user_identifier,
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json(
                    { error: 'Ya existe una configuración para esa plataforma + proveedor' },
                    { status: 409 }
                );
            }
            throw error;
        }

        return NextResponse.json({ config: data });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const id = request.nextUrl.searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'id requerido' }, { status: 400 });
        }

        const body = await request.json();
        const {
            platform,
            supplier_name,
            support_instructions,
            help_steps,
            faq_items,
            needs_code,
            code_url,
            code_source,
            telegram_bot_username,
            telegram_user_identifier,
        } = body;

        const supabase = await getSupabase();
        const { data, error } = await (supabase as any)
            .from('provider_support_config')
            .update({
                ...(platform !== undefined && { platform }),
                ...(supplier_name !== undefined && { supplier_name }),
                ...(support_instructions !== undefined && { support_instructions }),
                ...(help_steps !== undefined && { help_steps }),
                ...(faq_items !== undefined && { faq_items }),
                ...(needs_code !== undefined && { needs_code }),
                ...(code_url !== undefined && { code_url }),
                ...(code_source !== undefined && { code_source }),
                ...(telegram_bot_username !== undefined && { telegram_bot_username }),
                ...(telegram_user_identifier !== undefined && { telegram_user_identifier }),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ config: data });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const id = request.nextUrl.searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'id requerido' }, { status: 400 });
        }

        const supabase = await getSupabase();
        const { error } = await (supabase as any)
            .from('provider_support_config')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
