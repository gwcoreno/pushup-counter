'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';
import { signUp, type AuthActionState } from '@/app/actions/auth';
import { DISPLAY_NAME_MAX } from '@/lib/battle/display-name';

const initial: AuthActionState = {};

type SignupFormProps = {
  convertingGuest?: boolean;
  initialDisplayName?: string | null;
};

export function SignupForm({
  convertingGuest = false,
  initialDisplayName = null,
}: SignupFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(signUp, initial);
  const [displayName, setDisplayName] = useState(initialDisplayName ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (state?.success) {
      router.push('/');
      router.refresh();
      return;
    }
    if (state?.fields) {
      setEmail(state.fields.email);
      setDisplayName(state.fields.displayName);
    }
    if (state?.clearPasswords) {
      setPassword('');
      setConfirmPassword('');
    }
    if (state?.error) {
      setClientError(null);
    }
  }, [state, router]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    setClientError(null);
    const formData = new FormData(e.currentTarget);
    const pwd = String(formData.get('password') ?? '');
    const confirm = String(formData.get('confirmPassword') ?? '');

    if (pwd !== confirm) {
      e.preventDefault();
      setEmail(String(formData.get('email') ?? '').trim());
      setDisplayName(String(formData.get('displayName') ?? ''));
      setPassword('');
      setConfirmPassword('');
      setClientError('Passwords do not match.');
    }
    // When passwords match, native form submission runs `formAction` in a transition.
  };

  const errorMessage = clientError ?? state?.error;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      <div className="w-full max-w-sm space-y-2 text-center">
        <h1 className="text-2xl font-bold">
          {convertingGuest ? 'Save your guest account' : 'Sign up'}
        </h1>
        <p className="text-sm text-muted">
          {convertingGuest
            ? 'Add email and password to keep your display name, workouts, and battle history on this account.'
            : 'Create an account with email and password. Add a display name so others can recognize you in battles.'}
        </p>
      </div>

      <form action={formAction} onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium mb-1">
            Display name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="nickname"
            maxLength={DISPLAY_NAME_MAX}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={
              convertingGuest && initialDisplayName
                ? initialDisplayName
                : 'Leave blank to use email username'
            }
            className="w-full border border-border rounded-lg px-3 py-2 bg-background"
          />
          {convertingGuest && initialDisplayName && (
            <p className="text-xs text-muted mt-1">
              Leave blank to keep <strong>{initialDisplayName}</strong>.
            </p>
          )}
        </div>
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 bg-background"
          />
        </div>
        {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg"
        >
          {pending
            ? convertingGuest
              ? 'Saving account…'
              : 'Creating account…'
            : convertingGuest
              ? 'Save account'
              : 'Create account'}
        </button>
      </form>

      <p className="text-sm text-muted">
        {convertingGuest ? (
          <>
            Already have a full account?{' '}
            <Link href="/login" className="text-blue-600 underline">
              Sign in
            </Link>{' '}
            (that uses a different account — use a new email above to upgrade this guest).
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 underline">
              Log in
            </Link>
          </>
        )}
      </p>
      <Link href="/" className="text-sm text-muted hover:underline">
        ← Home
      </Link>
    </main>
  );
}
