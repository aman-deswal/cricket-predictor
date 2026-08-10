import {
  CompetitionMatch,
  getCompetitionPriority,
  getFeaturedHorizonMatches,
  getMatchTimestamp,
  hasValidMarketOdds,
} from './competition';

interface FeaturedPrediction {
  confidence: string;
  reasoning?: string;
  team1_win_probability: number;
  team2_win_probability: number;
}

interface SpotlightSignals {
  has_expert_preview?: boolean;
  has_espn_context?: boolean;
  enrichment_confidence?: string;
  h2h_match_count?: number;
  source_link_count?: number;
  key_player_count?: number;
  possible_xi_player_count?: number;
  player_update_count?: number;
}

export interface FeaturedCandidate extends CompetitionMatch {
  match_id: string;
  venue?: string;
  predictions?: FeaturedPrediction | FeaturedPrediction[] | null;
  spotlight_signals?: SpotlightSignals;
  team1_recent_form?: Array<'W' | 'L'>;
  team2_recent_form?: Array<'W' | 'L'>;
}

function getPrimaryPrediction(match: FeaturedCandidate): FeaturedPrediction | null {
  return Array.isArray(match.predictions) ? match.predictions[0] ?? null : match.predictions ?? null;
}

function hasKnownVenue(value: string | undefined): boolean {
  const venue = value?.trim();
  return Boolean(
    venue
    && !/^(tbd|tbc|unknown|unavailable|none|n\/a|coming soon|venue tbd|venue tbc)$/i.test(venue),
  );
}

export function getEvidenceCompletenessScore(match: FeaturedCandidate): number {
  const signals = match.spotlight_signals;
  return [
    hasKnownVenue(match.venue) ? 8 : 0,
    signals?.has_expert_preview ? 15 : 0,
    signals?.has_espn_context ? 12 : 0,
    Math.min((signals?.h2h_match_count ?? 0) * 3, 15),
    Math.min((signals?.source_link_count ?? 0) * 4, 16),
    Math.min((signals?.key_player_count ?? 0) * 2, 12),
    Math.min((signals?.possible_xi_player_count ?? 0), 16),
    Math.min((signals?.player_update_count ?? 0) * 3, 12),
    Math.min((match.team1_recent_form?.length ?? 0) + (match.team2_recent_form?.length ?? 0), 10),
  ].reduce((sum, score) => sum + score, 0);
}

function getPredictionConfidenceScore(match: FeaturedCandidate): number {
  const prediction = getPrimaryPrediction(match);
  return prediction?.confidence === 'high' ? 3 : prediction?.confidence === 'medium' ? 2 : prediction ? 1 : 0;
}

function getMeaningfulEdgeScore(match: FeaturedCandidate): number {
  const prediction = getPrimaryPrediction(match);
  const odds = hasValidMarketOdds(match) ? match.bookmaker_odds : null;
  const edgeScore = prediction && odds
    ? Math.max(
        0,
        Math.round((prediction.team1_win_probability - 1 / odds.team1_odds) * 100),
        Math.round((prediction.team2_win_probability - 1 / odds.team2_odds) * 100),
      )
    : 0;
  return edgeScore >= 7 ? edgeScore : 0;
}

export function compareFeaturedMatches(a: FeaturedCandidate, b: FeaturedCandidate): number {
  const marketDiff = Number(hasValidMarketOdds(b)) - Number(hasValidMarketOdds(a));
  if (marketDiff !== 0) return marketDiff;

  const completenessDiff = getEvidenceCompletenessScore(b) - getEvidenceCompletenessScore(a);
  if (completenessDiff !== 0) return completenessDiff;

  const confidenceDiff = getPredictionConfidenceScore(b) - getPredictionConfidenceScore(a);
  if (confidenceDiff !== 0) return confidenceDiff;

  const edgeDiff = getMeaningfulEdgeScore(b) - getMeaningfulEdgeScore(a);
  if (edgeDiff !== 0) return edgeDiff;

  const priorityDiff = getCompetitionPriority(a) - getCompetitionPriority(b);
  if (priorityDiff !== 0) return priorityDiff;

  const kickoffDiff = getMatchTimestamp(a) - getMatchTimestamp(b);
  if (kickoffDiff !== 0) return kickoffDiff;

  return a.match_id.localeCompare(b.match_id);
}

export function selectFeaturedMatch<T extends FeaturedCandidate>(matches: T[], now = Date.now()): T | null {
  const predictedMatches = matches.filter((match) => getPrimaryPrediction(match) !== null);
  return getFeaturedHorizonMatches(predictedMatches, now).sort(compareFeaturedMatches)[0] ?? null;
}
