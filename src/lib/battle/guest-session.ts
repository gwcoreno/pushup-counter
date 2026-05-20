import { createClient } from '@/utils/supabase/client';
import { guestDisplayName, normalizeDisplayName } from '@/lib/battle/display-name';

export type BattleUser = {
  id: string;
  displayName: string | null;
  isAnonymous: boolean;
};

export { guestDisplayName, normalizeDisplayName } from '@/lib/battle/display-name';

/** Returns the current session user without creating a guest account. */
export async function getExistingBattleUser(): Promise<BattleUser | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  return {
    id: user.id,
    displayName: user.is_anonymous ? guestDisplayName(user) : user.email ?? guestDisplayName(user),
    isAnonymous: user.is_anonymous ?? false,
  };
}

async function syncDisplayNameToProfile(userId: string, displayName: string) {
  const supabase = createClient();
  await supabase.from('users').update({ display_name: displayName }).eq('id', userId);
}

/** Anonymous sign-in with display name, or update name on an existing guest session. */
export async function createGuestSession(displayName: string): Promise<BattleUser> {
  const name = normalizeDisplayName(displayName);
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.user) {
    if (!session.user.is_anonymous) {
      return {
        id: session.user.id,
        displayName: session.user.email ?? name,
        isAnonymous: false,
      };
    }
    const { error } = await supabase.auth.updateUser({ data: { display_name: name } });
    if (error) throw new Error(error.message);
    await syncDisplayNameToProfile(session.user.id, name);
    return { id: session.user.id, displayName: name, isAnonymous: true };
  }

  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { display_name: name } },
  });
  if (error || !data.user) {
    throw new Error(
      error?.message ?? 'Could not start a guest session. Enable Anonymous sign-ins in Supabase.',
    );
  }
  await syncDisplayNameToProfile(data.user.id, name);
  return { id: data.user.id, displayName: name, isAnonymous: true };
}
