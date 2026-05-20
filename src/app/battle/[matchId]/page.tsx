import { BattleMatchClient } from '@/components/battle/BattleMatchClient';

export default function BattleMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  return <BattleMatchClient paramsPromise={params} />;
}
