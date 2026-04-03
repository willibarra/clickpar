import fs from 'fs';
import path from 'path';

function scanCSVs() {
    const dir = path.resolve(process.cwd(), 'datos');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.csv'));
    
    const mapping = {};
    let totalFound = 0;

    for (const file of files) {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8').split('\n');
        if (content.length < 2) continue;
        
        const header = content[0].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        const emailIdx = header.findIndex(h => h.toLowerCase() === 'usuario' || h.toLowerCase() === 'email');
        const provIdx = header.findIndex(h => h.toLowerCase() === 'nombre proveedor' || h.toLowerCase() === 'proveedor');
        
        if (emailIdx === -1 || provIdx === -1) continue;
        
        for (let i = 1; i < content.length; i++) {
            // Split by comma ignoring commas inside quotes
            const lineMatch = content[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
            if (!lineMatch) continue;
            
            // Re-split using a standard proper csv parser would be better, but split by comma might suffice if there are no inner commas for email/supplier.
            const cols = content[i].split(',');
            if (cols.length <= Math.max(emailIdx, provIdx)) continue;
            
            const email = cols[emailIdx].trim().replace(/^"|"$/g, '');
            const supplier = cols[provIdx].trim().replace(/^"|"$/g, '');
            
            if (email && supplier && supplier !== 'SIN PROVEEDOR' && supplier !== '-' && supplier !== 'null') {
                mapping[email.toLowerCase()] = supplier;
                totalFound++;
            }
        }
    }
    
    console.log(`Extracted mapping for ${Object.keys(mapping).length} unique emails from ${files.length} CSVs.`);
    fs.writeFileSync('datos/recovered_mapping.json', JSON.stringify(mapping, null, 2));
}

scanCSVs();
