import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/reset-test-user
 * Resets the test customer user and creates a test sale for portal testing.
 */
export async function GET(req: NextRequest) {
    const supabase = await createAdminClient();

    const TEST_EMAIL = 'cliente@clickpar.com';
    const TEST_PASSWORD = 'Admin123!';
    const TEST_PHONE = '0981999888';
    const TEST_NAME = 'Cliente Test';

    try {
        // 1. Check if user exists in auth
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existingUser = users?.find((u: any) => u.email === TEST_EMAIL);

        let userId: string;

        if (existingUser) {
            userId = existingUser.id;
            // Reset password
            await supabase.auth.admin.updateUserById(userId, {
                password: TEST_PASSWORD,
                email_confirm: true,
            });
        } else {
            // Create new auth user
            const { data: newUser, error: authError } = await supabase.auth.admin.createUser({
                email: TEST_EMAIL,
                password: TEST_PASSWORD,
                email_confirm: true,
            });
            if (authError) throw new Error(`Auth create error: ${authError.message}`);
            userId = newUser.user.id;
        }

        // 2. Upsert profile
        await (supabase.from('profiles') as any).upsert({
            id: userId,
            full_name: TEST_NAME,
            phone_number: TEST_PHONE,
            role: 'customer',
        }, { onConflict: 'id' });

        // 3. Find or create customer record
        const { data: existingCustomer } = await (supabase.from('customers') as any)
            .select('id')
            .eq('phone', TEST_PHONE)
            .single();

        let customerId: string;
        if (existingCustomer) {
            customerId = existingCustomer.id;
        } else {
            const { data: newCustomer, error: custError } = await (supabase.from('customers') as any)
                .insert({
                    full_name: TEST_NAME,
                    phone: TEST_PHONE,
                    email: TEST_EMAIL,
                    notes: 'Test customer for portal development',
                })
                .select('id')
                .single();
            if (custError) throw new Error(`Customer create error: ${custError.message}`);
            customerId = newCustomer.id;
        }

        // 4. Check if test sale already exists
        const { data: existingSales } = await (supabase.from('sales') as any)
            .select('id')
            .eq('customer_id', customerId)
            .eq('is_active', true);

        let saleInfo = 'existing';

        if (!existingSales || existingSales.length === 0) {
            // Find an available slot to create a test sale
            const { data: availableSlots } = await (supabase.from('sale_slots') as any)
                .select('id, slot_identifier, mother_accounts:mother_account_id(platform, email)')
                .eq('status', 'available')
                .limit(1);

            if (availableSlots && availableSlots.length > 0) {
                const slot = availableSlots[0];
                const startDate = new Date();
                const endDate = new Date();
                endDate.setDate(endDate.getDate() + 30);

                await (supabase.from('sales') as any).insert({
                    customer_id: customerId,
                    slot_id: slot.id,
                    amount_gs: 25000,
                    start_date: startDate.toISOString().split('T')[0],
                    end_date: endDate.toISOString().split('T')[0],
                    is_active: true,
                    payment_method: 'cash',
                });

                await (supabase.from('sale_slots') as any)
                    .update({ status: 'sold' })
                    .eq('id', slot.id);

                saleInfo = `created for ${slot.mother_accounts?.platform || 'unknown'}`;
            } else {
                saleInfo = 'no available slots — no sale created';
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Test user reset successfully',
            user: {
                email: TEST_EMAIL,
                password: TEST_PASSWORD,
                phone: TEST_PHONE,
                userId,
                customerId,
            },
            sale: saleInfo,
        });
    } catch (error: any) {
        console.error('[ResetTestUser]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
