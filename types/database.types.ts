/**
 * ClickPar Database Types
 * Generado del esquema SQL de Supabase + migraciones
 * Última actualización: 2026-03-16
 */

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

// ==========================================
// Enum Types
// ==========================================

export type UserRole = 'super_admin' | 'staff' | 'customer' | 'affiliate' | 'vendedor' | 'proveedor';
export type AccountStatus = 'active' | 'review' | 'dead' | 'expired' | 'frozen' | 'quarantine';
export type SlotStatus = 'available' | 'sold' | 'reserved' | 'warranty_claim';
export type PaymentMethod = 'bank_transfer' | 'tigo_money' | 'binance' | 'cash';
export type SalePaymentMethod = 'cash' | 'transfer' | 'qr' | 'other';
export type PlatformBusinessType = 'family_account' | 'profile_sharing';

// ==========================================
// Database Interface
// ==========================================

export interface Database {
    public: {
        Tables: {
            // ──────────────────────────────
            // PROFILES
            // ──────────────────────────────
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

            // ──────────────────────────────
            // SUPPLIERS
            // ──────────────────────────────
            suppliers: {
                Row: {
                    id: string;
                    name: string;
                    contact_info: string | null;
                    payment_method_preferred: string | null;
                    phone: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    name: string;
                    contact_info?: string | null;
                    payment_method_preferred?: string | null;
                    phone?: string | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    name?: string;
                    contact_info?: string | null;
                    payment_method_preferred?: string | null;
                    phone?: string | null;
                    created_at?: string;
                };
            };

            // ──────────────────────────────
            // MOTHER ACCOUNTS (Inventario)
            // ──────────────────────────────
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
                    slot_price_gs: number | null;
                    default_slot_price_gs: number | null;
                    notes: string | null;
                    sale_type: string | null;
                    instructions: string | null;
                    send_instructions: boolean;
                    is_autopay: boolean;
                    autopay_last_checked: string | null;
                    invitation_url: string | null;
                    invite_address: string | null;
                    quarantined_at: string | null;
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
                    slot_price_gs?: number | null;
                    default_slot_price_gs?: number | null;
                    notes?: string | null;
                    sale_type?: string | null;
                    instructions?: string | null;
                    send_instructions?: boolean;
                    is_autopay?: boolean;
                    autopay_last_checked?: string | null;
                    invitation_url?: string | null;
                    invite_address?: string | null;
                    quarantined_at?: string | null;
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
                    slot_price_gs?: number | null;
                    default_slot_price_gs?: number | null;
                    notes?: string | null;
                    sale_type?: string | null;
                    instructions?: string | null;
                    send_instructions?: boolean;
                    is_autopay?: boolean;
                    autopay_last_checked?: string | null;
                    invitation_url?: string | null;
                    invite_address?: string | null;
                    quarantined_at?: string | null;
                    created_at?: string;
                };
            };

            // ──────────────────────────────
            // SALE SLOTS
            // ──────────────────────────────
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

