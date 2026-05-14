'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn, type AuthActionState } from '@/app/actions/auth';

const initial: AuthActionState = {};

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';
  const registered = searchParams.get('registered') === '1';

  const [state, formAction, pending] = useActionState(signIn, initial);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      <div className="w-full max-w-sm space-y-2 text-center">
        <h1 className="text-2xl font-bold">Log in</h1>
        <p className="text-sm text-muted">
          Use the email and password you signed up with.
        </p>
      </div>

      {registered && (
        <p className="text-sm text-green-600 max-w-sm text-center">
          Account created. You can sign in below.
        </p>
      )}

      <form action={formAction} className="w-full max-w-sm space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full border border-border rounded-lg px-3 py-2 bg-background"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full border border-border rounded-lg px-3 py-2 bg-background"
          />
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-sm text-muted">
        No account?{' '}
        <Link href="/signup" className="text-blue-600 underline">
          Sign up
        </Link>
      </p>
      <Link href="/" className="text-sm text-muted hover:underline">
        ← Home
      </Link>
    </main>
  );
}
