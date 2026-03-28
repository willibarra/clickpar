import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export default async function CreatorSlugPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    // Create client inside handler to avoid module-level env var access during build
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { slug } = await params;

    // 1. Look up the creator by slug
    const { data: customer } = await supabase
        .from('customers')
        .select('id, full_name, creator_slug, creator_whatsapp')
        .eq('creator_slug', slug)
        .single();

    if (!customer) {
        notFound();
    }

    // 2. Log the click (non-blocking)
    const headersList = await headers();
    const referrer = headersList.get('referer') || null;
    const userAgent = headersList.get('user-agent') || null;

    await supabase.from('creator_clicks').insert({
        slug,
        customer_id: customer.id,
        referrer,
        user_agent: userAgent,
    });

    // 3. Build the WhatsApp redirect URL
    // Priority: creator's personal number > env variable > hardcoded fallback
    const waNumber =
        (customer as any).creator_whatsapp ||
        process.env.WHATSAPP_BUSINESS_NUMBER ||
        '595973000000';
    const creatorName = (customer as any).full_name || slug;

    const messageTemplate =
        process.env.WHATSAPP_DEFAULT_MESSAGE ||
        'Hola! me contacto desde el link de {creator} 👋';

    const message = messageTemplate.replace('{creator}', creatorName);
    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;

    // 4. Redirect to WhatsApp
    redirect(waUrl);
}
