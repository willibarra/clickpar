'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * Obtiene todas las plataformas activas
 */
export async function getPlatforms() {
    const supabase = await createClient();

    const { data, error } = await (supabase.from('platforms') as any)
        .select('*')
        .eq('is_active', true)
        .order('name');

    if (error) {
        console.error('Error fetching platforms:', error);
        return [];
    }

    return data || [];
}

/**
 * Crea una nueva plataforma o reactiva una existente
 */
export async function createPlatform(formData: FormData) {
    const supabase = await createClient();

    const name = formData.get('name') as string;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const data: Record<string, any> = {
        name,
        slug,
        business_type: formData.get('business_type') as string || 'profile_sharing',
        icon_color: formData.get('icon_color') as string || '#666666',
        default_max_slots: parseInt(formData.get('default_max_slots') as string) || 5,
        default_slot_price_gs: parseFloat(formData.get('default_slot_price_gs') as string) || 30000,
        slot_label: formData.get('slot_label') as string || 'Perfil',
        is_active: true,
    };

    // Parse nicknames from JSON
    const nicknamesStr = formData.get('nicknames') as string;
    if (nicknamesStr) {
        try {
            data.nicknames = JSON.parse(nicknamesStr);
        } catch { data.nicknames = []; }
    }

    // Store alias
    const storeAlias = formData.get('store_alias') as string;
    data.store_alias = storeAlias || null;

    // Check if there's an inactive platform with the same name (previously deleted)
    const { data: existing } = await (supabase.from('platforms') as any)
        .select('id')
        .eq('name', name)
        .eq('is_active', false)
        .single();

    if (existing) {
        // Reactivate the existing platform with new data
        const { error } = await (supabase.from('platforms') as any)
            .update(data)
            .eq('id', existing.id);

        if (error) {
            return { error: error.message };
        }
    } else {
        // Create new platform
        const { error } = await (supabase.from('platforms') as any).insert(data);

        if (error) {
            if (error.code === '23505') { // Unique violation
                return { error: 'Ya existe una plataforma con ese nombre' };
            }
            return { error: error.message };
        }
    }

    revalidatePath('/inventory');
    revalidatePath('/settings');
    return { success: true };
}

/**
 * Actualiza una plataforma existente
 */
export async function updatePlatform(id: string, formData: FormData) {
    const supabase = await createClient();

    const data: Record<string, any> = {};

    const name = formData.get('name');
    if (name) {
        data.name = name;
        data.slug = (name as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    const businessType = formData.get('business_type');
    if (businessType) data.business_type = businessType;

    const iconColor = formData.get('icon_color');
    if (iconColor) data.icon_color = iconColor;

    const defaultMaxSlots = formData.get('default_max_slots');
    if (defaultMaxSlots) data.default_max_slots = parseInt(defaultMaxSlots as string);

    const defaultSlotPriceGs = formData.get('default_slot_price_gs');
    if (defaultSlotPriceGs) data.default_slot_price_gs = parseFloat(defaultSlotPriceGs as string);

    const slotLabel = formData.get('slot_label');
    if (slotLabel) data.slot_label = slotLabel;

    const nicknamesStr = formData.get('nicknames') as string;
    if (nicknamesStr) {
        try {
            data.nicknames = JSON.parse(nicknamesStr);
        } catch { data.nicknames = []; }
    }

    // Store alias
    const storeAlias = formData.get('store_alias') as string;
    if (storeAlias !== undefined && storeAlias !== null) {
        data.store_alias = storeAlias || null;
    }

    const { error } = await (supabase.from('platforms') as any)
        .update(data)
        .eq('id', id);

    if (error) {
        return { error: error.message };
    }

    revalidatePath('/inventory');
    revalidatePath('/settings');
    return { success: true };
}

/**
 * Desactiva una plataforma (soft delete)
 */
export async function deletePlatform(id: string) {
    const supabase = await createClient();

    const { error } = await (supabase.from('platforms') as any)
        .update({ is_active: false })
        .eq('id', id);

    if (error) {
        return { error: error.message };
    }

    revalidatePath('/inventory');
    revalidatePath('/settings');
    return { success: true };
}
