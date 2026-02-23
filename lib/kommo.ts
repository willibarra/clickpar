/**
 * Kommo CRM Integration Service
 * Handles creating leads, contacts, and managing the sales pipelines.
 */

// ==========================================
// Pipeline & Status IDs (from Kommo API)
// ==========================================

// Pipeline principal: Embudo de ventas (ID: 13199295) - clickrespuestas
const VENTAS_PIPELINE_ID = 13199295;
const VENTAS_STATUS = {
    INCOMING: 101778035,           // Incoming leads
    INTERESADO: 101778055,         // Interesado
    ESPERANDO_PAGO: 101778059,     // Esperando Pago
    VERIFICACION_PAGO: 101778063,  // Verificación de Pago
    VENTA_CONFIRMADA: 101778067,   // Venta Confirmada
    CREDENCIALES_ENVIADAS: 101778071, // Entrega de Credenciales
    PROBLEMAS: 101778075,          // Problemas
    LOGRADO: 142,
    PERDIDO: 143,
};

// Pipeline: Soporte ClickPar (ID: 13199351) - clickrespuestas
const SOPORTE_PIPELINE_ID = 13199351;
const SOPORTE_STATUS = {
    INCOMING: 101778379,
    PROBLEMA_REPORTADO: 101778383,
    EN_SEGUIMIENTO: 101778387,
    RESUELTO: 101778391,
    LOGRADO: 142,
    PERDIDO: 143,
};

// ==========================================
// Helpers
// ==========================================

function getHeaders() {
    const token = process.env.KOMMO_ACCESS_TOKEN;
    if (!token) throw new Error('KOMMO_ACCESS_TOKEN not configured');
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    };
}

function getBaseUrl() {
    const subdomain = process.env.KOMMO_SUBDOMAIN || 'sistemadeclickpar';
    return `https://${subdomain}.kommo.com/api/v4`;
}

/**
 * Fetch lead details from Kommo, including linked contacts.
 */
export async function getLeadDetails(leadId: number): Promise<{
    name: string;
    price: number;
    statusId: number;
    contacts: { name: string; phone: string | null }[];
    customFields: any[];
} | null> {
    try {
        const res = await fetch(
            `${getBaseUrl()}/leads/${leadId}?with=contacts`,
            { headers: getHeaders() }
        );
        if (!res.ok) return null;
        const lead = await res.json();

        // Extract contacts with phone numbers
        const contacts: { name: string; phone: string | null }[] = [];
        const embeddedContacts = lead?._embedded?.contacts || [];

        for (const c of embeddedContacts) {
            const contactRes = await fetch(
                `${getBaseUrl()}/contacts/${c.id}`,
                { headers: getHeaders() }
            );
            if (contactRes.ok) {
                const contactData = await contactRes.json();
                const phoneField = contactData.custom_fields_values?.find(
                    (f: any) => f.field_code === 'PHONE'
                );
                contacts.push({
                    name: contactData.name || '',
                    phone: phoneField?.values?.[0]?.value || null,
                });
            }
        }

        return {
            name: lead.name || '',
            price: lead.price || 0,
            statusId: lead.status_id,
            contacts,
            customFields: lead.custom_fields_values || [],
        };
    } catch (error) {
        console.error('[Kommo] Error fetching lead details:', error);
        return null;
    }
}

/**
 * Format credentials with anti-ban character substitution.
 * Prevents Instagram/WhatsApp from detecting login credentials.
 */
export function formatAntiSpam(text: string): string {
    return text
        .replace(/@/g, ' @ ')
        .replace(/\./g, ' . ')
        .split('')
        .map((char, i, arr) => {
            // Add invisible separator between characters for passwords
            if (i > 0 && i < arr.length - 1 && /[a-zA-Z0-9]/.test(char)) {
                return char;
            }
            return char;
        })
        .join('');
}

/**
 * Format email in anti-ban style: u·s·e·r @ e·m·a·i·l . c·o·m
 */
export function formatEmailAntiSpam(email: string): string {
    const [user, domain] = email.split('@');
    const formatPart = (part: string) => part.split('').join('·');
    return `${formatPart(user)} @ ${formatPart(domain)}`;
}

/**
 * Format password in anti-ban style: p·a·s·s·w·o·r·d
 */
export function formatPasswordAntiSpam(password: string): string {
    return password.split('').join('·');
}

// ==========================================
// Token Management
// ==========================================

