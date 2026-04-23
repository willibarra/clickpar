---
description: WhatsApp integration patterns via Evolution API — messaging, templates, anti-ban, and CRM webhooks
---

# WhatsApp Integration — ClickPar

## Architecture Overview

```
ClickPar (Next.js)
  └── lib/whatsapp.ts (42KB, central module)
        ├── Instance Management (Evolution API)
        ├── Settings & Templates (Supabase tables)
        ├── Template Rendering (variable substitution)
        ├── Message Sending (with anti-ban)
        ├── High-Level Functions (credentials, renewals, tickets)
        └── N8N Integration (AI-powered renewal messages)

Evolution API (external)
  └── Manages WhatsApp Web sessions (Baileys)
  └── Exposes REST API for sending/receiving

Webhook: /api/whatsapp/webhook
  └── Receives incoming messages from Evolution API
  └── Routes to internal CRM (conversations/messages tables)
```

## Key Configuration

| Env Variable | Purpose |
|-------------|---------|
| `EVOLUTION_API_URL` | Evolution API base URL |
| `EVOLUTION_API_KEY` | API authentication key |
| `N8N_RENEWAL_WEBHOOK_URL` | N8N webhook for AI renewal messages |
| `STAFF_ALERT_PHONE` | Fallback phone for staff notifications |

## Dual Instance System

ClickPar uses TWO WhatsApp instances for load distribution and anti-ban:

- `instance_1_name` / `instance_2_name` — Configured in `whatsapp_settings` table
- **Send modes**: `alternate` (round-robin), `instance-1` (fixed), `instance-2` (fixed)
- **Customer binding**: First message to a customer "seals" them to an instance via `customers.whatsapp_instance`
- **Auto-fallback**: If preferred instance is disconnected, system falls back to the other

## Anti-Ban Protection

```
1. Rate Limiting: Max messages per hour (checkHourlyLimit)
2. Random Delay: 8-25 seconds between messages (waitForRandomDelay)
3. Instance Rotation: Alternate between two numbers
4. Phone Whitelist: Can restrict to test numbers during development
5. Logging: All sends tracked in whatsapp_send_log
```

## Message Templates

Templates are stored in `whatsapp_templates` table with:
- `key`: Template identifier (e.g., `venta_credenciales`)
- `variant`: Multiple variants per key for rotation
- `message`: Template text with `{variable}` placeholders
- `enabled`: Toggle per variant

### Available Template Keys

| Key | Used for | Variables |
|-----|---------|-----------|
| `venta_credenciales` | Sale credentials delivery | `{nombre}`, `{plataforma}`, `{email}`, `{password}`, `{perfil}`, `{pin}`, `{fecha_vencimiento}` |
| `familia_credenciales` | Family account credentials | `{nombre}`, `{plataforma}`, `{email}`, `{password}`, `{fecha_vencimiento}` |
| `familia_invitacion` | Family invite (no password) | `{nombre}`, `{plataforma}`, `{email}`, `{fecha_vencimiento}` |
| `pre_vencimiento` | Pre-expiry reminder | `{nombre}`, `{plataforma}`, `{fecha_vencimiento}`, `{dias_restantes}`, `{precio}` |
| `vencimiento_hoy` | Expiry today | `{nombre}`, `{plataforma}`, `{precio}` |
| `vencimiento_vencido` | Already expired | `{nombre}`, `{plataforma}`, `{fecha_vencimiento}`, `{precio}` |
| `credenciales_actualizadas` | Credential change notice | `{nombre}`, `{plataforma}`, `{email}`, `{password}`, `{perfil}`, `{pin}` |

### Template Rendering Rules
1. `{nombre}` is auto-normalized: pure numbers → `#XXX` (last 3 digits), otherwise → first word only
2. Lines with empty variables are removed entirely (e.g., no PIN = no PIN line)
3. Consecutive blank lines collapsed to one
4. Variant rotation is persisted in `app_config` table (round-robin)

## High-Level Send Functions

```typescript
// Sale credentials → customer
sendSaleCredentials({ customerPhone, customerName, platform, email, password, profile, pin?, expirationDate, ... })

// Family credentials (we created the account)
sendFamilyCredentials({ customerPhone, customerName, platform, clientEmail, clientPassword, expirationDate, ... })

// Family invite (customer's own account)
sendFamilyInvite({ customerPhone, customerName, platform, clientEmail, expirationDate, ... })

// Renewal reminders
sendPreExpiryReminder({ ..., daysRemaining, price })
sendExpiryNotification({ ..., price })
sendExpiredNotification({ ..., expirationDate, price })

// Credential updates to all active users of a mother account
notifyAccountCredentialChange({ motherAccountId, newEmail, newPassword })
// → Only sends to customers who are NOT overdue (endDate >= today)

// Support tickets
sendTicketConfirmation({ customerPhone, customerName, ticketId })
sendTicketResolved({ ..., resolucion })
sendStaffTicketAlert({ ticketId, customerName, customerPhone, platform, tipo, descripcion, canal })
```

## Whitelist System (Development)
- Controlled via `app_config` keys: `phone_whitelist` (comma-separated) + `wa_whitelist_enabled` (true/false)
- When enabled, only whitelisted phones receive automated messages
- 30-second in-memory cache to avoid per-message DB hits
- Fail-open on errors (messages are sent if whitelist check fails)

## Platform Display Names
- `getPlatformDisplayName(platformName)` resolves the first nickname from `platforms` table
- Used in all templates to show friendly names (e.g., "Nefi" instead of "Netflix")

## CRM Webhook Flow
```
Evolution API → POST /api/whatsapp/webhook
  → Parse incoming message
  → Upsert conversation in 'conversations' table
  → Insert message in 'messages' table
  → Match customer by phone number
  → Display in internal CRM dashboard (/chatbot)
```

## Renewal Pipeline (3-phase cron)
```
Phase 1: /api/cron/queue-messages     → Identify expiring sales, create queue
Phase 2: /api/cron/compose-messages   → Render templates with variables
Phase 3: /api/cron/send-messages      → Deliver via sendText() with anti-ban delays
```

Alternative: N8N webhook for AI-generated renewal messages (`sendRenewalToN8N()`)

## Common Pitfalls
1. **Never skip anti-ban**: Always use `sendText()` which includes rate limiting and delays. Direct Evolution API calls bypass protections.
2. **Phone format**: Use `normalizePhone()` — accepts `0973...`, `595973...`, `+595973...` → outputs `595973...`
3. **Template not found**: If `getRenderedTemplate()` returns null, the template key doesn't exist or all variants are disabled. Functions should have fallback messages.
4. **Instance binding**: Once a customer is bound to an instance, subsequent messages use that instance. Reset by clearing `customers.whatsapp_instance`.
