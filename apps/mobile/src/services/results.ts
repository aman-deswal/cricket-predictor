import {
  isInternationalMatch,
  summarizeAccuracy,
  type AccuracyTrendPoint,
  type CalibrationBin,
  type DashboardData,
  type PredictionConfidence,
  type PredictionHistoryItem,
} from '@sixsense/domain';

import { getSupabaseClient } from '@/lib/supabase';

interface ResultRow {
  prediction_id: string;
  match_id: string;
  predicted_winner: string;
  actual_winner: string;
  correct: boolean;
  brier_score: number | null;
  predicted_probability: number;
  result_text: string | null;
  scored_at: string;
}

interface PredictionContextRow {
  match_id: string;
  team1: string;
  team2: string;
  reasoning: string | null;
  toss_insight: string | null;
  confidence: string;
  team1_win_probability: number;
  team2_win_probability: number;
}

interface CalibrationCacheRow {
  data: unknown;
}

function isConfidence(value: string): value is PredictionConfidence {
  return value === 'low' || value === 'medium' || value === 'high';
}

function mapCalibration(value: unknown): CalibrationBin[] {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const bin = item as Record<string, unknown>;
    if (
      typeof bin.bin_center !== 'number'
      || typeof bin.predicted_avg !== 'number'
      || typeof bin.actual_avg !== 'number'
      || typeof bin.count !== 'number'
    ) {
      return [];
    }
    return [{
      bin_center: bin.bin_center,
      predicted_avg: bin.predicted_avg,
      actual_avg: bin.actual_avg,
      count: bin.count,
    }];
  });
}

function buildTrend(history: PredictionHistoryItem[]): AccuracyTrendPoint[] {
  const chronological = [...history].reverse();
  if (chronological.length < 10) return [];

  return chronological.slice(9).map((item, index) => {
    const window = chronological.slice(index, index + 10);
    return {
      date: item.scored_at,
      accuracy: summarizeAccuracy(window).accuracy,
    };
  });
}

export async function getPredictionHistory(): Promise<PredictionHistoryItem[]> {
  const supabase = getSupabaseClient();
  const { data: results, error } = await supabase
    .from('prediction_results')
    .select('prediction_id, match_id, predicted_winner, actual_winner, correct, brier_score, predicted_probability, result_text, scored_at')
    .order('scored_at', { ascending: false })
    .returns<ResultRow[]>();

  if (error) throw new Error(`Unable to load prediction history: ${error.message}`);
  if (!results?.length) return [];

  const matchIds = [...new Set(results.map((result) => result.match_id))];
  const { data: predictions, error: predictionError } = await supabase
    .from('predictions')
    .select('match_id, team1, team2, reasoning, toss_insight, confidence, team1_win_probability, team2_win_probability')
    .in('match_id', matchIds)
    .returns<PredictionContextRow[]>();

  if (predictionError) {
    throw new Error(`Unable to load prediction context: ${predictionError.message}`);
  }

  const predictionByMatch = new Map(
    (predictions ?? []).map((prediction) => [prediction.match_id, prediction]),
  );

  return results.map((result) => {
    const prediction = predictionByMatch.get(result.match_id);
    return {
      ...result,
      team1: prediction?.team1 ?? result.predicted_winner,
      team2: prediction?.team2 ?? result.actual_winner,
      reasoning: prediction?.reasoning ?? undefined,
      toss_insight: prediction?.toss_insight ?? undefined,
      confidence: prediction && isConfidence(prediction.confidence) ? prediction.confidence : undefined,
      team1_win_probability: prediction?.team1_win_probability,
      team2_win_probability: prediction?.team2_win_probability,
    };
  });
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = getSupabaseClient();
  const [history, calibrationResult] = await Promise.all([
    getPredictionHistory(),
    supabase
      .from('stats_cache')
      .select('data')
      .eq('stat_type', 'calibration')
      .maybeSingle<CalibrationCacheRow>(),
  ]);

  const statsSummary = summarizeAccuracy(history);
  const scoredBrier = history
    .map((item) => item.brier_score)
    .filter((score): score is number => score !== null);
  const international = history.filter(isInternationalMatch);
  const league = history.filter((item) => !isInternationalMatch(item));

  return {
    stats: {
      ...statsSummary,
      avgBrier: scoredBrier.length > 0
        ? scoredBrier.reduce((total, score) => total + score, 0) / scoredBrier.length
        : null,
    },
    split: {
      international: summarizeAccuracy(international),
      league: summarizeAccuracy(league),
    },
    calibration: calibrationResult.error ? [] : mapCalibration(calibrationResult.data?.data),
    trend: buildTrend(history),
  };
}
