import { createAdminClient } from '@/lib/supabase/server';
import { ShoppingCart, TrendingUp, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NewSaleModal } from '@/components/sales/new-sale-modal';
import { CancelSubscriptionButton } from '@/components/sales/cancel-subscription-button';
import { SalesDataActions } from '@/components/sales/sales-data-actions';

export default async function SalesPage() {
    const supabase = await createAdminClient();

    // 1. Fetch sales
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawSales, error: salesError } = await (supabase
        .from('sales') as any)
        .select('*')
        .order('created_at', { ascending: false });

    if (salesError) console.error('Error fetching sales:', salesError);

    // 2. Extract IDs for manual join
    const customerIds = [...new Set(rawSales?.map((s: any) => s.customer_id).filter(Boolean))] as string[];
    const slotIds = [...new Set(rawSales?.map((s: any) => s.slot_id).filter(Boolean))] as string[];

    // 3. Fetch related data
    // Customers
    const { data: customers } = await (supabase
        .from('customers') as any)
        .select('id, full_name, phone')
        .in('id', customerIds);

    // Slots with Mother Accounts
    const { data: slots } = await (supabase
        .from('sale_slots') as any)
        .select(`
            id,
            slot_identifier,
            mother_accounts (platform, email)
        `)
        .in('id', slotIds);

    // 4. Manual Join
    const sales = rawSales?.map((sale: any) => ({
        ...sale,
        customers: customers?.find((c: any) => c.id === sale.customer_id),
        sale_slots: slots?.find((s: any) => s.id === sale.slot_id)
    })) || [];

    // Calculate stats from sales
    const activeSales = sales?.filter((s: any) => s.is_active).length || 0;
    const totalRevenue = sales?.reduce((acc: number, s: any) => acc + (s.amount_gs || 0), 0) || 0;
    const thisMonthSales = sales?.filter((s: any) => {
        const created = new Date(s.created_at);
        const now = new Date();
        return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }).length || 0;

    // Format date helper
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('es-PY');
    };

    // Calculate end date (30 days from start)
    const getEndDate = (startDate: string) => {
        if (!startDate) return '-';
        const start = new Date(startDate);
        start.setDate(start.getDate() + 30);
        return start.toLocaleDateString('es-PY');
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Ventas</h1>
                    <p className="text-muted-foreground">Gestiona ventas y suscripciones</p>
                </div>
                <div className="flex gap-2">
                    <SalesDataActions sales={sales || []} />
                    <NewSaleModal />
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="border-border bg-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Ventas Activas
                        </CardTitle>
                        <ShoppingCart className="h-4 w-4 text-[#86EFAC]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{activeSales}</div>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Ventas Este Mes
                        </CardTitle>
                        <Calendar className="h-4 w-4 text-[#F97316]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{thisMonthSales}</div>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Ingresos Totales
                        </CardTitle>
                        <TrendingUp className="h-4 w-4 text-[#86EFAC]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">
                            Gs. {totalRevenue.toLocaleString('es-PY')}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Ticket Promedio
                        </CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">
                            Gs. {sales?.length ? Math.round(totalRevenue / sales.length).toLocaleString('es-PY') : '0'}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Sales Table */}
            <Card className="border-border bg-card">
                <CardHeader>
                    <CardTitle>Ventas Recientes</CardTitle>
                </CardHeader>
                <CardContent>
                    {sales && sales.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border text-left text-sm text-muted-foreground">
                                        <th className="pb-3 font-medium">Cliente</th>
                                        <th className="pb-3 font-medium">Plataforma</th>
                                        <th className="pb-3 font-medium">Slot</th>
                                        <th className="pb-3 font-medium">Precio</th>
                                        <th className="pb-3 font-medium">Fecha Inicio</th>
                                        <th className="pb-3 font-medium">Vencimiento</th>
                                        <th className="pb-3 font-medium">Estado</th>
                                        <th className="pb-3 font-medium">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {sales.map((sale: any) => (
                                        <tr key={sale.id} className="border-b border-border/50">
                                            <td className="py-3">
                                                <div>
                                                    <p className="font-medium text-foreground">
                                                        {sale.customers?.full_name || 'Sin nombre'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {sale.customers?.phone || 'Sin teléfono'}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="py-3 text-foreground">
                                                {sale.sale_slots?.mother_accounts?.platform || '-'}
                                            </td>
                                            <td className="py-3 text-muted-foreground">
                                                {sale.sale_slots?.slot_identifier || '-'}
                                            </td>
                                            <td className="py-3 font-medium text-foreground">
                                                Gs. {sale.amount_gs?.toLocaleString('es-PY')}
                                            </td>
                                            <td className="py-3 text-muted-foreground">
                                                {formatDate(sale.start_date)}
                                            </td>
                                            <td className="py-3 text-muted-foreground">
                                                {getEndDate(sale.start_date)}
                                            </td>
                                            <td className="py-3">
                                                <span className={`rounded-full px-2 py-1 text-xs font-medium ${sale.is_active
                                                    ? 'bg-[#86EFAC]/20 text-[#86EFAC]'
                                                    : 'bg-red-500/20 text-red-500'
                                                    }`}>
                                                    {sale.is_active ? 'Activa' : 'Cancelada'}
                                                </span>
                                            </td>
                                            <td className="py-3">
                                                {sale.is_active && (
                                                    <CancelSubscriptionButton
                                                        subscriptionId={sale.id}
                                                        slotId={sale.sale_slots?.id}
                                                    />
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12">
                            <ShoppingCart className="mb-4 h-12 w-12 text-muted-foreground" />
                            <p className="text-muted-foreground">No hay ventas registradas</p>
                            <div className="mt-4">
                                <NewSaleModal />
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
