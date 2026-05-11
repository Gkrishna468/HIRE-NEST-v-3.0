import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase credentials");

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: users, error: userError } = await supabase.auth.admin.listUsers();
  const userId = users?.users?.[0]?.id || '00000000-0000-0000-0000-000000000000';
  
  const { data, error } = await supabase.from('integrations').upsert({
    user_id: userId,
    provider: 'google',
    access_token: 'test',
  }, {
    onConflict: 'user_id,provider'
  });

  console.log("Upsert result:", JSON.stringify(data, null, 2));
  console.log("Upsert Error:", error);
}

run();
