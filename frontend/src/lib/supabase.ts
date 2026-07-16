import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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
  scored_at: string;
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
    name: string;
    team: string;
    role: 'bat' | 'bowl' | 'all';
    form_note: string;
  }>;
  expert_preview: string | null;
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
  const [{ data, error }, { data: statsData }] = await Promise.all([
    supabase
      .from('matches')
      .select('*, predictions(*)')
      .eq('status', 'upcoming')
      .order('date', { ascending: true }),
    supabase
      .from('stats_cache')
      .select('stat_type, match_type, data')
      .eq('stat_type', 'team_stats'),
  ]);

  if (error) throw error;

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
    return {
      ...match,
      team1_recent_form: recentFormByTeam.get(getTeamStatsKey(match.team1, inferTeamGender(match.team1), statsMatchType)) ?? [],
      team2_recent_form: recentFormByTeam.get(getTeamStatsKey(match.team2, inferTeamGender(match.team2), statsMatchType)) ?? [],
    };
  });

  return sortMatchesByPriority(matchesWithForm.filter(isFutureMatch));
}

export async function getMatch(matchId: string): Promise<Match | null> {
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
  const { data, error } = await supabase
    .from('predictions')
    .select('*')
    .eq('match_id', matchId)
    .single();

  if (error) return null;
  return data;
}

export async function getMatchOdds(matchId: string): Promise<MatchOdds[]> {
  const { data, error } = await supabase
    .from('match_odds')
    .select('*')
    .eq('match_id', matchId)
    .order('fetched_at', { ascending: false });

  if (error) return [];
  return data ?? [];
}

export async function getMatchEnrichment(matchId: string): Promise<MatchEnrichment | null> {
  const { data, error } = await supabase
    .from('match_enrichment')
    .select('*')
    .eq('match_id', matchId)
    .single();

  if (error) return null;
  return data;
}

export async function getMatchSquads(matchId: string): Promise<MatchSquad[]> {
  const { data, error } = await supabase
    .from('match_squads')
    .select('*')
    .eq('match_id', matchId);

  if (error) return [];
  return data ?? [];
}

export async function getPlayerStats(playerNames: string[], format: string): Promise<PlayerStats[]> {
  if (!playerNames.length) return [];
  const { data, error } = await supabase
    .from('player_stats')
    .select('*')
    .in('player_name', playerNames)
    .eq('format', format);

  if (error) return [];
  return data ?? [];
}

export async function getPredictionHistory(): Promise<PredictionResult[]> {
  const { data, error } = await supabase
    .from('prediction_results')
    .select('*')
    .order('scored_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getDashboardStats(): Promise<{
  total: number;
  correct: number;
  accuracy: number;
  avgBrier: number;
}> {
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
