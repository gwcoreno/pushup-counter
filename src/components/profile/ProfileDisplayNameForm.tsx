'use client';

import { useActionState } from 'react';
import { updateDisplayName, type ProfileActionState } from '@/app/actions/profile';
import { DISPLAY_NAME_MAX } from '@/lib/battle/display-name';

const initial: ProfileActionState = {};

export function ProfileDisplayNameForm({ currentName }: { currentName: string }) {
  const [state, formAction, pending] = useActionState(updateDisplayName, initial);

  return (
    <form action={formAction} className="space-y-3">
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
          key={currentName}
          defaultValue={currentName}
          className="w-full max-w-sm border border-border rounded-lg px-3 py-2 bg-background text-sm"
        />
        <p className="text-xs text-muted mt-1">
          Shown in battles and on your profile. Leave blank to use your email username.
        </p>
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-600">Display name updated.</p>}
      <button
        type="submit"
        disabled={pending}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg"
      >
        {pending ? 'Saving…' : 'Save display name'}
      </button>
    </form>
  );
}
