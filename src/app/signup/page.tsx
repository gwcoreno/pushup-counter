import { redirect } from 'next/navigation';
import { SignupForm } from '@/components/SignupForm';
import { resolveDisplayName } from '@/lib/battle/display-name';
import { createServerSupabase } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !user.is_anonymous) {
    redirect('/profile');
  }

  let initialDisplayName: string | null = null;
  if (user?.is_anonymous) {
    const { data: profile } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    initialDisplayName = resolveDisplayName(user, profile?.display_name);
  }

  return (
    <SignupForm
      convertingGuest={Boolean(user?.is_anonymous)}
      initialDisplayName={initialDisplayName}
    />
  );
}
