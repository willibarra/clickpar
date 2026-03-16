import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/portal/verify-captcha
 * Verifies hCaptcha token before allowing OTP to be sent.
 */
export async function POST(req: NextRequest) {
    const { token } = await req.json();

    if (!token) {
        return NextResponse.json({ error: 'Captcha requerido' }, { status: 400 });
    }

    const secretKey = process.env.HCAPTCHA_SECRET_KEY;
    if (!secretKey) {
        console.warn('[verify-captcha] HCAPTCHA_SECRET_KEY not configured, allowing through');
        return NextResponse.json({ success: true });
    }

    try {
        const response = await fetch('https://api.hcaptcha.com/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                secret: secretKey,
                response: token,
            }),
        });

        const data = await response.json();

        if (data.success) {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json(
                { error: 'Verificación de captcha fallida', codes: data['error-codes'] },
                { status: 403 }
            );
        }
    } catch (error: any) {
        console.error('[verify-captcha] Error:', error.message);
        return NextResponse.json({ error: 'Error al verificar captcha' }, { status: 500 });
    }
}
