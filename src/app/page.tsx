'use client';

import dynamic from 'next/dynamic';

const PushUpCounter = dynamic(() => import('@/components/PushUpCounter'), {
  ssr: false,
});

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-10 gap-6">
      <header className="text-center">
        <h1 className="text-3xl sm:text-4xl font-bold">Push-Up Counter</h1>
        <p className="text-sm sm:text-base text-foreground/70 mt-2">
          Position yourself sideways to the camera so both elbows are visible.
        </p>
      </header>
      <PushUpCounter />
    </main>
  );
}
