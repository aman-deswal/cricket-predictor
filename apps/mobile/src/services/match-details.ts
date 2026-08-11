import type {
  EdgeScore,
  EdgeScoreFactors,
  Match,
  MatchDetails,
  MatchEnrichment,
  MatchOdds,
  MatchSquad,
  MatchStatus,
  PlayerUpdate,
  Prediction,
  PredictionConfidence,
  SourceLink,
  SquadPlayer,
} from '@sixsense/domain';

import { getSupabaseClient } from '@/lib/supabase';

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
  competition_name?: string | null;
  team1_logo_url?: string | null;
  team2_logo_url?: string | null;
}

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

interface EdgeScoreRow {
  team1_score: number;
  team2_score: number;
  net_edge: number;
  edge_team: string;
  narrative: string;
  factors: unknown;
}

interface MatchOddsRow {
  match_id: string;
  bookmaker: string;
  team1_odds: number;
  team2_odds: number;
  draw_odds: number | null;
  market: string;
  fetched_at: string;
}

interface MatchEnrichmentRow {
  match_id: string;
  venue_name: string | null;
  venue_confidence: string;
  possible_xi: unknown;
  player_updates: unknown;
  expert_preview: string | null;
  toss_insight: string | null;
  source_links: unknown;
  confidence: string;
  generated_at: string;
}

interface MatchSquadRow {
  match_id: string;
  team: string;
  players: unknown;
  is_confirmed: boolean;
  source: string;
  fetched_at: string;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return JSON.parse(value) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMatchStatus(value: string): value is MatchStatus {
  return value === 'upcoming' || value === 'live' || value === 'completed';
}

function isConfidence(value: string): value is PredictionConfidence {
  return value === 'low' || value === 'medium' || value === 'high';
}

function mapMatch(row: MatchRow): Match {
  if (!isMatchStatus(row.status)) {
    throw new Error(`Unexpected match status: ${row.status}`);
  }

  return {
    ...row,
    status: row.status,
    winner: row.winner ?? undefined,
    competition_name: row.competition_name ?? undefined,
    team1_logo_url: row.team1_logo_url ?? undefined,
    team2_logo_url: row.team2_logo_url ?? undefined,
  };
}

function mapPrediction(row: PredictionRow): Prediction {
  if (!isConfidence(row.confidence)) {
    throw new Error(`Unexpected prediction confidence: ${row.confidence}`);
  }

  return {
    ...row,
    confidence: row.confidence,
    toss_insight: row.toss_insight ?? undefined,
    scored_at: row.scored_at ?? undefined,
  };
}

function mapFactors(value: unknown): EdgeScore['factors'] {
  const parsed = parseJson(value);
  if (!isRecord(parsed)) throw new Error('Edge score factors are malformed.');

  const mapTeamFactors = (teamValue: unknown): EdgeScoreFactors => {
    if (!isRecord(teamValue)) throw new Error('Edge score team factors are malformed.');
    const { form, momentum, pressure, market } = teamValue;
    if (![form, momentum, pressure, market].every((factor) => typeof factor === 'number')) {
      throw new Error('Edge score factor values are malformed.');
    }
    return {
      form: form as number,
      momentum: momentum as number,
      pressure: pressure as number,
      market: market as number,
    };
  };

  return {
    team1: mapTeamFactors(parsed.team1),
    team2: mapTeamFactors(parsed.team2),
  };
}

function mapEdgeScore(row: EdgeScoreRow): EdgeScore {
  return {
    team1_score: row.team1_score,
    team2_score: row.team2_score,
    net_edge: row.net_edge,
    edge_team: row.edge_team,
    narrative: row.narrative,
    factors: mapFactors(row.factors),
  };
}

function mapPlayerUpdates(value: unknown): PlayerUpdate[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item) => {
    if (!isRecord(item) || typeof item.status !== 'string') return [];
    const confidence = item.confidence;
    return [{
      player: typeof item.player === 'string' ? item.player : undefined,
      team: typeof item.team === 'string' ? item.team : undefined,
      status: item.status,
      confidence:
        confidence === 'confirmed' || confidence === 'reported' || confidence === 'speculative'
          ? confidence
          : undefined,
      source_index: typeof item.source_index === 'number' ? item.source_index : undefined,
    }];
  });
}

