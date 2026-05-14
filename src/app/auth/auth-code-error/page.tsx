import Link from 'next/link';

export default function AuthCodeErrorPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Sign-in link did not work</h1>
      <p className="text-sm text-muted text-center max-w-md">
        The link may have expired or already been used. Try signing in again from the login page.
      </p>
      <Link href="/login" className="text-blue-600 underline text-sm">
        Back to login
      </Link>
    </main>
  );
}
