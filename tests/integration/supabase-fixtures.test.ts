import { afterEach, describe, expect, it } from 'vitest';
import {
  createTestSessions,
  createTestUser,
  deleteTestUser,
  getServiceSupabase,
  isServiceSupabaseConfigured,
  sessionWindow,
} from '../helpers/supabase-test-data';

describe.skipIf(!isServiceSupabaseConfigured())('Supabase fixtures', () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (!userId) return;
    await deleteTestUser(userId);
    userId = undefined;
  });

  it('createTestUser + createTestSessions seeds rows readable with service client', async () => {
    const user = await createTestUser();
    userId = user.userId;

    const t0 = new Date('2026-03-01T10:00:00.000Z');
    const w1 = sessionWindow(t0, 5 * 60 * 1000);
    const w2 = sessionWindow(new Date(t0.getTime() + 24 * 60 * 60 * 1000), 90_000);

    const { ids } = await createTestSessions(user.userId, [
      { ...w1, reps: 10 },
      { ...w2, reps: 22 },
    ]);

    expect(ids).toHaveLength(2);

    const admin = getServiceSupabase();
    const { data, error } = await admin
      .from('sessions')
      .select('reps,start_time')
      .eq('user_id', user.userId)
      .order('start_time', { ascending: true });

    expect(error).toBeNull();
    expect(data?.map((r) => r.reps)).toEqual([10, 22]);
  });
});
