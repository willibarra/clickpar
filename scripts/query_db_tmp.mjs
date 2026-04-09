import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const supabase = createClient(
  'https://db.clickpar.shop',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg'
);

async function main() {
  const { data: mothers } = await supabase
    .from('mother_accounts')
    .select('id')
    .eq('platform', 'Spotify Premium')
    .eq('status', 'frozen')
    .eq('supplier_name', 'GLOBAL STORE')
    .is('deleted_at', null);

  const motherIds = mothers.map(m => m.id);

  let allSlots = [];
  for (let i = 0; i < motherIds.length; i += 15) {
    const { data: slots } = await supabase
      .from('sale_slots')
      .select('id, mother_account_id, slot_identifier, pin_code')
      .in('mother_account_id', motherIds.slice(i, i + 15));
    allSlots = allSlots.concat(slots || []);
  }
  const slotMap = {};
  allSlots.forEach(s => slotMap[s.id] = s);
  const slotIds = allSlots.map(s => s.id);

  let allSales = [];
  for (let i = 0; i < slotIds.length; i += 20) {
    const { data: sales } = await supabase
      .from('sales').select('id, slot_id, customer_id, amount_gs, end_date')
      .in('slot_id', slotIds.slice(i, i + 20)).eq('is_active', true);
    allSales = allSales.concat(sales || []);
  }

  const customerIds = [...new Set(allSales.map(s => s.customer_id))];
  let allCustomers = [];
  for (let i = 0; i < customerIds.length; i += 20) {
    const { data: custs } = await supabase
      .from('customers').select('id, full_name, phone')
      .in('id', customerIds.slice(i, i + 20));
    allCustomers = allCustomers.concat(custs || []);
  }
  const customerMap = {};
  allCustomers.forEach(c => customerMap[c.id] = c);

  const results = allSales.map(sale => {
    const slot = slotMap[sale.slot_id];
    const customer = customerMap[sale.customer_id];
    return {
      cliente: customer?.full_name || 'N/A',
      numero: customer?.phone || 'N/A',
      pantalla: slot?.slot_identifier || 'N/A',
      pin: slot?.pin_code || 'N/A',
      ultimo_pago: sale.amount_gs ? `${Number(sale.amount_gs).toLocaleString('es-PY')} Gs` : 'N/A',
      vencimiento: sale.end_date || 'Sin fecha',
    };
  }).sort((a, b) => a.cliente.localeCompare(b.cliente));

  // Escribir a archivo para no truncar
  writeFileSync('/tmp/spotify_full.json', JSON.stringify(results, null, 2));
  console.log(`Total registros: ${results.length}`);
  console.log('Archivo guardado en /tmp/spotify_full.json');
}
main();