function mapSourceLinks(value: unknown): SourceLink[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item) => {
    if (!isRecord(item)) return [];
    return [{
      title: typeof item.title === 'string' ? item.title : undefined,
      url: typeof item.url === 'string' ? item.url : undefined,
      source: typeof item.source === 'string' ? item.source : undefined,
      published_at: typeof item.published_at === 'string' || item.published_at === null
        ? item.published_at
        : undefined,
    }];
  });
}

function mapPossibleXi(value: unknown): MatchEnrichment['possible_xi'] {
  const parsed = parseJson(value);
  if (!isRecord(parsed)) return {};

  const team1 = Array.isArray(parsed.team1)
    ? parsed.team1.filter((player): player is string => typeof player === 'string')
    : undefined;
  const team2 = Array.isArray(parsed.team2)
    ? parsed.team2.filter((player): player is string => typeof player === 'string')
    : undefined;

  return { team1, team2 };
}

function mapEnrichment(row: MatchEnrichmentRow): MatchEnrichment {
  if (!isConfidence(row.confidence)) {
    throw new Error(`Unexpected enrichment confidence: ${row.confidence}`);
  }
  if (
    row.venue_confidence !== 'confirmed'
    && row.venue_confidence !== 'reported'
    && row.venue_confidence !== 'unknown'
  ) {
    throw new Error(`Unexpected venue confidence: ${row.venue_confidence}`);
  }

  return {
    ...row,
    venue_confidence: row.venue_confidence,
    possible_xi: mapPossibleXi(row.possible_xi),
    player_updates: mapPlayerUpdates(row.player_updates),
    source_links: mapSourceLinks(row.source_links),
    confidence: row.confidence,
  };
}

function mapPlayers(value: unknown): SquadPlayer[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string') return [];
    return [{
      id: item.id,
      name: item.name,
      role: typeof item.role === 'string' ? item.role : 'Player',
      batting_style: typeof item.batting_style === 'string' ? item.batting_style : undefined,
      bowling_style: typeof item.bowling_style === 'string' ? item.bowling_style : undefined,
      is_captain: typeof item.is_captain === 'boolean' ? item.is_captain : undefined,
      is_keeper: typeof item.is_keeper === 'boolean' ? item.is_keeper : undefined,
      image_url: typeof item.image_url === 'string' ? item.image_url : undefined,
    }];
  });
}

function mapSquad(row: MatchSquadRow): MatchSquad {
  return {
    ...row,
    players: mapPlayers(row.players),
  };
}

export async function getMatchDetails(matchId: string): Promise<MatchDetails | null> {
  const supabase = getSupabaseClient();
  const [matchResult, predictionResult, edgeResult, oddsResult, enrichmentResult, squadsResult] =
    await Promise.all([
      supabase.from('matches').select('*').eq('match_id', matchId).maybeSingle<MatchRow>(),
      supabase
        .from('predictions')
        .select('*')
        .eq('match_id', matchId)
        .order('scored_at', { ascending: false })
        .limit(1)
        .maybeSingle<PredictionRow>(),
      supabase.from('match_edge_scores').select('*').eq('match_id', matchId).maybeSingle<EdgeScoreRow>(),
      supabase
        .from('match_odds')
        .select('match_id, bookmaker, team1_odds, team2_odds, draw_odds, market, fetched_at')
        .eq('match_id', matchId)
        .order('fetched_at', { ascending: false })
        .returns<MatchOddsRow[]>(),
      supabase.from('match_enrichment').select('*').eq('match_id', matchId).maybeSingle<MatchEnrichmentRow>(),
      supabase.from('match_squads').select('*').eq('match_id', matchId).returns<MatchSquadRow[]>(),
    ]);

  const firstError = [
    matchResult.error,
    predictionResult.error,
    edgeResult.error,
    oddsResult.error,
    enrichmentResult.error,
    squadsResult.error,
  ].find((error) => error !== null);

  if (firstError) {
    throw new Error(`Unable to load match details: ${firstError.message}`);
  }
  if (!matchResult.data) return null;

  return {
    match: mapMatch(matchResult.data),
    prediction: predictionResult.data ? mapPrediction(predictionResult.data) : null,
    edgeScore: edgeResult.data ? mapEdgeScore(edgeResult.data) : null,
    odds: (oddsResult.data ?? []).map((row): MatchOdds => ({ ...row })),
    enrichment: enrichmentResult.data ? mapEnrichment(enrichmentResult.data) : null,
    squads: (squadsResult.data ?? []).map(mapSquad),
  };
}
