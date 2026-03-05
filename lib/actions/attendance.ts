'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface StaffScheduleData {
    user_id: string;
    monday_start?: string; monday_end?: string;
    tuesday_start?: string; tuesday_end?: string;
    wednesday_start?: string; wednesday_end?: string;
    thursday_start?: string; thursday_end?: string;
    friday_start?: string; friday_end?: string;
    saturday_start?: string; saturday_end?: string;
    sunday_start?: string; sunday_end?: string;
}

export async function getStaffSchedule(userId: string) {
    const supabase = await createAdminClient();
    const { data, error } = await (supabase.from('staff_schedules') as any)
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching staff schedule:', error);
    }
    return data;
}

export async function updateStaffSchedule(data: StaffScheduleData) {
    const supabase = await createAdminClient();

    const { error } = await (supabase.from('staff_schedules') as any)
        .upsert({
            ...data,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

    if (error) {
        return { error: error.message };
    }

    revalidatePath('/settings');
    return { success: true };
}

export async function registerAttendance(userId: string) {
    const supabase = await createAdminClient();
    const today = new Date().toISOString().split('T')[0];

    // Check if attendance exists for today
    const { data: existing } = await (supabase.from('staff_attendance') as any)
        .select('id, first_login_at')
        .eq('user_id', userId)
        .eq('date', today)
        .single();

    if (existing) {
        // Update last_activity
        await (supabase.from('staff_attendance') as any)
            .update({ last_activity_at: new Date().toISOString() })
            .eq('id', existing.id);
        return { isFirstLoginToday: false };
    } else {
        // Create new attendance record
        await (supabase.from('staff_attendance') as any).insert({
            user_id: userId,
            date: today,
            first_login_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString()
        });
        return { isFirstLoginToday: true };
    }
}
