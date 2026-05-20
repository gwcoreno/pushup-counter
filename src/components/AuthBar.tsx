import Link from 'next/link';
import { signOut } from '@/app/actions/auth';
import { resolveDisplayName } from '@/lib/battle/display-name';
import { createServerSupabase } from '@/utils/supabase/server';

export async function AuthBar() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let headerLabel = 'Account';
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    headerLabel =
      resolveDisplayName(user, profile?.display_name, user.email) ??
      (user.is_anonymous ? 'Guest' : 'Account');
  }

  return (
    <header className="w-full border-b border-border px-4 py-3 flex items-center justify-between gap-4 max-w-3xl mx-auto">
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/" className="font-medium hover:underline">
          Push-Up Counter
        </Link>
        <Link href="/battle" className="text-muted hover:underline">
          1v1 battle
        </Link>
        {user && (
          <>
            <Link href="/sessions" className="text-muted hover:underline">
              My sessions
            </Link>
          </>
        )}
      </nav>
      <div className="flex items-center gap-3 text-sm">
        {user ? (
          <>
            <Link
              href="/profile"
              className="text-muted truncate max-w-[200px] hover:underline"
              title={headerLabel}
            >
              {headerLabel}
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="text-foreground hover:underline border border-border rounded-md px-2 py-1"
              >
                Sign out
              </button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login" className="text-blue-600 hover:underline">
              Log in
            </Link>
            <Link
              href="/signup"
              className="bg-blue-600 text-white rounded-md px-3 py-1.5 hover:bg-blue-700"
            >
              Sign up
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
