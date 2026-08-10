export type CanonicalMatchStatus = 'upcoming' | 'live' | 'completed';

export interface MatchStatusPresentation {
  kind: CanonicalMatchStatus;
  label: 'UPCOMING' | 'LIVE' | 'FINAL';
  showCountdown: boolean;
}

export function getMatchStatusPresentation(status: CanonicalMatchStatus): MatchStatusPresentation {
  if (status === 'live') {
    return { kind: 'live', label: 'LIVE', showCountdown: false };
  }
  if (status === 'completed') {
    return { kind: 'completed', label: 'FINAL', showCountdown: false };
  }
  return { kind: 'upcoming', label: 'UPCOMING', showCountdown: true };
}
