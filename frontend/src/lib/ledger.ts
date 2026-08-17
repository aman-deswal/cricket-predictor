import { getCompetitionProfile } from './competition';
import { isInternationalMatch } from './prediction-history';

export type LedgerScope = 'international' | 'league';

export interface LedgerMarketOdds {
  bookmaker: string;
  team1_odds: number;
  team2_odds: number;
}

export interface LedgerEdgeSnapshot {
  net_edge: number;
  edge_team: string;
}

export interface LedgerEntry {
  match_id: string;
  name: string;
  team1: string;
  team2: string;
  date: string;
  venue?: string | null;
  match_type?: string;
  status?: 'completed';
  predicted_winner: string;
  actual_winner: string;
  correct: boolean;
  confidence?: 'low' | 'medium' | 'high';
  team1_win_probability?: number;
  team2_win_probability?: number;
  predicted_probability: number;
  result_text?: string | null;
  scored_at: string;
  competition_name?: string | null;
  series_scoreline?: string | null;
  scorecards?: unknown[] | null;
  reasoning?: string;
  bookmaker_odds?: LedgerMarketOdds | null;
  edge_score?: LedgerEdgeSnapshot | null;
}

export interface ScorecardSummary {
  inningsNumber: number | null;
  teamName: string;
  headline: string;
  total: string | null;
  topBatter: string | null;
}

const LEDGER_POOL_LIMIT = 12;
const LEDGER_VISIBLE_COUNT = 3;
const LEDGER_WINDOW_DAYS = 45;
const ROTATION_WINDOW_MS = 12 * 60 * 60 * 1000;

function toTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getRotationSeed(now: Date): number {
  return Math.floor(now.getTime() / ROTATION_WINDOW_MS);
}

function getCompetitionKey(entry: LedgerEntry): string {
  if (entry.competition_name?.trim()) return entry.competition_name.trim().toLowerCase();
  return getCompetitionProfile({
    name: entry.name,
    team1: entry.team1,
    team2: entry.team2,
    date: entry.date,
    match_type: entry.match_type ?? 'cricket',
    status: entry.status ?? 'completed',
    competition_name: entry.competition_name ?? null,
  }).key;
}

export function getLedgerScope(entry: Pick<LedgerEntry, 'team1' | 'team2' | 'predicted_winner' | 'actual_winner'>): LedgerScope {
  const profile = getCompetitionProfile({
    name: 'name' in entry && typeof entry.name === 'string' ? entry.name : `${entry.team1} vs ${entry.team2}`,
    team1: entry.team1,
    team2: entry.team2,
    date: 'date' in entry && typeof entry.date === 'string' ? entry.date : '',
    match_type: 'match_type' in entry && typeof entry.match_type === 'string' ? entry.match_type : 'cricket',
    status: 'status' in entry && typeof entry.status === 'string' ? entry.status : 'completed',
    competition_name: 'competition_name' in entry && typeof entry.competition_name === 'string'
      ? entry.competition_name
      : null,
  });

  if (profile.kind === 'League') return 'league';
  return isInternationalMatch(entry) ? 'international' : 'league';
}

export function getLedgerEvidenceScore(entry: LedgerEntry): number {
  return (
    Number(Boolean(entry.result_text?.trim())) * 20
    + Number(Boolean(entry.bookmaker_odds)) * 18
    + Number((entry.scorecards?.length ?? 0) > 0) * 16
    + Number(Boolean(entry.series_scoreline?.trim())) * 10
    + Number(Boolean(entry.edge_score)) * 12
    + Number(Boolean(entry.reasoning?.trim())) * 8
    + (entry.confidence === 'high' ? 4 : entry.confidence === 'medium' ? 2 : 0)
  );
}

function compareLedgerEntries(left: LedgerEntry, right: LedgerEntry): number {
  const evidenceDiff = getLedgerEvidenceScore(right) - getLedgerEvidenceScore(left);
  if (evidenceDiff !== 0) return evidenceDiff;

  const scoredDiff = toTimestamp(right.scored_at) - toTimestamp(left.scored_at);
  if (scoredDiff !== 0) return scoredDiff;

  if (Number(right.correct) !== Number(left.correct)) {
    return Number(right.correct) - Number(left.correct);
  }

  return left.match_id.localeCompare(right.match_id);
}

function rotateEntries<T>(entries: T[], seed: number): T[] {
  if (entries.length <= 1) return entries;
  const start = seed % entries.length;
  return entries.slice(start).concat(entries.slice(0, start));
}

