/**
 * Supabase credentials.
 *
 * Expo inlines any `EXPO_PUBLIC_`-prefixed variable from `.env` at bundle time,
 * which is the whole of the configuration story — there is no dotenv parsing to
 * do here as there was when this ran in Swift.
 *
 *   # mobile/.env
 *   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
 *
 * These are the publishable (anon) credentials, which are meant to be shipped
 * in a client; the schema's row-level security is what actually decides who may
 * read and write.
 */
export const supabaseURL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const mediaBucket = 'media';

/** Whether this build has been given somewhere to talk to. */
export const isSupabaseConfigured = supabaseURL.length > 0 && supabaseKey.length > 0;

export function requireSupabaseConfig(): { url: string; key: string } {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
        'Set them in mobile/.env, or use the local server instead.'
    );
  }
  return { url: supabaseURL.replace(/\/$/, ''), key: supabaseKey };
}
