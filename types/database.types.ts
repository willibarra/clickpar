/**
 * ClickPar Database Types
 * Generado del esquema SQL de Supabase
 */

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

// Enum Types
export type UserRole = 'super_admin' | 'staff' | 'customer' | 'affiliate';
export type AccountStatus = 'active' | 'review' | 'dead' | 'expired';
export type SlotStatus = 'available' | 'sold' | 'reserved' | 'warranty_claim';
export type PaymentMethod = 'bank_transfer' | 'tigo_money' | 'binance' | 'cash';

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string;
                    full_name: string | null;
                    phone_number: string | null;
                    role: UserRole;
                    avatar_url: string | null;
                    created_at: string;
                };
                Insert: {
                    id: string;
                    full_name?: string | null;
                    phone_number?: string | null;
                    role?: UserRole;
                    avatar_url?: string | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    full_name?: string | null;
                    phone_number?: string | null;
                    role?: UserRole;
                    avatar_url?: string | null;
                    created_at?: string;
                };
            };
            suppliers: {
                Row: {
                    id: string;
                    name: string;
                    contact_info: string | null;
                    payment_method_preferred: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    name: string;
                    contact_info?: string | null;
                    payment_method_preferred?: string | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    name?: string;
                    contact_info?: string | null;
                    payment_method_preferred?: string | null;
                    created_at?: string;
                };
            };
            mother_accounts: {
                Row: {
                    id: string;
                    supplier_id: string | null;
                    platform: string;
                    email: string;
                    password: string;
                    purchase_cost_usdt: number | null;
                    purchase_cost_gs: number | null;
                    renewal_date: string;
                    target_billing_day: number | null;
                    max_slots: number;
                    status: AccountStatus;
                    supplier_name: string | null;
                    supplier_phone: string | null;
                    sale_price_gs: number | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    supplier_id?: string | null;
                    platform: string;
                    email: string;
                    password: string;
                    purchase_cost_usdt?: number | null;
                    purchase_cost_gs?: number | null;
                    renewal_date: string;
                    target_billing_day?: number | null;
                    max_slots?: number;
                    status?: AccountStatus;
                    supplier_name?: string | null;
                    supplier_phone?: string | null;
                    sale_price_gs?: number | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    supplier_id?: string | null;
                    platform?: string;
                    email?: string;
                    password?: string;
                    purchase_cost_usdt?: number | null;
                    purchase_cost_gs?: number | null;
                    renewal_date?: string;
                    target_billing_day?: number | null;
                    max_slots?: number;
                    status?: AccountStatus;
                    supplier_name?: string | null;
                    supplier_phone?: string | null;
                    sale_price_gs?: number | null;
                    created_at?: string;
                }
            };
            renewals: {
                Row: {
                    id: string;
                    mother_account_id: string;
                    renewal_date: string;
                    purchase_cost_gs: number;
                    expected_slot_price_gs: number;
                    projected_profit_gs: number;
                    actual_profit_gs: number | null;
                    notes: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    mother_account_id: string;
                    renewal_date: string;
                    purchase_cost_gs: number;
                    expected_slot_price_gs: number;
                    projected_profit_gs: number;
                    actual_profit_gs?: number | null;
                    notes?: string | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    mother_account_id?: string;
                    renewal_date?: string;
                    purchase_cost_gs?: number;
                    expected_slot_price_gs?: number;
                    projected_profit_gs?: number;
                    actual_profit_gs?: number | null;
                    notes?: string | null;
                    created_at?: string;
                };
            };
            sale_slots: {
                Row: {
                    id: string;
                    mother_account_id: string;
                    slot_identifier: string | null;
                    pin_code: string | null;
                    status: SlotStatus;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    mother_account_id: string;
                    slot_identifier?: string | null;
                    pin_code?: string | null;
                    status?: SlotStatus;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    mother_account_id?: string;
                    slot_identifier?: string | null;
                    pin_code?: string | null;
                    status?: SlotStatus;
                    updated_at?: string;
                };
            };
            subscriptions: {
                Row: {
                    id: string;
                    customer_id: string | null;
                    slot_id: string | null;
                    start_date: string;
                    end_date: string;
                    sale_price_gs: number;
                    is_active: boolean;
                    auto_renew: boolean;
                    affiliate_referral_id: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    customer_id?: string | null;
                    slot_id?: string | null;
                    start_date?: string;
                    end_date: string;
                    sale_price_gs: number;
                    is_active?: boolean;
                    auto_renew?: boolean;
                    affiliate_referral_id?: string | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    customer_id?: string | null;
                    slot_id?: string | null;
                    start_date?: string;
                    end_date?: string;
                    sale_price_gs?: number;
                    is_active?: boolean;
                    auto_renew?: boolean;
                    affiliate_referral_id?: string | null;
                    created_at?: string;
                };
            };
            transactions: {
                Row: {
                    id: string;
                    customer_id: string | null;
                    amount: number;
                    currency: string;
                    reference_code: string | null;
                    proof_image_url: string | null;
                    status: string;
                    origin_source: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    customer_id?: string | null;
                    amount: number;
                    currency?: string;
                    reference_code?: string | null;
                    proof_image_url?: string | null;
                    status?: string;
                    origin_source?: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    customer_id?: string | null;
                    amount?: number;
                    currency?: string;
                    reference_code?: string | null;
                    proof_image_url?: string | null;
                    status?: string;
                    origin_source?: string;
                    created_at?: string;
                };
            };
            affiliate_codes: {
                Row: {
                    id: string;
                    affiliate_user_id: string | null;
                    code: string;
                    discount_percent: number;
                    commission_percent: number;
                    total_earnings: number;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    affiliate_user_id?: string | null;
                    code: string;
                    discount_percent?: number;
                    commission_percent?: number;
                    total_earnings?: number;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    affiliate_user_id?: string | null;
                    code?: string;
                    discount_percent?: number;
                    commission_percent?: number;
                    total_earnings?: number;
                    created_at?: string;
                };
            };
        };
        Views: {};
        Functions: {};
        Enums: {
            user_role: UserRole;
            account_status: AccountStatus;
            slot_status: SlotStatus;
            payment_method: PaymentMethod;
        };
    };
}

// Helper types for easier usage
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Supplier = Database['public']['Tables']['suppliers']['Row'];
export type MotherAccount = Database['public']['Tables']['mother_accounts']['Row'];
export type SaleSlot = Database['public']['Tables']['sale_slots']['Row'];
export type Subscription = Database['public']['Tables']['subscriptions']['Row'];
export type Transaction = Database['public']['Tables']['transactions']['Row'];
export type AffiliateCode = Database['public']['Tables']['affiliate_codes']['Row'];
