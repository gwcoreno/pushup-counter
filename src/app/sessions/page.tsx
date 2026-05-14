import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createServerSupabase } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

type SessionRow = {
  id: string;
  start_time: string;
  end_time: string;
  reps: number;
};

export default async function SessionsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/sessions');
  }

  const { data, error } = await supabase
    .from('sessions')
    .select('id,start_time,end_time,reps')
    .order('start_time', { ascending: false });

  const sessions = (data ?? []) as SessionRow[];

  return (
    <main className="min-h-screen p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Workout sessions</h1>
        <Button variant="outline" size="sm" asChild>
          <Link href="/">← Counter</Link>
        </Button>
      </div>

      {error && (
        <p className="text-red-600 text-sm">
          {error.message} — run the SQL migration in Supabase if tables are missing.
        </p>
      )}

      {!error && sessions.length === 0 && (
        <p className="text-sm text-muted">
          No saved sessions yet. Start the counter while logged in, then press Stop to record a
          session.
        </p>
      )}

      {sessions.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left">
                <th className="p-3 font-medium">Start</th>
                <th className="p-3 font-medium">End</th>
                <th className="p-3 font-medium whitespace-nowrap">Duration</th>
                <th className="p-3 font-medium text-right">Reps</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="p-3 whitespace-nowrap">{formatLocal(s.start_time)}</td>
                  <td className="p-3 whitespace-nowrap">{formatLocal(s.end_time)}</td>
                  <td className="p-3 whitespace-nowrap tabular-nums text-muted">
                    {formatDuration(s.start_time, s.end_time)}
                  </td>
                  <td className="p-3 text-right tabular-nums">{s.reps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function formatLocal(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Elapsed time from start to end (e.g. `3m 12s`, `1h 5m`). */
function formatDuration(startIso: string, endIso: string) {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return '—';

  const totalSec = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);

  return parts.join(' ');
}
