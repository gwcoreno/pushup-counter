'use server';

/**
 * No email verification: in Supabase Dashboard go to Authentication → Providers → Email
 * and turn off “Confirm email” so users can sign in immediately after sign-up.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/utils/supabase/server';
import { getSiteUrl } from '@/lib/site-url';

export type AuthActionState = { error?: string; message?: string };

export async function signUp(
  _prev: AuthActionState | undefined,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirmPassword') ?? '');

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }
  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters.' };
  }
  if (password !== confirm) {
    return { error: 'Passwords do not match.' };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  redirect('/login?registered=1');
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
