import { createClient } from '@/utils/supabase/client';

/**
 * Ensures the browser has a Supabase session (anonymous if needed) so battle RPCs see auth.uid().
 * Requires "Anonymous sign-ins" enabled in Supabase → Authentication → Providers.
 */
export async function ensureAnonSession(): Promise<{ id: string }> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) {
    return { id: session.user.id };
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(error?.message ?? 'Could not start a guest session. Enable Anonymous sign-ins in Supabase.');
  }
  return { id: data.user.id };
}
