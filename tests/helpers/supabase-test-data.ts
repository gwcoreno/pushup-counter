import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
}

/** Service-role client (bypasses RLS). Use only in tests / trusted scripts. */
export function getServiceSupabase(): SupabaseClient {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (Dashboard → Settings → API).',
    );
  }
  if (!adminClient) {
    adminClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

export function isServiceSupabaseConfigured(): boolean {
  return !!(supabaseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export type CreatedTestUser = {
  userId: string;
  email: string;
  password: string;
};

/**
 * Creates a confirmed auth user. `public.users` is filled by the DB trigger.
 * @param options.email — default: unique `test-…@example.test`
 * @param options.password — default: `TestUser-password-1`
 */
export async function createTestUser(options?: {
  email?: string;
  password?: string;
}): Promise<CreatedTestUser> {
  const admin = getServiceSupabase();
  const email =
    options?.email ??
    `test-${Date.now()}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = options?.password ?? 'TestUser-password-1';

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) throw error;
  if (!data.user) throw new Error('auth.admin.createUser returned no user');

  return { userId: data.user.id, email, password };
}

export type TestSessionInput = {
  startTimeIso: string;
  endTimeIso: string;
  reps: number;
};

/** Build ISO start/end from a start instant and duration (for readable tests). */
export function sessionWindow(start: Date, durationMs: number): Pick<TestSessionInput, 'startTimeIso' | 'endTimeIso'> {
  const end = new Date(start.getTime() + durationMs);
  return { startTimeIso: start.toISOString(), endTimeIso: end.toISOString() };
}

/**
 * Inserts workout rows into `public.sessions` for an existing user id.
 * RLS is bypassed when using the service-role client.
 */
export async function createTestSessions(
  userId: string,
  sessions: TestSessionInput[],
): Promise<{ ids: string[] }> {
  if (sessions.length === 0) return { ids: [] };

  const admin = getServiceSupabase();
  const rows = sessions.map((s) => ({
    user_id: userId,
    start_time: s.startTimeIso,
    end_time: s.endTimeIso,
    reps: Math.max(0, Math.floor(Number(s.reps) || 0)),
  }));

  const { data, error } = await admin.from('sessions').insert(rows).select('id');
  if (error) throw error;

  return { ids: (data ?? []).map((r) => r.id as string) };
}

/** Deletes the auth user (cascades `public.users` and `public.sessions`). */
export async function deleteTestUser(userId: string): Promise<void> {
  const admin = getServiceSupabase();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}
