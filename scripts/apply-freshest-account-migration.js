/**
 * Aplica la migración purchase_freshest_account.sql a la base de datos
 * Uso: node scripts/apply-freshest-account-migration.js
 */
const https = require('https');
const fs = require('fs');

// Parser de .env.local
if (fs.existsSync('.env.local')) {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    envFile.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
        if (match) {
            let key = match[1];
            let value = (match[2] || '').trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            process.env[key] = value;
        }
    });
}

function run() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db.clickpar.shop';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!key) {
        console.error("❌ No se encontró SUPABASE_SERVICE_ROLE_KEY en .env.local");
        return;
    }

    const sqlPath = 'supabase/migrations/20260406_purchase_freshest_account.sql';
    if (!fs.existsSync(sqlPath)) {
        console.error("❌ No se encuentra el archivo SQL en", sqlPath);
        return;
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    const url = new URL(supabaseUrl);
    url.pathname = '/rest/v1/rpc/exec_sql';

    console.log(`Aplicando migración purchase_freshest_account a ${url.hostname}...`);

    const req = https.request(url, {
        method: 'POST',
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
        },
        family: 4
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                console.log("✅ Migración aplicada: purchase_from_store ahora prioriza cuentas frescas (renewal_date DESC)");
            } else {
                console.error(`❌ Error (Status ${res.statusCode}):`, data);
            }
        });
    });

    req.on('error', (err) => {
        console.error("❌ Error de red:", err.message);
    });

    req.write(JSON.stringify({ query: sql }));
    req.end();
}

run();
