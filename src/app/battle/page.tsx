import { redirect } from 'next/navigation';
import { BattleLobby } from '@/components/battle/BattleLobby';
import { createServerSupabase } from '@/utils/supabase/server';

export default async function BattlePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/battle');
  }
  return <BattleLobby />;
}
