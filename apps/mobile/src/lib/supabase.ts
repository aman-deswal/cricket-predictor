import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getPublicEnvironment } from '@/config/environment';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const { supabaseUrl, supabaseAnonKey } = getPublicEnvironment();
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return client;
}
