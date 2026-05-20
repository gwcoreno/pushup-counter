'use server';

/**
 * Auth setup (Supabase Dashboard → Authentication):
 * - Email: turn off “Confirm email” for immediate sign-in after sign-up.
 * - Providers: enable Anonymous sign-ins (for battle guests).
 * - Providers: enable Manual linking (required to convert guest → email on same user id).
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { convertAnonymousToEmailUser } from '@/lib/auth/convert-guest';
import { resolveSignUpDisplayName, syncUserProfile } from '@/lib/auth/sync-user-profile';
import { getSiteUrl } from '@/lib/site-url';
import { createServerSupabase } from '@/utils/supabase/server';

export type AuthActionState = {
  error?: string;
  message?: string;
  /** Set on success; client navigates (avoid redirect() in useActionState). */
  success?: boolean;
  /** When true, client clears only password fields and keeps `fields`. */
  clearPasswords?: boolean;
  fields?: { email: string; displayName: string };
};

const PASSWORD_MISMATCH = 'Passwords do not match.';

export async function signUp(
  _prev: AuthActionState | undefined,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');
  const rawDisplayName = String(formData.get('displayName') ?? '').trim();

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }
  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters.' };
  }
  if (password !== confirm) {
    return {
      error: PASSWORD_MISMATCH,
      clearPasswords: true,
      fields: { email, displayName: rawDisplayName },
    };
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName: string;
  try {
    const existing =
      user?.is_anonymous
        ? await (async () => {
            const { data: profile } = await supabase
              .from('users')
              .select('display_name')
              .eq('id', user.id)
              .maybeSingle();
            return { user, dbDisplayName: profile?.display_name ?? null };
          })()
        : null;
    displayName = resolveSignUpDisplayName(rawDisplayName, email, existing);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Invalid display name.' };
  }

  if (user?.is_anonymous) {
    const converted = await convertAnonymousToEmailUser(
      supabase,
      user,
      email,
      password,
      displayName,
    );
    if (!converted.ok) {
      return { error: converted.error };
    }

    revalidatePath('/', 'layout');
    return { success: true };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/callback`,
      data: { display_name: displayName },
    },
  });

  if (error) {
    return { error: error.message };
  }

  try {
    const {
      data: { user: newUser },
    } = await supabase.auth.getUser();
    if (newUser) {
      await syncUserProfile(supabase, newUser.id, { email, display_name: displayName });
    }
  } catch {
    /* trigger on auth.users insert usually creates the row */
  }

  revalidatePath('/', 'layout');
  return { success: true };
}

export async function signIn(
  _prev: AuthActionState | undefined,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  const rawNext = String(formData.get('next') ?? '/');
  const safeNext =
    rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.includes(':')
      ? rawNext
      : '/';

  revalidatePath('/', 'layout');
  redirect(safeNext);
}

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}
