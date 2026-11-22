import { isSupabaseConfigured, supabase } from './config/supabase';
import { ensureInitialAdmin, seedData } from './seed';

export async function initializeDatabase(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured');
  }

  if (process.env.NODE_ENV === 'production') {
    await ensureInitialAdmin(supabase);
    return;
  }

  await seedData(false, supabase);
}
