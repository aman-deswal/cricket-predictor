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

export function getPrimaryPrediction(match: MatchWithPredictions): Prediction | null {
  return match.predictions[0] ?? null;
}

export function formatWinProbability(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}
