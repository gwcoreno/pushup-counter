import { createServerSupabase } from '@/utils/supabase/server';
import { HomePushUpCounter } from '@/components/HomePushUpCounter';

export default async function Home() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-10 gap-6">
      <header className="text-center">
        <h1 className="text-3xl sm:text-4xl font-bold">Push-Up Counter</h1>
        <p className="text-sm sm:text-base text-muted mt-2">
          Position yourself directly in front of the camera so both elbows are visible.
        </p>
        {!user && (
          <p className="text-xs text-muted mt-2">
            Sign in to save each workout.
          </p>
        )}
      </header>
      <HomePushUpCounter />
    </main>
  );
}
