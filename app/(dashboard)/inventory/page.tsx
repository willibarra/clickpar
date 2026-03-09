import { createAdminClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AddAccountModal } from '@/components/inventory/add-account-modal';
import { AddPlatformModal } from '@/components/inventory/add-platform-modal';
import { InventoryView } from '@/components/inventory/inventory-view';
import { InventoryDataActions } from '@/components/inventory/inventory-data-actions';

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

export default async function InventoryPage() {
    const supabase = await createAdminClient();

    // Fetch mother accounts with their slots
    const { data: accounts } = await supabase
        .from('mother_accounts')
        .select(`
      *,
      sale_slots (
        *,
        sales!sales_slot_id_fkey (
          id, end_date, is_active,
          customers ( id, full_name, phone )
        )
      )
    `)
        .order('platform');

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
                    <InventoryDataActions accounts={accounts || []} />
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
                accounts={accounts || []}
                platformColors={platformColors}
                statusColors={statusColors}
            />

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
