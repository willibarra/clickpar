import { createClient, createAdminClient } from '@/lib/supabase/server';
import { ShoppingCart, TrendingUp, Calendar, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NewSaleModal } from '@/components/sales/new-sale-modal';
import { SalesDataActions } from '@/components/sales/sales-data-actions';
import { SalesTable } from '@/components/sales/sales-table';

export default async function SalesPage() {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();

    const supabase = await createAdminClient();

    // Fetch user role
    let role = 'staff';
    if (user) {
        const { data: profile } = await (supabase.from('profiles') as any).select('role').eq('id', user.id).single();
        if (profile) role = profile.role;
    }

    const isSuperAdmin = role === 'super_admin';

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

    // Helper para dividir en lotes (evitar "URI too long" con muchos IDs)
    function chunk<T>(arr: T[], size: number): T[][] {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
    }

    // 3. Fetch related data en lotes de 200
    // Customers
    const custMap = new Map<string, any>();
    for (const ids of chunk(customerIds, 200)) {
        const { data: rows } = await (supabase.from('customers') as any)
            .select('id, full_name, phone').in('id', ids);
        (rows || []).forEach((r: any) => custMap.set(r.id, r));
    }

    // Slots con Mother Accounts (sale_slots SÍ tiene FK hacia mother_accounts)
    const slotMap = new Map<string, any>();
    for (const ids of chunk(slotIds, 200)) {
        const { data: rows } = await (supabase.from('sale_slots') as any)
            .select(`
                id,
                slot_identifier,
                mother_accounts (platform, email)
            `)
            .in('id', ids);
        (rows || []).forEach((r: any) => slotMap.set(r.id, r));
    }

    // 4. Manual Join
    const sales = rawSales?.map((sale: any) => ({
        ...sale,
        customers: custMap.get(sale.customer_id) || undefined,
        sale_slots: slotMap.get(sale.slot_id) || undefined,
    })) || [];

    // Calculate admin stats
    const activeSales = sales?.filter((s: any) => s.is_active).length || 0;

    // Calculate dates for stats
    const now = new Date();
    const todayStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = new Date(yesterday.getTime() - (yesterday.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    const todaySales = sales?.filter((s: any) => {
        const createdStr = new Date(s.created_at).toISOString().split('T')[0];
        return createdStr === todayStr;
    }).length || 0;

    const yesterdaySales = sales?.filter((s: any) => {
        const createdStr = new Date(s.created_at).toISOString().split('T')[0];
        return createdStr === yesterdayStr;
    }).length || 0;

    const thisMonthSales = sales?.filter((s: any) => {
        const created = new Date(s.created_at);
        return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }).length || 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Ventas</h1>
                    <p className="text-muted-foreground">Gestiona ventas y suscripciones</p>
                </div>
                <div className="flex gap-2">
                    {isSuperAdmin && <SalesDataActions sales={sales || []} />}
                    <NewSaleModal />
                </div>
            </div>

            {/* Admin Stats Cards - ONLY for super_admin */}
            {isSuperAdmin && (
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
                                Ventas del Día
                            </CardTitle>
                            <Clock className="h-4 w-4 text-[#F97316]" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-foreground">{todaySales}</div>
                        </CardContent>
                    </Card>

                    <Card className="border-border bg-card">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Ayer
                            </CardTitle>
                            <TrendingUp className="h-4 w-4 text-blue-400" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-foreground">{yesterdaySales}</div>
                        </CardContent>
                    </Card>

                    <Card className="border-border bg-card">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                Mes
                            </CardTitle>
                            <Calendar className="h-4 w-4 text-[#86EFAC]" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-foreground">{thisMonthSales}</div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Sales Table with Pagination */}
            <SalesTable sales={sales} />
        </div>
    );
}
