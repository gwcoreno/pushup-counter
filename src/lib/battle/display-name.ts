import type { User } from '@supabase/supabase-js';

export const DISPLAY_NAME_MAX = 32;

export function normalizeDisplayName(raw: string): string {
  const name = raw.trim().slice(0, DISPLAY_NAME_MAX);
  if (!name) {
    throw new Error('Enter a name to continue.');
  }
  return name;
}

export function guestDisplayName(user: User): string | null {
  const meta = user.user_metadata?.display_name;
  return typeof meta === 'string' && meta.trim() ? meta.trim() : null;
}

/** Local part of an email (before @), capped at {@link DISPLAY_NAME_MAX}. */
export function displayNameFromEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split('@')[0]?.trim();
  if (!local) return null;
  return local.slice(0, DISPLAY_NAME_MAX);
}

/** Use trimmed input, or fall back to the email local part when input is empty. */
export function displayNameFromInput(raw: string, email?: string | null): string {
  const trimmed = raw.trim();
  if (trimmed) return normalizeDisplayName(trimmed);
  const fallback = displayNameFromEmail(email);
  if (!fallback) {
    throw new Error('Enter a display name, or sign up with an email to use a default.');
  }
  return fallback;
}

/** Prefer stored name, then metadata, then email local part. */
export function resolveDisplayName(
  user: User,
  dbDisplayName: string | null | undefined,
  email?: string | null,
): string | null {
  const fromDb = dbDisplayName?.trim() || null;
  const explicit = fromDb ?? guestDisplayName(user);
  if (explicit) return explicit;
  return displayNameFromEmail(email ?? user.email);
}
