import { getTeamMeta } from './teams';

export type AccuracyPeriod = 'week' | 'month' | 'all';
export type AccuracyScope = 'international' | 'league' | 'overall';

type PeriodWithHomepagePriority = Exclude<AccuracyPeriod, 'all'>;

export interface PredictionHistoryLike {
  correct: boolean;
  scored_at: string;
  predicted_winner: string;
  actual_winner: string;
  team1?: string | null;
  team2?: string | null;
}

export interface AccuracySummary {
  correct: number;
  total: number;
  accuracy: number;
  pct: number;
}

export interface AccuracyTrendPoint {
  date: string;
  accuracy: number;
}

export interface HomepageTrustSignal {
  period: PeriodWithHomepagePriority;
  periodLabel: string;
  shortPeriodLabel: string;
  scope: AccuracyScope;
  scopeLabel: string;
  shortScopeLabel: string;
  stats: AccuracySummary;
}

export interface HomepageTrustMetrics {
  week: HomepageTrustSignal | null;
  month: HomepageTrustSignal | null;
  primary: HomepageTrustSignal | null;
  sparkline: number[];
  breakdown: {
    week: Record<AccuracyScope, HomepageTrustSignal | null>;
    month: Record<AccuracyScope, HomepageTrustSignal | null>;
  };
}

const PERIOD_SAMPLE_FLOOR: Record<PeriodWithHomepagePriority, number> = {
  week: 4,
  month: 8,
};

const PERIOD_META: Record<PeriodWithHomepagePriority, { label: string; shortLabel: string; freshnessBonus: number }> = {
  week: { label: 'This week', shortLabel: '7d', freshnessBonus: 4 },
  month: { label: 'This month', shortLabel: '30d', freshnessBonus: 2 },
};

const SCOPE_META: Record<AccuracyScope, { label: string; shortLabel: string; priority: number; bonus: number }> = {
  international: { label: 'International', shortLabel: 'Intl', priority: 0, bonus: 2 },
  overall: { label: 'All matches', shortLabel: 'All', priority: 1, bonus: 1 },
  league: { label: 'League', shortLabel: 'League', priority: 2, bonus: 0 },
};

export function isInternationalMatch(item: Pick<PredictionHistoryLike, 'team1' | 'team2' | 'predicted_winner' | 'actual_winner'>): boolean {
  const team1 = item.team1 || item.predicted_winner;
  const team2 = item.team2 || item.actual_winner;
  return Boolean(getTeamMeta(team1).countryCode) && Boolean(getTeamMeta(team2).countryCode);
}

export function filterHistoryByPeriod<T extends Pick<PredictionHistoryLike, 'scored_at'>>(items: T[], period: AccuracyPeriod): T[] {
  if (period === 'all') return items;

  const now = new Date();
  return items.filter((item) => {
    const scoredAt = new Date(item.scored_at);
    const elapsedMs = now.getTime() - scoredAt.getTime();

    if (period === 'week') {
      return elapsedMs >= 0 && elapsedMs < 7 * 24 * 60 * 60 * 1000;
    }

    return scoredAt.getMonth() === now.getMonth() && scoredAt.getFullYear() === now.getFullYear();
  });
}

export function computeAccuracy<T extends Pick<PredictionHistoryLike, 'correct'>>(items: T[]): AccuracySummary | null {
  if (!items.length) return null;

  const correct = items.filter((item) => item.correct).length;
  const accuracy = correct / items.length;

  return {
    correct,
    total: items.length,
    accuracy,
    pct: Math.round(accuracy * 100),
  };
}

export function buildAccuracyTrend<T extends Pick<PredictionHistoryLike, 'correct' | 'scored_at'>>(
  items: T[],
  window = 10,
): AccuracyTrendPoint[] {
  if (window < 2 || items.length < window) return [];

  const ordered = [...items].sort((left, right) => (
    new Date(left.scored_at).getTime() - new Date(right.scored_at).getTime()
  ));

  const trend: AccuracyTrendPoint[] = [];
  for (let index = window - 1; index < ordered.length; index += 1) {
    const slice = ordered.slice(index - window + 1, index + 1);
    const summary = computeAccuracy(slice);
    if (!summary) continue;

    trend.push({
      date: new Date(ordered[index].scored_at).toLocaleDateString(),
      accuracy: summary.accuracy * 100,
    });
  }

  return trend;
}

function filterHistoryByScope<T extends PredictionHistoryLike>(items: T[], scope: AccuracyScope): T[] {
  if (scope === 'overall') return items;
  return items.filter((item) => (scope === 'international' ? isInternationalMatch(item) : !isInternationalMatch(item)));
}

