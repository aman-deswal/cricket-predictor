export interface MovementPredictionSnapshot {
  team1_win_probability: number;
  team2_win_probability: number;
  captured_at: string;
}

export interface MovementOddsSnapshot {
  team1_odds: number;
  team2_odds: number;
  draw_odds: number | null;
  fetched_at: string;
}

export interface MovementMarketBook {
  id: string;
  bookmaker: string;
  color: string;
  history: MovementOddsSnapshot[];
}

export interface MovementSeries {
  id: string;
  label: string;
  color: string;
  kind: 'model' | 'market';
}

export interface PreMatchMovement {
  chartRows: Array<Record<string, number | null>>;
  series: MovementSeries[];
  minDomain: number;
  maxDomain: number;
  modelPointCount: number;
  marketPointCount: number;
}

export const SIXSENSE_SERIES_ID = 'sixsense-model';

export function hasValidTwoSidedOdds(snapshot: MovementOddsSnapshot): boolean {
  return Number.isFinite(snapshot.team1_odds)
    && snapshot.team1_odds > 1
    && Number.isFinite(snapshot.team2_odds)
    && snapshot.team2_odds > 1;
}

export function toNormalizedImpliedProbability(
  snapshot: MovementOddsSnapshot,
  trackedTeam: 'team1' | 'team2',
): number | null {
  if (!hasValidTwoSidedOdds(snapshot)) return null;
  const raw1 = 1 / snapshot.team1_odds;
  const raw2 = 1 / snapshot.team2_odds;
  const rawDraw = snapshot.draw_odds && snapshot.draw_odds > 1 ? 1 / snapshot.draw_odds : 0;
  const total = raw1 + raw2 + rawDraw;
  if (total <= 0) return null;
  return ((trackedTeam === 'team1' ? raw1 : raw2) / total) * 100;
}

export function buildPreMatchMovement(
  predictionHistory: MovementPredictionSnapshot[],
  marketBooks: MovementMarketBook[],
  trackedTeam: 'team1' | 'team2',
): PreMatchMovement {
  const rowsByTimestamp = new Map<number, Record<string, number | null>>();
  let modelPointCount = 0;
  let marketPointCount = 0;

  predictionHistory.forEach((snapshot) => {
    const timestamp = new Date(snapshot.captured_at).getTime();
    const probability = trackedTeam === 'team1'
      ? snapshot.team1_win_probability
      : snapshot.team2_win_probability;
    if (Number.isNaN(timestamp) || !Number.isFinite(probability)) return;
    const row = rowsByTimestamp.get(timestamp) ?? { timestamp };
    row[SIXSENSE_SERIES_ID] = probability * 100;
    rowsByTimestamp.set(timestamp, row);
    modelPointCount += 1;
  });

  const marketSeries: MovementSeries[] = [];
  marketBooks.forEach((book) => {
    let bookPointCount = 0;
    book.history.forEach((snapshot) => {
      const timestamp = new Date(snapshot.fetched_at).getTime();
      const probability = toNormalizedImpliedProbability(snapshot, trackedTeam);
      if (Number.isNaN(timestamp) || probability === null) return;
      const row = rowsByTimestamp.get(timestamp) ?? { timestamp };
      row[book.id] = probability;
      rowsByTimestamp.set(timestamp, row);
      bookPointCount += 1;
      marketPointCount += 1;
    });
    if (bookPointCount > 0) {
      marketSeries.push({
        id: book.id,
        label: `${book.bookmaker} market`,
        color: book.color,
        kind: 'market',
      });
    }
  });

  const series: MovementSeries[] = [
    ...(modelPointCount > 0
      ? [{
          id: SIXSENSE_SERIES_ID,
          label: 'SixSense model',
          color: '#f59e0b',
          kind: 'model' as const,
        }]
      : []),
    ...marketSeries,
  ];
  const chartRows = [...rowsByTimestamp.values()]
    .sort((left, right) => Number(left.timestamp) - Number(right.timestamp));
  const values = chartRows.flatMap((row) => series.map((entry) => row[entry.id]))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  let minDomain = 40;
  let maxDomain = 60;
  if (values.length > 0) {
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const spread = Math.max(rawMax - rawMin, 6);
    const center = (rawMin + rawMax) / 2;
    minDomain = Math.max(0, Math.floor(center - spread / 2 - 3));
    maxDomain = Math.min(100, Math.ceil(center + spread / 2 + 3));
  }

  return {
    chartRows,
    series,
    minDomain,
    maxDomain,
    modelPointCount,
    marketPointCount,
  };
}
