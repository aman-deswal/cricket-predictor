'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { getMatch, getMatchEnrichment, getMatchOdds, getMatchSquads, getPlayerStats, getPrediction, Match, MatchEnrichment, MatchOdds, MatchSquad, PlayerStats, Prediction } from '@/lib/supabase';
import { getTeamMeta, getFlagUrl, getFlag2xUrl } from '@/lib/teams';
import { PredictionChart } from '@/components/PredictionChart';
import { TossImpact } from '@/components/TossImpact';

function toAmericanOdds(probability: number): string {
  if (probability <= 0 || probability >= 1) return '-';
  if (probability >= 0.5) {
    // Favorite: negative odds
    return Math.round(-100 * probability / (1 - probability)).toString();
  } else {
    // Underdog: positive odds
    return '+' + Math.round(100 * (1 - probability) / probability).toString();
  }
}

function decimalToAmerican(decimal: number): string {
  if (decimal <= 0) return '-';
  if (decimal < 2) {
    return Math.round(-100 / (decimal - 1)).toString();
  } else {
    return '+' + Math.round((decimal - 1) * 100).toString();
  }
}

function getSeriesName(match: Match): string {
  const prefix = `${match.team1} vs ${match.team2}, `;
  if (match.name?.startsWith(prefix)) {
    return match.name.slice(prefix.length);
  }
  if (match.name?.includes(',')) {
    return match.name.split(',').slice(1).join(',').trim();
  }
  return match.name || match.venue || 'TBC';
}

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export function PredictDetails() {
  const searchParams = useSearchParams();
  const matchId = searchParams.get('id');
  const [match, setMatch] = useState<Match | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [enrichment, setEnrichment] = useState<MatchEnrichment | null>(null);
  const [odds, setOdds] = useState<MatchOdds[]>([]);
  const [squads, setSquads] = useState<MatchSquad[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!matchId) {
        setLoading(false);
        return;
      }

      try {
        const [matchData, predictionData, enrichmentData, oddsData, squadData] = await Promise.all([
          getMatch(matchId),
          getPrediction(matchId),
          getMatchEnrichment(matchId),
          getMatchOdds(matchId),
          getMatchSquads(matchId),
        ]);
        setMatch(matchData);
        setPrediction(predictionData);
        setEnrichment(enrichmentData);
        setOdds(oddsData);
        setSquads(squadData);

        // Fetch player stats for all squad players
        if (squadData.length > 0 && matchData) {
          const allNames = squadData.flatMap(s => s.players.map(p => p.name));
          const format = matchData.match_type?.toLowerCase().includes('t20') ? 't20i' :
                         matchData.match_type?.toLowerCase().includes('odi') ? 'odi' : 't20i';
          const stats = await getPlayerStats(allNames, format);
          setPlayerStats(stats);
        }
      } catch (err) {
        console.error('Failed to load match details:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [matchId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div
          className="rounded-full h-10 w-10 border-2 border-cricket-400 border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    );
  }

  if (!matchId || !match) {
    return (
      <motion.div {...fadeUp} className="text-center text-gray-500 py-16">
        <p className="text-xl">Match not found</p>
      </motion.div>
    );
  }

  const displayTeam1 = prediction?.team1 ?? match.team1;
  const displayTeam2 = prediction?.team2 ?? match.team2;
  const team1Meta = getTeamMeta(displayTeam1);
  const team2Meta = getTeamMeta(displayTeam2);
  const hasSquadOrXi = enrichment?.possible_xi && ((enrichment.possible_xi.team1?.length ?? 0) > 0 || (enrichment.possible_xi.team2?.length ?? 0) > 0);
  const isModelEstimated = enrichment !== null && enrichment.source_links.length === 0;
  const squadLabel = isModelEstimated ? 'Recent-player candidates' : 'Source-backed squad';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero: Teams + Prediction (replaces VS with chart) */}
      <motion.div
        className="relative rounded-3xl bg-gradient-to-br from-gray-900 via-cricket-950 to-gray-900 border border-cricket-800/30 p-6 sm:p-8 mb-6 overflow-hidden"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Background glow */}
        <div className="absolute top-0 left-1/4 w-1/2 h-32 bg-cricket-500/10 blur-3xl rounded-full" />

        <div className="relative flex items-center justify-between gap-2">
          {/* Team 1 */}
          <motion.div
            className="flex-1 text-center"
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-2 rounded-full overflow-hidden ring-3 ring-offset-2 ring-offset-cricket-950 shadow-xl"
              style={{ ['--tw-ring-color' as string]: team1Meta.primaryColor }}
              whileHover={{ scale: 1.1 }}
            >
              <img
                src={getFlagUrl(team1Meta.countryCode, 80)}
                srcSet={`${getFlag2xUrl(team1Meta.countryCode, 80)} 2x`}
                alt={displayTeam1}
                className="w-full h-full object-cover"
              />
            </motion.div>
            <h2 className="text-base sm:text-lg font-bold text-white">{team1Meta.shortName}</h2>
            {prediction && (
              <p className="text-lg sm:text-2xl font-black text-cricket-300 mt-1">
                {(prediction.team1_win_probability * 100).toFixed(0)}%
              </p>
            )}
            {prediction && (
              <span className="text-xs font-mono text-gray-400">
                {toAmericanOdds(prediction.team1_win_probability)}
              </span>
            )}
          </motion.div>

          {/* Center: Chart or VS */}
          <motion.div
            className="flex flex-col items-center px-2"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.3 }}
          >
            {prediction ? (
              <div className="w-20 h-20 sm:w-28 sm:h-28">
                <PredictionChart
                  team1={prediction.team1}
                  team2={prediction.team2}
                  team1Prob={prediction.team1_win_probability}
                  team2Prob={prediction.team2_win_probability}
                  compact
                />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-cricket-900/80 border border-cricket-700/50 flex items-center justify-center">
                <span className="text-xs font-black text-cricket-400 uppercase">VS</span>
              </div>
            )}
            <span className="text-[10px] text-cricket-300 mt-1 uppercase tracking-wider font-semibold">Prediction</span>
          </motion.div>

          {/* Team 2 */}
          <motion.div
            className="flex-1 text-center"
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-2 rounded-full overflow-hidden ring-3 ring-offset-2 ring-offset-cricket-950 shadow-xl"
              style={{ ['--tw-ring-color' as string]: team2Meta.primaryColor }}
              whileHover={{ scale: 1.1 }}
            >
              <img
                src={getFlagUrl(team2Meta.countryCode, 80)}
                srcSet={`${getFlag2xUrl(team2Meta.countryCode, 80)} 2x`}
                alt={displayTeam2}
                className="w-full h-full object-cover"
              />
            </motion.div>
            <h2 className="text-base sm:text-lg font-bold text-white">{team2Meta.shortName}</h2>
            {prediction && (
              <p className="text-lg sm:text-2xl font-black text-cricket-300 mt-1">
                {(prediction.team2_win_probability * 100).toFixed(0)}%
              </p>
            )}
            {prediction && (
              <span className="text-xs font-mono text-gray-400">
                {toAmericanOdds(prediction.team2_win_probability)}
              </span>
            )}
          </motion.div>
        </div>

        {/* Match info bar */}
        <motion.div
          className="relative mt-4 pt-3 border-t border-gray-800/50 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] text-gray-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <span className="uppercase font-semibold text-cricket-400">{match.match_type}</span>
          <span>📍 {enrichment?.venue_name || match.venue || 'TBC'}</span>
          <span>{new Date(match.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <span className="truncate max-w-[150px]">{getSeriesName(match)}</span>
        </motion.div>
      </motion.div>

      {/* Toss Scenarios — full width, important context */}
      {prediction && (
        <motion.div className="mb-4" {...fadeUp} transition={{ delay: 0.22 }}>
          <TossImpact
            team1={displayTeam1}
            team2={displayTeam2}
            team1Prob={prediction.team1_win_probability}
            team2Prob={prediction.team2_win_probability}
          />
        </motion.div>
      )}

      {/* Reasoning — full width center, most important after hero */}
      {prediction ? (
        <motion.div
          className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border border-cricket-800/30 mb-4"
          {...fadeUp}
          transition={{ delay: 0.25 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Reasoning</h2>
            <motion.span
              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                prediction.confidence === 'high'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : prediction.confidence === 'medium'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-red-500/20 text-red-300'
              }`}
            >
              {prediction.confidence} confidence
            </motion.span>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed mb-3">{prediction.reasoning}</p>

          {/* Form-based context (ground truth from stats_cache) */}
          {((match.team1_recent_form?.length ?? 0) > 0 || (match.team2_recent_form?.length ?? 0) > 0) && (
            <div className="mb-3 p-2 rounded-lg bg-gray-800/30 border border-gray-700/40">
              <p className="text-[9px] text-gray-500 uppercase font-semibold mb-1">📊 Actual Form (last 10)</p>
              <div className="flex flex-wrap gap-4 text-[10px]">
                {[
                  { team: displayTeam1, form: match.team1_recent_form },
                  { team: displayTeam2, form: match.team2_recent_form },
                ].map(({ team, form }) => {
                  const recent = (form ?? []).slice(-10);
                  const wins = recent.filter(r => r === 'W').length;
                  const pct = recent.length > 0 ? Math.round((wins / recent.length) * 100) : null;
                  return pct !== null ? (
                    <span key={team} className="text-gray-400">
                      <span className="font-medium text-white">{getTeamMeta(team).shortName}:</span> {pct}% ({wins}W/{recent.length - wins}L)
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-[9px] text-gray-600 pt-2 border-t border-gray-800/30">
            <span>Model: {prediction.model}</span>
            <span>Ensemble: {prediction.ensemble_size}x</span>
          </div>
        </motion.div>
      ) : (
        <motion.div
          {...fadeUp}
          transition={{ delay: 0.25 }}
          className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border border-cricket-800/30 flex flex-col items-center justify-center text-center mb-4"
        >
          <span className="text-3xl mb-2">🏏</span>
          <p className="text-sm font-semibold text-cricket-300">Prediction Pending</p>
          <p className="text-gray-500 text-xs mt-1">Pipeline hasn&apos;t run yet</p>
        </motion.div>
      )}

      {/* Form + Sportsbook Odds — side by side on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Form & Our Odds */}
        <motion.div
          className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border border-cricket-800/30"
          {...fadeUp}
          transition={{ delay: 0.28 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Recent Form</h2>
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-cricket-500/20 text-cricket-300 font-semibold border border-cricket-500/30">Our Odds</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { team: displayTeam1, meta: team1Meta, form: match.team1_recent_form, prob: prediction?.team1_win_probability },
              { team: displayTeam2, meta: team2Meta, form: match.team2_recent_form, prob: prediction?.team2_win_probability },
            ].map(({ team, meta, form, prob }) => {
              const recent = (form ?? []).slice(-10);
              const wins = recent.filter(r => r === 'W').length;
              const winRate = recent.length > 0 ? Math.round((wins / recent.length) * 100) : null;
              const americanOdds = prob ? toAmericanOdds(prob) : null;

              return (
                <div key={team} className="text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    <div className="w-5 h-5 rounded-full overflow-hidden">
                      <img src={getFlagUrl(meta.countryCode, 20)} alt="" className="w-full h-full object-cover" />
                    </div>
                    <span className="font-bold text-white text-xs">{meta.shortName}</span>
                  </div>

                  {/* Form dots */}
                  {recent.length > 0 && (
                    <div className="flex justify-center gap-0.5 mb-1.5">
                      {recent.map((result, i) => (
                        <span
                          key={`${result}-${i}`}
                          className={`h-4 w-4 flex items-center justify-center rounded text-[8px] font-bold text-white ${
                            result === 'W' ? 'bg-emerald-500' : 'bg-red-500/80'
                          }`}
                        >
                          {result}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Win rate */}
                  {winRate !== null && (
                    <p className="text-[10px] text-gray-400 mb-1.5">
                      <span className={`font-semibold ${winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{winRate}%</span>
                      <span className="text-gray-600"> ({wins}W {recent.length - wins}L)</span>
                    </p>
                  )}

                  {/* American odds */}
                  {americanOdds && (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-800/50 border border-gray-700/50">
                      <span className="text-xs font-mono font-bold text-cricket-300">{americanOdds}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Key Players + Sportsbook Odds — side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Key Players */}
        {enrichment && enrichment.key_players && enrichment.key_players.length > 0 ? (
          <motion.div
            className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border border-cricket-800/30"
            {...fadeUp}
            transition={{ delay: 0.32 }}
          >
            <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3">🔥 Key Players</h2>
            <div className="space-y-2">
              {enrichment.key_players.map((player, i) => {
                const roleIcon = player.role === 'bat' ? '🏏' : player.role === 'bowl' ? '🎳' : '⭐';
                return (
                  <div
                    key={`${player.name}-${i}`}
                    className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/30 border border-gray-800/50"
                  >
                    <span className="text-sm">{roleIcon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">{player.name}</p>
                      <p className="text-[9px] text-gray-500">{player.team} · {player.form_note}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border border-cricket-800/30 flex items-center justify-center"
            {...fadeUp}
            transition={{ delay: 0.32 }}
          >
            <p className="text-xs text-gray-500">Key player data loading...</p>
          </motion.div>
        )}

        {/* Sportsbook Odds */}
        <motion.div
          className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border border-cricket-800/30"
          {...fadeUp}
          transition={{ delay: 0.35 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">📊 Sportsbook Odds</h2>
            {odds.length > 0 && <span className="text-[9px] text-gray-500">{odds.length} bookmakers</span>}
          </div>
          {odds.length > 0 ? (
            <div className="space-y-2">
              {odds.slice(0, 4).map((o) => {
                const aiProb1 = prediction?.team1_win_probability;
                const impliedProb1 = o.team1_odds > 0 ? (1 / o.team1_odds) : null;
                const diff1 = aiProb1 && impliedProb1 ? ((aiProb1 - impliedProb1) * 100).toFixed(0) : null;
                const isValue1 = diff1 && Number(diff1) > 10;
                const isValue2 = diff1 && Number(diff1) < -10;

                return (
                  <div key={`${o.bookmaker}-${o.fetched_at}`} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800/40 border border-gray-700/30">
                    <span className="text-[10px] text-gray-400 font-medium w-20 truncate">{o.bookmaker}</span>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-mono font-bold ${isValue1 ? 'text-yellow-400' : 'text-white'}`}>
                        {decimalToAmerican(o.team1_odds)}
                        {isValue1 && <span className="ml-1 text-[8px]">🔥</span>}
                      </span>
                      <span className="text-gray-700 text-[10px]">|</span>
                      <span className={`text-xs font-mono font-bold ${isValue2 ? 'text-yellow-400' : 'text-white'}`}>
                        {decimalToAmerican(o.team2_odds)}
                        {isValue2 && <span className="ml-1 text-[8px]">🔥</span>}
                      </span>
                    </div>
                  </div>
                );
              })}
              <p className="text-[9px] text-gray-600 text-center mt-1">
                🔥 = Disagrees with market &gt;10%
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-500 text-center py-4">No sportsbook odds available yet</p>
          )}
        </motion.div>
      </div>

      {/* Squad + Research Notes — side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Squad */}
        <motion.div
          className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border border-cricket-800/30"
          {...fadeUp}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Squad</h2>
            {squads.length > 0 && (
              <span className="text-[9px] text-gray-500 uppercase">
                {squads.some(s => s.is_confirmed) ? 'Confirmed XI' : 'Probable'}
              </span>
            )}
          </div>
          {squads.length > 0 ? (
            <div className="space-y-3">
              {squads.map((squad) => {
                const meta = squad.team.toLowerCase().includes(displayTeam1.toLowerCase()) ? team1Meta : team2Meta;
                const teamDisplay = squad.team.toLowerCase().includes(displayTeam1.toLowerCase()) ? displayTeam1 : displayTeam2;
                return (
                  <div key={squad.team}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-4 h-4 rounded-full overflow-hidden">
                        <img src={getFlagUrl(meta.countryCode, 16)} alt="" className="w-full h-full object-cover" />
                      </div>
                      <span className="text-[10px] font-semibold text-white">{teamDisplay}</span>
                      <span className="text-[9px] text-gray-600">({squad.players.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {squad.players.slice(0, 11).map((player) => {
                        const roleIcon = player.is_keeper ? '🧤' :
                          player.role?.includes('All') ? '⚡' :
                          player.role?.includes('Bowl') ? '🎳' : '🏏';
                        return (
                          <span key={player.id || player.name} className="text-[9px] text-gray-400 px-1.5 py-0.5 rounded bg-gray-800/50 border border-gray-800/30">
                            {roleIcon} {player.name.split(' ').pop()}
                            {player.is_captain && <span className="text-yellow-400">(C)</span>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : hasSquadOrXi ? (
            <div className="space-y-3">
              {[
                { team: displayTeam1, players: enrichment!.possible_xi.team1 ?? [], meta: team1Meta },
                { team: displayTeam2, players: enrichment!.possible_xi.team2 ?? [], meta: team2Meta },
              ].map(({ team, players, meta }) => (
                <div key={team}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className="w-4 h-4 rounded-full overflow-hidden">
                      <img src={getFlagUrl(meta.countryCode, 16)} alt="" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-[10px] font-semibold text-white">{team}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {players.map((p) => (
                      <span key={p} className="text-[9px] text-gray-400 px-1.5 py-0.5 rounded bg-gray-800/50 border border-gray-800/30">
                        {p.split(' ').pop()}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-gray-500">Squad not available yet</p>
          )}
        </motion.div>

        {/* Research Notes */}
        {enrichment ? (
          <motion.div
            className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border border-cricket-800/30"
            {...fadeUp}
            transition={{ delay: 0.45 }}
          >
            <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Research Notes</h2>

            {enrichment.expert_preview && (
              <p className="text-xs text-gray-300 leading-relaxed mb-3">{enrichment.expert_preview}</p>
            )}

            {enrichment.player_updates.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {enrichment.player_updates.slice(0, 4).map((update, index) => (
                  <div
                    key={`${update.player ?? 'update'}-${index}`}
                    className="rounded-md bg-gray-800/30 border border-gray-800/50 px-2 py-1.5 text-[10px]"
                  >
                    <span className="font-medium text-white">{update.player ?? update.team ?? 'Update'}:</span>{' '}
                    <span className="text-gray-400">{update.status}</span>
                  </div>
                ))}
              </div>
            )}

            {enrichment.source_links.length > 0 && (
              <div className="space-y-1">
                {enrichment.source_links.slice(0, 3).map((source, index) => (
                  <a
                    key={`${source.url ?? source.title}-${index}`}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-[10px] text-cricket-400 hover:text-cricket-300 truncate"
                  >
                    [{index + 1}] {source.source}: {source.title}
                  </a>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border border-cricket-800/30 flex items-center justify-center"
            {...fadeUp}
            transition={{ delay: 0.45 }}
          >
            <p className="text-[10px] text-gray-500">Research data loading...</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}