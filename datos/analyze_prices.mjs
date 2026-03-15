/**
 * analyze_prices.mjs
 * Analiza cuántas ventas activas están sin precio en la BD
 * y cuántas se pueden reparar con los CSVs de Netflix.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'http://proyectoantigravitycomparador-supabase-6e56c0-76-13-163-100.traefik.me';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// 1. Query DB: active sales with amount_gs = 0 or null
const { data: sales, error } = await supabase
  .from('sales')
  .select(`
    id,
    amount_gs,
    customer_id,
    slot_id,
    end_date,
    is_active
  `)
  .eq('is_active', true)
  .or('amount_gs.is.null,amount_gs.eq.0')
  .limit(5000);

if (error) { console.error('DB error:', error.message); process.exit(1); }

console.log(`\n=== VENTAS ACTIVAS SIN PRECIO: ${sales.length} ===\n`);

// 2. Get all customers in one go
const custIds = [...new Set(sales.map(s => s.customer_id).filter(Boolean))];
const { data: customers } = await supabase
  .from('customers')
  .select('id, full_name, phone')
  .in('id', custIds);

const custMap = new Map(customers.map(c => [c.id, c]));

// 3. Get all slots + mother accounts
const slotIds = [...new Set(sales.map(s => s.slot_id).filter(Boolean))];
const slotChunks = [];
for (let i = 0; i < slotIds.length; i += 200) slotChunks.push(slotIds.slice(i, i+200));

const slotMap = new Map();
for (const chunk of slotChunks) {
  const { data: slots } = await supabase
    .from('sale_slots')
    .select('id, slot_identifier, mother_account:mother_accounts(id, platform, email)')
    .in('id', chunk);
  (slots||[]).forEach(s => slotMap.set(s.id, s));
}

// 4. Parse Netflix CSVs and build price lookup: phone + platform + slot_identifier => price
const NETFLIX_FILES = [
  'NETFLIX_clean.csv',
];

function normalizePhone(p) {
  if (!p) return '';
  p = p.replace(/\D/g, '');
  if (p.startsWith('0')) p = '595' + p.slice(1);
  if (!p.startsWith('595') && p.length === 9) p = '595' + p;
  return p;
}

const priceMap = new Map(); // key: "phone|platform|slot" => price_gs

for (const file of NETFLIX_FILES) {
  const fp = path.join(__dirname, file);
  if (!fs.existsSync(fp)) continue;
  const content = fs.readFileSync(fp, 'utf-8');
  const rows = parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true });
  
  for (const row of rows) {
    const phone = normalizePhone(row['Celular Cliente'] || '');
    const platform = (row['Plataforma'] || '').trim();
    const pantalla = (row['Pantalla'] || '').trim();
    const priceStr = (row['Precio de Venta'] || '').trim();
    
    if (!phone || !priceStr || priceStr === '0') continue;
    try {
      const price = parseInt(priceStr);
      if (price > 0) {
        const key = `${phone}|${platform}|${pantalla}`;
        priceMap.set(key, price);
        // Also try without pantalla normalization
        const key2 = `${phone}|${platform}`;
        if (!priceMap.has(key2)) priceMap.set(key2, price);
      }
    } catch {}
  }
}

console.log(`Precios en CSV Netflix: ${priceMap.size} entradas\n`);

// 5. Cross-reference
let matched = 0;
let unmatched = 0;
const matchedSales = [];

for (const sale of sales) {
  const cust = custMap.get(sale.customer_id);
  const slot = slotMap.get(sale.slot_id);
  const phone = normalizePhone(cust?.phone || '');
  const platform = slot?.mother_account?.platform || '';
  const slotId = slot?.slot_identifier || '';

  const key1 = `${phone}|${platform}|${slotId}`;
  const key2 = `${phone}|${platform}`;
  
  const price = priceMap.get(key1) || priceMap.get(key2);
  
  if (price) {
    matched++;
    matchedSales.push({ saleId: sale.id, price, phone, platform, slotId, custName: cust?.full_name });
  } else {
    unmatched++;
  }
}

console.log(`✅ Pueden corregirse: ${matched}`);
console.log(`❌ Sin match CSV:     ${unmatched}`);
console.log(`\nEjemplos de ventas que se pueden actualizar:`);
matchedSales.slice(0, 10).forEach(m => {
  console.log(`  [${m.saleId}] ${m.custName} | ${m.platform} / ${m.slotId} => Gs. ${m.price.toLocaleString()}`);
});

// Group unmatched by platform
const unmatchedSales = sales
  .filter(s => !matchedSales.find(m => m.saleId === s.id))
  .map(s => {
    const slot = slotMap.get(s.slot_id);
    return slot?.mother_account?.platform || 'Unknown';
  });

const byPlatform = {};
unmatchedSales.forEach(p => { byPlatform[p] = (byPlatform[p] || 0) + 1; });
console.log('\nVentas sin precio por plataforma (no corregibles con CSV actual):');
Object.entries(byPlatform).sort((a,b) => b[1]-a[1]).forEach(([p,c]) => console.log(`  ${p}: ${c}`));
