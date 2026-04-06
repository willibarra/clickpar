const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db.clickpar.shop';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
    console.error('Set SUPABASE_SERVICE_ROLE_KEY env var');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

(async () => {
  const phone = '595983445336';

  // 1. Find customer by phone
  const { data: customers } = await supabase
    .from('customers')
    .select('id, full_name, phone')
    .or(`phone.eq.${phone},phone.eq.+${phone},phone.eq.0983445336`);
  
  console.log('=== CLIENTE ===');
  console.log(JSON.stringify(customers, null, 2));

  if (!customers || customers.length === 0) { console.log('Cliente no encontrado'); return; }
  const customer = customers[0];

  // 2. Find ALL sales for this customer
  const { data: sales } = await supabase
    .from('sales')
    .select('id, slot_id, amount_gs, start_date, end_date, is_active, created_at')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false });
  
  console.log('\n=== VENTAS (todas) ===');
  console.log(JSON.stringify(sales, null, 2));

  // 3. For each sale, get the slot info
  if (sales && sales.length > 0) {
    for (const sale of sales) {
      const { data: slot } = await supabase
        .from('sale_slots')
        .select('id, slot_identifier, pin_code, status, mother_account_id, mother_accounts:mother_account_id(platform, email, password)')
        .eq('id', sale.slot_id)
        .single();
      
      const platform = slot && slot.mother_accounts ? slot.mother_accounts.platform : 'N/A';
      console.log('\n--- Slot for sale ' + sale.id + ' | ' + platform + ' | active: ' + sale.is_active + ' | created: ' + sale.created_at + ' ---');
      console.log(JSON.stringify(slot, null, 2));
    }
  }

  // 4. Check activity logs for recent swap actions
  try {
    const { data: logs } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('action', 'swap_service')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (logs && logs.length > 0) {
      console.log('\n=== SWAP LOGS (ultimos 10) ===');
      console.log(JSON.stringify(logs, null, 2));
    }
  } catch (e) {
    // table might not exist
  }
})();
