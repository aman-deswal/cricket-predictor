'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { getMatch, getMatchEnrichment, getMatchOdds, getPrediction, Match, MatchEnrichment, MatchOdds, Prediction } from '@/lib/supabase';
import { getTeamMeta, getFlagUrl, getFlag2xUrl } from '@/lib/teams';
import { PredictionChart } from '@/components/PredictionChart';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!matchId) {
        setLoading(false);
        return;
      }

      try {
        const [matchData, predictionData, enrichmentData, oddsData] = await Promise.all([
          getMatch(matchId),
          getPrediction(matchId),
          getMatchEnrichment(matchId),
          getMatchOdds(matchId),
        ]);
        setMatch(matchData);
        setPrediction(predictionData);
        setEnrichment(enrichmentData);
        setOdds(oddsData);
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
    <div className="max-w-3xl mx-auto">
      {/* Hero section with team flags */}
      <motion.div
        className="relative rounded-3xl bg-gradient-to-br from-gray-900 via-cricket-950 to-gray-900 border border-cricket-800/30 p-8 mb-8 overflow-hidden"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Background glow */}
        <div className="absolute top-0 left-1/4 w-1/2 h-32 bg-cricket-500/10 blur-3xl rounded-full" />

        <div className="relative flex items-center justify-between gap-4">
          {/* Team 1 */}
          <motion.div
            className="flex-1 text-center"
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              className="w-20 h-20 mx-auto mb-3 rounded-full overflow-hidden ring-3 ring-offset-2 ring-offset-cricket-950 shadow-xl"
              style={{ ['--tw-ring-color' as string]: team1Meta.primaryColor }}
              whileHover={{ scale: 1.1, rotate: 5 }}
            >
              <img
                src={getFlagUrl(team1Meta.countryCode, 80)}
                srcSet={`${getFlag2xUrl(team1Meta.countryCode, 80)} 2x`}
                alt={displayTeam1}
                className="w-full h-full object-cover"
              />
            </motion.div>
            <h2 className="text-lg font-bold text-white">{team1Meta.shortName}</h2>
            <p className="text-xs text-gray-400">{displayTeam1}</p>
          </motion.div>

          {/* Center VS */}
          <motion.div
            className="flex flex-col items-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.3 }}
          >
            <div className="w-12 h-12 rounded-full bg-cricket-900/80 border border-cricket-700/50 flex items-center justify-center">
              <span className="text-xs font-black text-cricket-400 uppercase">VS</span>
            </div>
          </motion.div>

          {/* Team 2 */}
          <motion.div
            className="flex-1 text-center"
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              className="w-20 h-20 mx-auto mb-3 rounded-full overflow-hidden ring-3 ring-offset-2 ring-offset-cricket-950 shadow-xl"
              style={{ ['--tw-ring-color' as string]: team2Meta.primaryColor }}
              whileHover={{ scale: 1.1, rotate: -5 }}
            >
              <img
                src={getFlagUrl(team2Meta.countryCode, 80)}
                srcSet={`${getFlag2xUrl(team2Meta.countryCode, 80)} 2x`}
                alt={displayTeam2}
                className="w-full h-full object-cover"
              />
            </motion.div>
            <h2 className="text-lg font-bold text-white">{team2Meta.shortName}</h2>
            <p className="text-xs text-gray-400">{displayTeam2}</p>
          </motion.div>
        </div>

        {/* Match info */}
        <motion.div
          className="relative mt-6 pt-4 border-t border-gray-800/50 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center text-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <div>
            <p className="text-gray-500 uppercase tracking-wider mb-1">Format</p>
            <p className="text-white font-semibold">{match.match_type.toUpperCase()}</p>
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wider mb-1">Venue</p>
            <p className="text-white font-semibold truncate">{enrichment?.venue_name || match.venue || 'TBC'}</p>
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wider mb-1">Date</p>
            <p className="text-white font-semibold">{new Date(match.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
          <div>
            <p className="text-gray-500 uppercase tracking-wider mb-1">Series</p>
            <p className="text-white font-semibold truncate">{getSeriesName(match)}</p>
          </div>
        </motion.div>
      </motion.div>

      {/* Form & Odds Section */}
      <motion.div
        className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-6 border border-cricket-800/30 mb-8"
        {...fadeUp}
        transition={{ delay: 0.25 }}
      >
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Recent Form & Odds</h2>
        <div className="grid grid-cols-2 gap-6">
          {[
            { team: displayTeam1, meta: team1Meta, form: match.team1_recent_form, prob: prediction?.team1_win_probability },
            { team: displayTeam2, meta: team2Meta, form: match.team2_recent_form, prob: prediction?.team2_win_probability },
          ].map(({ team, meta, form, prob }) => {
            const recent = (form ?? []).slice(-10);
            const wins = recent.filter(r => r === 'W').length;
            const winRate = recent.length > 0 ? Math.round((wins / recent.length) * 100) : null;
            const odds = prob && prob > 0 && prob < 1 ? (1 / prob).toFixed(2) : null;

            return (
              <div key={team} className="text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full overflow-hidden">
                    <img src={getFlagUrl(meta.countryCode, 24)} alt="" className="w-full h-full object-cover" />
                  </div>
                  <span className="font-bold text-white text-sm">{meta.shortName}</span>
                </div>

                {/* Form dots */}
                {recent.length > 0 && (
                  <div className="flex justify-center gap-1 mb-2">
                    {recent.map((result, i) => (
                      <span
                        key={`${result}-${i}`}
                        className={`h-5 w-5 flex items-center justify-center rounded text-[9px] font-bold text-white ${
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
                  <p className="text-xs text-gray-400 mb-2">
                    Win rate: <span className={`font-semibold ${winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{winRate}%</span>
                    <span className="text-gray-600"> ({wins}W {recent.length - wins}L last {recent.length})</span>
                  </p>
                )}

                {/* Decimal odds */}
                {odds && (
                  <div className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-gray-800/50 border border-gray-700/50">
                    <span className="text-[10px] text-gray-500 uppercase">Odds</span>
                    <span className="text-sm font-mono font-bold text-cricket-300">{odds}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Sportsbook Odds Section */}
      {odds.length > 0 && (
        <motion.div
          className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-6 border border-cricket-800/30 mb-8"
          {...fadeUp}
          transition={{ delay: 0.28 }}
        >
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">📊 Sportsbook Odds</h2>
          <div className="space-y-3">
            {odds.slice(0, 5).map((o) => {
              const aiProb1 = prediction?.team1_win_probability;
              const impliedProb1 = o.team1_odds > 0 ? (1 / o.team1_odds) : null;
              const diff1 = aiProb1 && impliedProb1 ? ((aiProb1 - impliedProb1) * 100).toFixed(0) : null;
              const isValue1 = diff1 && Number(diff1) > 10;
              const isValue2 = diff1 && Number(diff1) < -10;

              return (
                <div key={`${o.bookmaker}-${o.fetched_at}`} className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-800/40 border border-gray-700/30">
                  <span className="text-xs text-gray-400 font-medium w-24 truncate">{o.bookmaker}</span>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <span className={`text-sm font-mono font-bold ${isValue1 ? 'text-yellow-400' : 'text-white'}`}>
                        {o.team1_odds.toFixed(2)}
                      </span>
                      {isValue1 && <span className="ml-1 text-[9px] text-yellow-400 font-bold">VALUE</span>}
                    </div>
                    <span className="text-gray-600 text-xs">vs</span>
                    <div className="text-center">
                      <span className={`text-sm font-mono font-bold ${isValue2 ? 'text-yellow-400' : 'text-white'}`}>
                        {o.team2_odds.toFixed(2)}
                      </span>
                      {isValue2 && <span className="ml-1 text-[9px] text-yellow-400 font-bold">VALUE</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-600 mt-3 text-center">
            &quot;VALUE&quot; = AI disagrees with market by &gt;10%. Not financial advice.
          </p>
        </motion.div>
      )}

      {/* Prediction Section */}
      {!prediction ? (
        <motion.div
          {...fadeUp}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-8 border border-cricket-800/30 text-center"
        >
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-4xl mb-4"
          >
            🏏
          </motion.div>
          <p className="text-xl font-semibold text-cricket-300">Prediction Pending</p>
          <p className="text-gray-400 mt-2 text-sm">The prediction pipeline hasn&apos;t generated probabilities yet.</p>
        </motion.div>
      ) : (
        <motion.div
          className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-8 border border-cricket-800/30 mb-8"
          {...fadeUp}
          transition={{ delay: 0.3 }}
        >
          {/* Chart */}
          <div className="flex justify-center mb-10">
            <PredictionChart
              team1={prediction.team1}
              team2={prediction.team2}
              team1Prob={prediction.team1_win_probability}
              team2Prob={prediction.team2_win_probability}
            />
          </div>

          {/* Winner call */}
          <motion.div
            className="text-center mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mb-2">Predicted Winner</p>
            <motion.p
              className="text-3xl font-black text-white"
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 150, delay: 1 }}
            >
              {prediction.predicted_winner}
            </motion.p>
            <motion.span
              className={`inline-block mt-3 px-4 py-1.5 rounded-full text-xs font-semibold ${
                prediction.confidence === 'high'
                  ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30'
                  : prediction.confidence === 'medium'
                  ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30'
                  : 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30'
              }`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 }}
            >
              {prediction.confidence} confidence
            </motion.span>
          </motion.div>

          {/* Reasoning */}
          <motion.div
            className="border-t border-gray-800/50 pt-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-[0.2em] mb-3">AI Reasoning</h3>
            <p className="text-gray-300 leading-relaxed text-sm">{prediction.reasoning}</p>
          </motion.div>

          {/* Model info */}
          <motion.div
            className="mt-6 pt-4 border-t border-gray-800/30 flex items-center justify-between text-[10px] text-gray-600"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
          >
            <span>Model: {prediction.model}</span>
            <span>Ensemble: {prediction.ensemble_size}x calls</span>
          </motion.div>
        </motion.div>
      )}

      {/* Key Players to Watch */}
      {enrichment && enrichment.key_players && enrichment.key_players.length > 0 && (
        <motion.div
          className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-6 border border-cricket-800/30 mb-6"
          {...fadeUp}
          transition={{ delay: 0.45 }}
        >
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">🔥 Key Players to Watch</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {enrichment.key_players.map((player, i) => {
              const playerMeta = player.team === displayTeam1 ? team1Meta : team2Meta;
              const roleIcon = player.role === 'bat' ? '🏏' : player.role === 'bowl' ? '⚾' : '⭐';
              return (
                <motion.div
                  key={`${player.name}-${i}`}
                  className="flex items-start gap-3 p-3 rounded-xl bg-gray-800/30 border border-gray-800/50"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.05 }}
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-lg" style={{ backgroundColor: `${playerMeta.primaryColor}20` }}>
                    {roleIcon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{player.name}</p>
                    <p className="text-[10px] text-gray-500 uppercase">{player.team} · {player.role === 'bat' ? 'Batter' : player.role === 'bowl' ? 'Bowler' : 'All-rounder'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{player.form_note}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Squad Section */}
      <motion.div
        className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-6 border border-cricket-800/30 mb-6"
        {...fadeUp}
        transition={{ delay: 0.5 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Squad / Players</h2>
          {hasSquadOrXi && <span className="text-[10px] text-gray-500 uppercase">{squadLabel}</span>}
        </div>
        {hasSquadOrXi ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { team: displayTeam1, players: enrichment!.possible_xi.team1 ?? [], meta: team1Meta },
              { team: displayTeam2, players: enrichment!.possible_xi.team2 ?? [], meta: team2Meta },
            ].map(({ team, players, meta }) => (
              <motion.div
                key={team}
                className="rounded-xl border border-gray-800/50 p-4 bg-gray-900/30"
                whileHover={{ borderColor: meta.primaryColor }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-full overflow-hidden">
                    <img src={getFlagUrl(meta.countryCode, 20)} alt="" className="w-full h-full object-cover" />
                  </div>
                  <p className="font-semibold text-white text-sm">{team}</p>
                </div>
                {players.length > 0 ? (
                  <ul className="space-y-1">
                    {players.map((player, i) => (
                      <motion.li
                        key={player}
                        className="text-xs text-gray-400 pl-2 border-l border-gray-800"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6 + i * 0.03 }}
                      >
                        {player}
                      </motion.li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-600">No confirmed squad yet</p>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500">Squad information will appear once confirmed by sources.</p>
        )}
      </motion.div>

      {/* Research Notes */}
      {enrichment && (
        <motion.div
          className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-6 border border-cricket-800/30 mb-6"
          {...fadeUp}
          transition={{ delay: 0.6 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Research Notes</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              enrichment.confidence === 'high' ? 'bg-emerald-500/20 text-emerald-400' :
              enrichment.confidence === 'medium' ? 'bg-amber-500/20 text-amber-400' :
              'bg-red-500/20 text-red-400'
            }`}>
              {enrichment.confidence}
            </span>
          </div>

          {enrichment.venue_name && (
            <div className="mb-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Venue</p>
              <p className="text-sm text-gray-200">{enrichment.venue_name}</p>
            </div>
          )}

          {enrichment.expert_preview && (
            <div className="mb-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Expert Preview</p>
              <p className="text-sm text-gray-300 leading-relaxed">{enrichment.expert_preview}</p>
            </div>
          )}

          {enrichment.player_updates.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Player Updates</p>
              <div className="space-y-2">
                {enrichment.player_updates.map((update, index) => (
                  <motion.div
                    key={`${update.player ?? 'update'}-${index}`}
                    className="rounded-lg bg-gray-800/30 border border-gray-800/50 p-3 text-xs"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 + index * 0.05 }}
                  >
                    <span className="font-medium text-white">{update.player ?? update.team ?? 'Update'}:</span>{' '}
                    <span className="text-gray-400">{update.status}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {enrichment.source_links.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Sources</p>
              <div className="space-y-1.5">
                {enrichment.source_links.slice(0, 5).map((source, index) => (
                  <a
                    key={`${source.url ?? source.title}-${index}`}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs text-cricket-400 hover:text-cricket-300 transition-colors"
                  >
                    [{index + 1}] {source.source}: {source.title}
                  </a>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}