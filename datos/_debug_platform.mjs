import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const envContent = readFileSync(resolve(ROOT, '.env.local'), 'utf-8');
const env = Object.fromEntries(envContent.split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Ver todos los campos de Netflix en la tabla platforms
const { data } = await supabase.from('platforms').select('*').ilike('name', '%netflix%');
console.log('Netflix en platforms:');
console.log(JSON.stringify(data, null, 2));

// Ver también si hay alguna otra columna de apodo
const { data: sample } = await supabase.from('platforms').select('*').eq('is_active', true).limit(1);
console.log('\nColumnas disponibles en platforms:');
if (sample && sample[0]) console.log(Object.keys(sample[0]).join(', '));
