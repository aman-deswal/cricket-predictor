import {
  COMPETITION_PRIORITY,
  CompetitionMatch,
  getCompetitionPriority,
  getFeaturedHorizonMatches,
  getMatchTimestamp,
  hasValidMarketOdds,
} from './competition';

const EVIDENCE_POINTS = {
  venue: 8,
  expertPreview: 15,
  espnContext: 12,
  h2h: 15,
  sourceLinks: 16,
  keyPlayers: 12,
  possibleXi: 16,
  playerUpdates: 12,
  recentForm: 10,
} as const;
const MAX_EVIDENCE_COMPLETENESS = Object.values(EVIDENCE_POINTS)
  .reduce((sum, points) => sum + points, 0);
export const FEATURED_SCORE_WEIGHTS = {
  competitionRelevance: 0.6,
  evidenceCompleteness: 0.4,
} as const;
const COMPOSITE_SCORE_PRECISION = 1_000_000;

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
    hasKnownVenue(match.venue) ? EVIDENCE_POINTS.venue : 0,
    signals?.has_expert_preview ? EVIDENCE_POINTS.expertPreview : 0,
    signals?.has_espn_context ? EVIDENCE_POINTS.espnContext : 0,
    Math.min((signals?.h2h_match_count ?? 0) * 3, EVIDENCE_POINTS.h2h),
    Math.min((signals?.source_link_count ?? 0) * 4, EVIDENCE_POINTS.sourceLinks),
    Math.min((signals?.key_player_count ?? 0) * 2, EVIDENCE_POINTS.keyPlayers),
    Math.min((signals?.possible_xi_player_count ?? 0), EVIDENCE_POINTS.possibleXi),
    Math.min((signals?.player_update_count ?? 0) * 3, EVIDENCE_POINTS.playerUpdates),
    Math.min(
      (match.team1_recent_form?.length ?? 0) + (match.team2_recent_form?.length ?? 0),
      EVIDENCE_POINTS.recentForm,
    ),
  ].reduce((sum, score) => sum + score, 0);
}

function normalizeBounded(value: number, maximum: number): number {
  if (maximum <= 0) return 0;
  return Math.max(0, Math.min(1, value / maximum));
}

export function getFeaturedCompositeScore(match: FeaturedCandidate): number {
  const evidenceScore = normalizeBounded(
    getEvidenceCompletenessScore(match),
    MAX_EVIDENCE_COMPLETENESS,
  );
  const competitionScore = normalizeBounded(
    COMPETITION_PRIORITY.UNKNOWN - getCompetitionPriority(match),
    COMPETITION_PRIORITY.UNKNOWN,
  );
  const weightedScore = (
    competitionScore * FEATURED_SCORE_WEIGHTS.competitionRelevance
    + evidenceScore * FEATURED_SCORE_WEIGHTS.evidenceCompleteness
  );
  return Math.round(weightedScore * COMPOSITE_SCORE_PRECISION) / COMPOSITE_SCORE_PRECISION;
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

  const compositeDiff = getFeaturedCompositeScore(b) - getFeaturedCompositeScore(a);
  if (compositeDiff !== 0) return compositeDiff;

  const completenessDiff = getEvidenceCompletenessScore(b) - getEvidenceCompletenessScore(a);
  if (completenessDiff !== 0) return completenessDiff;

  const confidenceDiff = getPredictionConfidenceScore(b) - getPredictionConfidenceScore(a);
  if (confidenceDiff !== 0) return confidenceDiff;

  const edgeDiff = getMeaningfulEdgeScore(b) - getMeaningfulEdgeScore(a);
  if (edgeDiff !== 0) return edgeDiff;

  const kickoffDiff = getMatchTimestamp(a) - getMatchTimestamp(b);
  if (kickoffDiff !== 0) return kickoffDiff;

  return a.match_id.localeCompare(b.match_id);
}

export function selectFeaturedMatch<T extends FeaturedCandidate>(matches: T[], now = Date.now()): T | null {
  const predictedMatches = matches.filter((match) => getPrimaryPrediction(match) !== null);
  return getFeaturedHorizonMatches(predictedMatches, now).sort(compareFeaturedMatches)[0] ?? null;
}
