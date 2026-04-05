import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AddAccountModal } from '@/components/inventory/add-account-modal';
import { AddPlatformModal } from '@/components/inventory/add-platform-modal';
import { InventoryView } from '@/components/inventory/inventory-view';
import { TrashPanel } from '@/components/inventory/trash-panel';

// Static platform colors
const platformColors: Record<string, { bg: string; text: string; gradient: string }> = {
    Netflix: { bg: 'bg-[#E50914]', text: 'text-white', gradient: 'from-[#E50914]/20' },
    Spotify: { bg: 'bg-[#1DB954]', text: 'text-white', gradient: 'from-[#1DB954]/20' },
    HBO: { bg: 'bg-[#5c16c5]', text: 'text-white', gradient: 'from-[#5c16c5]/20' },
    'HBO Max': { bg: 'bg-[#5c16c5]', text: 'text-white', gradient: 'from-[#5c16c5]/20' },
    'Disney+': { bg: 'bg-[#0063e5]', text: 'text-white', gradient: 'from-[#0063e5]/20' },
    'Amazon Prime': { bg: 'bg-[#00a8e1]', text: 'text-white', gradient: 'from-[#00a8e1]/20' },
    'YouTube Premium': { bg: 'bg-[#ff0000]', text: 'text-white', gradient: 'from-[#ff0000]/20' },
    'Apple TV+': { bg: 'bg-[#000000]', text: 'text-white', gradient: 'from-[#000000]/20' },
    Crunchyroll: { bg: 'bg-[#F47521]', text: 'text-white', gradient: 'from-[#F47521]/20' },
    'Paramount+': { bg: 'bg-[#0064FF]', text: 'text-white', gradient: 'from-[#0064FF]/20' },
    'Star+': { bg: 'bg-[#C724B1]', text: 'text-white', gradient: 'from-[#C724B1]/20' },
    Tidal: { bg: 'bg-[#000000]', text: 'text-white', gradient: 'from-[#000000]/20' },
    default: { bg: 'bg-gray-500', text: 'text-white', gradient: 'from-gray-500/20' },
};

const statusColors: Record<string, string> = {
    available: 'bg-[#86EFAC] text-black',
    sold: 'bg-[#F97316] text-white',
    reserved: 'bg-yellow-500 text-black',
    warranty_claim: 'bg-red-500 text-white',
};

const statusLabels: Record<string, string> = {
    available: 'Disponible',
    sold: 'Vendido',
    reserved: 'Reservado',
    warranty_claim: 'Garantía',
};

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
    const params = await searchParams;
    const initialSearch = params.q || '';
    const supabase = await createAdminClient();

    // Step 1: Fetch mother accounts with slots
    const { data: accounts } = await supabase
        .from('mother_accounts')
        .select(`*, show_in_store, sale_slots (id, status, slot_identifier, pin_code)`)
        .is('deleted_at', null)
        .order('platform');

    // Step 2: Fetch active sales (plain — PostgREST FK not registered for customers join)
    const { data: activeSales } = await supabase
        .from('sales')
        .select('id, slot_id, customer_id, start_date, end_date')
        .eq('is_active', true);

    // Step 3: Fetch all customers as a lookup map (simpler and reliable vs .in with 1000+ IDs)
    const { data: allCustomers } = await supabase
        .from('customers')
        .select('id, full_name, phone');
    const customerMap: Record<string, { id: string; full_name: string | null; phone: string | null }> =
        Object.fromEntries((allCustomers || []).map((c: any) => [c.id, c]));

    // Build sale lookup map by slot_id for O(1) merge
    const saleBySlot: Record<string, any> = Object.fromEntries(
        ((activeSales || []) as any[]).map((s: any) => [s.slot_id, s])
    );

    // Merge: slot + sale + customer
    const enrichedAccounts = (accounts as any[] || []).map((account: any) => ({
        ...account,
        sale_slots: (account.sale_slots || []).map((slot: any) => {
            const sale = saleBySlot[slot.id];
            return {
                ...slot,
                sales: sale ? [{ ...sale, customers: customerMap[sale.customer_id] || null }] : [],
            };
        }),
    }));

    // Fetch deleted (trash) accounts
    const { data: trashedAccounts } = await supabase
        .from('mother_accounts')
        .select('id, platform, email, password, max_slots, renewal_date, status, deleted_at, supplier_name, notes, sale_type, purchase_cost_gs, purchase_cost_usdt')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

    // Calculate stats
    const totalAccounts = accounts?.length || 0;
    const totalSlots = accounts?.reduce((acc: number, a: any) => acc + (a.sale_slots?.length || 0), 0) || 0;
    const availableSlots = accounts?.reduce((acc: number, a: any) =>
        acc + (a.sale_slots?.filter((s: { status: string }) => s.status === 'available').length || 0), 0) || 0;
    const soldSlots = totalSlots - availableSlots;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Inventario</h1>
                    <p className="text-muted-foreground">Gestiona tus cuentas madre y slots</p>
                </div>
                <div className="flex gap-2">
                    <AddPlatformModal />
                    <AddAccountModal />
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="border-border bg-card">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Cuentas Madre
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{totalAccounts}</div>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Total Slots
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{totalSlots}</div>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Disponibles
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-[#86EFAC]">{availableSlots}</div>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Vendidos
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-[#F97316]">{soldSlots}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Accounts List/Grid View */}
            <InventoryView
                accounts={enrichedAccounts}
                platformColors={platformColors}
                statusColors={statusColors}
                initialSearch={initialSearch}
            />

            {/* Trash Panel */}
            <TrashPanel accounts={trashedAccounts || []} />

            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-muted-foreground">Estados:</span>
                {Object.entries(statusLabels).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2">
                        <div className={`h-3 w-3 rounded ${statusColors[key]}`} />
                        <span className="text-muted-foreground">{label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
