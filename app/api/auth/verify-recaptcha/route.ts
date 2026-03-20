import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';


export async function POST(request: NextRequest) {
    try {
        const { token } = await request.json();

        if (!token) {
            return NextResponse.json({ success: false, error: 'No token provided' }, { status: 400 });
        }

        const secretKey = process.env.RECAPTCHA_SECRET_KEY;
        if (!secretKey) {
            // No secret key configured — skip verification
            return NextResponse.json({ success: true, score: 1.0 });
        }

        const verifyUrl = `https://www.google.com/recaptcha/api/siteverify`;
        const res = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `secret=${secretKey}&response=${token}`,
        });

        const data = await res.json();

        return NextResponse.json({
            success: data.success,
            score: data.score,
            action: data.action,
        });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
