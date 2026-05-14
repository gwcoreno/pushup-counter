import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

type CookieStore = Awaited<ReturnType<typeof cookies>>;

export const createClient = (cookieStore: CookieStore) =>
  createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // setAll from a Server Component — middleware refreshes sessions.
        }
      },
    },
  });

/** Supabase server client using Next.js cookies (Route Handlers, Server Actions, RSC). */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createClient(cookieStore);
}
