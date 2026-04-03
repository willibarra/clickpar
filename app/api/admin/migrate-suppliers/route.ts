import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const SIN_PROVEEDOR_ID = '00000000-0000-0000-0000-000000000001';

export async function GET() {
    const supabase = await createAdminClient();
    const log: string[] = [];

    try {
        // 1. Check existing suppliers
        const { data: suppliers } = await (supabase.from('suppliers') as any)
            .select('id, name')
            .order('name');

        log.push(`Proveedores existentes: ${suppliers?.map((s: any) => s.name).join(', ')}`);

        // 2. Ensure SIN PROVEEDOR exists
        const sinExists = (suppliers || []).find(
            (s: any) => s.name === 'SIN PROVEEDOR' || s.id === SIN_PROVEEDOR_ID
        );

        if (!sinExists) {
            const { error: insertErr } = await (supabase.from('suppliers') as any).insert({
                id: SIN_PROVEEDOR_ID,
                name: 'SIN PROVEEDOR',
                contact_info: 'Cuentas sin proveedor asignado',
            });

            if (insertErr) {
                log.push(`ERROR creando SIN PROVEEDOR: ${insertErr.message}`);
            } else {
                log.push('✓ SIN PROVEEDOR creado');
            }
        } else {
            log.push(`SIN PROVEEDOR ya existe (id: ${sinExists.id})`);
        }

        const sinId = sinExists?.id || SIN_PROVEEDOR_ID;

        // 3. Count orphan accounts
        const { data: orphans } = await (supabase.from('mother_accounts') as any)
            .select('id')
            .is('supplier_id', null)
            .is('deleted_at', null);

        log.push(`Cuentas sin supplier_id: ${orphans?.length || 0}`);

        // 4. Assign orphans to SIN PROVEEDOR
        if ((orphans?.length || 0) > 0) {
            const { error: updateErr } = await (supabase.from('mother_accounts') as any)
                .update({ supplier_id: sinId, supplier_name: 'SIN PROVEEDOR' })
                .is('supplier_id', null)
                .is('deleted_at', null);

            if (updateErr) {
                log.push(`ERROR asignando huérfanas: ${updateErr.message}`);
            } else {
                log.push(`✓ ${orphans?.length} cuentas asignadas a SIN PROVEEDOR`);
            }
        }

        // 5. Fix mismatched supplier_id/name
        const { data: allSuppliers } = await (supabase.from('suppliers') as any)
            .select('id, name');

        const { data: accountsWithName } = await (supabase.from('mother_accounts') as any)
            .select('id, supplier_id, supplier_name')
            .not('supplier_name', 'is', null)
            .is('deleted_at', null);

        let fixed = 0;
        for (const acc of (accountsWithName || [])) {
            const match = (allSuppliers || []).find(
                (s: any) => s.name.toLowerCase().trim() === (acc.supplier_name || '').toLowerCase().trim()
            );
            if (match && match.id !== acc.supplier_id) {
                await (supabase.from('mother_accounts') as any)
                    .update({ supplier_id: match.id })
                    .eq('id', acc.id);
                fixed++;
            }
        }
        if (fixed > 0) log.push(`✓ ${fixed} supplier_id corregidos por nombre`);

        // 6. Final summary
        const { data: allAccounts } = await (supabase.from('mother_accounts') as any)
            .select('supplier_id')
            .is('deleted_at', null);

        const byId: Record<string, number> = {};
        (allAccounts || []).forEach((a: any) => {
            const k = a.supplier_id || 'NULL';
            byId[k] = (byId[k] || 0) + 1;
        });

        const supplierMap = Object.fromEntries(
            (allSuppliers || []).map((s: any) => [s.id, s.name])
        );
        const summary: Record<string, number> = {};
        for (const [id, count] of Object.entries(byId)) {
            summary[supplierMap[id] || id] = count;
        }

        log.push('Resumen final: ' + JSON.stringify(summary, null, 2));
        log.push('✅ MIGRACIÓN COMPLETADA');

        return NextResponse.json({ ok: true, log });
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err.message, log });
    }
}
