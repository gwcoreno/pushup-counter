'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/utils/supabase/server';

export type SaveSessionResult = { ok: true } | { ok: false; error: string };

export async function saveWorkoutSession(input: {
  startTimeIso: string;
  endTimeIso: string;
  reps: number;
}): Promise<SaveSessionResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: 'Not signed in.' };
  }

  const reps = Math.max(0, Math.floor(Number(input.reps) || 0));

  const { error } = await supabase.from('sessions').insert({
    user_id: user.id,
    start_time: input.startTimeIso,
    end_time: input.endTimeIso,
    reps,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/sessions');
  return { ok: true };
}
