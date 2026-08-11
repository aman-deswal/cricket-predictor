import { useLocalSearchParams } from 'expo-router';

import { ScreenState } from '@/components/screen-state';

export default function MatchDetailsScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();

  return (
    <ScreenState
      title="Match details foundation ready"
      detail={`The native details data composition for ${matchId ?? 'this match'} is tracked by issue #178.`}
    />
  );
}
