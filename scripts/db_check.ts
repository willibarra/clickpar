import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase variables in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkDb() {
  console.log('Testing connection to:', supabaseUrl)
  
  const startTime = Date.now()
  try {
    // 1. Simple query to check if alive
    const { data: healthData, error: healthError } = await supabase.from('staff').select('count', { count: 'exact', head: true })
    
    if (healthError) {
      console.error('Database connection error:', healthError)
      return
    }
    
    console.log('Database is REACHABLE. Response time:', Date.now() - startTime, 'ms')
    
    // 2. Check for active/hung queries (optional, if we have permissions)
    const { data: queries, error: queriesError } = await supabase.rpc('get_active_queries')
    
    if (queriesError) {
       // Fallback to raw query if RPC doesn't exist
       console.log('Searching for active queries via raw query...')
       const { data: rawQueries, error: rawError } = await supabase.from('pg_stat_activity').select('*')
       if (rawError) {
         console.warn('Could not read pg_stat_activity (permissions?):', rawError.message)
       } else {
         console.log('Active queries:', rawQueries)
       }
    } else {
      console.log('Active queries (via RPC):', queries)
    }

  } catch (err) {
    console.error('Connection attempt failed:', err)
  }
}

checkDb()
