import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

/**
 * DEPRECATED — GET /api/cron/expiration-alerts
 *
 * Este endpoint fue reemplazado por el pipeline de 3 fases:
 *   POST /api/cron/queue-messages    → Fase 1: encolar mensajes
 *   POST /api/cron/compose-messages  → Fase 2: componer texto
 *   POST /api/cron/send-messages     → Fase 3: enviar por WhatsApp
 *
 * El pipeline completo se dispara automáticamente con:
 *   GET  /api/cron/trigger-pipeline  (Vercel Cron: 0 11 * * * = 7am Paraguay)
 *   POST /api/automatizaciones/run-pipeline  (trigger manual desde el dashboard)
 */
export async function GET() {
    return NextResponse.json(
        {
            deprecated: true,
            message:
                'Este endpoint está deprecado (reemplazado por el pipeline de 3 fases). ' +
                'Usar GET /api/cron/trigger-pipeline o POST /api/automatizaciones/run-pipeline.',
            migration: {
                auto:   'GET  /api/cron/trigger-pipeline',
                manual: 'POST /api/automatizaciones/run-pipeline',
            },
        },
        { status: 410 }
    );
}