function buildScopedHomepageSignal<T extends PredictionHistoryLike>(
  items: T[],
  period: PeriodWithHomepagePriority,
  scope: AccuracyScope,
): HomepageTrustSignal | null {
  const periodItems = filterHistoryByPeriod(items, period);
  if (!periodItems.length) return null;

  const stats = computeAccuracy(filterHistoryByScope(periodItems, scope));
  if (!stats) return null;

  return {
    period,
    periodLabel: PERIOD_META[period].label,
    shortPeriodLabel: PERIOD_META[period].shortLabel,
    scope,
    scopeLabel: SCOPE_META[scope].label,
    shortScopeLabel: SCOPE_META[scope].shortLabel,
    stats,
  };
}

function buildHomepageSignal<T extends PredictionHistoryLike>(
  items: T[],
  period: PeriodWithHomepagePriority,
): HomepageTrustSignal | null {
  const candidates = (Object.keys(SCOPE_META) as AccuracyScope[])
    .map((scope) => buildScopedHomepageSignal(items, period, scope))
    .filter((signal): signal is HomepageTrustSignal => signal !== null);

  if (!candidates.length) return null;

  const preferredInternational = candidates.find((candidate) => (
    candidate.scope === 'international' && candidate.stats.total >= PERIOD_SAMPLE_FLOOR[period]
  ));
  if (preferredInternational) return preferredInternational;

  const reliableCandidates = candidates.filter((candidate) => candidate.stats.total >= PERIOD_SAMPLE_FLOOR[period]);
  const selectionPool = reliableCandidates.length ? reliableCandidates : candidates;

  return [...selectionPool].sort((left, right) => {
    if (right.stats.accuracy !== left.stats.accuracy) {
      return right.stats.accuracy - left.stats.accuracy;
    }

    if (right.stats.total !== left.stats.total) {
      return right.stats.total - left.stats.total;
    }

    return SCOPE_META[left.scope].priority - SCOPE_META[right.scope].priority;
  })[0] ?? null;
}

function getHomepageSignalScore(signal: HomepageTrustSignal): number {
  return (
    signal.stats.pct
    + Math.min(signal.stats.total, 12)
    + PERIOD_META[signal.period].freshnessBonus
    + SCOPE_META[signal.scope].bonus
  );
}

function buildSparkline<T extends PredictionHistoryLike>(items: T[], signal: HomepageTrustSignal | null): number[] {
  if (!signal) return [];

  const scopedItems = filterHistoryByScope(filterHistoryByPeriod(items, signal.period), signal.scope);
  const preferredWindow = scopedItems.length >= 18 ? 8 : scopedItems.length >= 12 ? 6 : 4;
  const scopedTrend = buildAccuracyTrend(scopedItems, Math.min(preferredWindow, scopedItems.length));
  if (scopedTrend.length >= 2) {
    return scopedTrend.slice(-8).map((point) => Math.round(point.accuracy));
  }

  const broaderScopeItems = filterHistoryByScope(items, signal.scope);
  const broaderWindow = broaderScopeItems.length >= 14 ? 6 : 4;
  const broaderTrend = buildAccuracyTrend(broaderScopeItems, Math.min(broaderWindow, broaderScopeItems.length));
  if (broaderTrend.length >= 2) {
    return broaderTrend.slice(-8).map((point) => Math.round(point.accuracy));
  }

  return [];
}

export function getHomepageTrustMetrics<T extends PredictionHistoryLike>(items: T[]): HomepageTrustMetrics {
  const week = buildHomepageSignal(items, 'week');
  const month = buildHomepageSignal(items, 'month');
  const breakdown = {
    week: {
      international: buildScopedHomepageSignal(items, 'week', 'international'),
      league: buildScopedHomepageSignal(items, 'week', 'league'),
      overall: buildScopedHomepageSignal(items, 'week', 'overall'),
    },
    month: {
      international: buildScopedHomepageSignal(items, 'month', 'international'),
      league: buildScopedHomepageSignal(items, 'month', 'league'),
      overall: buildScopedHomepageSignal(items, 'month', 'overall'),
    },
  };
  const primary = [week, month]
    .filter((signal): signal is HomepageTrustSignal => signal !== null)
    .sort((left, right) => getHomepageSignalScore(right) - getHomepageSignalScore(left))[0] ?? null;

  return {
    week,
    month,
    primary,
    sparkline: buildSparkline(items, primary),
    breakdown,
  };
}
