import { getAccountsForRenewal, getClientSubscriptions } from '@/lib/actions/renewals';
import { RenewalsView } from '@/components/renewals/renewals-view';
import { CalendarClock } from 'lucide-react';

export default async function RenewalsPage() {
    const [accountsResult, subsResult] = await Promise.all([
        getAccountsForRenewal(),
        getClientSubscriptions(),
    ]);

    const accounts = accountsResult.data || [];
    const subscriptions = subsResult.data || [];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                    <CalendarClock className="h-7 w-7 text-[#F97316]" />
                    Centro de Renovaciones
                </h1>
                <p className="text-muted-foreground">
                    Gestión masiva de vencimientos de proveedores y clientes
                </p>
            </div>
            <RenewalsView accounts={accounts} subscriptions={subscriptions} />
        </div>
    );
}
