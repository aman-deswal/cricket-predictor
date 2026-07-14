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

export async function getUpcomingMatches(): Promise<(Match & { predictions: Prediction[] })[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*, predictions(*)')
    .eq('status', 'upcoming')
    .order('date', { ascending: true });

  if (error) throw error;
  return data ?? [];
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
