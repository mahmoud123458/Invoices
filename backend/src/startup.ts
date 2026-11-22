import { isSupabaseConfigured, supabase } from './config/supabase';
import { seedData } from './seed';

export async function initializeDatabase(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured');
  }

  // In production: seed only if the database is empty (idempotent, no env vars needed)
  // In development: also seed if empty
  await seedData(false, supabase);
}
