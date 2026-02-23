import { createAdminClient } from '@/lib/supabase/server';
import { Wallet, TrendingUp, TrendingDown, DollarSign, CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RenewalModal } from '@/components/finance/renewal-modal';
import { FinanceDataActions } from '@/components/finance/finance-data-actions';

export default async function FinancePage() {
    const supabase = await createAdminClient();

    // 1. Fetch Sales (without joins - FK not recognized by PostgREST)
    const { data: salesData } = await (supabase.from('sales') as any)
        .select('*')
        .order('created_at', { ascending: false });
    const sales = (salesData as any[]) || [];

    // 2. Fetch Expenses
    const { data: expensesData } = await (supabase.from('expenses') as any).select('*');
    const expenses = (expensesData as any[]) || [];

    // 3. Fetch customer names for sales (manual join)
    const customerIds = [...new Set(sales.map((s: any) => s.customer_id).filter(Boolean))] as string[];
    let customerMap = new Map<string, string>();
    if (customerIds.length > 0) {
        const { data: customers } = await (supabase.from('customers') as any)
            .select('id, full_name')
            .in('id', customerIds);
        (customers || []).forEach((c: any) => customerMap.set(c.id, c.full_name || 'Cliente'));
    }

    // 4. Fetch slot/platform info for sales (manual join)
    const slotIds = [...new Set(sales.map((s: any) => s.slot_id).filter(Boolean))] as string[];
    let slotMap = new Map<string, string>();
    if (slotIds.length > 0) {
        const { data: slots } = await (supabase.from('sale_slots') as any)
            .select('id, mother_accounts:mother_account_id(platform)')
            .in('id', slotIds);
        (slots || []).forEach((s: any) => {
            const platform = s.mother_accounts?.platform || 'Servicio';
            slotMap.set(s.id, platform);
        });
    }

    // Calculate totals
    const totalIncome = sales.reduce((sum: number, s: any) => sum + (Number(s.amount_gs) || 0), 0);
    const totalExpenses = expenses.reduce((sum: number, e: any) => sum + (Number(e.amount_gs) || 0), 0);
    const profit = totalIncome - totalExpenses;
    const profitMargin = totalIncome > 0 ? ((profit / totalIncome) * 100).toFixed(1) : '0';

    // Build transactions list
    const transactions = [
        ...sales.slice(0, 10).map((s: any) => ({
            id: s.id,
            date: s.created_at,
            amount: s.amount_gs,
            type: 'income' as const,
            description: `Venta ${slotMap.get(s.slot_id) || ''} - ${customerMap.get(s.customer_id) || 'Cliente'}`,
            status: 'completed'
        })),
        ...expenses.slice(0, 10).map((e: any) => ({
            id: e.id,
            date: e.created_at,
            amount: e.amount_gs,
            type: 'expense' as const,
            description: e.description || 'Gasto operativo',
            status: 'completed'
        }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 15);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Finanzas</h1>
                    <p className="text-muted-foreground">Resumen de ingresos y gastos (P&L)</p>
                </div>
                <div className="flex gap-2">
                    <FinanceDataActions
                        sales={sales}
                        expenses={expenses}
                        totalIncome={totalIncome}
                        totalExpenses={totalExpenses}
                    />
                    <RenewalModal />
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-border bg-card border-l-4 border-l-[#86EFAC]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Ingresos Totales (Ventas)
                        </CardTitle>
                        <TrendingUp className="h-4 w-4 text-[#86EFAC]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-[#86EFAC]">
                            Gs. {totalIncome.toLocaleString('es-PY')}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {sales.length} ventas registradas
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card border-l-4 border-l-[#F97316]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Gastos Operativos
                        </CardTitle>
                        <TrendingDown className="h-4 w-4 text-[#F97316]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-[#F97316]">
                            Gs. {totalExpenses.toLocaleString('es-PY')}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {expenses.length} gastos registrados
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Ganancia Neta
                        </CardTitle>
                        <DollarSign className="h-4 w-4 text-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${profit >= 0 ? 'text-[#86EFAC]' : 'text-red-500'}`}>
                            Gs. {profit.toLocaleString('es-PY')}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Margen Neto: {profitMargin}%
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Transactions */}
            <Card className="border-border bg-card">
                <CardHeader>
                    <CardTitle>Últimos Movimientos</CardTitle>
                </CardHeader>
                <CardContent>
                    {transactions.length > 0 ? (
                        <div className="space-y-3">
                            {transactions.map(tx => (
                                <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${tx.type === 'income' ? 'bg-[#86EFAC]' : 'bg-[#F97316]'}`} />
                                        <div>
                                            <p className="text-sm font-medium text-foreground">{tx.description}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {new Date(tx.date).toLocaleDateString('es-PY', {
                                                    day: '2-digit', month: 'short', year: 'numeric'
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`text-sm font-semibold ${tx.type === 'income' ? 'text-[#86EFAC]' : 'text-[#F97316]'}`}>
                                        {tx.type === 'income' ? '+' : '-'}Gs. {Number(tx.amount).toLocaleString('es-PY')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12">
                            <CreditCard className="mb-4 h-12 w-12 text-muted-foreground" />
                            <p className="text-muted-foreground">No hay movimientos registrados</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
