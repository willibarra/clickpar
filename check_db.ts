import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
    console.log("Checking message_queue...");
    const { data: rows, error } = await supabase.from('message_queue').select('*').order('created_at', { ascending: false }).limit(5);
    if (error) console.error(error);
    else console.log(rows);
}

main();
