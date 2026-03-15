import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'http://127.0.0.1:54321',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hj04zWl196z2-SBc0'
);

const { data: zeros, count: zeroCount } = await supabase
  .from('sales')
  .select('*', { count: 'exact', head: false })
  .eq('is_active', true)
  .or('amount_gs.is.null,amount_gs.eq.0')
  .limit(5);

const { count: totalActive } = await supabase
  .from('sales')
  .select('*', { count: 'exact', head: true })
  .eq('is_active', true);

const { count: withPrice } = await supabase
  .from('sales')
  .select('*', { count: 'exact', head: true })
  .eq('is_active', true)
  .gt('amount_gs', 0);

console.log('Total ventas activas:', totalActive);
console.log('Con precio > 0:', withPrice);
console.log('Sin precio (0 o null):', zeroCount);
console.log('\nMuestra de ventas sin precio:', JSON.stringify(zeros?.slice(0,3), null, 2));
