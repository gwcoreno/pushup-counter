import Link from 'next/link';
import { createServerSupabase } from '@/utils/supabase/server';
import { signOut } from '@/app/actions/auth';

export async function AuthBar() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="w-full border-b border-border px-4 py-3 flex items-center justify-between gap-4 max-w-3xl mx-auto">
      <nav className="flex items-center gap-4 text-sm">
        <Link href="/" className="font-medium hover:underline">
          Push-Up Counter
        </Link>
        {user && (
          <>
            <Link href="/battle" className="text-muted hover:underline">
              1v1 battle
            </Link>
            <Link href="/sessions" className="text-muted hover:underline">
              My sessions
            </Link>
          </>
        )}
      </nav>
      <div className="flex items-center gap-3 text-sm">
        {user ? (
          <>
            <span className="text-muted truncate max-w-[200px]" title={user.email ?? ''}>
              {user.email}
            </span>
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
