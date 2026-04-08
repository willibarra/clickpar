'use client';
import { useState, useEffect } from 'react';
import { EditCustomerModal } from './edit-customer-modal';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

export function InlineEditCustomerModal({ 
    customerId, 
    open, 
    onOpenChange 
}: { 
    customerId: string, 
    open: boolean, 
    onOpenChange: (open: boolean) => void 
}) {
    const [customer, setCustomer] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open && customerId) {
            setLoading(true);
            const supabase = createClient();
            supabase.from('customers').select('*').eq('id', customerId).single()
                .then(({ data }) => {
                    if (data) {
                        (data as any).phone_number = (data as any).phone;
                    }
                    setCustomer(data);
                    setLoading(false);
                });
        } else {
            setCustomer(null);
        }
    }, [open, customerId]);

    if (!open) return null;

    if (loading || !customer) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
                <div className="bg-card border border-border p-6 rounded-lg flex flex-col items-center">
                    <Loader2 className="h-8 w-8 animate-spin text-[#86EFAC] mb-4" />
                    <p className="text-muted-foreground text-sm">Cargando datos del cliente...</p>
                </div>
            </div>
        );
    }

    return (
        <EditCustomerModal 
            customer={customer} 
            defaultOpen={true} 
            onOpenChange={(v) => {
                if (!v) onOpenChange(false);
            }} 
        />
    );
}
