import type { User } from '@supabase/supabase-js';
import { syncUserProfile } from '@/lib/auth/sync-user-profile';
import { createServerSupabase } from '@/utils/supabase/server';

type SupabaseServer = Awaited<ReturnType<typeof createServerSupabase>>;

const EMAIL_IN_USE =
  /already registered|already been registered|identity.*exists|user already exists/i;

/**
 * Links email + password to the current anonymous user (same auth.users id).
 * Requires Anonymous sign-ins and Manual linking in Supabase Auth settings.
 */
export async function convertAnonymousToEmailUser(
  supabase: SupabaseServer,
  user: User,
  email: string,
  password: string,
  displayName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.auth.updateUser({
    email,
    password,
    data: { display_name: displayName },
  });

  if (error) {
    if (EMAIL_IN_USE.test(error.message)) {
      return {
        ok: false,
        error:
          'This email already has an account. Sign in to that account instead, or use a different email.',
      };
    }
    return { ok: false, error: error.message };
  }

  const userId = data.user?.id ?? user.id;
  try {
    await syncUserProfile(supabase, userId, { email, display_name: displayName });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not update profile.' };
  }

  return { ok: true };
}
