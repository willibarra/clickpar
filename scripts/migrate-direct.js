const https = require('https');
const fs = require('fs');

// Manual .env.local parser
if (fs.existsSync('.env.local')) {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    envFile.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            let key = match[1];
            let value = match[2] || '';
            if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
            if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
            process.env[key] = value;
        }
    });
}

function run() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db.clickpar.shop';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!key) {
        console.error("No se encontró SUPABASE_SERVICE_ROLE_KEY en .env.local");
        return;
    }

    const sqlPath = 'supabase/migrations/20260405_wallet_and_store.sql';
    if (!fs.existsSync(sqlPath)) {
        console.error("No se encuentra el archivo SQL en", sqlPath);
        return;
    }
    
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const url = new URL(supabaseUrl);
    url.pathname = '/rest/v1/rpc/exec_sql'; // Try bypassing pgmeta and use PostgREST

    console.log(`Intentando inyección SQL vía PostgREST en: ${url.toString()}...`);

    const req = https.request(url, {
        method: 'POST',
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
        },
        family: 4 // Fuerza a usar IPv4 para evadir el bug de DNS timeout local
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                console.log("✅ Migración de Base de Datos aplicada exitosamente!");
            } else {
                console.error(`❌ Error en la base de datos (Status ${res.statusCode}):`, data);
            }
        });
    });

    req.on('error', (err) => {
        console.error("❌ Error de red / Timeout:", err.message);
    });

    req.write(JSON.stringify({ query: sql }));
    req.end();
}

run();
