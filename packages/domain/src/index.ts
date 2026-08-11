export type MatchStatus = 'upcoming' | 'live' | 'completed';
export type PredictionConfidence = 'low' | 'medium' | 'high';

export interface Match {
  match_id: string;
  name: string;
  team1: string;
  team2: string;
  date: string;
  venue: string;
  match_type: string;
  status: MatchStatus;
  winner?: string;
  competition_name?: string;
  team1_logo_url?: string;
  team2_logo_url?: string;
}

export interface Prediction {
  match_id: string;
  team1: string;
  team2: string;
  predicted_winner: string;
  team1_win_probability: number;
  team2_win_probability: number;
  confidence: PredictionConfidence;
  reasoning: string;
  toss_insight?: string;
  model: string;
  ensemble_size: number;
  scored_at?: string;
}

export interface MatchWithPredictions extends Match {
  predictions: Prediction[];
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

export interface PlayerUpdate {
  player?: string;
  team?: string;
  status: string;
  confidence?: 'confirmed' | 'reported' | 'speculative';
  source_index?: number;
}

export interface SourceLink {
  title?: string;
  url?: string;
  source?: string;
  published_at?: string | null;
}

export interface MatchEnrichment {
  match_id: string;
  venue_name: string | null;
  venue_confidence: 'confirmed' | 'reported' | 'unknown';
  possible_xi: {
    team1?: string[];
    team2?: string[];
  };
  player_updates: PlayerUpdate[];
  expert_preview: string | null;
  toss_insight?: string | null;
  source_links: SourceLink[];
  confidence: PredictionConfidence;
  generated_at: string;
}

export interface MatchDetails {
  match: Match;
  prediction: Prediction | null;
  edgeScore: EdgeScore | null;
  odds: MatchOdds[];
  enrichment: MatchEnrichment | null;
  squads: MatchSquad[];
}

export interface PredictionHistoryItem {
  prediction_id: string;
  match_id: string;
  predicted_winner: string;
  actual_winner: string;
  correct: boolean;
  brier_score: number | null;
  predicted_probability: number;
  result_text?: string | null;
  scored_at: string;
  team1: string;
  team2: string;
  reasoning?: string;
  toss_insight?: string;
  confidence?: PredictionConfidence;
  team1_win_probability?: number;
  team2_win_probability?: number;
}

export interface AccuracySummary {
  total: number;
  correct: number;
  accuracy: number;
}

export interface DashboardStats extends AccuracySummary {
  avgBrier: number | null;
}

export interface AccuracySplit {
  international: AccuracySummary;
  league: AccuracySummary;
}

export interface CalibrationBin {
  bin_center: number;
  predicted_avg: number;
  actual_avg: number;
  count: number;
}

export interface AccuracyTrendPoint {
  date: string;
  accuracy: number;
}

export interface DashboardData {
  stats: DashboardStats;
  split: AccuracySplit;
  calibration: CalibrationBin[];
  trend: AccuracyTrendPoint[];
}

const INTERNATIONAL_TEAMS = new Set([
  'afghanistan',
  'australia',
  'bangladesh',
  'bermuda',
  'canada',
  'england',
  'hong kong',
  'india',
  'ireland',
  'kenya',
  'namibia',
  'nepal',
  'netherlands',
  'new zealand',
  'oman',
  'pakistan',
  'papua new guinea',
  'scotland',
  'south africa',
  'sri lanka',
  'united arab emirates',
  'united states of america',
  'usa',
  'west indies',
  'zimbabwe',
]);

function normalizeTeamName(team: string): string {
  return team
    .toLowerCase()
    .replace(/\s+\((men|women)\)$/, '')
    .replace(/\s+(men|women)$/, '')
    .trim();
}

export function isInternationalMatch(item: Pick<PredictionHistoryItem, 'team1' | 'team2'>): boolean {
  return INTERNATIONAL_TEAMS.has(normalizeTeamName(item.team1))
    && INTERNATIONAL_TEAMS.has(normalizeTeamName(item.team2));
}

export function summarizeAccuracy(items: Pick<PredictionHistoryItem, 'correct'>[]): AccuracySummary {
  const total = items.length;
  const correct = items.filter((item) => item.correct).length;
  return { total, correct, accuracy: total > 0 ? correct / total : 0 };
}

export function getPrimaryPrediction(match: MatchWithPredictions): Prediction | null {
  return match.predictions[0] ?? null;
}

export function formatWinProbability(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}
