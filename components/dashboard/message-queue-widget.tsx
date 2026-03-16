import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { Send, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';

/**
 * Dashboard widget showing message queue summary.
 * Displays: sent today, failed, pending counts.
 */
export async function MessageQueueWidget() {
    const supabase = await createAdminClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Run all counts in parallel
    const [sentResult, failedResult, pendingResult] = await Promise.all([
        // Sent today
        (supabase as any)
            .from('message_queue')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'sent')
            .gte('sent_at', todayStart.toISOString()),
        // Failed (all time, not resolved)
        (supabase as any)
            .from('message_queue')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'failed'),
        // Pending + composed (waiting to be processed)
        (supabase as any)
            .from('message_queue')
            .select('*', { count: 'exact', head: true })
            .in('status', ['pending', 'composed']),
    ]);

    const sentToday = sentResult.count || 0;
    const failed = failedResult.count || 0;
    const pending = pendingResult.count || 0;

    // Don't render if queue is empty
    if (sentToday === 0 && failed === 0 && pending === 0) return null;

    return (
        <Card className="border-border bg-gradient-to-br from-[#1a1a2e]/80 to-[#1a1a1a]">
            <CardContent className="py-4 px-5">
                <div className="flex items-center gap-3 mb-3">
                    <Send className="h-5 w-5 text-blue-400" />
                    <span className="text-sm font-semibold text-foreground">Cola de Mensajes</span>
                </div>
                <div className="flex flex-wrap gap-3">
                    {/* Sent today */}
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <span className="text-sm text-foreground">
                            <span className="font-bold text-emerald-400">{sentToday}</span> enviados hoy
                        </span>
                    </div>
                    {/* Failed */}
                    {failed > 0 && (
                        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5">
                            <AlertCircle className="h-4 w-4 text-red-400" />
                            <span className="text-sm text-foreground">
                                <span className="font-bold text-red-400">{failed}</span> fallidos
                            </span>
                        </div>
                    )}
                    {/* Pending */}
                    {pending > 0 && (
                        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5">
                            <Clock className="h-4 w-4 text-amber-400" />
                            <span className="text-sm text-foreground">
                                <span className="font-bold text-amber-400">{pending}</span> pendientes
                            </span>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
