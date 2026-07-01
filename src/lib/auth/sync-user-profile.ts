import type { User } from '@supabase/supabase-js';
import {
  displayNameFromInput,
  normalizeDisplayName,
  resolveDisplayName,
} from '@/lib/battle/display-name';
import { createServerSupabase } from '@/utils/supabase/server';

type SupabaseServer = Awaited<ReturnType<typeof createServerSupabase>>;

export async function syncUserProfile(
  supabase: SupabaseServer,
  userId: string,
  fields: { email?: string; display_name?: string },
) {
  const { error } = await supabase
    .from('users')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw new Error(error.message);
}

/** Keeps guest display name when the form field is left blank. */
export function resolveSignUpDisplayName(
  raw: string,
  email: string,
  existing: { user: User; dbDisplayName?: string | null } | null,
): string {
  const trimmed = raw.trim();
  if (trimmed) return normalizeDisplayName(trimmed);
  if (existing) {
    const kept = resolveDisplayName(existing.user, existing.dbDisplayName, existing.user.email);
    if (kept) return kept;
  }
  return displayNameFromInput('', email);
}
