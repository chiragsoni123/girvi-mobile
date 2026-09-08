import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * False until .env is filled in — the app shows a setup screen instead of
 * failing with a confusing network error.
 */
export const isSupabaseConfigured =
  SUPABASE_URL.startsWith('http') &&
  !SUPABASE_URL.includes('your-project-ref') &&
  SUPABASE_ANON_KEY.length > 20;

/** Requests that hang longer than this are aborted so the UI can recover. */
const REQUEST_TIMEOUT_MS = 20000;

/**
 * On patchy mobile data a socket can stay open indefinitely. Without this the
 * app would sit on a spinner with no way back; aborting surfaces a normal
 * "no connection" error that the user can retry.
 */
const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new Error('Network request failed: the server took too long to respond.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export const supabase = createClient(
  isSupabaseConfigured ? SUPABASE_URL : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? SUPABASE_ANON_KEY : 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // React Native has no URL bar for the session to come back through.
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: { fetch: fetchWithTimeout },
    realtime: { params: { eventsPerSecond: 4 } },
  }
);

// Refresh the access token while the app is in the foreground only.
AppState.addEventListener('change', (state) => {
  if (!isSupabaseConfigured) return;
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});

// Error translation lives in ./errors — re-exported here because most callers
// already reach for it alongside the client.
export { describeError, logError, toAppError } from './errors';
export type { AppError, ErrorKind } from './errors';
