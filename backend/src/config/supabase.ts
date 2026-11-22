import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

export interface SupabaseConfiguration {
  configured: boolean;
  client: SupabaseClient | null;
}

export const createSupabaseConfiguration = (
  env: NodeJS.ProcessEnv = process.env
): SupabaseConfiguration => {
  const supabaseUrl = env.SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const isProduction = env.NODE_ENV === 'production';

  if (isProduction && !supabaseUrl) {
    throw new Error('SUPABASE_URL must be configured for production');
  }
  if (isProduction && !supabaseServiceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY must be configured for production');
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return { configured: false, client: null };
  }

  const client = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return { configured: true, client };
};

const supabaseConfiguration = createSupabaseConfiguration();

export const isSupabaseConfigured = supabaseConfiguration.configured;
export const supabase = supabaseConfiguration.client;
