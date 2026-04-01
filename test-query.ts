import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
async function main() {
  const { data: accounts, error } = await supabase.from('mother_accounts').select('id, sale_slots(id)');
  console.log('accounts error:', error);
  
  const { data: sales, error: salesError } = await supabase.from('sales').select('id, slot_id, is_active, end_date, customers(id, full_name, phone)').eq('is_active', true);
  console.log('sales error:', salesError);
  console.log('Sales example:', sales?.slice(0, 2));
}
main();
