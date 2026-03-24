import { createAdminClient } from '@/lib/supabase/server';
import { Suspense } from 'react';
import { Users, TrendingUp, AlertTriangle, UserX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AddCustomerModal } from '@/components/customers/add-customer-modal';
import { CustomerDataActions } from '@/components/customers/customer-data-actions';
import { CustomersView, type CustomerRow } from '@/components/customers/customers-view';

export default async function CustomersPage() {
    const supabase = await createAdminClient();

    // 1. Fetch all customers
    const { data: rawCustomers } = await (supabase.from('customers') as any)
        .select('id, full_name, phone, email, created_at, customer_type, whatsapp_instance, creator_slug, panel_disabled')
        .order('created_at', { ascending: false });

    const customerList = (rawCustomers || []) as any[];
    const customerIds = customerList.map((c: any) => c.id);

    // 2. Fetch ALL active sales (no .in() filter to avoid URL length limits with many customer IDs)
    let allSales: any[] = [];
    {
        const customerIdSet = new Set(customerIds);
        let offset = 0;
        const pageSize = 1000;
        while (true) {
            const { data: salesChunk } = await (supabase.from('sales') as any)
                .select('id, customer_id, amount_gs, start_date, end_date, is_active, slot_id')
                .range(offset, offset + pageSize - 1);
            if (!salesChunk || salesChunk.length === 0) break;
            // Only keep sales for customers we have
            allSales.push(...salesChunk.filter((s: any) => customerIdSet.has(s.customer_id)));
            if (salesChunk.length < pageSize) break;
            offset += pageSize;
        }
    }

    // 3. Fetch slot→platform+account mapping for ALL sales (for history)
    const allSlotIds = [...new Set(allSales.filter((s: any) => s.slot_id).map((s: any) => s.slot_id))];

    let slotInfoMap = new Map<string, { platform: string; account_email: string }>();
    if (allSlotIds.length > 0) {
        // Batch fetch in chunks of 100 to avoid URL length limits
        for (let i = 0; i < allSlotIds.length; i += 100) {
            const chunk = allSlotIds.slice(i, i + 100);
            const { data: slots } = await (supabase.from('sale_slots') as any)
                .select('id, slot_identifier, mother_accounts:mother_account_id(platform, email)')
                .in('id', chunk);
            (slots || []).forEach((s: any) => {
                slotInfoMap.set(s.id, {
                    platform: s.mother_accounts?.platform || 'Servicio',
                    account_email: s.mother_accounts?.email || '',
                });
            });
        }
    }

    // 4. Build enriched customer rows
    const today = new Date();

    const enrichedCustomers: CustomerRow[] = customerList.map((c: any) => {
        const mySales = allSales.filter((s: any) => s.customer_id === c.id);
        const activeSales = mySales.filter((s: any) => s.is_active);

        // Build services array with computed sale_end_date
        const services = activeSales
            .filter((s: any) => s.slot_id)
            .map((s: any) => {
                // Usar end_date real de la BD; si no existe, calcular start + 30
                const rawEnd = s.end_date || (() => {
                    const d = new Date(s.start_date); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0];
                })();
                const info = slotInfoMap.get(s.slot_id);
                return {
                    platform: info?.platform || 'Servicio',
                    sale_end_date: rawEnd,
                    amount: s.amount_gs || 0,
                };
            });

        // Build history array (ALL sales, sorted newest first)
        const history = mySales
            .filter((s: any) => s.slot_id)
            .sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
            .map((s: any) => {
                const rawEnd = s.end_date || (() => {
                    const d = new Date(s.start_date); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0];
                })();
                const info = slotInfoMap.get(s.slot_id);
                return {
                    sale_id: s.id,
                    platform: info?.platform || 'Servicio',
                    account_email: info?.account_email || '',
                    start_date: s.start_date,
                    end_date: rawEnd,
                    amount: s.amount_gs || 0,
                    is_active: s.is_active,
                };
            });

        // Next expiry = earliest sale_end_date
        const endDates = services.map(s => s.sale_end_date).filter(Boolean).sort();
        const nextExpiry = endDates.length > 0 ? endDates[0] : null;

        // Status logic
        let status: 'active' | 'expired' | 'inactive';
        if (services.length > 0) {
            // Has active sales — check if any haven't expired
            const hasValidService = services.some(s => new Date(s.sale_end_date) >= today);
            status = hasValidService ? 'active' : 'expired';
        } else if (mySales.length > 0) {
            // Had sales before, but none active now
            status = 'expired';
        } else {
            status = 'inactive';
        }

        // LTV
        const totalSpent = mySales.reduce((sum: number, s: any) => sum + (s.amount_gs || 0), 0);
        const totalPurchases = mySales.length;

        return {
            id: c.id,
            full_name: c.full_name || 'Sin nombre',
            phone: c.phone || '',
            customer_type: c.customer_type || 'cliente',
            whatsapp_instance: c.whatsapp_instance || null,
            creator_slug: c.creator_slug || null,
            panel_disabled: c.panel_disabled ?? false,
            services,
            history,
            status,
            nextExpiry,
            totalSpent,
            totalPurchases,
        };
    });

    // Stats
    const totalCustomers = enrichedCustomers.length;
    const activeCount = enrichedCustomers.filter(c => c.status === 'active').length;
    const expiredCount = enrichedCustomers.filter(c => c.status === 'expired').length;
    const inactiveCount = enrichedCustomers.filter(c => c.status === 'inactive').length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
                    <p className="text-muted-foreground">Base de clientes con estado de servicio en tiempo real</p>
                </div>
                <div className="flex gap-2">
                    <CustomerDataActions customers={rawCustomers || []} />
                    <AddCustomerModal />
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="border-border bg-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Clientes</CardTitle>
                        <Users className="h-4 w-4 text-[#86EFAC]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{totalCustomers}</div>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Activos</CardTitle>
                        <TrendingUp className="h-4 w-4 text-[#86EFAC]" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-[#86EFAC]">{activeCount}</div>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Vencidos</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-500">{expiredCount}</div>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Sin Servicio</CardTitle>
                        <UserX className="h-4 w-4 text-gray-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-400">{inactiveCount}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Customers Table View */}
            <Suspense fallback={<div className="text-muted-foreground text-sm py-8 text-center">Cargando clientes...</div>}>
                <CustomersView customers={enrichedCustomers} />
            </Suspense>
        </div>
    );
}
