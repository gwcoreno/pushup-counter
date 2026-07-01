'use server';

import { revalidatePath } from 'next/cache';
import { displayNameFromInput } from '@/lib/battle/display-name';
import { createServerSupabase } from '@/utils/supabase/server';

export type ProfileActionState = { error?: string; success?: boolean };

export async function updateDisplayName(
  _prev: ProfileActionState | undefined,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'You must be signed in to update your profile.' };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('email')
    .eq('id', user.id)
    .maybeSingle();

  let name: string;
  try {
    name = displayNameFromInput(
      String(formData.get('displayName') ?? ''),
      user.email ?? profile?.email,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Invalid display name.' };
  }

  const { error: authError } = await supabase.auth.updateUser({
    data: { display_name: name },
  });
  if (authError) {
    return { error: authError.message };
  }

  const { error: dbError } = await supabase
    .from('users')
    .update({ display_name: name })
    .eq('id', user.id);

  if (dbError) {
    return { error: dbError.message };
  }

  revalidatePath('/profile');
  revalidatePath('/', 'layout');
  return { success: true };
}
