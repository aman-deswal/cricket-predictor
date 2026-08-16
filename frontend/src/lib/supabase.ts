import { createClient } from '@supabase/supabase-js';
import { getTeamMeta } from './teams';
import { getFranchiseLogoUrl } from './franchise-logos';
import { getStoredDemoMode } from './demo-mode';
import { compareMatchCenterMatches, hasValidMarketOdds } from './competition';
import { normalizeBookmaker, selectFreshestTrustedSportsbookOdds } from './market-odds';
import { buildAccuracyTrend } from './prediction-history';
export { getMatchSection } from './competition';
export type { MatchSection } from './competition';
import {
  getMockAccuracyTrend,
  getMockCalibrationData,
  getMockDashboardStats,
  getMockEdgeScore,
  getMockESPNMatchData,
  getMockMatch,
  getMockMatchEnrichment,
  getMockMatchOdds,
  getMockMatchOddsHistory,
  getMockPredictionSnapshots,
  getMockMatchSquads,
  getMockPlayerStats,
  getMockPrediction,
  getMockPredictionHistory,
  getMockUpcomingMatches,
} from './mock-data';

const hasSupabaseConfig = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export function isMockDataEnabled(): boolean {
  const storedMode = getStoredDemoMode();
  if (storedMode !== null) return storedMode;
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true' || !hasSupabaseConfig;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://mock.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'mock-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Match {
  match_id: string;
  name: string;
  team1: string;
  team2: string;
  date: string;
  venue: string;
  match_type: string;
  status: 'upcoming' | 'live' | 'completed';
  winner?: string;
  team1_recent_form?: Array<'W' | 'L'>;
  team2_recent_form?: Array<'W' | 'L'>;
  bookmaker_odds?: { bookmaker: string; team1_odds: number; team2_odds: number };
  team1_logo_url?: string;
  team2_logo_url?: string;
}

export interface EdgeScoreFactors {
  form: number;
  momentum: number;
  pressure: number;
  market: number;
}

export interface EdgeScore {
  team1_score: number;
  team2_score: number;
  net_edge: number;
  edge_team: string;
  narrative: string;
  factors: {
    team1: EdgeScoreFactors;
    team2: EdgeScoreFactors;
  };
}

export interface Prediction {
  match_id: string;
  team1: string;
  team2: string;
  predicted_winner: string;
  team1_win_probability: number;
  team2_win_probability: number;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
  toss_insight?: string;
  model: string;
  ensemble_size: number;
  scored_at?: string;
}

export interface PredictionSnapshot {
  match_id: string;
  team1: string;
  team2: string;
  predicted_winner: string;
  team1_win_probability: number;
  team2_win_probability: number;
  confidence: 'low' | 'medium' | 'high';
  edge_score: Record<string, unknown>;
  model: string;
  ensemble_size: number;
  input_state: Record<string, unknown>;
  change_events: PredictionChangeEvent[];
  captured_at: string;
}

export interface PredictionChangeEvent {
  event_at: string;
  category: string;
  type: string;
  label: string;
  summary: string;
  affected_team: string | null;
  affected_input: string;
  relationship: 'coincided_input_change';
  probability_delta: number | null;
  source: {
    name?: string;
    reference?: string;
    observed_at?: string;
  };
}

export interface PredictionResult {
  prediction_id: string;
  match_id: string;
  predicted_winner: string;
  actual_winner: string;
  correct: boolean;
  brier_score: number | null;
  predicted_probability: number;
  result_text?: string | null;
  scored_at: string;
}

/** PredictionResult enriched with pre-match prediction details for the history drilldown. */
export interface PredictionHistoryItem extends PredictionResult {
  team1: string;
  team2: string;
  reasoning?: string;
  toss_insight?: string;
  confidence?: 'low' | 'medium' | 'high';
  team1_win_probability?: number;
  team2_win_probability?: number;
  toss_winner?: string | null;
  toss_decision?: string | null;
}

export interface MatchEnrichment {
  match_id: string;
  venue_name: string | null;
  venue_confidence: 'confirmed' | 'reported' | 'unknown';
  possible_xi: {
    team1?: string[];
    team2?: string[];
  };
  player_updates: Array<{
    player?: string;
    team?: string;
    status: string;
    confidence?: 'confirmed' | 'reported' | 'speculative';
    source_index?: number;
  }>;
  key_players: Array<{
    name?: string;
    team?: string;
    role?: 'bat' | 'bowl' | 'all';
    form_note?: string;
    // Key battles format
    batter?: string;
    batter_team?: string;
    bowler?: string;
    bowler_team?: string;
    insight?: string;
    batter_scores?: number[];       // last 5 batting scores (newest last)
    bowler_figures?: number[];      // last 5 wicket counts per game (newest last)
    h2h?: {
      dismissals: number;
      balls_faced: number;
      runs_scored: number;
      dot_pct: number;        // % of balls that were dots
      boundary_pct: number;   // % of balls hit for 4/6
      last_5: Array<'W' | 'NW'>; // W = wicket, NW = not out
    };
  }>;
  expert_preview: string | null;
  toss_insight?: string | null;
  source_links: Array<{
    title?: string;
    url?: string;
    source?: string;
    published_at?: string | null;
  }>;
  confidence: 'high' | 'medium' | 'low';
  generated_at: string;
}

export interface MatchSpotlightSignals {
  enrichment_confidence?: 'high' | 'medium' | 'low';
  has_expert_preview?: boolean;
  has_espn_context?: boolean;
  h2h_match_count?: number;
  key_player_count?: number;
  player_update_count?: number;
  possible_xi_player_count?: number;
  source_link_count?: number;
}

export type MatchWithPredictions = Match & {
  predictions: Prediction[];
  spotlight_signals?: MatchSpotlightSignals;
  competition_name?: string;
  team1_logo_url?: string;
  team2_logo_url?: string;
};

interface FranchiseLogoRow {
  normalized_team_name: string;
  team_name: string;
  team_abbr: string | null;
  logo_url: string;
  competition_name: string | null;
}

export interface MatchOdds {
  match_id: string;
  bookmaker: string;
  team1_odds: number;
  team2_odds: number;
  draw_odds: number | null;
  market: string;
  fetched_at: string;
}

export interface SquadPlayer {
  id: string;
  name: string;
  role: string;
  batting_style?: string;
  bowling_style?: string;
  is_captain?: boolean;
  is_keeper?: boolean;
  image_url?: string;
}

export interface MatchSquad {
  match_id: string;
  team: string;
  players: SquadPlayer[];
  is_confirmed: boolean;
  source: string;
  fetched_at: string;
}

export interface PlayerStats {
  player_name: string;
  team: string;
  format: string;
  role: string;
  batting_avg: number;
  batting_sr: number;
  batting_runs: number;
  batting_innings: number;
  batting_highest: string;
  batting_fifties: number;
  batting_hundreds: number;
  bowling_avg: number;
  bowling_economy: number;
  bowling_wickets: number;
  bowling_innings: number;
  bowling_best: string;
  matches_played: number;
}

interface TeamStatsCacheRow {
  stat_type: string;
  match_type: string;
  data: Array<{
    team: string;
    gender?: string;
    form_last_10?: Array<'W' | 'L'>;
  }>;
}

function normalizeTeam(team: string): string {
  return team.replace(/\s+Women$/, '').replace(/\s+Men$/, '').trim();
}

function normalizeLogoTeamName(team: string): string {
  return team
    .replace(/\s*\((Men|Women)\)\s*$/i, '')
    .replace(/\s+(Men|Women)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function inferTeamGender(team: string): string {
  return team.includes('Women') ? 'female' : 'male';
}

function getStatsMatchType(matchType: string): string {
  const normalized = matchType.toLowerCase();
  if (normalized.includes('t20')) return 't20s';
  if (normalized.includes('odi')) return 'odis';
  return normalized;
}

function getTeamStatsKey(team: string, gender: string, matchType: string): string {
  return `${normalizeTeam(team)}::${gender}::${matchType}`;
}

function getMatchTimestamp(match: Match): number {
  const timestamp = new Date(match.date).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function sortMatchesByPriority(matches: MatchWithPredictions[]): MatchWithPredictions[] {
  return [...matches].sort(compareMatchCenterMatches);
}

function isFutureMatch(match: Match, now = Date.now()): boolean {
  return getMatchTimestamp(match) > now;
}

function isLiveMatch(match: Match): boolean {
  return match.status === 'live';
}

function isPlaceholderEvidenceText(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const text = value.trim();
  return !text
    || /^(tbd|tbc|unknown|unavailable|none|n\/a|coming soon|venue tbd|venue tbc)$/i.test(text)
    || /^No recent reputable (article|source)-backed updates (were found|were generated)/i.test(text)
    || /unavailable until a reliable source is found/i.test(text);
}

function hasKnownVenue(value: string | undefined): boolean {
  const venue = value?.trim();
  return Boolean(
    venue
    && !/^(tbd|tbc|unknown|unavailable|none|n\/a|coming soon|venue tbd|venue tbc)$/i.test(venue),
  );
}

const LOGICAL_FIXTURE_WINDOW_MS = 2 * 60 * 60 * 1000;
const TEAM_IDENTITY_ALIASES: Record<string, string> = {
  'antigua and barbuda falcons': 'antigua and barbuda falcons',
  'antigua barbuda falcons': 'antigua and barbuda falcons',
  'barbados royals': 'barbados royals',
  'barbados tridents': 'barbados royals',
  'saint lucia kings': 'st lucia kings',
  'st lucia kings': 'st lucia kings',
  'st lucia stars': 'st lucia kings',
  'st lucia zouks': 'st lucia kings',
  'st kitts and nevis patriots': 'st kitts and nevis patriots',
  'st kitts nevis patriots': 'st kitts and nevis patriots',
};

type RawEnrichmentRow = {
  match_id: string;
  venue_name: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  expert_preview: string | null;
  toss_insight?: string | null;
  player_updates: unknown[] | string | null;
  key_players: unknown[] | string | null;
  possible_xi: { team1?: unknown[]; team2?: unknown[] } | string | null;
  source_links: unknown[] | string | null;
};

type RawEspnMatchDataRow = {
  match_id: string;
  espn_event_id?: string | null;
  venue_name: string | null;
  venue_city?: string | null;
  venue_country?: string | null;
  venue_capacity?: number | null;
  venue_grass?: boolean | null;
  venue_image_url?: string | null;
  toss_winner?: string | null;
  toss_decision?: string | null;
  match_number?: string | null;
  match_days?: string | null;
  hours_of_play?: string | null;
  series_note: string | null;
  series_scoreline?: string | null;
  series_leaders?: unknown[] | string | null;
  officials?: unknown[] | string | null;
  rosters: ESPNRoster[] | string | null;
  head_to_head: unknown[] | string | null;
  standings?: unknown[] | string | null;
  scorecards?: unknown[] | string | null;
  fetched_at?: string | null;
};

type RawOddsRow = {
  match_id: string;
  bookmaker: string;
  team1_odds: number;
  team2_odds: number;
  draw_odds?: number | null;
  market?: string;
  fetched_at: string;
};

type SurfaceBuildContext = {
  espnVenue: Map<string, string>;
  espnH2H: Map<string, ESPNH2HGame[]>;
  espnCompetition: Map<string, string>;
  espnRosters: Map<string, ESPNRoster[]>;
  franchiseLogosByName: Map<string, string>;
  franchiseLogosByAbbr: Map<string, string>;
  franchiseLogosByCompetitionAbbr: Map<string, string>;
  enrichmentVenue: Map<string, string>;
  enrichmentSignals: Map<string, MatchSpotlightSignals>;
  oddsByMatch: Map<string, RawOddsRow[]>;
  recentFormByTeam: Map<string, Array<'W' | 'L'>>;
};

export interface UnifiedMatchDetails {
  match: Match | null;
  prediction: Prediction | null;
  predictionHistory: PredictionSnapshot[];
  enrichment: MatchEnrichment | null;
  odds: MatchOdds[];
  oddsHistory: MatchOdds[];
  squads: MatchSquad[];
  espnMatchData: ESPNMatchData | null;
  edgeScore: EdgeScore | null;
  linkedMatchIds: string[];
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function firstPresentString(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function normalizeLogicalFixtureTeam(team: string): string {
  const normalized = team
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/’/g, '\'')
    .replace(/\s*\((men|women)\)\s*/g, ' $1 ')
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bst\.\b/g, 'st')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return TEAM_IDENTITY_ALIASES[normalized] ?? normalized;
}

function parseLogicalFixtureTimestamp(value: string): number | null {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

type FixtureIdentity = Pick<Match, 'match_id' | 'team1' | 'team2' | 'date'>;

export function matchesRepresentSameLogicalFixture(left: FixtureIdentity, right: FixtureIdentity): boolean {
  const leftTeams = [normalizeLogicalFixtureTeam(left.team1), normalizeLogicalFixtureTeam(left.team2)].sort();
  const rightTeams = [normalizeLogicalFixtureTeam(right.team1), normalizeLogicalFixtureTeam(right.team2)].sort();
  if (leftTeams[0] !== rightTeams[0] || leftTeams[1] !== rightTeams[1]) return false;

  const leftTime = parseLogicalFixtureTimestamp(left.date);
  const rightTime = parseLogicalFixtureTimestamp(right.date);
  if (leftTime === null || rightTime === null) return left.date === right.date;
  return Math.abs(leftTime - rightTime) <= LOGICAL_FIXTURE_WINDOW_MS;
}

function getSourcePriority(matchId: string): number {
  if (matchId.startsWith('espn-')) return 3;
  if (matchId.startsWith('cricbuzz-')) return 2;
  return 1;
}

function getStatusPriority(status: string): number {
  if (status === 'live') return 3;
  if (status === 'upcoming') return 2;
  if (status === 'completed') return 1;
  return 0;
}

function getPrimaryPredictionFromMatch(match: Pick<MatchWithPredictions, 'predictions'>): Prediction | null {
  return match.predictions[0] ?? null;
}

function getLogicalFixtureCoverageScore(match: MatchWithPredictions): number {
  const prediction = getPrimaryPredictionFromMatch(match);
  const signals = match.spotlight_signals;
  return (
    getStatusPriority(match.status) * 10_000
    + Number(hasValidMarketOdds(match)) * 2_000
    + Number(prediction !== null) * 1_500
    + Number(Boolean(signals?.has_espn_context)) * 600
    + Number(Boolean(signals?.has_expert_preview)) * 500
    + (signals?.source_link_count ?? 0) * 50
    + (signals?.possible_xi_player_count ?? 0) * 20
    + (signals?.key_player_count ?? 0) * 15
    + (signals?.player_update_count ?? 0) * 15
    + ((match.team1_recent_form?.length ?? 0) + (match.team2_recent_form?.length ?? 0)) * 5
    + Number(hasKnownVenue(match.venue)) * 40
    + getSourcePriority(match.match_id)
  );
}

function compareLogicalFixtureCandidates(left: MatchWithPredictions, right: MatchWithPredictions): number {
  return getLogicalFixtureCoverageScore(right) - getLogicalFixtureCoverageScore(left)
    || getMatchTimestamp(left) - getMatchTimestamp(right)
    || right.match_id.localeCompare(left.match_id);
}

function mergeLogicalSpotlightSignals(matches: MatchWithPredictions[]): MatchSpotlightSignals | undefined {
  if (!matches.length) return undefined;

  return matches.reduce<MatchSpotlightSignals>((merged, match) => {
    const signals = match.spotlight_signals;
    if (!signals) return merged;

    const confidenceRank = { high: 3, medium: 2, low: 1 } as const;
    const currentConfidence = merged.enrichment_confidence;
    const incomingConfidence = signals.enrichment_confidence;
    if (
      incomingConfidence
      && (!currentConfidence || confidenceRank[incomingConfidence] > confidenceRank[currentConfidence])
    ) {
      merged.enrichment_confidence = incomingConfidence;
    }

    merged.has_expert_preview = merged.has_expert_preview || signals.has_expert_preview;
    merged.has_espn_context = merged.has_espn_context || signals.has_espn_context;
    merged.h2h_match_count = Math.max(merged.h2h_match_count ?? 0, signals.h2h_match_count ?? 0);
    merged.key_player_count = Math.max(merged.key_player_count ?? 0, signals.key_player_count ?? 0);
    merged.player_update_count = Math.max(merged.player_update_count ?? 0, signals.player_update_count ?? 0);
    merged.possible_xi_player_count = Math.max(
      merged.possible_xi_player_count ?? 0,
      signals.possible_xi_player_count ?? 0,
    );
    merged.source_link_count = Math.max(merged.source_link_count ?? 0, signals.source_link_count ?? 0);
    return merged;
  }, {});
}

export function mergeLogicalSurfaceMatches(matches: MatchWithPredictions[]): MatchWithPredictions[] {
  const groups: MatchWithPredictions[][] = [];

  for (const match of matches) {
    const group = groups.find((candidateGroup) => candidateGroup.some((candidate) => (
      matchesRepresentSameLogicalFixture(candidate, match)
    )));
    if (group) {
      group.push(match);
    } else {
      groups.push([match]);
    }
  }

  return groups.map((group) => {
    const ordered = [...group].sort(compareLogicalFixtureCandidates);
    const primary = ordered[0];
    const predictions = ordered
      .flatMap((match) => match.predictions)
      .filter((prediction, index, items) => (
        items.findIndex((candidate) => candidate.match_id === prediction.match_id) === index
      ));
    const venue = ordered.map((match) => match.venue).find((candidate) => hasKnownVenue(candidate)) ?? primary.venue;
    const competitionName = ordered
      .map((match) => match.competition_name?.trim())
      .find((candidate): candidate is string => Boolean(candidate));
    const team1Form = [...ordered]
      .sort((left, right) => (right.team1_recent_form?.length ?? 0) - (left.team1_recent_form?.length ?? 0))[0]
      ?.team1_recent_form ?? primary.team1_recent_form;
    const team2Form = [...ordered]
      .sort((left, right) => (right.team2_recent_form?.length ?? 0) - (left.team2_recent_form?.length ?? 0))[0]
      ?.team2_recent_form ?? primary.team2_recent_form;
    const marketBackedMatch = ordered.find((match) => hasValidMarketOdds(match));

    return {
      ...primary,
      predictions,
      venue,
      competition_name: competitionName ?? primary.competition_name,
      team1_logo_url: ordered.map((match) => match.team1_logo_url).find(Boolean) ?? primary.team1_logo_url,
      team2_logo_url: ordered.map((match) => match.team2_logo_url).find(Boolean) ?? primary.team2_logo_url,
      team1_recent_form: team1Form,
      team2_recent_form: team2Form,
      bookmaker_odds: marketBackedMatch?.bookmaker_odds ?? primary.bookmaker_odds,
      spotlight_signals: mergeLogicalSpotlightSignals(ordered),
    };
  });
}

function buildSurfaceMatch(
  match: MatchWithPredictions,
  context: SurfaceBuildContext,
  relatedMatchIds: string[] = [match.match_id],
): MatchWithPredictions {
  const statsMatchType = getStatsMatchType(match.match_type);
  let team1Form = context.recentFormByTeam.get(
    getTeamStatsKey(match.team1, inferTeamGender(match.team1), statsMatchType),
  ) ?? [];
  let team2Form = context.recentFormByTeam.get(
    getTeamStatsKey(match.team2, inferTeamGender(match.team2), statsMatchType),
  ) ?? [];

  const h2hGames = relatedMatchIds
    .map((matchId) => context.espnH2H.get(matchId) ?? [])
    .find((games) => games.length > 0) ?? [];
  const h2hMatchCount = h2hGames.length;
  if (h2hGames.length > 0) {
    const team1Meta = getTeamMeta(match.team1);
    const team2Meta = getTeamMeta(match.team2);
    const deriveForm = (shortName: string): Array<'W' | 'L'> => (
      h2hGames
        .slice(0, 5)
        .reverse()
        .map((game) => {
          const team = game.teams?.find((candidate) => candidate.abbreviation === shortName);
          return team?.winner ? 'W' as const : 'L' as const;
        })
    );
    const derivedTeam1 = deriveForm(team1Meta.shortName);
    const derivedTeam2 = deriveForm(team2Meta.shortName);
    if (derivedTeam1.length > 0) team1Form = derivedTeam1;
    if (derivedTeam2.length > 0) team2Form = derivedTeam2;
  }

  const competitionName = relatedMatchIds
    .map((matchId) => context.espnCompetition.get(matchId)?.trim())
    .find((candidate): candidate is string => Boolean(candidate));
  const rosters = relatedMatchIds.flatMap((matchId) => context.espnRosters.get(matchId) ?? []);
  const findTeamLogo = (teamName: string): string | undefined => {
    const teamMeta = getTeamMeta(teamName);
    const normalizedName = normalizeLogoTeamName(teamName);
    const normalizedTeamMeta = normalizeLogoTeamName(teamMeta.name);
    const normalizedCompetition = normalizeLogoTeamName(competitionName ?? '');
    const rosterLogo = rosters.find((roster) => {
      const rosterName = normalizeLogoTeamName(roster.team_name ?? '');
      const rosterAbbr = roster.team_abbr?.toUpperCase();
      return rosterName === normalizedName
        || rosterName === normalizedTeamMeta
        || (rosterAbbr ? rosterAbbr === teamMeta.shortName.toUpperCase() : false);
    })?.team_logo;

    return getFranchiseLogoUrl(teamName)
      || rosterLogo
      || context.franchiseLogosByName.get(normalizedName)
      || context.franchiseLogosByName.get(normalizedTeamMeta)
      || (normalizedCompetition
        ? context.franchiseLogosByCompetitionAbbr.get(
          `${normalizedCompetition}::${teamMeta.shortName.toUpperCase()}`,
        )
        : undefined)
      || context.franchiseLogosByAbbr.get(teamMeta.shortName.toUpperCase())
      || undefined;
  };

  const bookmakerOddsRows = relatedMatchIds.flatMap((matchId) => context.oddsByMatch.get(matchId) ?? []);
  const bookmakerOdds = selectFreshestTrustedSportsbookOdds(bookmakerOddsRows)[0];
  const spotlightSignals = mergeLogicalSpotlightSignals(relatedMatchIds.map((matchId) => ({
    ...match,
    match_id: matchId,
    spotlight_signals: {
      ...context.enrichmentSignals.get(matchId),
      has_espn_context: context.espnVenue.has(matchId) || ((context.espnH2H.get(matchId)?.length ?? 0) > 0),
      h2h_match_count: context.espnH2H.get(matchId)?.length ?? 0,
    },
  } as MatchWithPredictions)));

  return {
    ...match,
    venue: [match.venue, ...relatedMatchIds.map((matchId) => context.espnVenue.get(matchId)), ...relatedMatchIds.map((matchId) => context.enrichmentVenue.get(matchId))]
      .find((candidate): candidate is string => hasKnownVenue(candidate)) ?? '',
    competition_name: competitionName ?? match.competition_name,
    team1_logo_url: findTeamLogo(match.team1),
    team2_logo_url: findTeamLogo(match.team2),
    team1_recent_form: team1Form,
    team2_recent_form: team2Form,
    bookmaker_odds: bookmakerOdds
      ? {
        bookmaker: bookmakerOdds.bookmaker,
        team1_odds: bookmakerOdds.team1_odds,
        team2_odds: bookmakerOdds.team2_odds,
      }
      : undefined,
    spotlight_signals: spotlightSignals ?? {
      has_espn_context: h2hMatchCount > 0 || relatedMatchIds.some((matchId) => context.espnVenue.has(matchId)),
      h2h_match_count: h2hMatchCount,
    },
  };
}

export async function getUpcomingMatches(): Promise<MatchWithPredictions[]> {
  if (isMockDataEnabled()) {
    return getMockUpcomingMatches();
  }

  const now = Date.now();
  const [{ data, error }, { data: statsData }, { data: enrichmentData }, { data: espnData }, { data: franchiseLogoData }, { data: oddsData }] = await Promise.all([
    supabase
      .from('matches')
      .select('*, predictions(*)')
      .in('status', ['upcoming', 'live'])
      .order('date', { ascending: true }),
    supabase
      .from('stats_cache')
      .select('stat_type, match_type, data')
      .eq('stat_type', 'team_stats'),
    supabase
      .from('match_enrichment')
      .select('match_id, venue_name, confidence, expert_preview, player_updates, key_players, possible_xi, source_links'),
    supabase
      .from('espn_match_data')
      .select('match_id, venue_name, head_to_head, series_note, rosters'),
    supabase
      .from('franchise_logos')
      .select('normalized_team_name, team_name, team_abbr, logo_url, competition_name'),
    supabase
      .from('match_odds')
      .select('match_id, bookmaker, team1_odds, team2_odds, fetched_at')
      .order('fetched_at', { ascending: false }),
  ]);

  if (error) throw error;

  const espnVenue = new Map<string, string>();
  const espnH2H = new Map<string, ESPNH2HGame[]>();
  const espnCompetition = new Map<string, string>();
  const espnRosters = new Map<string, ESPNRoster[]>();
  (espnData ?? []).forEach((e: RawEspnMatchDataRow) => {
    if (!isPlaceholderEvidenceText(e.venue_name)) espnVenue.set(e.match_id, e.venue_name!.trim());
    const headToHead = parseJsonField<ESPNH2HGame[]>(e.head_to_head, []);
    if (headToHead.length > 0) espnH2H.set(e.match_id, headToHead);
    if (e.series_note) espnCompetition.set(e.match_id, e.series_note);
    if (e.rosters) {
      const rosters = parseJsonField<ESPNRoster[]>(e.rosters, []);
      if (Array.isArray(rosters)) espnRosters.set(e.match_id, rosters);
    }
  });
  const franchiseLogosByName = new Map<string, string>();
  const franchiseLogosByAbbr = new Map<string, string>();
  const franchiseLogosByCompetitionAbbr = new Map<string, string>();
  (franchiseLogoData ?? []).forEach((row: FranchiseLogoRow) => {
    const logoUrl = row.logo_url?.trim();
    if (!logoUrl) return;

    const normalizedName = normalizeLogoTeamName(row.team_name || row.normalized_team_name);
    if (normalizedName) franchiseLogosByName.set(normalizedName, logoUrl);

    const normalizedAlias = normalizeLogoTeamName(row.normalized_team_name);
    if (normalizedAlias) franchiseLogosByName.set(normalizedAlias, logoUrl);

    const abbr = row.team_abbr?.trim().toUpperCase();
    if (abbr) franchiseLogosByAbbr.set(abbr, logoUrl);

    const competition = normalizeLogoTeamName(row.competition_name ?? '');
    if (competition && abbr) {
      franchiseLogosByCompetitionAbbr.set(`${competition}::${abbr}`, logoUrl);
    }
  });
  const enrichmentVenue = new Map<string, string>();
  const enrichmentSignals = new Map<string, MatchSpotlightSignals>();
  const hasNamedEvidence = (value: unknown): boolean => (
    typeof value === 'string'
    && value.trim().length > 1
    && !isPlaceholderEvidenceText(value)
  );
  (enrichmentData ?? []).forEach((e: RawEnrichmentRow) => {
    if (!isPlaceholderEvidenceText(e.venue_name)) enrichmentVenue.set(e.match_id, e.venue_name!.trim());
    const keyPlayers = parseJsonField<unknown[]>(e.key_players, []);
    const playerUpdates = parseJsonField<unknown[]>(e.player_updates, []);
    const possibleXi = parseJsonField<{ team1?: unknown[]; team2?: unknown[] }>(e.possible_xi, { team1: [], team2: [] });
    const sourceLinks = parseJsonField<unknown[]>(e.source_links, []);
    const keyPlayerCount = Array.isArray(keyPlayers)
      ? keyPlayers.filter((entry) => {
          if (!entry || typeof entry !== 'object') return false;
          const player = entry as { name?: unknown; batter?: unknown; bowler?: unknown };
          return hasNamedEvidence(player.name)
            || (hasNamedEvidence(player.batter) && hasNamedEvidence(player.bowler));
        }).length
      : 0;
    const playerUpdateCount = Array.isArray(playerUpdates)
      ? playerUpdates.filter((entry) => {
          if (!entry || typeof entry !== 'object') return false;
          const update = entry as { player?: unknown; status?: unknown };
          return hasNamedEvidence(update.player) && !isPlaceholderEvidenceText(update.status);
        }).length
      : 0;
    const possibleXiPlayerCount = [
      ...(Array.isArray(possibleXi?.team1) ? possibleXi.team1 : []),
      ...(Array.isArray(possibleXi?.team2) ? possibleXi.team2 : []),
    ].filter(hasNamedEvidence).length;
    const sourceLinkCount = Array.isArray(sourceLinks)
      ? sourceLinks.filter((entry) => {
          if (!entry || typeof entry !== 'object') return false;
          const source = entry as { url?: unknown; source?: unknown };
          return typeof source.url === 'string'
            && /^https?:\/\//i.test(source.url.trim())
            && source.source !== 'demo';
        }).length
      : 0;
    enrichmentSignals.set(e.match_id, {
      enrichment_confidence: e.confidence ?? undefined,
      has_expert_preview: !isPlaceholderEvidenceText(e.expert_preview),
      key_player_count: keyPlayerCount,
      player_update_count: playerUpdateCount,
      possible_xi_player_count: possibleXiPlayerCount,
      source_link_count: sourceLinkCount,
    });
  });
  // Build odds lookup from the freshest trusted snapshot cohort per match.
  const oddsByMatch = new Map<string, RawOddsRow[]>();
  (oddsData ?? []).forEach((o: RawOddsRow) => {
    const entries = oddsByMatch.get(o.match_id) ?? [];
    entries.push(o);
    oddsByMatch.set(o.match_id, entries);
  });
  const recentFormByTeam = new Map<string, Array<'W' | 'L'>>();
  ((statsData ?? []) as TeamStatsCacheRow[]).forEach((cacheRow) => {
    cacheRow.data.forEach((record) => {
      if (record.form_last_10) {
        recentFormByTeam.set(
          getTeamStatsKey(record.team, record.gender || 'male', cacheRow.match_type),
          record.form_last_10,
        );
      }
    });
  });

  const context: SurfaceBuildContext = {
    espnVenue,
    espnH2H,
    espnCompetition,
    espnRosters,
    franchiseLogosByName,
    franchiseLogosByAbbr,
    franchiseLogosByCompetitionAbbr,
    enrichmentVenue,
    enrichmentSignals,
    oddsByMatch,
    recentFormByTeam,
  };

  const matchesWithForm = ((data ?? []) as MatchWithPredictions[]).map((match) => buildSurfaceMatch(match, context));
  const mergedMatches = mergeLogicalSurfaceMatches(matchesWithForm);
  return sortMatchesByPriority(mergedMatches.filter((match) => isLiveMatch(match) || isFutureMatch(match, now)));
}

function normalizeEnrichmentRow(row: RawEnrichmentRow): MatchEnrichment {
  return {
    match_id: row.match_id,
    venue_name: row.venue_name,
    venue_confidence: 'unknown',
    possible_xi: parseJsonField(row.possible_xi, { team1: [], team2: [] }),
    player_updates: parseJsonField(row.player_updates, []),
    key_players: parseJsonField(row.key_players, []),
    expert_preview: row.expert_preview ?? null,
    toss_insight: row.toss_insight ?? null,
    source_links: parseJsonField(row.source_links, []),
    confidence: row.confidence ?? 'low',
    generated_at: '',
  };
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  values.forEach((value) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    merged.push(trimmed);
  });
  return merged;
}

function mergeEnrichmentRows(rows: MatchEnrichment[]): MatchEnrichment | null {
  if (!rows.length) return null;

  const ordered = [...rows].sort((left, right) => {
    const confidenceRank = { high: 3, medium: 2, low: 1 } as const;
    return confidenceRank[right.confidence] - confidenceRank[left.confidence]
      || Number(!isPlaceholderEvidenceText(right.expert_preview)) - Number(!isPlaceholderEvidenceText(left.expert_preview))
      || Number((right.source_links?.length ?? 0) > 0) - Number((left.source_links?.length ?? 0) > 0);
  });
  const primary = ordered[0];
  const playerUpdates = new Map<string, MatchEnrichment['player_updates'][number]>();
  const keyPlayers = new Map<string, MatchEnrichment['key_players'][number]>();
  const sourceLinks = new Map<string, MatchEnrichment['source_links'][number]>();

  ordered.forEach((row) => {
    row.player_updates.forEach((update) => {
      const key = JSON.stringify([update.player ?? '', update.team ?? '', update.status ?? '']);
      if (!playerUpdates.has(key)) playerUpdates.set(key, update);
    });
    row.key_players.forEach((player) => {
      const key = JSON.stringify([player.name ?? '', player.batter ?? '', player.bowler ?? '', player.team ?? '']);
      if (!keyPlayers.has(key)) keyPlayers.set(key, player);
    });
    row.source_links.forEach((link) => {
      const key = link.url?.trim() || JSON.stringify([link.title ?? '', link.source ?? '']);
      if (!sourceLinks.has(key)) sourceLinks.set(key, link);
    });
  });

  return {
    ...primary,
    venue_name: firstPresentString(ordered.map((row) => row.venue_name)),
    expert_preview: firstPresentString(ordered.map((row) => row.expert_preview)) ?? null,
    toss_insight: firstPresentString(ordered.map((row) => row.toss_insight)) ?? null,
    possible_xi: {
      team1: uniqueStrings(ordered.flatMap((row) => row.possible_xi.team1 ?? [])),
      team2: uniqueStrings(ordered.flatMap((row) => row.possible_xi.team2 ?? [])),
    },
    player_updates: [...playerUpdates.values()],
    key_players: [...keyPlayers.values()],
    source_links: [...sourceLinks.values()],
  };
}

function normalizeEspnMatchDataRow(row: RawEspnMatchDataRow): ESPNMatchData {
  return {
    match_id: row.match_id,
    espn_event_id: row.espn_event_id ?? null,
    venue_name: row.venue_name ?? null,
    venue_city: row.venue_city ?? null,
    venue_country: row.venue_country ?? null,
    venue_capacity: row.venue_capacity ?? null,
    venue_grass: row.venue_grass ?? null,
    venue_image_url: row.venue_image_url ?? null,
    toss_winner: row.toss_winner ?? null,
    toss_decision: row.toss_decision ?? null,
    match_number: row.match_number ?? null,
    match_days: row.match_days ?? null,
    hours_of_play: row.hours_of_play ?? null,
    series_note: row.series_note ?? null,
    series_scoreline: row.series_scoreline ?? null,
    series_leaders: parseJsonField(row.series_leaders, []),
    officials: parseJsonField(row.officials, []),
    rosters: parseJsonField(row.rosters, []),
    head_to_head: parseJsonField(row.head_to_head, []),
    standings: parseJsonField(row.standings, []),
    scorecards: parseJsonField(row.scorecards, []),
    fetched_at: row.fetched_at ?? null,
  };
}

function mergeEspnMatchDataRows(rows: ESPNMatchData[]): ESPNMatchData | null {
  if (!rows.length) return null;

  const ordered = [...rows].sort((left, right) => {
    const leftCoverage = Number(Boolean(left.espn_event_id))
      + Number((left.head_to_head?.length ?? 0) > 0)
      + Number((left.rosters?.length ?? 0) > 0)
      + Number(Boolean(left.venue_name));
    const rightCoverage = Number(Boolean(right.espn_event_id))
      + Number((right.head_to_head?.length ?? 0) > 0)
      + Number((right.rosters?.length ?? 0) > 0)
      + Number(Boolean(right.venue_name));
    return rightCoverage - leftCoverage;
  });
  const primary = ordered[0];
  const dedupe = <T>(items: T[], keyFor: (item: T) => string): T[] => {
    const merged = new Map<string, T>();
    items.forEach((item) => {
      const key = keyFor(item);
      if (!merged.has(key)) merged.set(key, item);
    });
    return [...merged.values()];
  };

  return {
    ...primary,
    espn_event_id: firstPresentString(ordered.map((row) => row.espn_event_id)) ?? null,
    venue_name: firstPresentString(ordered.map((row) => row.venue_name)) ?? null,
    venue_city: firstPresentString(ordered.map((row) => row.venue_city)) ?? null,
    venue_country: firstPresentString(ordered.map((row) => row.venue_country)) ?? null,
    venue_image_url: firstPresentString(ordered.map((row) => row.venue_image_url)) ?? null,
    toss_winner: firstPresentString(ordered.map((row) => row.toss_winner)) ?? null,
    toss_decision: firstPresentString(ordered.map((row) => row.toss_decision)) ?? null,
    match_number: firstPresentString(ordered.map((row) => row.match_number)) ?? null,
    match_days: firstPresentString(ordered.map((row) => row.match_days)) ?? null,
    hours_of_play: firstPresentString(ordered.map((row) => row.hours_of_play)) ?? null,
    series_note: firstPresentString(ordered.map((row) => row.series_note)) ?? null,
    series_scoreline: firstPresentString(ordered.map((row) => row.series_scoreline)) ?? null,
    series_leaders: dedupe(ordered.flatMap((row) => row.series_leaders ?? []), (item) => JSON.stringify(item)),
    officials: dedupe(ordered.flatMap((row) => row.officials ?? []), (item) => JSON.stringify(item)),
    rosters: dedupe(ordered.flatMap((row) => row.rosters ?? []), (item) => item.team_name ?? JSON.stringify(item)),
    head_to_head: dedupe(ordered.flatMap((row) => row.head_to_head ?? []), (item) => `${item.date}|${item.note}`),
    standings: dedupe(ordered.flatMap((row) => row.standings ?? []), (item) => item.team_name ?? JSON.stringify(item)),
    scorecards: dedupe(ordered.flatMap((row) => row.scorecards ?? []), (item) => JSON.stringify(item)),
    fetched_at: firstPresentString(ordered.map((row) => row.fetched_at)) ?? null,
  };
}

function mergeSquadRows(rows: MatchSquad[]): MatchSquad[] {
  const grouped = new Map<string, MatchSquad>();
  rows.forEach((row) => {
    const current = grouped.get(row.team);
    if (
      !current
      || Number(row.is_confirmed) > Number(current.is_confirmed)
      || row.players.length > current.players.length
    ) {
      grouped.set(row.team, row);
    }
  });
  return [...grouped.values()];
}

function toEdgeScore(row: Record<string, unknown>): EdgeScore {
  return {
    team1_score: Number(row.team1_score ?? 0),
    team2_score: Number(row.team2_score ?? 0),
    net_edge: Number(row.net_edge ?? 0),
    edge_team: String(row.edge_team ?? ''),
    narrative: String(row.narrative ?? ''),
    factors: (row.factors as EdgeScore['factors']) ?? { team1: { form: 0, momentum: 0, pressure: 0, market: 0 }, team2: { form: 0, momentum: 0, pressure: 0, market: 0 } },
  };
}

async function resolveLogicalMatchGroup(matchId: string): Promise<MatchWithPredictions[]> {
  const { data: baseMatch, error } = await supabase
    .from('matches')
    .select('*, predictions(*)')
    .eq('match_id', matchId)
    .single();
  if (error || !baseMatch) return [];

  const baseTime = parseLogicalFixtureTimestamp(baseMatch.date);
  let query = supabase.from('matches').select('*, predictions(*)');
  if (baseTime !== null) {
    query = query
      .gte('date', new Date(baseTime - LOGICAL_FIXTURE_WINDOW_MS).toISOString())
      .lte('date', new Date(baseTime + LOGICAL_FIXTURE_WINDOW_MS).toISOString());
  } else {
    query = query.eq('date', baseMatch.date);
  }

  const { data: candidates } = await query.order('date', { ascending: true });
  const logicalMatches = ((candidates ?? []) as MatchWithPredictions[]).filter((candidate) => (
    matchesRepresentSameLogicalFixture(baseMatch as MatchWithPredictions, candidate)
  ));
  return logicalMatches.length > 0 ? logicalMatches : [baseMatch as MatchWithPredictions];
}

export async function getUnifiedMatchDetails(matchId: string): Promise<UnifiedMatchDetails> {
  if (isMockDataEnabled()) {
    const [match, prediction, predictionHistory, enrichment, odds, oddsHistory, squads, espnMatchData, edgeScore] = await Promise.all([
      getMatch(matchId),
      getPrediction(matchId),
      getPredictionSnapshots(matchId),
      getMatchEnrichment(matchId),
      getMatchOdds(matchId),
      getMatchOddsHistory(matchId),
      getMatchSquads(matchId),
      getESPNMatchData(matchId),
      getEdgeScore(matchId),
    ]);
    return {
      match,
      prediction,
      predictionHistory,
      enrichment,
      odds,
      oddsHistory,
      squads,
      espnMatchData,
      edgeScore,
      linkedMatchIds: match ? [match.match_id] : [],
    };
  }

  const logicalMatches = await resolveLogicalMatchGroup(matchId);
  if (!logicalMatches.length) {
    return {
      match: null,
      prediction: null,
      predictionHistory: [],
      enrichment: null,
      odds: [],
      oddsHistory: [],
      squads: [],
      espnMatchData: null,
      edgeScore: null,
      linkedMatchIds: [],
    };
  }

  const matchIds = logicalMatches.map((match) => match.match_id);
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const [
    { data: statsData },
    { data: enrichmentRows },
    { data: espnRows },
    { data: franchiseLogoData },
    { data: oddsRows },
    { data: oddsHistoryRows },
    { data: squadRows },
    { data: snapshotRows },
    { data: edgeRows },
  ] = await Promise.all([
    supabase.from('stats_cache').select('stat_type, match_type, data').eq('stat_type', 'team_stats'),
    supabase.from('match_enrichment').select('*').in('match_id', matchIds),
    supabase.from('espn_match_data').select('*').in('match_id', matchIds),
    supabase.from('franchise_logos').select('normalized_team_name, team_name, team_abbr, logo_url, competition_name'),
    supabase.from('match_odds').select('*').in('match_id', matchIds).order('fetched_at', { ascending: false }),
    supabase.from('match_odds_history').select('match_id, bookmaker, team1_odds, team2_odds, draw_odds, market, fetched_at').in('match_id', matchIds).gte('fetched_at', cutoff).order('fetched_at', { ascending: false }).limit(400),
    supabase.from('match_squads').select('*').in('match_id', matchIds),
    supabase.from('prediction_snapshots').select('match_id, team1, team2, predicted_winner, team1_win_probability, team2_win_probability, confidence, edge_score, model, ensemble_size, input_state, change_events, captured_at').in('match_id', matchIds).order('captured_at', { ascending: false }).limit(400),
    supabase.from('match_edge_scores').select('*').in('match_id', matchIds),
  ]);

  const espnVenue = new Map<string, string>();
  const espnH2H = new Map<string, ESPNH2HGame[]>();
  const espnCompetition = new Map<string, string>();
  const espnRosters = new Map<string, ESPNRoster[]>();
  const normalizedEspnRows = ((espnRows ?? []) as RawEspnMatchDataRow[]).map(normalizeEspnMatchDataRow);
  normalizedEspnRows.forEach((row) => {
    if (!isPlaceholderEvidenceText(row.venue_name)) espnVenue.set(row.match_id, row.venue_name!.trim());
    if (row.head_to_head.length > 0) espnH2H.set(row.match_id, row.head_to_head);
    if (row.series_note) espnCompetition.set(row.match_id, row.series_note);
    if (row.rosters.length > 0) espnRosters.set(row.match_id, row.rosters);
  });

  const franchiseLogosByName = new Map<string, string>();
  const franchiseLogosByAbbr = new Map<string, string>();
  const franchiseLogosByCompetitionAbbr = new Map<string, string>();
  (franchiseLogoData ?? []).forEach((row: FranchiseLogoRow) => {
    const logoUrl = row.logo_url?.trim();
    if (!logoUrl) return;
    const normalizedName = normalizeLogoTeamName(row.team_name || row.normalized_team_name);
    if (normalizedName) franchiseLogosByName.set(normalizedName, logoUrl);
    const normalizedAlias = normalizeLogoTeamName(row.normalized_team_name);
    if (normalizedAlias) franchiseLogosByName.set(normalizedAlias, logoUrl);
    const abbr = row.team_abbr?.trim().toUpperCase();
    if (abbr) franchiseLogosByAbbr.set(abbr, logoUrl);
    const competition = normalizeLogoTeamName(row.competition_name ?? '');
    if (competition && abbr) franchiseLogosByCompetitionAbbr.set(`${competition}::${abbr}`, logoUrl);
  });

  const enrichmentVenue = new Map<string, string>();
  const enrichmentSignals = new Map<string, MatchSpotlightSignals>();
  const normalizedEnrichmentRows = ((enrichmentRows ?? []) as RawEnrichmentRow[]).map(normalizeEnrichmentRow);
  normalizedEnrichmentRows.forEach((row) => {
    if (!isPlaceholderEvidenceText(row.venue_name)) enrichmentVenue.set(row.match_id, row.venue_name!.trim());
    enrichmentSignals.set(row.match_id, {
      enrichment_confidence: row.confidence,
      has_expert_preview: !isPlaceholderEvidenceText(row.expert_preview),
      key_player_count: row.key_players.length,
      player_update_count: row.player_updates.length,
      possible_xi_player_count: (row.possible_xi.team1?.length ?? 0) + (row.possible_xi.team2?.length ?? 0),
      source_link_count: row.source_links.filter((link) => link.source !== 'demo').length,
    });
  });

  const oddsByMatch = new Map<string, RawOddsRow[]>();
  ((oddsRows ?? []) as RawOddsRow[]).forEach((row) => {
    const entries = oddsByMatch.get(row.match_id) ?? [];
    entries.push(row);
    oddsByMatch.set(row.match_id, entries);
  });

  const recentFormByTeam = new Map<string, Array<'W' | 'L'>>();
  ((statsData ?? []) as TeamStatsCacheRow[]).forEach((cacheRow) => {
    cacheRow.data.forEach((record) => {
      if (record.form_last_10) {
        recentFormByTeam.set(
          getTeamStatsKey(record.team, record.gender || 'male', cacheRow.match_type),
          record.form_last_10,
        );
      }
    });
  });

  const context: SurfaceBuildContext = {
    espnVenue,
    espnH2H,
    espnCompetition,
    espnRosters,
    franchiseLogosByName,
    franchiseLogosByAbbr,
    franchiseLogosByCompetitionAbbr,
    enrichmentVenue,
    enrichmentSignals,
    oddsByMatch,
    recentFormByTeam,
  };

  const surfacedMatches = logicalMatches.map((match) => buildSurfaceMatch(match, context, matchIds));
  const mergedMatch = mergeLogicalSurfaceMatches(surfacedMatches)[0] ?? null;
  const orderedMatchIds = [
    mergedMatch?.match_id,
    ...matchIds.filter((candidate) => candidate !== mergedMatch?.match_id),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const prediction = orderedMatchIds
    .map((candidate) => surfacedMatches.find((match) => match.match_id === candidate)?.predictions[0] ?? null)
    .find((candidate): candidate is Prediction => candidate !== null)
    ?? null;
  const edgeScore = orderedMatchIds
    .map((candidate) => (edgeRows ?? []).find((row: Record<string, unknown>) => row.match_id === candidate))
    .find(Boolean);

  const odds = new Map<string, MatchOdds>();
  ((oddsRows ?? []) as MatchOdds[]).forEach((row) => {
    const key = `${normalizeBookmaker(row.bookmaker)}::${row.fetched_at}`;
    if (!odds.has(key)) odds.set(key, row);
  });
  const oddsHistory = new Map<string, MatchOdds>();
  ((oddsHistoryRows ?? []) as MatchOdds[]).forEach((row) => {
    const key = `${normalizeBookmaker(row.bookmaker)}::${row.fetched_at}`;
    if (!oddsHistory.has(key)) oddsHistory.set(key, row);
  });
  const predictionHistory = ((snapshotRows ?? []) as PredictionSnapshot[])
    .filter((snapshot, index, items) => (
      items.findIndex((candidate) => (
        candidate.match_id === snapshot.match_id && candidate.captured_at === snapshot.captured_at
      )) === index
    ))
    .reverse();

  return {
    match: mergedMatch,
    prediction,
    predictionHistory,
    enrichment: mergeEnrichmentRows(normalizedEnrichmentRows),
    odds: [...odds.values()],
    oddsHistory: [...oddsHistory.values()].reverse(),
    squads: mergeSquadRows(((squadRows ?? []) as MatchSquad[]).map((row) => ({
      ...row,
      players: parseJsonField(row.players, []),
    }))),
    espnMatchData: mergeEspnMatchDataRows(normalizedEspnRows),
    edgeScore: edgeScore ? toEdgeScore(edgeScore as Record<string, unknown>) : null,
    linkedMatchIds: orderedMatchIds,
  };
}

export async function getMatch(matchId: string): Promise<Match | null> {
  if (isMockDataEnabled()) {
    return getMockMatch(matchId);
  }

  const [{ data, error }, { data: statsData }, { data: franchiseLogoData }] = await Promise.all([
    supabase
      .from('matches')
      .select('*')
      .eq('match_id', matchId)
      .single(),
    supabase
      .from('stats_cache')
      .select('stat_type, match_type, data')
      .eq('stat_type', 'team_stats'),
    supabase
      .from('franchise_logos')
      .select('normalized_team_name, team_name, team_abbr, logo_url, competition_name'),
  ]);

  if (error || !data) return null;

  const match = data as Match;
  const statsMatchType = getStatsMatchType(match.match_type);
  const franchiseLogosByName = new Map<string, string>();
  const franchiseLogosByAbbr = new Map<string, string>();
  (franchiseLogoData ?? []).forEach((row: FranchiseLogoRow) => {
    const logoUrl = row.logo_url?.trim();
    if (!logoUrl) return;
    const normalizedName = normalizeLogoTeamName(row.team_name || row.normalized_team_name);
    if (normalizedName) franchiseLogosByName.set(normalizedName, logoUrl);
    if (row.normalized_team_name) franchiseLogosByName.set(normalizeLogoTeamName(row.normalized_team_name), logoUrl);
    const abbr = row.team_abbr?.trim().toUpperCase();
    if (abbr) franchiseLogosByAbbr.set(abbr, logoUrl);
  });

  const recentFormByTeam = new Map<string, Array<'W' | 'L'>>();
  ((statsData ?? []) as TeamStatsCacheRow[]).forEach((cacheRow) => {
    cacheRow.data.forEach((record) => {
      if (record.form_last_10) {
        recentFormByTeam.set(
          getTeamStatsKey(record.team, record.gender || 'male', cacheRow.match_type),
          record.form_last_10,
        );
      }
    });
  });

  match.team1_recent_form = recentFormByTeam.get(getTeamStatsKey(match.team1, inferTeamGender(match.team1), statsMatchType)) ?? [];
  match.team2_recent_form = recentFormByTeam.get(getTeamStatsKey(match.team2, inferTeamGender(match.team2), statsMatchType)) ?? [];
  const team1Meta = getTeamMeta(match.team1);
  const team2Meta = getTeamMeta(match.team2);
  match.team1_logo_url = getFranchiseLogoUrl(match.team1)
    || franchiseLogosByName.get(normalizeLogoTeamName(match.team1))
    || franchiseLogosByName.get(normalizeLogoTeamName(team1Meta.name))
    || franchiseLogosByAbbr.get(team1Meta.shortName.toUpperCase())
    || undefined;
  match.team2_logo_url = getFranchiseLogoUrl(match.team2)
    || franchiseLogosByName.get(normalizeLogoTeamName(match.team2))
    || franchiseLogosByName.get(normalizeLogoTeamName(team2Meta.name))
    || franchiseLogosByAbbr.get(team2Meta.shortName.toUpperCase())
    || undefined;

  return match;
}

export async function getPrediction(matchId: string): Promise<Prediction | null> {
  if (isMockDataEnabled()) {
    return getMockPrediction(matchId);
  }

  const { data, error } = await supabase
    .from('predictions')
    .select('*')
    .eq('match_id', matchId)
    .single();

  if (error) return null;
  return data;
}

export async function getPredictionSnapshots(matchId: string): Promise<PredictionSnapshot[]> {
  if (isMockDataEnabled()) {
    return getMockPredictionSnapshots(matchId);
  }

  const { data, error } = await supabase
    .from('prediction_snapshots')
    .select('match_id, team1, team2, predicted_winner, team1_win_probability, team2_win_probability, confidence, edge_score, model, ensemble_size, input_state, change_events, captured_at')
    .eq('match_id', matchId)
    .order('captured_at', { ascending: false })
    .limit(200);

  if (error) return [];
  return (data ?? []).reverse();
}

export async function getMatchOdds(matchId: string): Promise<MatchOdds[]> {
  if (isMockDataEnabled()) {
    return getMockMatchOdds(matchId);
  }

  const { data, error } = await supabase
    .from('match_odds')
    .select('*')
    .eq('match_id', matchId)
    .order('fetched_at', { ascending: false });

  if (error) return [];
  return data ?? [];
}

export async function getMatchOddsHistory(matchId: string): Promise<MatchOdds[]> {
  if (isMockDataEnabled()) {
    return getMockMatchOddsHistory(matchId);
  }

  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('match_odds_history')
    .select('match_id, bookmaker, team1_odds, team2_odds, draw_odds, market, fetched_at')
    .eq('match_id', matchId)
    .gte('fetched_at', cutoff)
    .order('fetched_at', { ascending: false })
    .limit(200);

  if (error) return [];
  return (data ?? []).reverse();
}

export async function getEdgeScore(matchId: string): Promise<EdgeScore | null> {
  if (isMockDataEnabled()) {
    return getMockEdgeScore(matchId);
  }

  const { data, error } = await supabase
    .from('match_edge_scores')
    .select('*')
    .eq('match_id', matchId)
    .single();

  if (error) return null;
  return {
    team1_score: data.team1_score,
    team2_score: data.team2_score,
    net_edge: data.net_edge,
    edge_team: data.edge_team,
    narrative: data.narrative,
    factors: data.factors,
  };
}

export async function getMatchEnrichment(matchId: string): Promise<MatchEnrichment | null> {
  if (isMockDataEnabled()) {
    return getMockMatchEnrichment(matchId);
  }

  const { data, error } = await supabase
    .from('match_enrichment')
    .select('*')
    .eq('match_id', matchId)
    .single();

  if (error || !data) return null;

  // Defensively parse JSON fields that Supabase may return as strings (TEXT vs JSONB)
  const parseJSON = <T>(val: unknown, fallback: T): T => {
    if (val === null || val === undefined) return fallback;
    if (typeof val !== 'string') return val as T;
    try { return JSON.parse(val) as T; } catch { return fallback; }
  };

  return {
    ...data,
    possible_xi: parseJSON(data.possible_xi, { team1: [], team2: [] }),
    player_updates: parseJSON(data.player_updates, []),
    key_players: parseJSON(data.key_players, []),
    source_links: parseJSON(data.source_links, []),
  };
}

export async function getMatchSquads(matchId: string): Promise<MatchSquad[]> {
  if (isMockDataEnabled()) {
    return getMockMatchSquads(matchId);
  }

  const { data, error } = await supabase
    .from('match_squads')
    .select('*')
    .eq('match_id', matchId);

  if (error || !data) return [];

  // Defensively parse players JSON field (may be stored as string in some envs)
  const parseJSON = <T>(val: unknown, fallback: T): T => {
    if (val === null || val === undefined) return fallback;
    if (typeof val !== 'string') return val as T;
    try { return JSON.parse(val) as T; } catch { return fallback; }
  };

  return data.map((squad) => ({
    ...squad,
    players: parseJSON(squad.players, []),
  }));
}

// ---------- ESPN Cricinfo Data ----------

export interface ESPNVenue {
  name: string;
  city: string;
  country: string;
  capacity: number | null;
  grass: boolean | null;
  image_url: string | null;
}

export interface ESPNOfficial {
  name: string;
  role: string;
}

export interface ESPNRosterPlayer {
  name: string;
  espn_id: string;
  position: string;
  position_abbr: string;
  headshot_url: string;
}

export interface ESPNRoster {
  team_name: string;
  team_abbr: string;
  team_logo: string;
  players: ESPNRosterPlayer[];
}

export interface ESPNH2HTeam {
  name: string;
  abbreviation: string;
  score: string;
  winner: boolean;
}

export interface ESPNH2HGame {
  date: string;
  note: string;
  teams: ESPNH2HTeam[];
}

export interface ESPNStanding {
  team_name: string;
  team_abbr: string;
  stats: Record<string, string>;
}

export interface ESPNSeriesLeader {
  player_name: string;
  player_id: string;
  team: string;
  team_abbr: string;
  category: string;
  value: string;
  headshot_url: string;
}

export interface ESPNMatchData {
  match_id: string;
  espn_event_id: string | null;
  // Venue
  venue_name: string | null;
  venue_city: string | null;
  venue_country: string | null;
  venue_capacity: number | null;
  venue_grass: boolean | null;
  venue_image_url: string | null;
  // Toss
  toss_winner: string | null;
  toss_decision: string | null;
  // Schedule
  match_number: string | null;
  match_days: string | null;
  hours_of_play: string | null;
  series_note: string | null;
  // Series
  series_scoreline: string | null;
  series_leaders: ESPNSeriesLeader[];
  // JSON fields
  officials: ESPNOfficial[];
  rosters: ESPNRoster[];
  head_to_head: ESPNH2HGame[];
  standings: ESPNStanding[];
  scorecards: unknown[];
  // Metadata
  fetched_at: string | null;
}

export async function getESPNMatchData(matchId: string): Promise<ESPNMatchData | null> {
  if (isMockDataEnabled()) {
    return getMockESPNMatchData(matchId);
  }

  const { data, error } = await supabase
    .from('espn_match_data')
    .select('*')
    .eq('match_id', matchId)
    .single();

  if (error || !data) return null;

  // Parse JSON fields that may come as strings
  const parseJSON = (val: unknown): unknown[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return []; }
    }
    return [];
  };

  return {
    ...data,
    officials: parseJSON(data.officials) as ESPNOfficial[],
    rosters: parseJSON(data.rosters) as ESPNRoster[],
    head_to_head: parseJSON(data.head_to_head) as ESPNH2HGame[],
    standings: parseJSON(data.standings) as ESPNStanding[],
    scorecards: parseJSON(data.scorecards),
    series_leaders: parseJSON(data.series_leaders) as ESPNSeriesLeader[],
    series_scoreline: data.series_scoreline ?? null,
  };
}

export async function getPlayerStats(playerNames: string[], format: string): Promise<PlayerStats[]> {
  if (isMockDataEnabled()) {
    return getMockPlayerStats(playerNames, format);
  }

  if (!playerNames.length) return [];
  const { data, error } = await supabase
    .from('player_stats')
    .select('*')
    .in('player_name', playerNames)
    .eq('format', format);

  if (error) return [];
  return data ?? [];
}

export async function getPredictionHistory(): Promise<PredictionHistoryItem[]> {
  if (isMockDataEnabled()) {
    return getMockPredictionHistory();
  }

  const { data: results, error } = await supabase
    .from('prediction_results')
    .select('*')
    .order('scored_at', { ascending: false });

  if (error) throw error;
  if (!results?.length) return [];

  // Enrich with pre-match prediction details (team names, reasoning, probabilities)
  const matchIds = results.map((r) => r.match_id);
  const { data: predictions } = await supabase
    .from('predictions')
    .select('match_id, team1, team2, reasoning, toss_insight, confidence, team1_win_probability, team2_win_probability')
    .in('match_id', matchIds);

  // Pull toss data from espn_match_data
  const { data: espnData } = await supabase
    .from('espn_match_data')
    .select('match_id, toss_winner, toss_decision')
    .in('match_id', matchIds);

  const predMap = Object.fromEntries((predictions ?? []).map((p) => [p.match_id, p]));
  const tossMap = Object.fromEntries((espnData ?? []).map((e) => [e.match_id, e]));

  return results.map((r) => ({
    ...r,
    team1: predMap[r.match_id]?.team1 ?? '',
    team2: predMap[r.match_id]?.team2 ?? '',
    reasoning: predMap[r.match_id]?.reasoning,
    toss_insight: predMap[r.match_id]?.toss_insight,
    confidence: predMap[r.match_id]?.confidence,
    team1_win_probability: predMap[r.match_id]?.team1_win_probability,
    team2_win_probability: predMap[r.match_id]?.team2_win_probability,
    toss_winner: tossMap[r.match_id]?.toss_winner ?? null,
    toss_decision: tossMap[r.match_id]?.toss_decision ?? null,
  }));
}

export async function getAccuracyBySplit(): Promise<{
  international: { total: number; correct: number; accuracy: number };
  league: { total: number; correct: number; accuracy: number };
}> {
  const history = await getPredictionHistory();

  const classify = (r: PredictionHistoryItem) => {
    const t1 = r.team1 || r.predicted_winner;
    const t2 = r.team2 || r.actual_winner;
    return Boolean(getTeamMeta(t1).countryCode) && Boolean(getTeamMeta(t2).countryCode);
  };

  const intl = history.filter(classify);
  const league = history.filter((r) => !classify(r));

  return {
    international: {
      total: intl.length,
      correct: intl.filter((r) => r.correct).length,
      accuracy: intl.length > 0 ? intl.filter((r) => r.correct).length / intl.length : 0,
    },
    league: {
      total: league.length,
      correct: league.filter((r) => r.correct).length,
      accuracy: league.length > 0 ? league.filter((r) => r.correct).length / league.length : 0,
    },
  };
}

export async function getDashboardStats(): Promise<{
  total: number;
  correct: number;
  accuracy: number;
  avgBrier: number;
}> {
  if (isMockDataEnabled()) {
    return getMockDashboardStats();
  }

  const { data, error } = await supabase
    .from('prediction_results')
    .select('correct, brier_score');

  if (error) throw error;

  const results = data ?? [];
  const total = results.length;
  const correct = results.filter((r) => r.correct).length;
  const brierScores = results
    .map((r) => r.brier_score)
    .filter((b): b is number => b !== null);

  return {
    total,
    correct,
    accuracy: total > 0 ? correct / total : 0,
    avgBrier: brierScores.length > 0
      ? brierScores.reduce((a, b) => a + b, 0) / brierScores.length
      : 0,
  };
}

export async function getCalibrationData(): Promise<Array<{ bin_center: number; predicted_avg: number; actual_avg: number; count: number }>> {
  if (isMockDataEnabled()) {
    return getMockCalibrationData();
  }

  const { data } = await supabase
    .from('stats_cache')
    .select('data')
    .eq('stat_type', 'calibration')
    .single();

  return (data?.data as Array<{ bin_center: number; predicted_avg: number; actual_avg: number; count: number }>) ?? [];
}

export async function getAccuracyTrend(): Promise<Array<{ date: string; accuracy: number }>> {
  if (isMockDataEnabled()) {
    return getMockAccuracyTrend();
  }

  const { data } = await supabase
    .from('prediction_results')
    .select('correct, scored_at')
    .order('scored_at', { ascending: true });

  return buildAccuracyTrend(data ?? [], 10);
}