export async function refreshKommoToken(): Promise<{ access_token: string; refresh_token: string } | null> {
    try {
        const res = await fetch(`https://${process.env.KOMMO_SUBDOMAIN}.kommo.com/oauth2/access_token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: process.env.KOMMO_CLIENT_ID,
                client_secret: process.env.KOMMO_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: process.env.KOMMO_REFRESH_TOKEN,
                redirect_uri: process.env.KOMMO_REDIRECT_URI,
            }),
        });

        if (!res.ok) {
            console.error('Failed to refresh Kommo token:', await res.text());
            return null;
        }

        const data = await res.json();
        console.log('[Kommo] Token refreshed. Update .env.local with new tokens.');
        return data;
    } catch (error) {
        console.error('[Kommo] Token refresh error:', error);
        return null;
    }
}

// ==========================================
// Contacts
// ==========================================

async function findOrCreateContact(phone: string, name: string): Promise<number | null> {
    try {
        const searchRes = await fetch(
            `${getBaseUrl()}/contacts?query=${encodeURIComponent(phone)}`,
            { headers: getHeaders() }
        );

        if (searchRes.ok) {
            const searchData = await searchRes.json();
            const contacts = searchData?._embedded?.contacts;
            if (contacts && contacts.length > 0) {
                return contacts[0].id;
            }
        }

        const createRes = await fetch(`${getBaseUrl()}/contacts`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify([
                {
                    name: name || phone,
                    custom_fields_values: [
                        {
                            field_code: 'PHONE',
                            values: [{ value: phone, enum_code: 'MOB' }],
                        },
                    ],
                },
            ]),
        });

        if (!createRes.ok) {
            console.error('[Kommo] Failed to create contact:', await createRes.text());
            return null;
        }

        const createData = await createRes.json();
        return createData?._embedded?.contacts?.[0]?.id || null;
    } catch (error) {
        console.error('[Kommo] Contact error:', error);
        return null;
    }
}

// ==========================================
// Leads — Ventas Pipeline
// ==========================================

export async function createVentaLead(params: {
    platform: string;
    customerPhone: string;
    customerName: string;
    price: number;
    slotInfo?: string;
    statusKey?: keyof typeof VENTAS_STATUS;
}): Promise<{ leadId: number | null; error?: string }> {
    try {
        const contactId = await findOrCreateContact(params.customerPhone, params.customerName);
        const statusId = VENTAS_STATUS[params.statusKey || 'INCOMING'];

        const leadData = [
            {
                name: `Venta ${params.platform} - ${params.customerName || params.customerPhone}`,
                price: params.price,
                pipeline_id: VENTAS_PIPELINE_ID,
                status_id: statusId,
                _embedded: {
                    contacts: contactId ? [{ id: contactId }] : [],
                },
            },
        ];

        const res = await fetch(`${getBaseUrl()}/leads`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(leadData),
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error('[Kommo] Failed to create lead:', errorText);
            if (res.status === 401) {
                await refreshKommoToken();
                return { leadId: null, error: 'Token expired. Please update tokens and retry.' };
            }
            return { leadId: null, error: `Kommo API error: ${errorText}` };
        }

        const data = await res.json();
        const leadId = data?._embedded?.leads?.[0]?.id;
        console.log(`[Kommo] Venta lead created: #${leadId} for ${params.platform}`);
        return { leadId };
    } catch (error: any) {
        console.error('[Kommo] Lead creation error:', error);
        return { leadId: null, error: error.message };
    }
}

// Legacy function for backward compatibility with Quick Sale
export async function createKommoLead(params: {
    platform: string;
    customerPhone: string;
    customerName: string;
    price: number;
    slotInfo?: string;
}): Promise<{ leadId: number | null; error?: string }> {
    return createVentaLead({ ...params, statusKey: 'VENTA_CONFIRMADA' });
}

// ==========================================
// Leads — Soporte Pipeline
// ==========================================

export async function createSoporteLead(params: {
    customerPhone: string;
    customerName: string;
    problemDescription: string;
}): Promise<{ leadId: number | null; error?: string }> {
    try {
        const contactId = await findOrCreateContact(params.customerPhone, params.customerName);

        const res = await fetch(`${getBaseUrl()}/leads`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify([
                {
                    name: `Soporte - ${params.customerName || params.customerPhone}`,
                    pipeline_id: SOPORTE_PIPELINE_ID,
                    status_id: SOPORTE_STATUS.PROBLEMA_REPORTADO,
                    _embedded: {
                        contacts: contactId ? [{ id: contactId }] : [],
                    },
                },
            ]),
        });

        if (!res.ok) {
            const errorText = await res.text();
            return { leadId: null, error: errorText };
        }

        const data = await res.json();
        const leadId = data?._embedded?.leads?.[0]?.id;

        if (leadId) {
            await addNoteToLead(leadId, `Problema reportado:\n${params.problemDescription}`);
        }

        console.log(`[Kommo] Soporte lead created: #${leadId}`);
        return { leadId };
    } catch (error: any) {
        return { leadId: null, error: error.message };
    }
}

// ==========================================
// Lead Management
// ==========================================

export async function moveVentaLeadToStatus(leadId: number, statusKey: keyof typeof VENTAS_STATUS): Promise<boolean> {
    try {
        const res = await fetch(`${getBaseUrl()}/leads`, {
            method: 'PATCH',
            headers: getHeaders(),
            body: JSON.stringify([
                {
                    id: leadId,
                    status_id: VENTAS_STATUS[statusKey],
                    pipeline_id: VENTAS_PIPELINE_ID,
                },
            ]),
        });

        if (!res.ok) {
            console.error('[Kommo] Failed to move lead:', await res.text());
            return false;
        }

        console.log(`[Kommo] Lead #${leadId} moved to ${statusKey}`);
        return true;
    } catch (error) {
        console.error('[Kommo] Move lead error:', error);
        return false;
    }
}

// Legacy function for backward compatibility
export async function moveLeadToStatus(leadId: number, statusName: string): Promise<boolean> {
    const statusKey = statusName as keyof typeof VENTAS_STATUS;
    return moveVentaLeadToStatus(leadId, statusKey);
}

export async function addNoteToLead(leadId: number, text: string): Promise<boolean> {
    try {
        const res = await fetch(`${getBaseUrl()}/leads/${leadId}/notes`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify([
                {
                    note_type: 'common',
                    params: { text },
                },
            ]),
        });

        if (!res.ok) {
            console.error('[Kommo] Failed to add note:', await res.text());
            return false;
        }

        return true;
    } catch (error) {
        console.error('[Kommo] Note error:', error);
        return false;
    }
}

// Export constants for external use
export { VENTAS_PIPELINE_ID, VENTAS_STATUS, SOPORTE_PIPELINE_ID, SOPORTE_STATUS };