function pushCandidate(
  output: LedgerEntry[],
  entry: LedgerEntry,
  competitionCounts: Map<string, number>,
  strictCompetitionCap: boolean,
): boolean {
  if (output.some((candidate) => candidate.match_id === entry.match_id)) return false;

  const competitionKey = getCompetitionKey(entry);
  const currentCompetitionCount = competitionCounts.get(competitionKey) ?? 0;
  if (strictCompetitionCap && currentCompetitionCount >= 2) return false;

  output.push(entry);
  competitionCounts.set(competitionKey, currentCompetitionCount + 1);
  return true;
}

export function selectLedgerEntries(
  entries: LedgerEntry[],
  scope: LedgerScope,
  now = new Date(),
): LedgerEntry[] {
  const cutoff = now.getTime() - LEDGER_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const scopedEntries = entries
    .filter((entry) => getLedgerScope(entry) === scope)
    .filter((entry) => {
      const scoredAt = toTimestamp(entry.scored_at);
      return scoredAt === 0 || scoredAt >= cutoff;
    })
    .sort((left, right) => toTimestamp(right.scored_at) - toTimestamp(left.scored_at))
    .slice(0, LEDGER_POOL_LIMIT);

  if (scopedEntries.length <= LEDGER_VISIBLE_COUNT) {
    return [...scopedEntries].sort(compareLedgerEntries);
  }

  const seed = getRotationSeed(now);
  const rankedEntries = rotateEntries([...scopedEntries].sort(compareLedgerEntries), seed);
  const rotatedLosses = rotateEntries(
    rankedEntries.filter((entry) => !entry.correct),
    seed,
  );

  const selection: LedgerEntry[] = [];
  const competitionCounts = new Map<string, number>();

  if (rotatedLosses.length > 0) {
    pushCandidate(selection, rotatedLosses[0], competitionCounts, true);
  }

  for (const candidate of rankedEntries) {
    if (selection.length >= LEDGER_VISIBLE_COUNT) break;
    pushCandidate(selection, candidate, competitionCounts, true);
  }

  if (selection.length < LEDGER_VISIBLE_COUNT) {
    for (const candidate of rankedEntries) {
      if (selection.length >= LEDGER_VISIBLE_COUNT) break;
      pushCandidate(selection, candidate, competitionCounts, false);
    }
  }

  return selection.sort(compareLedgerEntries);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function formatScorecardTotal(total: unknown): string | null {
  if (typeof total === 'string' && total.trim()) return total.trim();

  const totalRecord = asRecord(total);
  if (!totalRecord) return null;

  for (const field of ['displayValue', 'summary', 'score']) {
    const value = totalRecord[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  const runs = totalRecord.runs;
  const wickets = totalRecord.wickets;
  const overs = totalRecord.overs;
  if (typeof runs === 'number' || typeof runs === 'string') {
    const runsText = String(runs);
    const wicketsText = wickets === null || wickets === undefined || wickets === '' ? '' : `/${wickets}`;
    const oversText = overs === null || overs === undefined || overs === '' ? '' : ` (${overs} ov)`;
    return `${runsText}${wicketsText}${oversText}`;
  }

  return null;
}

export function buildScorecardSummaries(scorecards: unknown[] | null | undefined): ScorecardSummary[] {
  if (!Array.isArray(scorecards)) return [];

  return scorecards
    .map((entry) => {
      const row = asRecord(entry);
      if (!row) return null;

      const batting = Array.isArray(row.batting) ? row.batting : [];
      const topBatter = batting
        .map((candidate) => asRecord(candidate))
        .filter((candidate): candidate is Record<string, unknown> => candidate !== null)
        .sort((left, right) => Number(right.runs ?? 0) - Number(left.runs ?? 0))[0];

      const topBatterSummary = topBatter
        ? `${String(topBatter.player_name ?? 'Top score')} ${String(topBatter.runs ?? '').trim()}`
        : null;

      const teamName = typeof row.team_name === 'string' ? row.team_name.trim() : '';
      const headline = typeof row.headline === 'string' ? row.headline.trim() : '';
      const total = formatScorecardTotal(row.total);

      if (!teamName && !headline && !total) return null;

      return {
        inningsNumber: typeof row.innings_number === 'number' ? row.innings_number : null,
        teamName,
        headline,
        total,
        topBatter: topBatterSummary,
      };
    })
    .filter((entry): entry is ScorecardSummary => entry !== null)
    .slice(0, 4);
}
