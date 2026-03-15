import { createAdminClient } from '@/lib/supabase/server';
import {
    Wallet, TrendingUp, TrendingDown, DollarSign,
    CreditCard, ShoppingCart, BarChart3, Users, Store
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RenewalModal } from '@/components/finance/renewal-modal';
import { FinanceDataActions } from '@/components/finance/finance-data-actions';
import { FinanceFilters } from '@/components/finance/finance-filters';
import { PlatformBreakdown } from '@/components/finance/platform-breakdown';
import { AccountROITable } from '@/components/finance/account-roi-table';
import { SupplierBreakdown } from '@/components/finance/supplier-breakdown';
import { Suspense } from 'react';

// ── Helpers ──────────────────────────────────────────────────────────────────
function getMonthRange(monthParam: string | undefined) {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth(); // 0-indexed

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
        const parts = monthParam.split('-');
        year = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1;
    }

    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59);

    return {
        startStr: start.toISOString().split('T')[0],
        endStr: end.toISOString().split('T')[0],
        label: start.toLocaleDateString('es-PY', { month: 'long', year: 'numeric' }),
    };
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function FinancePage(
    { searchParams }: { searchParams: Promise<{ month?: string }> }
) {
    const sp = await searchParams;
    const { startStr, endStr } = getMonthRange(sp?.month);

    const supabase = await createAdminClient();

    // ── 1. Ventas del mes ────────────────────────────────────────────────────
    const { data: salesData } = await (supabase.from('sales') as any)
        .select('id, amount_gs, created_at, customer_id, slot_id, payment_method')
        .gte('created_at', startStr + 'T00:00:00')
        .lte('created_at', endStr + 'T23:59:59')
        .order('created_at', { ascending: false });
    const sales = (salesData as any[]) || [];

    // ── 2. Gastos operativos del mes ─────────────────────────────────────────
    const { data: expensesData } = await (supabase.from('expenses') as any)
        .select('*')
        .gte('created_at', startStr + 'T00:00:00')
        .lte('created_at', endStr + 'T23:59:59');
    const expenses = (expensesData as any[]) || [];

    // ── 3. Compras de inventario del mes (mother_accounts creadas en el mes) ─
    const { data: inventoryData } = await (supabase.from('mother_accounts') as any)
        .select('id, platform, email, purchase_cost_gs, purchase_cost_usdt, supplier_name, created_at, renewal_date, max_slots, status')
        .gte('created_at', startStr + 'T00:00:00')
        .lte('created_at', endStr + 'T23:59:59');
    const inventoryPurchases = (inventoryData as any[]) || [];

    // ── 4. Todos los mother_accounts activos (para ROI y proveedor) ──────────
    const { data: allAccountsData } = await (supabase.from('mother_accounts') as any)
        .select('id, platform, email, purchase_cost_gs, supplier_name');
    const allAccounts = (allAccountsData as any[]) || [];

    // ── 5. Todas las ventas del mes con info de slot/plataforma ─────────────
    const slotIds = [...new Set(sales.map((s: any) => s.slot_id).filter(Boolean))] as string[];
    const slotMap = new Map<string, { platform: string; motherAccountId: string }>();
    if (slotIds.length > 0) {
        const chunks = [];
        for (let i = 0; i < slotIds.length; i += 200) chunks.push(slotIds.slice(i, i + 200));
        for (const chunk of chunks) {
            const { data: slots } = await (supabase.from('sale_slots') as any)
                .select('id, mother_account_id, mother_accounts:mother_account_id(platform)')
                .in('id', chunk);
            (slots || []).forEach((s: any) => {
                slotMap.set(s.id, {
                    platform: s.mother_accounts?.platform || 'Otros',
                    motherAccountId: s.mother_account_id,
                });
            });
        }
    }

    // ── 6. Customers para movimientos ────────────────────────────────────────
    const customerIds = [...new Set(sales.map((s: any) => s.customer_id).filter(Boolean))] as string[];
    const customerMap = new Map<string, string>();
    if (customerIds.length > 0) {
        const { data: customers } = await (supabase.from('customers') as any)
            .select('id, full_name').in('id', customerIds);
        (customers || []).forEach((c: any) => customerMap.set(c.id, c.full_name || 'Cliente'));
    }

    // ── Calcular totales ──────────────────────────────────────────────────────
    const totalIncome = sales.reduce((s: number, x: any) => s + (Number(x.amount_gs) || 0), 0);
    const totalExpensesOp = expenses.reduce((s: number, x: any) => s + (Number(x.amount_gs) || 0), 0);
    const totalInventory = inventoryPurchases.reduce((s: number, x: any) => s + (Number(x.purchase_cost_gs) || 0), 0);
    const totalEgreso = totalExpensesOp + totalInventory;
    const profit = totalIncome - totalEgreso;
    const profitMargin = totalIncome > 0 ? ((profit / totalIncome) * 100).toFixed(1) : '0';

    // ── Desglose por plataforma ───────────────────────────────────────────────
    const platformMap = new Map<string, { income: number; sales: number }>();
    for (const sale of sales) {
        const info = slotMap.get(sale.slot_id);
        const plat = info?.platform || 'Otros';
        const existing = platformMap.get(plat) || { income: 0, sales: 0 };
        platformMap.set(plat, {
            income: existing.income + (Number(sale.amount_gs) || 0),
            sales: existing.sales + 1,
        });
    }
    const platformData = Array.from(platformMap.entries())
        .map(([platform, v]) => ({ platform, ...v }))
        .sort((a, b) => b.income - a.income);

    // ── ROI por cuenta madre ───────────────────────────────────────────────────
    // Para ROI acumulado total (no solo mes), usamos todas las ventas de ese slot
    const accountIncomeMap = new Map<string, number>();
    const accountSalesMap = new Map<string, number>();
    for (const sale of sales) {
        const info = slotMap.get(sale.slot_id);
        if (info?.motherAccountId) {
            const prev = accountIncomeMap.get(info.motherAccountId) || 0;
            accountIncomeMap.set(info.motherAccountId, prev + (Number(sale.amount_gs) || 0));
            accountSalesMap.set(info.motherAccountId, (accountSalesMap.get(info.motherAccountId) || 0) + 1);
        }
    }
    const roiData = allAccounts
        .filter((a: any) => accountSalesMap.has(a.id) || inventoryPurchases.some((p: any) => p.id === a.id))
        .map((a: any) => {
            const income = accountIncomeMap.get(a.id) || 0;
            const cost = Number(a.purchase_cost_gs) || 0;
            const profit = income - cost;
            const margin = cost > 0 ? (profit / cost) * 100 : income > 0 ? 100 : 0;
            return {
                id: a.id,
                email: a.email,
                platform: a.platform,
                cost,
                income,
                profit,
                margin,
                activeSales: accountSalesMap.get(a.id) || 0,
            };
        })
        .sort((a: any, b: any) => b.income - a.income)
        .slice(0, 20);

    // ── Desglose por proveedor ────────────────────────────────────────────────
    const supplierMap = new Map<string, { cost: number; income: number; accounts: Set<string> }>();
    for (const a of allAccounts) {
        const sup = a.supplier_name || 'Sin proveedor';
        const existing = supplierMap.get(sup) || { cost: 0, income: 0, accounts: new Set() };
        existing.accounts.add(a.id);
        existing.cost += Number(a.purchase_cost_gs) || 0;
        existing.income += accountIncomeMap.get(a.id) || 0;
        supplierMap.set(sup, existing);
    }
    const supplierData = Array.from(supplierMap.entries())
        .map(([supplier, v]) => ({
            supplier,
            cost: v.cost,
            income: v.income,
            profit: v.income - v.cost,
            accounts: v.accounts.size,
        }))
        .filter(s => s.cost > 0 || s.income > 0)
        .sort((a, b) => b.income - a.income);

    // ── Movimientos recientes ─────────────────────────────────────────────────
    const transactions = [
        ...sales.slice(0, 8).map((s: any) => ({
            id: s.id,
            date: s.created_at,
            amount: s.amount_gs,
            type: 'income' as const,
            description: `Venta ${slotMap.get(s.slot_id)?.platform || 'Servicio'} — ${customerMap.get(s.customer_id) || 'Cliente'}`,
            tag: 'Ingreso',
        })),
        ...expenses.slice(0, 5).map((e: any) => ({
            id: e.id,
            date: e.created_at,
            amount: e.amount_gs,
            type: 'expense' as const,
            description: e.description || 'Gasto operativo',
            tag: e.expense_type === 'renewal' ? 'Renovación' : 'Gasto Op.',
        })),
        ...inventoryPurchases.slice(0, 5).map((p: any) => ({
            id: 'inv-' + p.id,
            date: p.created_at,
            amount: p.purchase_cost_gs,
            type: 'expense' as const,
            description: `Compra ${p.platform} — ${p.email}`,
            tag: 'Inventario',
        })),
    ]
        .filter(t => t.amount > 0)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 15);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Finanzas</h1>
                    <p className="text-muted-foreground text-sm">P&amp;L — ingresos, egresos y rentabilidad</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <Suspense fallback={null}>
                        <FinanceFilters />
                    </Suspense>
                    <FinanceDataActions
                        sales={sales}
                        expenses={expenses}
                        inventoryPurchases={inventoryPurchases}
                        totalIncome={totalIncome}
                        totalExpenses={totalEgreso}
                    />
                    <RenewalModal />
                </div>
            </div>

            {/* Stats Cards — 4 cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Ingresos */}
                <Card className="border-border bg-card border-l-4 border-l-[#86EFAC]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Ingresos (Ventas)</CardTitle>
                        <TrendingUp className="h-4 w-4 text-[#86EFAC]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-[#86EFAC]">
                            Gs. {totalIncome.toLocaleString('es-PY')}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{sales.length} ventas</p>
                    </CardContent>
                </Card>

                {/* Compras de inventario */}
                <Card className="border-border bg-card border-l-4 border-l-blue-400">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Compras Inventario</CardTitle>
                        <ShoppingCart className="h-4 w-4 text-blue-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-400">
                            Gs. {totalInventory.toLocaleString('es-PY')}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{inventoryPurchases.length} cuentas compradas</p>
                    </CardContent>
                </Card>

                {/* Gastos operativos */}
                <Card className="border-border bg-card border-l-4 border-l-[#F97316]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Gastos Operativos</CardTitle>
                        <TrendingDown className="h-4 w-4 text-[#F97316]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-[#F97316]">
                            Gs. {totalExpensesOp.toLocaleString('es-PY')}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{expenses.length} gastos registrados</p>
                    </CardContent>
                </Card>

                {/* Ganancia neta */}
                <Card className="border-border bg-card border-l-4" style={{ borderLeftColor: profit >= 0 ? '#86EFAC' : '#F87171' }}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Ganancia Neta</CardTitle>
                        <DollarSign className="h-4 w-4 text-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${profit >= 0 ? 'text-[#86EFAC]' : 'text-red-400'}`}>
                            {profit >= 0 ? '' : '-'}Gs. {Math.abs(profit).toLocaleString('es-PY')}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Margen: {profitMargin}%</p>
                    </CardContent>
                </Card>
            </div>

            {/* Fila: Plataformas + Movimientos */}
            <div className="grid gap-4 lg:grid-cols-2">
                {/* Ingresos por plataforma */}
                <Card className="border-border bg-card">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-muted-foreground" />
                            <CardTitle className="text-base">Ingresos por Plataforma</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <PlatformBreakdown data={platformData} total={totalIncome} />
                    </CardContent>
                </Card>

                {/* Últimos movimientos */}
                <Card className="border-border bg-card">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Wallet className="h-4 w-4 text-muted-foreground" />
                            <CardTitle className="text-base">Últimos Movimientos</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {transactions.length > 0 ? (
                            <div className="space-y-2">
                                {transactions.map(tx => (
                                    <div key={tx.id} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${tx.type === 'income' ? 'bg-[#86EFAC]' : tx.tag === 'Inventario' ? 'bg-blue-400' : 'bg-[#F97316]'}`} />
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-xs text-muted-foreground">
                                                        {new Date(tx.date).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' })}
                                                    </p>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${tx.tag === 'Ingreso' ? 'bg-green-500/10 text-green-400' :
                                                        tx.tag === 'Inventario' ? 'bg-blue-500/10 text-blue-400' :
                                                        tx.tag === 'Renovación' ? 'bg-orange-500/10 text-orange-400' :
                                                        'bg-muted text-muted-foreground'}`}>
                                                        {tx.tag}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <span className={`text-sm font-semibold flex-shrink-0 ml-3 tabular-nums ${tx.type === 'income' ? 'text-[#86EFAC]' : tx.tag === 'Inventario' ? 'text-blue-400' : 'text-[#F97316]'}`}>
                                            {tx.type === 'income' ? '+' : '-'}Gs. {Number(tx.amount).toLocaleString('es-PY')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-10">
                                <CreditCard className="mb-3 h-10 w-10 text-muted-foreground" />
                                <p className="text-muted-foreground text-sm">Sin movimientos este mes</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ROI por cuenta madre */}
            {roiData.length > 0 && (
                <Card className="border-border bg-card">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <CardTitle className="text-base">ROI por Cuenta Madre</CardTitle>
                        </div>
                        <p className="text-xs text-muted-foreground">Cuentas con ventas en el período seleccionado</p>
                    </CardHeader>
                    <CardContent>
                        <AccountROITable data={roiData} />
                    </CardContent>
                </Card>
            )}

            {/* Ganancia por proveedor */}
            {supplierData.length > 0 && (
                <Card className="border-border bg-card">
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                            <Store className="h-4 w-4 text-muted-foreground" />
                            <CardTitle className="text-base">Rentabilidad por Proveedor</CardTitle>
                        </div>
                        <p className="text-xs text-muted-foreground">Basado en compras vs ingresos acumulados de sus cuentas</p>
                    </CardHeader>
                    <CardContent>
                        <SupplierBreakdown data={supplierData} />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