            // ──────────────────────────────
            // CUSTOMERS
            // ──────────────────────────────
            customers: {
                Row: {
                    id: string;
                    full_name: string;
                    phone: string | null;
                    email: string | null;
                    notes: string | null;
                    customer_type: string;
                    portal_password: string | null;
                    whatsapp_instance: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    full_name: string;
                    phone?: string | null;
                    email?: string | null;
                    notes?: string | null;
                    customer_type?: string;
                    portal_password?: string | null;
                    whatsapp_instance?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    full_name?: string;
                    phone?: string | null;
                    email?: string | null;
                    notes?: string | null;
                    customer_type?: string;
                    portal_password?: string | null;
                    whatsapp_instance?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
            };

            // ──────────────────────────────
            // SALES (reemplaza subscriptions)
            // ──────────────────────────────
            sales: {
                Row: {
                    id: string;
                    slot_id: string | null;
                    customer_id: string | null;
                    amount_gs: number;
                    payment_method: string;
                    billing_cycle_day: number | null;
                    start_date: string;
                    end_date: string | null;
                    is_active: boolean;
                    is_canje: boolean;
                    notes: string | null;
                    sold_by: string | null;
                    bundle_id: string | null;
                    override_price: boolean;
                    original_price_gs: number | null;
                    whatsapp_instance: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    slot_id?: string | null;
                    customer_id?: string | null;
                    amount_gs: number;
                    payment_method?: string;
                    billing_cycle_day?: number | null;
                    start_date?: string;
                    end_date?: string | null;
                    is_active?: boolean;
                    is_canje?: boolean;
                    notes?: string | null;
                    sold_by?: string | null;
                    bundle_id?: string | null;
                    override_price?: boolean;
                    original_price_gs?: number | null;
                    whatsapp_instance?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    slot_id?: string | null;
                    customer_id?: string | null;
                    amount_gs?: number;
                    payment_method?: string;
                    billing_cycle_day?: number | null;
                    start_date?: string;
                    end_date?: string | null;
                    is_active?: boolean;
                    is_canje?: boolean;
                    notes?: string | null;
                    sold_by?: string | null;
                    bundle_id?: string | null;
                    override_price?: boolean;
                    original_price_gs?: number | null;
                    whatsapp_instance?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
            };

            // ──────────────────────────────
            // RENEWALS
            // ──────────────────────────────
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

            // ──────────────────────────────
            // TRANSACTIONS
            // ──────────────────────────────
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

            // ──────────────────────────────
            // AFFILIATE CODES
            // ──────────────────────────────
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

            // ──────────────────────────────
            // BUNDLES (Combos)
            // ──────────────────────────────
            bundles: {
                Row: {
                    id: string;
                    name: string;
                    description: string | null;
                    price_gs: number;
                    original_price_gs: number | null;
                    discount_percent: number;
                    is_active: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    name: string;
                    description?: string | null;
                    price_gs: number;
                    original_price_gs?: number | null;
                    discount_percent?: number;
                    is_active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    name?: string;
                    description?: string | null;
                    price_gs?: number;
                    original_price_gs?: number | null;
                    discount_percent?: number;
                    is_active?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
            };

            // ──────────────────────────────
            // BUNDLE ITEMS
            // ──────────────────────────────
            bundle_items: {
                Row: {
                    id: string;
                    bundle_id: string;
                    platform: string;
                    slot_count: number;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    bundle_id: string;
                    platform: string;
                    slot_count?: number;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    bundle_id?: string;
                    platform?: string;
                    slot_count?: number;
                    created_at?: string;
                };
            };

            // ──────────────────────────────
            // EXPENSES
            // ──────────────────────────────
            expenses: {
                Row: {
                    id: string;
                    mother_account_id: string | null;
                    description: string;
                    amount_gs: number;
                    expense_type: string;
                    expense_date: string;
                    notes: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    mother_account_id?: string | null;
                    description: string;
                    amount_gs: number;
                    expense_type?: string;
                    expense_date?: string;
                    notes?: string | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    mother_account_id?: string | null;
                    description?: string;
                    amount_gs?: number;
                    expense_type?: string;
                    expense_date?: string;
                    notes?: string | null;
                    created_at?: string;
                };
            };

            // ──────────────────────────────
            // PLATFORMS
            // ──────────────────────────────
            platforms: {
                Row: {
                    id: string;
                    name: string;
                    slug: string;
                    business_type: PlatformBusinessType;
                    icon_color: string;
                    default_max_slots: number;
                    default_slot_price_gs: number;
                    slot_label: string;
                    nicknames: string[] | null;
                    is_active: boolean;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    name: string;
                    slug: string;
                    business_type?: PlatformBusinessType;
                    icon_color?: string;
                    default_max_slots?: number;
                    default_slot_price_gs?: number;
                    slot_label?: string;
                    nicknames?: string[] | null;
                    is_active?: boolean;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    name?: string;
                    slug?: string;
                    business_type?: PlatformBusinessType;
                    icon_color?: string;
                    default_max_slots?: number;
                    default_slot_price_gs?: number;
                    slot_label?: string;
                    nicknames?: string[] | null;
                    is_active?: boolean;
                    created_at?: string;
                };
            };

            // ──────────────────────────────
            // WHATSAPP SETTINGS
            // ──────────────────────────────
            whatsapp_settings: {
                Row: {
                    id: string;
                    send_mode: string;
                    instance_1_name: string;
                    instance_2_name: string;
                    instance_1_alias: string;
                    instance_2_alias: string;
                    auto_send_credentials: boolean;
                    auto_send_pre_expiry: boolean;
                    auto_send_expiry: boolean;
                    auto_send_credential_change: boolean;
                    pre_expiry_days: number;
                    batch_send_interval_seconds: number;
                    updated_at: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    send_mode?: string;
                    instance_1_name?: string;
                    instance_2_name?: string;
                    instance_1_alias?: string;
                    instance_2_alias?: string;
                    auto_send_credentials?: boolean;
                    auto_send_pre_expiry?: boolean;
                    auto_send_expiry?: boolean;
                    auto_send_credential_change?: boolean;
                    pre_expiry_days?: number;
                    batch_send_interval_seconds?: number;
                    updated_at?: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    send_mode?: string;
                    instance_1_name?: string;
                    instance_2_name?: string;
                    instance_1_alias?: string;
                    instance_2_alias?: string;
                    auto_send_credentials?: boolean;
                    auto_send_pre_expiry?: boolean;
                    auto_send_expiry?: boolean;
                    auto_send_credential_change?: boolean;
                    pre_expiry_days?: number;
                    batch_send_interval_seconds?: number;
                    updated_at?: string;
                    created_at?: string;
                };
            };

            // ──────────────────────────────
            // WHATSAPP TEMPLATES
            // ──────────────────────────────
            whatsapp_templates: {
                Row: {
                    id: string;
                    key: string;
                    name: string;
                    message: string;
                    enabled: boolean;
                    variant: number;
                    updated_at: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    key: string;
                    name: string;
                    message: string;
                    enabled?: boolean;
                    variant?: number;
                    updated_at?: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    key?: string;
                    name?: string;
                    message?: string;
                    enabled?: boolean;
                    variant?: number;
                    updated_at?: string;
                    created_at?: string;
                };
            };

            // ──────────────────────────────
            // WHATSAPP SEND LOG
            // ──────────────────────────────
            whatsapp_send_log: {
                Row: {
                    id: string;
                    template_key: string | null;
                    phone: string;
                    message: string;
                    instance_used: string;
                    status: string;
                    customer_id: string | null;
                    sale_id: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    template_key?: string | null;
                    phone: string;
                    message: string;
                    instance_used: string;
                    status?: string;
                    customer_id?: string | null;
                    sale_id?: string | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    template_key?: string | null;
                    phone?: string;
                    message?: string;
                    instance_used?: string;
                    status?: string;
                    customer_id?: string | null;
                    sale_id?: string | null;
                    created_at?: string;
                };
            };

            // ──────────────────────────────
            // NOTIFICATIONS
            // ──────────────────────────────
            notifications: {
                Row: {
                    id: string;
                    type: string;
                    message: string;
                    is_read: boolean;
                    is_resolved: boolean;
                    related_resource_id: string | null;
                    related_resource_type: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    type: string;
                    message: string;
                    is_read?: boolean;
                    is_resolved?: boolean;
                    related_resource_id?: string | null;
                    related_resource_type?: string | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    type?: string;
                    message?: string;
                    is_read?: boolean;
                    is_resolved?: boolean;
                    related_resource_id?: string | null;
                    related_resource_type?: string | null;
                    created_at?: string;
                };
            };

            // ──────────────────────────────
            // AUDIT LOG
            // ──────────────────────────────
            audit_log: {
                Row: {
                    id: string;
                    user_id: string | null;
                    action: string;
                    resource_type: string;
                    resource_id: string | null;
                    details: Json;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    user_id?: string | null;
                    action: string;
                    resource_type: string;
                    resource_id?: string | null;
                    details?: Json;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string | null;
                    action?: string;
                    resource_type?: string;
                    resource_id?: string | null;
                    details?: Json;
                    created_at?: string;
                };
            };

            // ──────────────────────────────
            // APP CONFIG
            // ──────────────────────────────
            app_config: {
                Row: {
                    key: string;
                    value: string;
                    label: string | null;
                    updated_at: string;
                };
                Insert: {
                    key: string;
                    value: string;
                    label?: string | null;
                    updated_at?: string;
                };
                Update: {
                    key?: string;
                    value?: string;
                    label?: string | null;
                    updated_at?: string;
                };
            };

            // ──────────────────────────────
            // PAYMENT METHODS
            // ──────────────────────────────
            payment_methods: {
                Row: {
                    id: string;
                    name: string;
                    key: string;
                    instructions: string;
                    emoji: string;
                    is_active: boolean;
                    sort_order: number;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    name: string;
                    key: string;
                    instructions: string;
                    emoji?: string;
                    is_active?: boolean;
                    sort_order?: number;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    name?: string;
                    key?: string;
                    instructions?: string;
                    emoji?: string;
                    is_active?: boolean;
                    sort_order?: number;
                    created_at?: string;
                };
            };

            // ──────────────────────────────
            // PROVIDER SUPPORT CONFIG
            // ──────────────────────────────
            provider_support_config: {
                Row: {
                    id: string;
                    platform: string;
                    supplier_name: string;
                    code_url: string | null;
                    support_instructions: string | null;
                    needs_code: boolean;
                    telegram_bot_username: string | null;
                    telegram_user_identifier: string | null;
                    telegram_account_field: string;
                    code_source: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    platform: string;
                    supplier_name: string;
                    code_url?: string | null;
                    support_instructions?: string | null;
                    needs_code?: boolean;
                    telegram_bot_username?: string | null;
                    telegram_user_identifier?: string | null;
                    telegram_account_field?: string;
                    code_source?: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    platform?: string;
                    supplier_name?: string;
                    code_url?: string | null;
                    support_instructions?: string | null;
                    needs_code?: boolean;
                    telegram_bot_username?: string | null;
                    telegram_user_identifier?: string | null;
                    telegram_account_field?: string;
                    code_source?: string;
                    created_at?: string;
                };
            };

            // ──────────────────────────────
            // GMAIL TOKENS
            // ──────────────────────────────
            gmail_tokens: {
                Row: {
                    id: string;
                    email: string;
                    refresh_token: string;
                    access_token: string | null;
                    expires_at: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    email: string;
                    refresh_token: string;
                    access_token?: string | null;
                    expires_at?: string | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    email?: string;
                    refresh_token?: string;
                    access_token?: string | null;
                    expires_at?: string | null;
                    created_at?: string;
                };
            };

            // ──────────────────────────────
            // OWNED EMAILS
            // ──────────────────────────────
            owned_emails: {
                Row: {
                    id: string;
                    email: string;
                    password: string | null;
                    provider: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    email: string;
                    password?: string | null;
                    provider?: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    email?: string;
                    password?: string | null;
                    provider?: string;
                    created_at?: string;
                };
            };
        };
        Views: {};
        Functions: {
            get_dashboard_stats: {
                Args: Record<string, never>;
                Returns: Json;
            };
            get_expiring_accounts: {
                Args: { days_ahead?: number };
                Returns: {
                    id: string;
                    platform: string;
                    email: string;
                    renewal_date: string;
                    days_until_expiry: number;
                    available_slots: number;
                    total_slots: number;
                }[];
            };
            omnisearch: {
                Args: {
                    search_term: string;
                    search_type?: string;
                    result_limit?: number;
                };
                Returns: Json;
            };
            get_best_slot_for_sale: {
                Args: {
                    target_platform: string;
                    target_billing_day?: number | null;
                };
                Returns: {
                    slot_id: string;
                    mother_account_id: string;
                    account_email: string;
                    slot_identifier: string;
                    renewal_date: string;
                    slot_price_gs: number;
                }[];
            };
            get_customer_ranking: {
                Args: { result_limit?: number };
                Returns: {
                    customer_id: string;
                    full_name: string;
                    phone: string;
                    total_spent: number;
                    total_purchases: number;
                    last_purchase: string;
                }[];
            };
        };
        Enums: {
            user_role: UserRole;
            account_status: AccountStatus;
            slot_status: SlotStatus;
            payment_method: PaymentMethod;
            sale_payment_method: SalePaymentMethod;
            platform_business_type: PlatformBusinessType;
        };
    };
}

// ==========================================
// Helper types for easier usage
// ==========================================

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Supplier = Database['public']['Tables']['suppliers']['Row'];
export type MotherAccount = Database['public']['Tables']['mother_accounts']['Row'];
export type SaleSlot = Database['public']['Tables']['sale_slots']['Row'];
export type Customer = Database['public']['Tables']['customers']['Row'];
export type Sale = Database['public']['Tables']['sales']['Row'];
export type Renewal = Database['public']['Tables']['renewals']['Row'];
export type Transaction = Database['public']['Tables']['transactions']['Row'];
export type AffiliateCode = Database['public']['Tables']['affiliate_codes']['Row'];
export type Bundle = Database['public']['Tables']['bundles']['Row'];
export type BundleItem = Database['public']['Tables']['bundle_items']['Row'];
export type Expense = Database['public']['Tables']['expenses']['Row'];
export type Platform = Database['public']['Tables']['platforms']['Row'];
export type WhatsAppSetting = Database['public']['Tables']['whatsapp_settings']['Row'];
export type WhatsAppTemplate = Database['public']['Tables']['whatsapp_templates']['Row'];
export type WhatsAppSendLog = Database['public']['Tables']['whatsapp_send_log']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];
export type AuditLog = Database['public']['Tables']['audit_log']['Row'];
export type AppConfig = Database['public']['Tables']['app_config']['Row'];
export type PaymentMethodRow = Database['public']['Tables']['payment_methods']['Row'];
export type ProviderSupportConfig = Database['public']['Tables']['provider_support_config']['Row'];
export type GmailToken = Database['public']['Tables']['gmail_tokens']['Row'];
export type OwnedEmail = Database['public']['Tables']['owned_emails']['Row'];

// Code Requests (Telegram verification codes)
export interface CodeRequest {
    id: string;
    sale_id: string;
    customer_id: string;
    platform: string;
    account_email: string;
    supplier_name: string | null;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
    code: string | null;
    resolved_by: string | null;
    resolved_at: string | null;
    auto_source: string;
    telegram_bot_username: string | null;
    telegram_user_identifier: string | null;
    notes: string | null;
    expires_at: string;
    created_at: string;
    updated_at: string;
}

// Legacy alias (subscriptions → sales)
/** @deprecated Use Sale instead */
export type Subscription = Sale;
