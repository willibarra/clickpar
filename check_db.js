require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log("Comprobando columnas en customers...");
  const { data: q1, error: e1 } = await supabase.from('customers').select('wallet_balance').limit(1);
  
  if (e1 && e1.code === 'PGRST204') {
     console.log("❌ La columna 'wallet_balance' NO existe DENTRO de customers.");
  } else if (!e1) {
     console.log("✅ Columna 'wallet_balance' encontrada!");
  } else {
     console.log("⚠️ Error comprobando customers:", e1.message);
  }

  console.log("\nComprobando tabla wallet_transactions...");
  const { data: q2, error: e2 } = await supabase.from('wallet_transactions').select('id').limit(1);
  
  if (e2 && e2.code === 'PGRST116') {
     console.log("❌ La tabla 'wallet_transactions' NO existe.");
  } else if (!e2) {
     console.log("✅ Tabla 'wallet_transactions' encontrada!");
  } else {
     console.log("⚠️ Error comprobando wallet_transactions:", e2.message);
  }
}
check();
