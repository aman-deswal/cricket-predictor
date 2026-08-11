import type { MatchStatus, MatchWithPredictions, Prediction, PredictionConfidence } from '@sixsense/domain';

import { getSupabaseClient } from '@/lib/supabase';

interface PredictionRow {
  match_id: string;
  team1: string;
  team2: string;
  predicted_winner: string;
  team1_win_probability: number;
  team2_win_probability: number;
  confidence: string;
  reasoning: string;
  toss_insight: string | null;
  model: string;
  ensemble_size: number;
  scored_at: string | null;
}

interface MatchRow {
  match_id: string;
  name: string;
  team1: string;
  team2: string;
  date: string;
  venue: string;
  match_type: string;
  status: string;
  winner: string | null;
  competition_name: string | null;
  team1_logo_url: string | null;
  team2_logo_url: string | null;
  predictions: PredictionRow[] | null;
}

const MATCH_FIELDS = `
  match_id,
  name,
  team1,
  team2,
  date,
  venue,
  match_type,
  status,
  winner,
  competition_name,
  team1_logo_url,
  team2_logo_url,
  predictions (
    match_id,
    team1,
    team2,
    predicted_winner,
    team1_win_probability,
    team2_win_probability,
    confidence,
    reasoning,
    toss_insight,
    model,
    ensemble_size,
    scored_at
  )
`;

function isMatchStatus(value: string): value is MatchStatus {
  return value === 'upcoming' || value === 'live' || value === 'completed';
}

function isPredictionConfidence(value: string): value is PredictionConfidence {
  return value === 'low' || value === 'medium' || value === 'high';
}

function mapPrediction(row: PredictionRow): Prediction {
  if (!isPredictionConfidence(row.confidence)) {
    throw new Error(`Unexpected prediction confidence: ${row.confidence}`);
  }

  return {
    ...row,
    confidence: row.confidence,
    toss_insight: row.toss_insight ?? undefined,
    scored_at: row.scored_at ?? undefined,
  };
}

function mapMatch(row: MatchRow): MatchWithPredictions {
  if (!isMatchStatus(row.status)) {
    throw new Error(`Unexpected match status: ${row.status}`);
  }

  return {
    match_id: row.match_id,
    name: row.name,
    team1: row.team1,
    team2: row.team2,
    date: row.date,
    venue: row.venue,
    match_type: row.match_type,
    status: row.status,
    winner: row.winner ?? undefined,
    competition_name: row.competition_name ?? undefined,
    team1_logo_url: row.team1_logo_url ?? undefined,
    team2_logo_url: row.team2_logo_url ?? undefined,
    predictions: (row.predictions ?? []).map(mapPrediction),
  };
}

export async function getUpcomingMatches(): Promise<MatchWithPredictions[]> {
  const { data, error } = await getSupabaseClient()
    .from('matches')
    .select(MATCH_FIELDS)
    .in('status', ['upcoming', 'live'])
    .order('date', { ascending: true })
    .returns<MatchRow[]>();

  if (error) {
    throw new Error(`Unable to load matches: ${error.message}`);
  }

  return (data ?? []).map(mapMatch);
}
