'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { getMatch, getMatchEnrichment, getMatchOdds, getMatchSquads, getPlayerStats, getPrediction, getESPNMatchData, Match, MatchEnrichment, MatchOdds, MatchSquad, PlayerStats, Prediction, ESPNMatchData } from '@/lib/supabase';
import { getTeamMeta, getFlagUrl, getFlag2xUrl } from '@/lib/teams';
import { PredictionChart } from '@/components/PredictionChart';
import { BatIcon, BowlIcon, KeeperIcon, AllRounderIcon, CaptainIcon } from '@/components/CricketIcons';

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
  const [espnData, setEspnData] = useState<ESPNMatchData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!matchId) {
        setLoading(false);
        return;
      }

      try {
        const [matchData, predictionData, enrichmentData, oddsData, squadData, espn] = await Promise.all([
          getMatch(matchId),
          getPrediction(matchId),
          getMatchEnrichment(matchId),
          getMatchOdds(matchId),
          getMatchSquads(matchId),
          getESPNMatchData(matchId),
        ]);
        setMatch(matchData);
        setPrediction(predictionData);
        setEnrichment(enrichmentData);
        setOdds(oddsData);
        setSquads(squadData);
        setEspnData(espn);

        // Fetch player stats for all squad players
        if (squadData.length > 0 && matchData) {
          const allNames = squadData.flatMap(s => (s.players ?? []).map(p => p.name));
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
  const isModelEstimated = enrichment !== null && (enrichment.source_links?.length ?? 0) === 0;
  const squadLabel = isModelEstimated ? 'Recent-player candidates' : 'Source-backed squad';
  const h2hGames = (espnData?.head_to_head ?? []).filter(g => g.teams && g.teams.length > 0);

  // Build a player name → image_url lookup from squad data
  const playerImageMap = new Map<string, string>();
  squads.forEach(squad => {
    (squad.players ?? []).forEach(p => {
      if (p.image_url) {
        playerImageMap.set(p.name.toLowerCase(), p.image_url);
        const lastName = p.name.split(' ').pop()?.toLowerCase() ?? '';
        if (lastName) playerImageMap.set(lastName, p.image_url);
      }
    });
  });

  return (
    <div className="max-w-7xl mx-auto">
      {/* Hero: Teams + Prediction (replaces VS with chart) */}
      <motion.div
        className="relative rounded-3xl bg-gradient-to-br from-gray-900 via-cricket-950 to-gray-900 border border-cricket-800/30 p-6 sm:p-8 lg:p-10 mb-6 overflow-hidden"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Background glow */}
        <div className="absolute top-0 left-1/4 w-1/2 h-32 bg-cricket-500/10 blur-3xl rounded-full" />

        <div className="relative flex items-center justify-between gap-4 sm:gap-6 lg:gap-10">
          {/* Team 1 */}
          <motion.div
            className="flex-1 text-center"
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 mx-auto mb-2 rounded-full overflow-hidden ring-3 ring-offset-2 ring-offset-cricket-950 shadow-xl"
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
            <h2 className="text-base sm:text-lg lg:text-xl font-bold text-white">{team1Meta.shortName}</h2>
            {/* Form strip — last 5 */}
            {(match.team1_recent_form?.length ?? 0) > 0 && (
              <div className="flex justify-center gap-0.5 mt-1">
                {(match.team1_recent_form ?? []).slice(-5).map((r, i) => (
                  <span key={`t1f-${i}`} className={`h-4 w-4 flex items-center justify-center rounded text-[8px] font-bold text-white ${r === 'W' ? 'bg-emerald-500' : 'bg-red-500/80'}`}>{r}</span>
                ))}
              </div>
            )}
            {prediction && (
              <p className="text-lg sm:text-2xl lg:text-3xl font-black text-cricket-300 mt-1">
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
              <div className="w-20 h-20 sm:w-28 sm:h-28 lg:w-36 lg:h-36">
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
              className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 mx-auto mb-2 rounded-full overflow-hidden ring-3 ring-offset-2 ring-offset-cricket-950 shadow-xl"
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
            <h2 className="text-base sm:text-lg lg:text-xl font-bold text-white">{team2Meta.shortName}</h2>
            {/* Form strip — last 5 */}
            {(match.team2_recent_form?.length ?? 0) > 0 && (
              <div className="flex justify-center gap-0.5 mt-1">
                {(match.team2_recent_form ?? []).slice(-5).map((r, i) => (
                  <span key={`t2f-${i}`} className={`h-4 w-4 flex items-center justify-center rounded text-[8px] font-bold text-white ${r === 'W' ? 'bg-emerald-500' : 'bg-red-500/80'}`}>{r}</span>
                ))}
              </div>
            )}
            {prediction && (
              <p className="text-lg sm:text-2xl lg:text-3xl font-black text-cricket-300 mt-1">
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
          <span>{espnData?.venue_name || enrichment?.venue_name || match.venue || 'TBC'}{espnData?.venue_city ? `, ${espnData.venue_city}` : ''}</span>
          <span>{new Date(match.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <span className="truncate max-w-[150px]">{getSeriesName(match)}</span>
        </motion.div>
      </motion.div>

      {/* 1. Sportsbook Odds | Reasoning — side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Sportsbook Odds */}
        <motion.div
          className={`bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border transition-all ${
            odds.length > 0 ? 'border-cricket-800/30' : 'border-gray-800/20 opacity-50'
          }`}
          {...fadeUp}
          transition={{ delay: 0.22 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 14V6l4-4 4 4v8" /><path d="M10 14V8l4-4v10" /><line x1="2" y1="14" x2="14" y2="14" /></svg>
              Sportsbook Odds
            </h2>
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
                        {isValue1 && <span className="ml-1 text-[8px] text-yellow-400">↑</span>}
                      </span>
                      <span className="text-gray-700 text-[10px]">|</span>
                      <span className={`text-xs font-mono font-bold ${isValue2 ? 'text-yellow-400' : 'text-white'}`}>
                        {decimalToAmerican(o.team2_odds)}
                        {isValue2 && <span className="ml-1 text-[8px] text-yellow-400">↑</span>}
                      </span>
                    </div>
                  </div>
                );
              })}
              <p className="text-[9px] text-gray-600 text-center mt-1">
                ↑ Value — diverges from market &gt;10%
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-500 text-center py-4">No sportsbook odds available yet</p>
          )}
        </motion.div>

        {/* Reasoning */}
        {prediction ? (
          <motion.div
            className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border border-cricket-800/30"
            {...fadeUp}
            transition={{ delay: 0.25 }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 2" /></svg>
                Reasoning
              </h2>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                  prediction.confidence === 'high'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : prediction.confidence === 'medium'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-red-500/20 text-red-300'
                }`}
              >
                {prediction.confidence} confidence
              </span>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{prediction.reasoning}</p>
          </motion.div>
        ) : (
          <motion.div
            {...fadeUp}
            transition={{ delay: 0.25 }}
            className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border border-gray-800/20 opacity-50 flex flex-col items-center justify-center text-center"
          >
            <p className="text-sm font-semibold text-gray-500">Prediction Pending</p>
            <p className="text-gray-600 text-xs mt-1">Pipeline hasn&apos;t run yet</p>
          </motion.div>
        )}
      </div>

      {/* 2. Key Battles | Research Notes — side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Key Battles */}
        <motion.div
          className={`bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border transition-all ${
            enrichment?.key_players?.length ? 'border-cricket-800/30' : 'border-gray-800/20 opacity-50'
          }`}
          {...fadeUp}
          transition={{ delay: 0.28 }}
        >
          <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 12L12 4M4 4l8 8" /></svg>
            Key Battles
          </h2>
          {enrichment?.key_players?.length ? (
            <div className="space-y-2">
              {enrichment.key_players.map((battle, i) => {
                const isBattleFormat = battle.batter && battle.bowler;
                if (isBattleFormat) {
                  const batterImg = playerImageMap.get(battle.batter!.toLowerCase()) || playerImageMap.get(battle.batter!.split(' ').pop()?.toLowerCase() ?? '');
                  const bowlerImg = playerImageMap.get(battle.bowler!.toLowerCase()) || playerImageMap.get(battle.bowler!.split(' ').pop()?.toLowerCase() ?? '');
                  return (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/30 border border-gray-800/50">
                      {/* Batter */}
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {batterImg ? (
                          <img src={batterImg} alt={battle.batter!} className="w-6 h-6 rounded-full object-cover ring-1 ring-gray-700 flex-shrink-0" />
                        ) : (
                          <span className="w-6 h-6 rounded-full bg-cricket-500/15 flex items-center justify-center flex-shrink-0"><BatIcon className="w-3 h-3 text-cricket-400" /></span>
                        )}
                        <span className="text-[10px] font-semibold text-white truncate">{battle.batter}</span>
                      </div>
                      {/* VS */}
                      <span className="text-[8px] font-bold text-gray-500 flex-shrink-0">vs</span>
                      {/* Bowler */}
                      <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                        <span className="text-[10px] font-semibold text-white truncate text-right">{battle.bowler}</span>
                        {bowlerImg ? (
                          <img src={bowlerImg} alt={battle.bowler!} className="w-6 h-6 rounded-full object-cover ring-1 ring-gray-700 flex-shrink-0" />
                        ) : (
                          <span className="w-6 h-6 rounded-full bg-orange-500/15 flex items-center justify-center flex-shrink-0"><BowlIcon className="w-3 h-3 text-orange-400" /></span>
                        )}
                      </div>
                    </div>
                  );
                }
                // Legacy key_players format fallback
                const imgUrl = playerImageMap.get((battle.name || '').toLowerCase()) || playerImageMap.get((battle.name || '').split(' ').pop()?.toLowerCase() ?? '');
                return (
                  <div key={i} className="flex items-center gap-1.5 p-1.5 rounded-lg bg-gray-800/30 border border-gray-800/50">
                    {imgUrl ? (
                      <img src={imgUrl} alt={battle.name!} className="w-7 h-7 rounded-full object-cover ring-1 ring-gray-700 flex-shrink-0" />
                    ) : (
                      <span className="w-7 h-7 rounded-full bg-cricket-500/15 flex items-center justify-center text-cricket-400 flex-shrink-0">
                        {battle.role === 'bat' ? <BatIcon className="w-3.5 h-3.5" /> :
                         battle.role === 'bowl' ? <BowlIcon className="w-3.5 h-3.5" /> :
                         <AllRounderIcon className="w-3.5 h-3.5" />}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-white truncate">{battle.name}</p>
                      <p className="text-[8px] text-gray-500 truncate">{battle.team} · {battle.form_note}</p>
                    </div>
                  </div>
                );
              })}
              {enrichment.key_players.some(b => b.insight) && (
                <div className="mt-1 space-y-0.5">
                  {enrichment.key_players.filter(b => b.insight).map((b, i) => (
                    <p key={i} className="text-[8px] text-gray-500 leading-tight">• {b.insight}</p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-500 text-center py-4">Key battle data not available</p>
          )}
        </motion.div>

        {/* Research Notes */}
        <motion.div
          className={`bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border transition-all ${
            enrichment ? 'border-cricket-800/30' : 'border-gray-800/20 opacity-50'
          }`}
          {...fadeUp}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="1" width="10" height="14" rx="1" /><line x1="5" y1="5" x2="11" y2="5" /><line x1="5" y1="8" x2="11" y2="8" /><line x1="5" y1="11" x2="9" y2="11" /></svg>
            Research Notes
          </h2>
          {enrichment ? (
            <>
              {enrichment.expert_preview && (
                <p className="text-xs text-gray-300 leading-relaxed mb-3">{enrichment.expert_preview}</p>
              )}

              {(enrichment.player_updates?.length ?? 0) > 0 && (
                <div className="space-y-1.5 mb-3">
                  {(enrichment.player_updates ?? []).slice(0, 4).map((update, index) => (
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

              {(enrichment.source_links?.length ?? 0) > 0 && (
                <div className="space-y-1">
                  {(enrichment.source_links ?? []).slice(0, 3).map((source, index) => (
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
            </>
          ) : (
            <p className="text-xs text-gray-500 text-center py-4">Research data not available</p>
          )}
        </motion.div>
      </div>

      {/* 3. Toss Insight | Squad — side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
        {/* Toss — AI-generated insight (2/5) */}
        <div className="lg:col-span-2">
          {prediction ? (
            <motion.div
              className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-4 border border-cricket-800/30 h-full flex flex-col justify-center"
              {...fadeUp}
              transition={{ delay: 0.35 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M5 6h6M5 10h6" /></svg>
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">Toss Factor</h2>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                {prediction.toss_insight || enrichment?.toss_insight || 'Toss analysis not available for this match.'}
              </p>
              <p className="text-[9px] text-gray-600 mt-2">AI analysis of {espnData?.venue_name || enrichment?.venue_name || match.venue || 'venue'}, format & team toss tendencies</p>
            </motion.div>
          ) : (
            <motion.div
              className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-4 border border-gray-800/20 opacity-50 h-full"
              {...fadeUp}
              transition={{ delay: 0.35 }}
            >
              <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Toss Factor</h2>
              <p className="text-xs text-gray-500 text-center py-4">Prediction pending</p>
            </motion.div>
          )}
        </div>

        {/* Squad — wider (3/5), prominent player cards */}
        <motion.div
          className={`lg:col-span-3 bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-4 border transition-all ${
            squads.length > 0 || hasSquadOrXi ? 'border-cricket-800/30' : 'border-gray-800/20 opacity-50'
          }`}
          {...fadeUp}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="5" cy="4" r="2.5" /><circle cx="11" cy="4" r="2.5" /><path d="M1 13c0-2.2 1.8-4 4-4s4 1.8 4 4" /><path d="M8 13c0-2.2 1.3-4 3-4s3 1.8 3 4" /></svg>
              Squad
            </h2>
            {squads.length > 0 && (
              <span className="text-[9px] text-gray-500 uppercase">
                {squads.some(s => s.is_confirmed) ? 'Confirmed XI' : 'Probable'}
              </span>
            )}
          </div>
          {squads.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {squads.map((squad) => {
                const meta = squad.team.toLowerCase().includes(displayTeam1.toLowerCase()) ? team1Meta : team2Meta;
                const teamDisplay = squad.team.toLowerCase().includes(displayTeam1.toLowerCase()) ? displayTeam1 : displayTeam2;
                return (
                  <div key={squad.team}>
                    <div className="flex items-center gap-1 mb-1.5">
                      <div className="w-4 h-4 rounded-full overflow-hidden">
                        <img src={getFlagUrl(meta.countryCode, 16)} alt="" className="w-full h-full object-cover" />
                      </div>
                      <span className="text-[10px] font-semibold text-white">{teamDisplay}</span>
                      <span className="text-[8px] text-gray-600">({(squad.players ?? []).length})</span>
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-1">
                      {(squad.players ?? []).slice(0, 11).map((player) => {
                        const RoleIcon = player.is_keeper ? KeeperIcon :
                          player.role?.includes('All') ? AllRounderIcon :
                          player.role?.includes('Bowl') ? BowlIcon : BatIcon;
                        return (
                          <div
                            key={player.id || player.name}
                            className="flex flex-col items-center gap-0.5 p-1 rounded-md bg-gray-800/40 border border-gray-800/30"
                          >
                            {player.image_url ? (
                              <img
                                src={player.image_url}
                                alt={player.name}
                                className="w-8 h-8 rounded-full object-cover ring-1 ring-gray-700"
                              />
                            ) : (
                              <span className="w-8 h-8 rounded-full bg-cricket-500/10 flex items-center justify-center">
                                <RoleIcon className="w-4 h-4 text-gray-500" />
                              </span>
                            )}
                            <span className="text-[8px] text-gray-300 text-center leading-tight truncate w-full">
                              {player.name.split(' ').pop()}
                              {player.is_captain && <CaptainIcon className="w-2 h-2 text-yellow-400 inline ml-0.5" />}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : hasSquadOrXi ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { team: displayTeam1, players: enrichment?.possible_xi?.team1 ?? [], meta: team1Meta },
              { team: displayTeam2, players: enrichment?.possible_xi?.team2 ?? [], meta: team2Meta },
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
          <p className="text-[10px] text-gray-500 text-center py-4">Squad not available yet</p>
        )}
        </motion.div>
      </div>

      {/* 4. Venue & Match Info + Series + H2H + Key Players (ESPN data) */}
      {espnData && (espnData.venue_name || h2hGames.length > 0 || espnData.toss_winner || espnData.series_note || (espnData.series_leaders?.length ?? 0) > 0 || espnData.series_scoreline) && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {/* Venue Details */}
          {espnData.venue_name && (
            <motion.div
              className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-4 border border-cricket-800/30"
              {...fadeUp}
              transition={{ delay: 0.45 }}
            >
              <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1C4.5 5 2 7.5 2 10.5a6 6 0 0012 0C14 7.5 11.5 5 8 1z" /></svg>
                Venue
              </h2>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-white">{espnData.venue_name}</p>
                {espnData.venue_city && (
                  <p className="text-[10px] text-gray-400">{espnData.venue_city}{espnData.venue_country ? `, ${espnData.venue_country}` : ''}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-1">
                  {espnData.venue_capacity && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800/60 text-gray-300">
                      🏟️ {espnData.venue_capacity.toLocaleString()} capacity
                    </span>
                  )}
                  {espnData.venue_grass !== null && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800/60 text-gray-300">
                      {espnData.venue_grass ? '🌱 Grass' : '🏗️ Drop-in'}
                    </span>
                  )}
                </div>
                {espnData.series_note && (
                  <p className="text-[9px] text-cricket-400/80 mt-1 italic">{espnData.series_note}</p>
                )}
              </div>
            </motion.div>
          )}

          {/* Series News & Recent Results */}
          <motion.div
            className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-4 border border-cricket-800/30"
            {...fadeUp}
            transition={{ delay: 0.5 }}
          >
            <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h12v10H2z" /><path d="M2 6h12" /><path d="M5 3v3" /></svg>
              Series
            </h2>
            <div className="space-y-2">
              {espnData.series_scoreline && (
                <p className="text-xs text-cricket-400 font-semibold">{espnData.series_scoreline}</p>
              )}
              {espnData.series_note && !espnData.series_scoreline && (
                <p className="text-xs text-cricket-400 font-medium">{espnData.series_note}</p>
              )}
              {/* Show recent match results from ESPN scorecards */}
              {espnData.standings.length > 0 && (
                <div className="space-y-1 mt-1">
                  {espnData.standings.slice(0, 4).map((team, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px] py-0.5 px-1.5 rounded bg-gray-800/30">
                      <span className="text-white font-medium">{team.team_name}</span>
                      <div className="flex gap-2 text-gray-400">
                        {team.stats.matchesPlayed && <span>P:{team.stats.matchesPlayed}</span>}
                        {team.stats.matchesWon && <span className="text-green-400">W:{team.stats.matchesWon}</span>}
                        {team.stats.matchesLost && <span className="text-red-400">L:{team.stats.matchesLost}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Toss result if available */}
              {espnData.toss_winner && (
                <div className="pt-1 border-t border-gray-800/50">
                  <p className="text-[10px] text-gray-300">
                    <span className="text-gray-500">Toss:</span>{' '}
                    <span className="font-medium text-white">{espnData.toss_winner}</span>
                    {espnData.toss_decision && <> elected to <span className="text-cricket-400">{espnData.toss_decision}</span></>}
                  </p>
                </div>
              )}
              {!espnData.series_note && espnData.standings.length === 0 && !espnData.toss_winner && (
                <p className="text-[10px] text-gray-500">No series data available yet</p>
              )}
            </div>
          </motion.div>

          {/* Head to Head */}
          <motion.div
            className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-4 border border-cricket-800/30"
            {...fadeUp}
            transition={{ delay: 0.55 }}
          >
            {h2hGames.length > 0 ? (
              <div>
                <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 3v10M12 3v10M4 8h8" /></svg>
                  Head to Head
                </h2>
                <div className="space-y-1">
                  {h2hGames.slice(0, 5).map((game, i) => {
                    const winner = game.teams.find(t => t.winner);
                    return (
                      <div key={i} className="flex items-center gap-2 text-[10px] py-0.5">
                        <span className="text-gray-500 w-16 shrink-0">{game.date ? new Date(game.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' }) : '?'}</span>
                        <div className="flex-1 flex items-center gap-1">
                          {game.teams.map((t, j) => (
                            <span key={j} className={`${t.winner ? 'text-cricket-400 font-semibold' : 'text-gray-400'}`}>
                              {t.abbreviation} {t.score}{j < game.teams.length - 1 ? ' vs ' : ''}
                            </span>
                          ))}
                        </div>
                        {winner && <span className="text-[8px] text-cricket-400/70">✓ {winner.abbreviation}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 3v10M12 3v10M4 8h8" /></svg>
                  Head to Head
                </h2>
                <p className="text-[10px] text-gray-500 py-2">No recent head-to-head data available</p>
              </div>
            )}
          </motion.div>

          {/* Key Players to Watch (ESPN Series Leaders) */}
          {(espnData.series_leaders?.length ?? 0) > 0 && (
            <motion.div
              className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-4 border border-cricket-800/30 lg:col-span-1"
              {...fadeUp}
              transition={{ delay: 0.55 }}
            >
              <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="3" /><path d="M2 14c0-3 3-5 6-5s6 2 6 5" /></svg>
                Key Players to Watch
              </h2>
              <div className="space-y-1">
                {espnData.series_leaders.map((leader, i) => {
                  const isBatting = leader.category.toLowerCase().includes('run');
                  const localImg = playerImageMap.get(leader.player_name.toLowerCase()) || playerImageMap.get(leader.player_name.split(' ').pop()?.toLowerCase() ?? '');
                  const imgUrl = localImg || leader.headshot_url;
                  return (
                    <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg bg-gray-800/30 border border-gray-800/50">
                      {imgUrl ? (
                        <img src={imgUrl} alt={leader.player_name} className="w-7 h-7 rounded-full object-cover ring-1 ring-gray-700 flex-shrink-0" />
                      ) : (
                        <span className="w-7 h-7 rounded-full bg-cricket-500/15 flex items-center justify-center flex-shrink-0">
                          {isBatting ? <BatIcon className="w-3.5 h-3.5 text-cricket-400" /> : <BowlIcon className="w-3.5 h-3.5 text-orange-400" />}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold text-white truncate">{leader.player_name}</p>
                        <p className="text-[8px] text-gray-500 truncate">{leader.team_abbr}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-[11px] font-bold ${isBatting ? 'text-cricket-400' : 'text-orange-400'}`}>{leader.value}</p>
                        <p className="text-[7px] text-gray-500 uppercase">{leader.category}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[7px] text-gray-600 mt-2 text-center">H2H career stats via ESPN Cricinfo</p>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}