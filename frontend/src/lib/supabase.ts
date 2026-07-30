import { createClient } from '@supabase/supabase-js';
import { getTeamMeta } from './teams';
import { getStoredDemoMode } from './demo-mode';
import {
  getMockAccuracyTrend,
  getMockCalibrationData,
  getMockDashboardStats,
  getMockEdgeScore,
  getMockESPNMatchData,
  getMockMatch,
  getMockMatchEnrichment,
  getMockMatchOdds,
  getMockMatchSquads,
  getMockPlayerStats,
  getMockPrediction,
  getMockPredictionHistory,  getMockUpcomingMatches,
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
  status: 'upcoming' | 'completed';
  winner?: string;
  team1_recent_form?: Array<'W' | 'L'>;
  team2_recent_form?: Array<'W' | 'L'>;
  bookmaker_odds?: { bookmaker: string; team1_odds: number; team2_odds: number };
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

export type MatchWithPredictions = Match & { predictions: Prediction[] };

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

export type MatchSection = 'International' | 'League' | 'Other';

const TOP_INTERNATIONAL_TEAMS = new Set([
  'India',
  'Australia',
  'England',
  'South Africa',
  'New Zealand',
  'Pakistan',
  'Sri Lanka',
  'Bangladesh',
  'West Indies',
  'Afghanistan',
  'Zimbabwe',
  'Ireland',
]);

const POPULAR_LEAGUES = [
  'indian premier league',
  'ipl',
  'womens premier league',
  'women premier league',
  'wpl',
  'big bash league',
  'bbl',
  'the hundred',
  'caribbean premier league',
  'cpl',
  'pakistan super league',
  'psl',
  'sa20',
  'major league cricket',
  'mlc',
  'lanka premier league',
  'lpl',
  'bangladesh premier league',
  'bpl',
];

function normalizeTeam(team: string): string {
  return team.replace(/\s+Women$/, '').replace(/\s+Men$/, '').trim();
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

function includesPopularLeague(match: Match): boolean {
  const haystack = `${match.name} ${match.venue}`.toLowerCase();
  return POPULAR_LEAGUES.some((league) => haystack.includes(league));
}

export function getMatchSection(match: Match): MatchSection {
  const team1 = normalizeTeam(match.team1);
  const team2 = normalizeTeam(match.team2);

  if (TOP_INTERNATIONAL_TEAMS.has(team1) && TOP_INTERNATIONAL_TEAMS.has(team2)) {
    return 'International';
  }

  if (includesPopularLeague(match)) {
    return 'League';
  }

  return 'Other';
}

function getMatchPriority(match: Match): number {
  const section = getMatchSection(match);
  if (section === 'International') return 0;
  if (section === 'League') return 1;
  return 2;
}

function getMatchTimestamp(match: Match): number {
  const timestamp = new Date(match.date).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function sortMatchesByPriority(matches: MatchWithPredictions[]): MatchWithPredictions[] {
  return [...matches].sort((a, b) => {
    const priorityDiff = getMatchPriority(a) - getMatchPriority(b);
    if (priorityDiff !== 0) return priorityDiff;

    return getMatchTimestamp(a) - getMatchTimestamp(b);
  });
}

function isFutureMatch(match: Match): boolean {
  return getMatchTimestamp(match) > Date.now();
}

export async function getUpcomingMatches(): Promise<MatchWithPredictions[]> {
  if (isMockDataEnabled()) {
    return getMockUpcomingMatches();
  }

  const [{ data, error }, { data: statsData }, { data: enrichmentData }, { data: espnData }, { data: oddsData }] = await Promise.all([
    supabase
      .from('matches')
      .select('*, predictions(*)')
      .eq('status', 'upcoming')
      .order('date', { ascending: true }),
    supabase
      .from('stats_cache')
      .select('stat_type, match_type, data')
      .eq('stat_type', 'team_stats'),
    supabase
      .from('match_enrichment')
      .select('match_id, venue_name'),
    supabase
      .from('espn_match_data')
      .select('match_id, venue_name, head_to_head'),
    supabase
      .from('match_odds')
      .select('match_id, bookmaker, team1_odds, team2_odds')
      .order('fetched_at', { ascending: false }),
  ]);

  if (error) throw error;

  // Build venue + H2H lookups (ESPN takes priority)
  const espnVenue = new Map<string, string>();
  const espnH2H = new Map<string, string>();
  (espnData ?? []).forEach((e: { match_id: string; venue_name: string | null; head_to_head: string | null }) => {
    if (e.venue_name) espnVenue.set(e.match_id, e.venue_name);
    if (e.head_to_head) espnH2H.set(e.match_id, typeof e.head_to_head === 'string' ? e.head_to_head : JSON.stringify(e.head_to_head));
  });
  const enrichmentVenue = new Map<string, string>();
  (enrichmentData ?? []).forEach((e: { match_id: string; venue_name: string | null }) => {
    if (e.venue_name) enrichmentVenue.set(e.match_id, e.venue_name);
  });

  // Build odds lookup — first entry per match (most recent, ordered by fetched_at desc)
  const oddsMap = new Map<string, { bookmaker: string; team1_odds: number; team2_odds: number }>();
  (oddsData ?? []).forEach((o: { match_id: string; bookmaker: string; team1_odds: number; team2_odds: number }) => {
    if (!oddsMap.has(o.match_id)) oddsMap.set(o.match_id, o);
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

  const matchesWithForm = ((data ?? []) as MatchWithPredictions[]).map((match) => {
    const statsMatchType = getStatsMatchType(match.match_type);
    let team1Form = recentFormByTeam.get(getTeamStatsKey(match.team1, inferTeamGender(match.team1), statsMatchType)) ?? [];
    let team2Form = recentFormByTeam.get(getTeamStatsKey(match.team2, inferTeamGender(match.team2), statsMatchType)) ?? [];

    // Override with ESPN H2H form if available (more accurate/recent)
    const h2hRaw = espnH2H.get(match.match_id);
    if (h2hRaw) {
      try {
        const h2hGames = typeof h2hRaw === 'string' ? JSON.parse(h2hRaw) : h2hRaw;
        if (Array.isArray(h2hGames) && h2hGames.length > 0) {
          const team1Meta = getTeamMeta(match.team1);
          const team2Meta = getTeamMeta(match.team2);
          const deriveForm = (shortName: string): Array<'W' | 'L'> => {
            return h2hGames
              .slice(0, 5)
              .reverse()
              .map((g: { teams?: Array<{ abbreviation?: string; winner?: boolean }> }) => {
                const t = g.teams?.find(t => t.abbreviation === shortName);
                return t?.winner ? 'W' as const : 'L' as const;
              });
          };
          const f1 = deriveForm(team1Meta.shortName);
          const f2 = deriveForm(team2Meta.shortName);
          if (f1.length > 0) team1Form = f1;
          if (f2.length > 0) team2Form = f2;
        }
      } catch {}
    }

    return {
      ...match,
      venue: match.venue || espnVenue.get(match.match_id) || enrichmentVenue.get(match.match_id) || '',
      team1_recent_form: team1Form,
      team2_recent_form: team2Form,
      bookmaker_odds: oddsMap.get(match.match_id),
    };
  });

  return sortMatchesByPriority(matchesWithForm);
}

export async function getMatch(matchId: string): Promise<Match | null> {
  if (isMockDataEnabled()) {
    return getMockMatch(matchId);
  }

  const [{ data, error }, { data: statsData }] = await Promise.all([
    supabase
      .from('matches')
      .select('*')
      .eq('match_id', matchId)
      .single(),
    supabase
      .from('stats_cache')
      .select('stat_type, match_type, data')
      .eq('stat_type', 'team_stats'),
  ]);

  if (error || !data) return null;

  const match = data as Match;
  const statsMatchType = getStatsMatchType(match.match_type);

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

  if (error) return null;
  return data;
}

export async function getMatchSquads(matchId: string): Promise<MatchSquad[]> {
  if (isMockDataEnabled()) {
    return getMockMatchSquads(matchId);
  }

  const { data, error } = await supabase
    .from('match_squads')
    .select('*')
    .eq('match_id', matchId);

  if (error) return [];
  return data ?? [];
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

  if (!data || data.length < 10) return [];

  const window = 10;
  const trend = [];
  for (let i = window - 1; i < data.length; i++) {
    const slice = data.slice(i - window + 1, i + 1);
    const correct = slice.filter((r) => r.correct).length;
    trend.push({
      date: new Date(data[i].scored_at).toLocaleDateString(),
      accuracy: (correct / window) * 100,
    });
  }
  return trend;
}
