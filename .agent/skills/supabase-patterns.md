---
description: Schema rules, anti-patterns, and data access conventions for ClickPar's Supabase database
---

# Supabase Patterns — ClickPar

## 🔴 CRITICAL ANTI-PATTERNS (Will cause DB errors)

These columns DO NOT EXIST. Never reference them:

| Table | Non-existent column | Common mistake |
|-------|---------------------|----------------|
| `sales` | `notes` | Trying to store transaction notes |
| `sales` | `end_date` | Use `start_date` + billing_cycle to calculate expiration |
| `sale_slots` | `customer_id` | Slot↔Customer link is via `sales` table only |

## Authoritative Data Source

- **Active services**: Always query `sales` with `is_active = true`. NEVER use the `subscriptions` view (legacy, often stale/empty).
- **Customer data**: Always use `customers` table, NOT `profiles`. The `profiles` table is for IAM (system users) only.

## Core Tables & Confirmed Columns

### `customers`
`id`, `full_name`, `phone`, `email`, `notes`, `created_at`, `whatsapp_instance`, `wallet_balance`

> ⚠️ Phone field is `phone` (not `phone_number` like in `profiles`)

### `sales`
`id`, `slot_id`, `customer_id`, `amount_gs`, `payment_method`, `billing_cycle_day`, `start_date`, `is_active`, `created_at`, `sold_by`, `bundle_id`, `override_price`, `original_price_gs`

> ⚠️ No `notes`, no `end_date`. Expiration = `start_date` + 30 days (or billing_cycle_day logic)

### `sale_slots`
`id`, `mother_account_id`, `slot_identifier`, `pin_code`, `status`, `created_at`

> ⚠️ No `customer_id`. Link to customer is through `sales.slot_id` → `sales.customer_id`

### `mother_accounts`
`id`, `platform`, `email`, `password`, `max_slots`, `status`, `renewal_date`, `amount_gs`, `target_billing_day`, `supplier_id`, `notes`, `created_at`

### `expenses`
`id`, `description`, `amount_gs`, `mother_account_id`, `created_at`

### `profiles` (IAM only)
`id`, `full_name`, `phone_number`, `role`, `avatar_url`, `created_at`

## Enums

```
user_role: super_admin, staff, customer, affiliate, vendedor, proveedor
account_status: active, review, dead, expired
slot_status: available, sold, reserved, warranty_claim
payment_method: bank_transfer, tigo_money, binance, cash
```

## Data Access Patterns

### Server Actions (Admin access)
```typescript
import { createAdminClient } from '@/lib/supabase/server';

// For admin operations that bypass RLS
const supabase = await createAdminClient();
```

### Client Components (RLS-restricted)
```typescript
import { createClient } from '@/lib/supabase/client';

// Client-side queries are restricted by RLS policies
const supabase = createClient();
```

### Untyped Escape Hatch (for new/volatile tables)
When the central `database.types.ts` hasn't been updated yet:
```typescript
// Cast to any to bypass TypeScript errors
const { data } = await (supabase as any).from('new_table').select('*');
```

## RPC Functions Available
- `get_dashboard_stats()` → JSON with balance, active accounts, slots, P&L
- `get_expiring_accounts(days_ahead)` → Mother accounts near renewal
- `omnisearch(search_term, search_type)` → Fuzzy search via `pg_trgm`
- `get_customer_ranking(result_limit)` → Top customers by `total_spent`

## Additional Tables (WhatsApp/Config)
- `whatsapp_settings` — Instance config, send modes, automation toggles
- `whatsapp_templates` — Message templates with key, variant, enabled flag
- `whatsapp_send_log` — Message delivery log with anti-ban metadata
- `app_config` — Key-value store for runtime settings (whitelist, rotation counters)
- `platforms` — Service definitions with nicknames, colors, business models
- `bundles` / `bundle_items` — Combo package definitions
- `conversations` / `messages` — Internal CRM messaging
- `tickets` — Customer support tickets

## RLS Rules Summary
- `super_admin` / `staff` → Full access
- `customer` → Own profile and subscriptions only
- `vendedor` / `proveedor` → Expanding policies
- For admin inventory views, use Server Actions with `createAdminClient` (not client-side queries)
