'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { signUp, type AuthActionState } from '@/app/actions/auth';

const initial: AuthActionState = {};

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUp, initial);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      <div className="w-full max-w-sm space-y-2 text-center">
        <h1 className="text-2xl font-bold">Sign up</h1>
        <p className="text-sm text-muted">Create an account with email and password.</p>
      </div>

      <form action={formAction} className="w-full max-w-sm space-y-4">
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
            autoComplete="new-password"
            required
            minLength={6}
            className="w-full border border-border rounded-lg px-3 py-2 bg-background"
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            className="w-full border border-border rounded-lg px-3 py-2 bg-background"
          />
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg"
        >
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="text-blue-600 underline">
          Log in
        </Link>
      </p>
      <Link href="/" className="text-sm text-muted hover:underline">
        ← Home
      </Link>
    </main>
  );
}
