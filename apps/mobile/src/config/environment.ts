export interface PublicEnvironment {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export function getPublicEnvironment(): PublicEnvironment {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Copy apps/mobile/.env.example to apps/mobile/.env.local and add the public project credentials.',
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}
