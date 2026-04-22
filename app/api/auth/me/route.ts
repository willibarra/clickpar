import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/me
 * Returns the current authenticated user's email and id.
 * Used by client components that need to identify the current staff member.
 */
export async function GET() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    return NextResponse.json({ id: user.id, email: user.email });
}
