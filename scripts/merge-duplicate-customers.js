// Script: fusionar todos los clientes duplicados/triplicados por teléfono normalizado
// Uso: node scripts/merge-duplicate-customers.js

const SUPABASE_URL = 'https://db.clickpar.shop';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

const headers = {
    'Content-Type': 'application/json',
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Prefer': 'return=minimal',
};

async function supabaseQuery(table, params = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, { headers });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`[${table}] HTTP ${res.status}: ${text}`);
    }
    return res.json();
}

async function supabaseUpdate(table, filter, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`[PATCH ${table}] HTTP ${res.status}: ${text}`);
    }
}

async function supabaseDelete(table, filter) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
        method: 'DELETE',
        headers,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`[DELETE ${table}] HTTP ${res.status}: ${text}`);
    }
}

function normalizePhone(phone) {
    return (phone || '').replace(/\D/g, '');
}

async function main() {
    console.log('🔍 Cargando todos los clientes...');

    // 1. Fetch all customers
    const customers = await supabaseQuery('customers', '?select=id,full_name,phone&order=created_at.asc&limit=10000');
    console.log(`   Total clientes: ${customers.length}`);

    // 2. Fetch all sales counts per customer
    const sales = await supabaseQuery('sales', '?select=id,customer_id&limit=50000');
    const salesCountByCustomer = {};
    for (const s of sales) {
        salesCountByCustomer[s.customer_id] = (salesCountByCustomer[s.customer_id] || 0) + 1;
    }

    // 3. Group by normalized phone
    const groups = new Map(); // normalizedPhone -> customers[]
    for (const c of customers) {
        const norm = normalizePhone(c.phone);
        if (!norm || norm.length < 6) continue;
        const arr = groups.get(norm) || [];
        arr.push(c);
        groups.set(norm, arr);
    }

    // 4. Only keep groups with 2+ members (duplicates/triplicates)
    const duplicateGroups = [...groups.values()].filter(g => g.length >= 2);
    console.log(`\n⚠️  Grupos duplicados encontrados: ${duplicateGroups.length}`);

    if (duplicateGroups.length === 0) {
        console.log('✅ No hay duplicados. ¡La base está limpia!');
        return;
    }

    // Preview duplicates
    console.log('\n📋 Grupos a fusionar:');
    for (const group of duplicateGroups) {
        const norm = normalizePhone(group[0].phone);
        console.log(`   📞 ${norm} (${group.length} registros):`);
        for (const c of group) {
            const cnt = salesCountByCustomer[c.id] || 0;
            console.log(`      - [${c.id.slice(0,8)}] ${c.full_name || '(sin nombre)'} · ${cnt} venta(s)`);
        }
    }

    console.log('\n🔀 Iniciando fusiones...\n');

    let totalMerged = 0;
    let totalTransferred = 0;
    const errors = [];

    for (const group of duplicateGroups) {
        try {
            // Pick primary: prefer the one with most sales; ties broken by oldest (first in list, since sorted by created_at asc)
            const sorted = [...group].sort((a, b) => {
                const ca = salesCountByCustomer[a.id] || 0;
                const cb = salesCountByCustomer[b.id] || 0;
                return cb - ca; // desc
            });

            const primary = sorted[0];
            const duplicates = sorted.slice(1);
            const norm = normalizePhone(primary.phone);

            // Reassign all sales from duplicates to primary
            let transferred = 0;
            for (const dup of duplicates) {
                const dupSalesCount = salesCountByCustomer[dup.id] || 0;
                if (dupSalesCount > 0) {
                    await supabaseUpdate(
                        'sales',
                        `customer_id=eq.${dup.id}`,
                        { customer_id: primary.id }
                    );
                    transferred += dupSalesCount;
                }
                // Delete duplicate customer
                await supabaseDelete('customers', `id=eq.${dup.id}`);
            }

            const dupNames = duplicates.map(d => d.full_name || d.phone || d.id).join(', ');
            console.log(`   ✅ ${norm} → Principal: "${primary.full_name}" | Eliminados: [${dupNames}] | ${transferred} venta(s) transferidas`);

            totalMerged += duplicates.length;
            totalTransferred += transferred;
        } catch (err) {
            const norm = normalizePhone(group[0].phone);
            console.error(`   ❌ Error en grupo ${norm}: ${err.message}`);
            errors.push({ phone: norm, error: err.message });
        }
    }

    console.log('\n' + '─'.repeat(60));
    console.log(`✅ Fusiones completadas:`);
    console.log(`   • Duplicados eliminados: ${totalMerged}`);
    console.log(`   • Ventas transferidas:   ${totalTransferred}`);
    if (errors.length > 0) {
        console.log(`   • Errores:               ${errors.length}`);
        errors.forEach(e => console.log(`     ⚠️  ${e.phone}: ${e.error}`));
    }
}

main().catch(err => {
    console.error('Error fatal:', err);
    process.exit(1);
});
