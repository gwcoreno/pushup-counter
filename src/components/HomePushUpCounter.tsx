'use client';

import dynamic from 'next/dynamic';

const PushUpCounter = dynamic(() => import('@/components/PushUpCounter'), {
  ssr: false,
});

export function HomePushUpCounter() {
  return <PushUpCounter />;
}
