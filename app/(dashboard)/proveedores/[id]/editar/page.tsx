import { createAdminClient, createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getSupplierDetail, updateSupplier } from '@/lib/actions/suppliers';
import { ArrowLeft } from 'lucide-react';

export default async function EditarProveedorPage({
    params,
}: {
    params: { id: string };
}) {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) redirect('/staff/login');

    const supabase = await createAdminClient();
    const { data: profile } = await (supabase.from('profiles') as any)
        .select('role')
        .eq('id', user.id)
        .single();
    if (!profile || profile.role !== 'super_admin') redirect('/');

    const supplier = await getSupplierDetail(params.id);
    if (!supplier) redirect('/proveedores');

    async function handleUpdate(formData: FormData) {
        'use server';
        const result = await updateSupplier(params.id, formData);
        if (result.error) {
            redirect(`/proveedores/${params.id}/editar?error=${encodeURIComponent(result.error)}`);
        }
        redirect(`/proveedores/${params.id}`);
    }

    return (
        <div className="space-y-6 max-w-xl">
            {/* Back */}
            <a
                href={`/proveedores/${params.id}`}
                className="inline-flex items-center gap-2 text-sm transition-colors hover:text-white"
                style={{ color: '#8b8ba7' }}
            >
                <ArrowLeft className="h-4 w-4" />
                Volver al proveedor
            </a>

            <div>
                <h1 className="text-2xl font-bold text-white">Editar Proveedor</h1>
                <p className="text-sm mt-0.5 font-mono" style={{ color: '#8b8ba7' }}>
                    {supplier.name}
                </p>
            </div>

            <form
                action={handleUpdate}
                className="rounded-2xl p-6 space-y-5"
                style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                }}
            >
                {/* Name */}
                <div className="space-y-1.5">
                    <label htmlFor="name" className="text-sm font-medium text-white">
                        Nombre <span className="text-red-400">*</span>
                    </label>
                    <input
                        id="name"
                        name="name"
                        type="text"
                        required
                        defaultValue={supplier.name}
                        className="w-full rounded-xl border px-4 py-2.5 text-sm text-white placeholder:text-[#8b8ba7] focus:outline-none focus:ring-1 focus:ring-[#86efac]/50"
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.12)',
                        }}
                    />
                    <p className="text-xs" style={{ color: '#8b8ba7' }}>
                        Se guardará en mayúsculas automáticamente
                    </p>
                </div>

                {/* Contact info */}
                <div className="space-y-1.5">
                    <label htmlFor="contact_info" className="text-sm font-medium text-white">
                        Contacto / Info
                    </label>
                    <input
                        id="contact_info"
                        name="contact_info"
                        type="text"
                        defaultValue={supplier.contact_info ?? ''}
                        placeholder="Ej: @usuario_telegram o +595 9XX XXXXXX"
                        className="w-full rounded-xl border px-4 py-2.5 text-sm text-white placeholder:text-[#8b8ba7] focus:outline-none focus:ring-1 focus:ring-[#86efac]/50"
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.12)',
                        }}
                    />
                </div>

                {/* Payment method */}
                <div className="space-y-1.5">
                    <label htmlFor="payment_method_preferred" className="text-sm font-medium text-white">
                        Método de pago preferido
                    </label>
                    <input
                        id="payment_method_preferred"
                        name="payment_method_preferred"
                        type="text"
                        defaultValue={supplier.payment_method_preferred ?? ''}
                        placeholder="Ej: PayPal, Transferencia BCP, USDT TRC20..."
                        className="w-full rounded-xl border px-4 py-2.5 text-sm text-white placeholder:text-[#8b8ba7] focus:outline-none focus:ring-1 focus:ring-[#86efac]/50"
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.12)',
                        }}
                    />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 pt-2">
                    <a
                        href={`/proveedores/${params.id}`}
                        className="rounded-xl px-5 py-2.5 text-sm font-medium transition-colors"
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#e2e8f0',
                        }}
                    >
                        Cancelar
                    </a>
                    <button
                        type="submit"
                        className="rounded-xl px-6 py-2.5 text-sm font-semibold transition-all hover:opacity-90"
                        style={{
                            background: 'rgba(134,239,172,0.15)',
                            border: '1px solid rgba(134,239,172,0.3)',
                            color: '#86efac',
                        }}
                    >
                        Guardar Cambios
                    </button>
                </div>
            </form>
        </div>
    );
}
