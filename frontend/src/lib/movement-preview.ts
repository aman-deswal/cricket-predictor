export interface MovementPreviewSourcePrediction {
  team1: string;
  team2: string;
  predicted_winner: string;
  team1_win_probability: number;
  team2_win_probability: number;
}

export interface MovementPreviewSourceSnapshot {
  team1_win_probability: number;
  team2_win_probability: number;
  captured_at: string;
}

export interface MatchMovementPreviewPoint {
  timestamp: string;
  value: number;
}

export interface MatchMovementPreview {
  trackedTeam: 'team1' | 'team2';
  points: MatchMovementPreviewPoint[];
  latest: number;
  change: number | null;
  direction: 'up' | 'down' | 'flat';
}

function trackedTeamFromPrediction(prediction: MovementPreviewSourcePrediction): 'team1' | 'team2' {
  if (prediction.predicted_winner === prediction.team1) return 'team1';
  if (prediction.predicted_winner === prediction.team2) return 'team2';
  return prediction.team1_win_probability >= prediction.team2_win_probability ? 'team1' : 'team2';
}

function previewValue(
  trackedTeam: 'team1' | 'team2',
  snapshot: Pick<MovementPreviewSourceSnapshot, 'team1_win_probability' | 'team2_win_probability'>,
): number | null {
  const raw = trackedTeam === 'team1' ? snapshot.team1_win_probability : snapshot.team2_win_probability;
  if (!Number.isFinite(raw)) return null;
  return raw * 100;
}

export function buildMatchMovementPreview(
  prediction: MovementPreviewSourcePrediction | null | undefined,
  snapshots: MovementPreviewSourceSnapshot[],
): MatchMovementPreview | null {
  if (!prediction) return null;

  const trackedTeam = trackedTeamFromPrediction(prediction);
  const points = snapshots
    .map((snapshot) => {
      const timestamp = new Date(snapshot.captured_at);
      const value = previewValue(trackedTeam, snapshot);
      if (Number.isNaN(timestamp.getTime()) || value === null) return null;
      return {
        timestamp: snapshot.captured_at,
        value,
      };
    })
    .filter((point): point is MatchMovementPreviewPoint => point !== null);

  const latestPredictionPoint = {
    timestamp: new Date().toISOString(),
    value: previewValue(trackedTeam, prediction) ?? 0,
  };

  const latestExisting = points[points.length - 1];
  const mergedPoints = latestExisting && Math.abs(latestExisting.value - latestPredictionPoint.value) < 0.01
    ? points
    : [...points, latestPredictionPoint];
  const trimmed = mergedPoints.slice(-12);
  const opening = trimmed[0]?.value ?? latestPredictionPoint.value;
  const latest = trimmed[trimmed.length - 1]?.value ?? latestPredictionPoint.value;
  const change = trimmed.length > 1 ? latest - opening : null;
  const magnitude = change === null ? 0 : Math.abs(change);

  return {
    trackedTeam,
    points: trimmed,
    latest,
    change,
    direction: magnitude < 0.05 ? 'flat' : (change ?? 0) > 0 ? 'up' : 'down',
  };
}
