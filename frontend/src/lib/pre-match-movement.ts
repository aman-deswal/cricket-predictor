export interface MovementPredictionSnapshot {
  team1_win_probability: number;
  team2_win_probability: number;
  captured_at: string;
  change_events?: MovementChangeEvent[] | null;
}

export interface MovementChangeEvent {
  event_at: string;
  category: string;
  type: string;
  label: string;
  summary: string;
  affected_team?: string | null;
  affected_input: string;
  relationship: 'coincided_input_change';
  probability_delta?: number | null;
  source?: {
    name?: string;
    reference?: string;
    observed_at?: string;
  };
}

export interface MovementAnnotation {
  timestamp: number;
  probability: number;
  eventCount: number;
}

export interface MovementEventItem extends MovementChangeEvent {
  snapshot_at: string;
  display_probability_delta: number | null;
  isLegacyFallback: boolean;
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
  annotations: MovementAnnotation[];
  events: MovementEventItem[];
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
  const annotations: MovementAnnotation[] = [];
  const events: MovementEventItem[] = [];
  let previousModelProbability: number | null = null;

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
    const storedEvents = Array.isArray(snapshot.change_events)
      ? snapshot.change_events
      : [];
    const probabilityDelta = previousModelProbability === null
      ? null
      : probability - previousModelProbability;
    const displayDelta = trackedTeam === 'team1'
      ? probabilityDelta
      : probabilityDelta === null ? null : -probabilityDelta;
    const shapedEvents = storedEvents.length > 0
      ? storedEvents.map((event) => ({
          ...event,
          snapshot_at: snapshot.captured_at,
          display_probability_delta: event.probability_delta === null
            || event.probability_delta === undefined
            ? displayDelta
            : trackedTeam === 'team1'
              ? event.probability_delta
              : -event.probability_delta,
          isLegacyFallback: false,
        }))
      : [{
          event_at: snapshot.captured_at,
          category: 'legacy',
          type: 'attribution_unavailable',
          label: 'Input attribution unavailable',
          summary: 'This legacy model snapshot did not retain the structured input changes that coincided with its probability.',
          affected_team: null,
          affected_input: 'structured_inputs',
          relationship: 'coincided_input_change' as const,
          probability_delta: displayDelta,
          source: {},
          snapshot_at: snapshot.captured_at,
          display_probability_delta: displayDelta,
          isLegacyFallback: true,
        }];
    events.push(...shapedEvents);
    annotations.push({
      timestamp,
      probability: probability * 100,
      eventCount: shapedEvents.length,
    });
    previousModelProbability = probability;
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
    annotations,
    events: events.sort(
      (left, right) => new Date(right.event_at).getTime() - new Date(left.event_at).getTime(),
    ),
  };
}
