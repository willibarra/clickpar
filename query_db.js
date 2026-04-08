const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function query() {
  const { data, error } = await supabase.from('mother_accounts').select('sale_type').limit(100);
  if (error) console.error(error);
  else {
    const types = new Set(data.map(d => d.sale_type));
    console.log(Array.from(types));
  }
}
query();
