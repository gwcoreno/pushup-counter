import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ProfileDisplayNameForm } from '@/components/profile/ProfileDisplayNameForm';
import { guestDisplayName, resolveDisplayName } from '@/lib/battle/display-name';
import { createServerSupabase } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  email: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ converted?: string }>;
}) {
  const { converted } = await searchParams;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/profile');
  }

  const [{ data: profile, error: profileError }, { count: sessionCount, error: sessionsError }, { data: repsRows }] =
    await Promise.all([
      supabase
        .from('users')
        .select('email,display_name,created_at,updated_at')
        .eq('id', user.id)
        .maybeSingle(),
      supabase.from('sessions').select('*', { count: 'exact', head: true }),
      supabase.from('sessions').select('reps'),
    ]);

  const dbProfile = profile as ProfileRow | null;
  const totalReps = (repsRows ?? []).reduce((sum, row) => sum + (row.reps ?? 0), 0);
  const displayEmail = user.email ?? dbProfile?.email ?? null;
  const displayName = resolveDisplayName(user, dbProfile?.display_name, displayEmail);
  const memberSince = dbProfile?.created_at ?? user.created_at;

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Profile</h1>
        <Button variant="outline" size="sm" asChild>
          <Link href="/">Home</Link>
        </Button>
      </div>

      {converted === '1' && !user.is_anonymous && (
        <p className="text-sm text-green-600 rounded-lg border border-border bg-surface p-3">
          Your guest account is now saved. Your display name, workouts, and battle history stayed on this
          account.
        </p>
      )}

      {(profileError || sessionsError) && (
        <p className="text-red-600 text-sm">
          Unable to load profile.
        </p>
      )}

      <section className="rounded-lg border border-border p-4 space-y-4">
        <div>
          <p className="text-xs font-medium text-muted uppercase tracking-wide">Display name</p>
          <p className="mt-1 text-lg font-semibold">{displayName ?? 'Not set'}</p>
          {!dbProfile?.display_name && !guestDisplayName(user) && displayName && displayEmail && (
            <p className="text-xs text-muted mt-1">
              Defaults to your email username until you save a custom name.
            </p>
          )}
        </div>
        <ProfileDisplayNameForm currentName={displayName ?? ''} />
      </section>

      <section className="rounded-lg border border-border divide-y divide-border">
        <dl className="p-4 space-y-4">
          <div>
            <dt className="text-xs font-medium text-muted uppercase tracking-wide">Account</dt>
            <dd className="mt-1 text-sm">
              {user.is_anonymous ? (
                <span>
                  Guest{' '}
                  <span className="text-muted">
                    —{' '}
                    <Link href="/signup" className="text-blue-600 hover:underline">
                      save your account
                    </Link>{' '}
                    with email to keep your data and sign in on other devices
                  </span>
                </span>
              ) : (
                displayEmail ?? '—'
              )}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted uppercase tracking-wide">Member since</dt>
            <dd className="mt-1 text-sm">{formatLocal(memberSince)}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Workout stats</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Sessions" value={String(sessionCount ?? 0)} />
          <StatCard label="Total reps" value={String(totalReps)} />
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/sessions">View all sessions →</Link>
        </Button>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-medium text-muted uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function formatLocal(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
