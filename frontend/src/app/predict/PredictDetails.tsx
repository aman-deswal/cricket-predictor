'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { getMatch, getMatchEnrichment, getMatchOdds, getMatchSquads, getPlayerStats, getPrediction, getESPNMatchData, getEdgeScore, Match, MatchEnrichment, MatchOdds, MatchSquad, PlayerStats, Prediction, ESPNMatchData, EdgeScore } from '@/lib/supabase';
import { getTeamMeta, getFlagUrl, getFlag2xUrl } from '@/lib/teams';
import { PredictionChart } from '@/components/PredictionChart';
import { BatIcon, BowlIcon, KeeperIcon, AllRounderIcon, CaptainIcon, SparkleIcon } from '@/components/CricketIcons';
import { CricketLoader } from '@/components/CricketLoader';

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

function getBookmakerMarketUrl(bookmaker: string, match: Match, market: string): string {
  const normalized = bookmaker.toLowerCase().replace(/[^a-z0-9]/g, '');
  const query = encodeURIComponent(`${match.team1} vs ${match.team2} cricket ${market}`);

  const searchUrlByBookmaker: Record<string, string> = {
    tab: `https://www.tab.com.au/sports/search?query=${query}`,
    skynet: `https://www.skybet.com/search?query=${query}`,
    skybet: `https://www.skybet.com/search?query=${query}`,
    paddypower: `https://www.paddypower.com/search?q=${query}`,
    boylesports: `https://www.boylesports.com/search?query=${query}`,
    bet365: `https://www.bet365.com/`,
    williamhill: `https://sports.williamhill.com/betting/en-gb`,
    unibet: `https://www.unibet.com/betting/sports/filter/cricket`,
  };

  return searchUrlByBookmaker[normalized] || `https://www.google.com/search?q=${encodeURIComponent(`${bookmaker} ${match.team1} vs ${match.team2} cricket odds`)}`;
}

function openExternalMarket(url: string): void {
  if (typeof window === 'undefined') return;
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) {
    window.location.href = url;
  }
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
  const [edgeScore, setEdgeScore] = useState<EdgeScore | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    ourTake: false,
    researchNotes: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!matchId) {
        setLoading(false);
        return;
      }

      try {
        const [matchData, predictionData, enrichmentData, oddsData, squadData, espn, edgeData] = await Promise.all([
          getMatch(matchId),
          getPrediction(matchId),
          getMatchEnrichment(matchId),
          getMatchOdds(matchId),
          getMatchSquads(matchId),
          getESPNMatchData(matchId),
          getEdgeScore(matchId),
        ]);
        setMatch(matchData);
        setPrediction(predictionData);
        setEnrichment(enrichmentData);
        setOdds(oddsData);
        setSquads(squadData);
        setEspnData(espn);
        setEdgeScore(edgeData);

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

  const [edgeBarsReady, setEdgeBarsReady] = useState(false);
  const [flippedBattle, setFlippedBattle] = useState<number | null>(null);
  const [pressedBattle, setPressedBattle] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setEdgeBarsReady(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Live countdown timer
  const getCountdown = useCallback(() => {
    if (!match) return null;
    const matchDate = match.date.endsWith('Z') || match.date.includes('+') ? match.date : match.date + 'Z';
    const diff = new Date(matchDate).getTime() - Date.now();
    if (diff <= 0) return null;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    return { days, hours, mins, secs };
  }, [match]);

  const [countdown, setCountdown] = useState(getCountdown);
  useEffect(() => {
    if (!match) return;
    const interval = setInterval(() => setCountdown(getCountdown()), 1000);
    return () => clearInterval(interval);
  }, [match, getCountdown]);

  if (loading) {
    return <CricketLoader />;
  }

  if (!matchId || !match) {
    return (
      <motion.div {...fadeUp} className="text-center text-gray-300 py-16">
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

  // Derive form from ESPN H2H (most recent and accurate for this matchup)
  // Falls back to Cricsheet format form if no ESPN data
  const deriveH2HForm = (teamShortName: string): Array<'W' | 'L'> => {
    if (h2hGames.length === 0) return [];
    return h2hGames
      .slice(0, 5)
      .map(game => {
        const team = game.teams.find((t: { abbreviation?: string; name?: string }) =>
          t.abbreviation?.toUpperCase() === teamShortName.toUpperCase()
        );
        if (!team) return null;
        return team.winner ? 'W' as const : 'L' as const;
      })
      .filter((r): r is 'W' | 'L' => r !== null)
      .reverse(); // oldest first → left-to-right chronological
  };
  const team1H2H = deriveH2HForm(team1Meta.shortName);
  const team2H2H = deriveH2HForm(team2Meta.shortName);
  const team1Form = team1H2H.length > 0 ? team1H2H : (match.team1_recent_form ?? []).slice(-5);
  const team2Form = team2H2H.length > 0 ? team2H2H : (match.team2_recent_form ?? []).slice(-5);
  const featuredBookmakerUrl = odds.length > 0
    ? getBookmakerMarketUrl(odds[0].bookmaker, match, odds[0].market)
    : null;
  const reasoningSentences = (prediction?.reasoning || '')
    .split(/(?<=[.!?])\s+/)
    .filter((s: string) => s.trim().length > 10);
  const visibleReasoning = expandedSections.ourTake ? reasoningSentences : reasoningSentences.slice(0, 3);

  const expertPreview = enrichment?.expert_preview?.trim() || '';
  const playerUpdates = enrichment?.player_updates ?? [];
  const sourceLinks = enrichment?.source_links ?? [];
  const researchNeedsAccordion = expertPreview.length > 260 || playerUpdates.length > 2 || sourceLinks.length > 2;
  const visiblePreview = expandedSections.researchNotes || expertPreview.length <= 260
    ? expertPreview
    : `${expertPreview.slice(0, 260).trimEnd()}…`;
  const visibleUpdates = expandedSections.researchNotes ? playerUpdates.slice(0, 6) : playerUpdates.slice(0, 2);
  const visibleSources = expandedSections.researchNotes ? sourceLinks.slice(0, 6) : sourceLinks.slice(0, 2);

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

  // Resolve team colors once — ensure visual distinction (same logic as donut chart)
  const colorDist = (c1: string, c2: string) => {
    const hex = (s: string) => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)];
    const [r1,g1,b1] = hex(c1);
    const [r2,g2,b2] = hex(c2);
    return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
  };
  const teamColor1 = team1Meta.primaryColor;
  const teamColor2 = colorDist(team1Meta.primaryColor, team2Meta.primaryColor) < 80
    ? team2Meta.secondaryColor
    : team2Meta.primaryColor;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Back link + Countdown */}
      <div className="flex items-center justify-between mb-4">
        <Link href="/" className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors group">
          <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 3L5 8l5 5" /></svg>
          All Matches
        </Link>
        {countdown && (
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <svg className="w-3 h-3 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M8 4v4l3 2" /></svg>
            <span className="font-mono">
              {countdown.days > 0 && <span className="text-white font-semibold">{countdown.days}</span>}
              {countdown.days > 0 && <span className="text-gray-300">d </span>}
              <span className="text-white font-semibold">{String(countdown.hours).padStart(2, '0')}</span>
              <span className="text-gray-300">h </span>
              <span className="text-white font-semibold">{String(countdown.mins).padStart(2, '0')}</span>
              <span className="text-gray-300">m </span>
              <span className="text-white font-semibold">{String(countdown.secs).padStart(2, '0')}</span>
              <span className="text-gray-300">s</span>
            </span>
          </div>
        )}
      </div>
      {/* Hero: Teams + Prediction (replaces VS with chart) */}
      <style>{`
        @keyframes pickEntrance {
          0%   { opacity: 0; box-shadow: 0 0 0 0 rgba(251,191,36,0); transform: scale(0.88); }
          55%  { opacity: 1; box-shadow: 0 0 22px 5px rgba(251,191,36,0.45); transform: scale(1.06); }
          100% { opacity: 1; box-shadow: 0 0 8px 1px rgba(251,191,36,0.22); transform: scale(1); }
        }
        @keyframes pickBreath {
          0%, 100% { box-shadow: 0 0 6px 1px rgba(251,191,36,0.18); }
          50%       { box-shadow: 0 0 14px 3px rgba(251,191,36,0.34); }
        }
        .pick-badge {
          animation: pickEntrance 0.65s cubic-bezier(0.22,1,0.36,1) forwards,
                     pickBreath 2.8s ease-in-out 0.65s infinite;
        }
      `}</style>
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
            {/* Pick badge above flag */}
            {prediction && prediction.team1_win_probability >= prediction.team2_win_probability ? (
              <div className="mb-2 flex items-center justify-center">
                <span className="pick-badge inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg" style={{ background: 'rgba(251,191,36,0.1)', color: '#fcd34d', border: '1px solid rgba(251,191,36,0.32)' }}>
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,6 5,9 10,3"/></svg>
                  Our Pick
                </span>
              </div>
            ) : <div className="mb-2 h-[26px]" />}
            <motion.div
              className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 mx-auto mb-2 rounded-full overflow-hidden shadow-xl"
              style={prediction && prediction.team1_win_probability >= prediction.team2_win_probability
                ? { boxShadow: `0 0 0 3px ${teamColor1}, 0 0 0 5px ${teamColor1}44, 0 0 20px ${teamColor1}55`, outline: 'none' }
                : { boxShadow: `0 0 0 2px ${team1Meta.primaryColor}55` }
              }
              whileHover={{ scale: 1.1 }}
            >
              {team1Meta.countryCode ? (
                <img
                  src={getFlagUrl(team1Meta.countryCode, 80)}
                  srcSet={`${getFlag2xUrl(team1Meta.countryCode, 80)} 2x`}
                  alt={displayTeam1}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center font-bold text-white text-lg"
                  style={{ backgroundColor: team1Meta.primaryColor }}
                >
                  {team1Meta.shortName.slice(0, 3)}
                </div>
              )}
            </motion.div>
            <h2 className="text-base sm:text-lg lg:text-xl font-bold text-white">{team1Meta.shortName}</h2>
            {/* Form strip — last 5 */}
            {team1Form.length > 0 && (
              <div className="flex items-center justify-center gap-1 mt-1.5">
                {team1Form.map((r, i) => (
                  <span key={`t1f-${i}`} className={`h-5 w-5 flex items-center justify-center rounded text-[9px] font-bold text-white ${r === 'W' ? 'bg-emerald-500' : 'bg-red-500/80'}`}>{r}</span>
                ))}
              </div>
            )}
            {prediction && (
              <p className="text-lg sm:text-2xl lg:text-3xl font-black mt-1" style={{ color: teamColor1, textShadow: '0 0 6px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.6)' }}>
                {(prediction.team1_win_probability * 100).toFixed(0)}%
              </p>
            )}
            {prediction && (
              <span
                className={`inline-flex items-center justify-center mt-1 px-2 py-0.5 rounded-full border text-xs font-mono font-semibold ${
                  featuredBookmakerUrl
                    ? 'border-cricket-400/35 bg-cricket-400/10 text-gray-100 cursor-pointer hover:bg-cricket-400/20'
                    : 'border-white/15 bg-white/5 text-gray-200'
                }`}
                onClick={featuredBookmakerUrl ? () => openExternalMarket(featuredBookmakerUrl) : undefined}
                role={featuredBookmakerUrl ? 'button' : undefined}
                tabIndex={featuredBookmakerUrl ? 0 : undefined}
                onKeyDown={featuredBookmakerUrl ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openExternalMarket(featuredBookmakerUrl);
                  }
                } : undefined}
              >
                {odds.length > 0
                  ? decimalToAmerican(odds[0].team1_odds)
                  : toAmericanOdds(prediction.team1_win_probability)}
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
              <div className="w-28 h-28 sm:w-36 sm:h-36 lg:w-44 lg:h-44">
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

          </motion.div>

          {/* Team 2 */}
          <motion.div
            className="flex-1 text-center"
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {/* Pick badge above flag */}
            {prediction && prediction.team2_win_probability > prediction.team1_win_probability ? (
              <div className="mb-2 flex items-center justify-center">
                <span className="pick-badge inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg" style={{ background: 'rgba(251,191,36,0.1)', color: '#fcd34d', border: '1px solid rgba(251,191,36,0.32)' }}>
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,6 5,9 10,3"/></svg>
                  Our Pick
                </span>
              </div>
            ) : <div className="mb-2 h-[26px]" />}
            <motion.div
              className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 mx-auto mb-2 rounded-full overflow-hidden shadow-xl"
              style={prediction && prediction.team2_win_probability > prediction.team1_win_probability
                ? { boxShadow: `0 0 0 3px ${teamColor2}, 0 0 0 5px ${teamColor2}44, 0 0 20px ${teamColor2}55` }
                : { boxShadow: `0 0 0 2px ${team2Meta.primaryColor}55` }
              }
              whileHover={{ scale: 1.1 }}
            >
              {team2Meta.countryCode ? (
                <img
                  src={getFlagUrl(team2Meta.countryCode, 80)}
                  srcSet={`${getFlag2xUrl(team2Meta.countryCode, 80)} 2x`}
                  alt={displayTeam2}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center font-bold text-white text-lg"
                  style={{ backgroundColor: team2Meta.primaryColor }}
                >
                  {team2Meta.shortName.slice(0, 3)}
                </div>
              )}
            </motion.div>
            <h2 className="text-base sm:text-lg lg:text-xl font-bold text-white">{team2Meta.shortName}</h2>
            {/* Form strip — last 5 */}
            {team2Form.length > 0 && (
              <div className="flex items-center justify-center gap-1 mt-1.5">
                {team2Form.map((r, i) => (
                  <span key={`t2f-${i}`} className={`h-5 w-5 flex items-center justify-center rounded text-[9px] font-bold text-white ${r === 'W' ? 'bg-emerald-500' : 'bg-red-500/80'}`}>{r}</span>
                ))}
              </div>
            )}
            {prediction && (
              <p className="text-lg sm:text-2xl lg:text-3xl font-black mt-1" style={{ color: teamColor2, textShadow: '0 0 6px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.6)' }}>
                {(prediction.team2_win_probability * 100).toFixed(0)}%
              </p>
            )}
            {prediction && (
              <span
                className={`inline-flex items-center justify-center mt-1 px-2 py-0.5 rounded-full border text-xs font-mono font-semibold ${
                  featuredBookmakerUrl
                    ? 'border-cricket-400/35 bg-cricket-400/10 text-gray-100 cursor-pointer hover:bg-cricket-400/20'
                    : 'border-white/15 bg-white/5 text-gray-200'
                }`}
                onClick={featuredBookmakerUrl ? () => openExternalMarket(featuredBookmakerUrl) : undefined}
                role={featuredBookmakerUrl ? 'button' : undefined}
                tabIndex={featuredBookmakerUrl ? 0 : undefined}
                onKeyDown={featuredBookmakerUrl ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openExternalMarket(featuredBookmakerUrl);
                  }
                } : undefined}
              >
                {odds.length > 0
                  ? decimalToAmerican(odds[0].team2_odds)
                  : toAmericanOdds(prediction.team2_win_probability)}
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
          <span className="uppercase font-semibold text-cricket-400">
            {(() => {
              const scoreline = espnData?.series_scoreline || '';
              const levelMatch = scoreline.match(/level\s+(\d+)-(\d+)/);
              const leadsMatch = scoreline.match(/leads?\s+(\d+)-(\d+)/);
              let matchNum = 0;
              if (levelMatch) matchNum = parseInt(levelMatch[1]) + parseInt(levelMatch[2]) + 1;
              else if (leadsMatch) matchNum = parseInt(leadsMatch[1]) + parseInt(leadsMatch[2]) + 1;
              const suffix = matchNum === 1 ? 'st' : matchNum === 2 ? 'nd' : matchNum === 3 ? 'rd' : 'th';
              return matchNum > 0 ? `${matchNum}${suffix} ${match.match_type}` : match.match_type;
            })()}
          </span>
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
            {odds.length > 0 && <span className="text-[9px] text-gray-300">{odds.length} {odds.length === 1 ? 'bookmaker' : 'bookmakers'}</span>}
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
                  <button
                    key={`${o.bookmaker}-${o.fetched_at}`}
                    type="button"
                    onClick={() => openExternalMarket(getBookmakerMarketUrl(o.bookmaker, match, o.market))}
                    className="w-full appearance-none flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800/40 border border-gray-700/30 hover:border-cricket-500/40 hover:bg-gray-800/65 transition-colors text-left"
                  >
                    <span className="text-[10px] text-gray-300 font-medium w-24 truncate">{o.bookmaker}</span>
                    <div className="flex items-center gap-2.5">
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-mono font-bold ${isValue1 ? 'text-yellow-300 border-yellow-400/30 bg-yellow-400/5' : 'text-white border-white/10 bg-white/[0.03]'}`}>
                        {decimalToAmerican(o.team1_odds)}
                        {isValue1 && <span className="ml-1 text-[8px] text-yellow-400">↑</span>}
                      </span>
                      <span className="text-gray-400 text-[10px]">|</span>
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-mono font-bold ${isValue2 ? 'text-yellow-300 border-yellow-400/30 bg-yellow-400/5' : 'text-white border-white/10 bg-white/[0.03]'}`}>
                        {decimalToAmerican(o.team2_odds)}
                        {isValue2 && <span className="ml-1 text-[8px] text-yellow-400">↑</span>}
                      </span>
                      <svg className="w-3 h-3 text-gray-300" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 4h6v6" /><path d="M10 4L4 10" /><path d="M4 6v6h6" /></svg>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-300 text-center py-4">No sportsbook odds available yet</p>
          )}
        </motion.div>

        {/* Our Take */}
        {prediction ? (
          <motion.div
            className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border border-cricket-800/30"
            {...fadeUp}
            transition={{ delay: 0.25 }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1a5 5 0 013 9v2a1 1 0 01-1 1H6a1 1 0 01-1-1v-2A5 5 0 018 1z" /><line x1="6" y1="14" x2="10" y2="14" /></svg>
                Our Take
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
            <div className="space-y-2.5">
              {visibleReasoning.map((sentence: string, i: number) => (
                  <div key={i} className="pl-3 border-l-2 border-cricket-500/40 text-sm text-gray-300 leading-relaxed">
                    {sentence.trim()}
                  </div>
                ))}
            </div>
            {reasoningSentences.length > 3 && (
              <button
                type="button"
                onClick={() => setExpandedSections((prev) => ({ ...prev, ourTake: !prev.ourTake }))}
                className="mt-3 text-[10px] font-medium text-cricket-300 hover:text-cricket-200 transition-colors"
              >
                {expandedSections.ourTake ? 'Show less' : 'Show more'}
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            {...fadeUp}
            transition={{ delay: 0.25 }}
            className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border border-gray-800/20 opacity-50 flex flex-col items-center justify-center text-center"
          >
            <p className="text-sm font-semibold text-gray-300">Prediction Pending</p>
            <p className="text-gray-400 text-xs mt-1">Pipeline hasn&apos;t run yet</p>
          </motion.div>
        )}
      </div>

      {/* AI vs Market Edge — the betting value signal */}
      {odds.length > 0 && prediction && (() => {
        const o = odds[0];
        const ai1 = Math.round(prediction.team1_win_probability * 100);
        const ai2 = Math.round(prediction.team2_win_probability * 100);
        const implied1 = Math.round((1 / o.team1_odds) * 100);
        const implied2 = Math.round((1 / o.team2_odds) * 100);
        const edge1 = ai1 - implied1;
        const edge2 = ai2 - implied2;

        // American odds: market price vs AI-implied fair price
        const mktOdds1 = decimalToAmerican(o.team1_odds);
        const mktOdds2 = decimalToAmerican(o.team2_odds);
        const fairOdds1 = toAmericanOdds(prediction.team1_win_probability);
        const fairOdds2 = toAmericanOdds(prediction.team2_win_probability);

        // Plain-English verdict
        const bestEdge = edge1 >= edge2 ? edge1 : edge2;
        const bestEdgeTeam = edge1 >= edge2 ? team1Meta.shortName : team2Meta.shortName;
        const worstEdge = edge1 >= edge2 ? edge2 : edge1;
        const worstEdgeTeam = edge1 >= edge2 ? team2Meta.shortName : team1Meta.shortName;
        let verdict = '';
        let verdictColor = 'text-gray-400';
        if (bestEdge >= 7) {
          verdict = `${bestEdgeTeam} underpriced by ${bestEdge}pts — value exists`;
          verdictColor = 'text-emerald-400';
        } else if (worstEdge <= -7) {
          verdict = `${worstEdgeTeam} may be overpriced — consider fading`;
          verdictColor = 'text-amber-400';
        } else {
          verdict = 'Market fairly priced — no exploitable edge detected';
          verdictColor = 'text-gray-400';
        }

        const EdgeRow = ({ shortName, color, aiPct, impliedPct, edgePct, mktOddsStr, fairOddsStr }: {
          shortName: string; color: string; aiPct: number; impliedPct: number; edgePct: number; mktOddsStr: string; fairOddsStr: string;
        }) => {
          const isValue = edgePct >= 7;
          return (
            <div className="rounded-xl p-3.5" style={{ background: `${color}12`, border: `1px solid ${color}28` }}>
              {/* Team name + odds row + edge badge */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-black text-white tracking-wider">{shortName}</span>
                <div className="flex items-center gap-2">
                  {/* Odds comparison */}
                  <div className="flex items-center gap-1.5 text-[10px] font-mono">
                    <span className="text-gray-500">Fair</span>
                    <span className="font-black text-gray-200">{fairOddsStr}</span>
                    <span className="text-gray-600">·</span>
                    <span className="text-gray-500">Mkt</span>
                    <span className="font-black" style={{ color }}>{mktOddsStr}</span>
                  </div>
                  {isValue ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-400/10 border border-emerald-400/25 px-2 py-0.5 rounded-full">
                      ↑ +{edgePct}pt
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-600 font-semibold">No edge</span>
                  )}
                </div>
              </div>
              {/* AI bar */}
              <div className="flex items-center gap-2.5 mb-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 w-7 shrink-0">AI</span>
                <div className="flex-1 h-3 bg-gray-800/70 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: edgeBarsReady ? `${aiPct}%` : '0%',
                      backgroundColor: color,
                      transition: 'width 0.9s ease-out 0.4s',
                    }}
                  />
                </div>
                <span className="text-sm font-black tabular-nums w-9 text-right" style={{ color }}>{aiPct}%</span>
              </div>
              {/* Market bar */}
              <div className="flex items-center gap-2.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 w-7 shrink-0">MKT</span>
                <div className="flex-1 h-3 bg-gray-800/70 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full opacity-40"
                    style={{ width: `${impliedPct}%`, backgroundColor: color }}
                  />
                </div>
                <span className="text-sm font-black tabular-nums w-9 text-right text-gray-400">{impliedPct}%</span>
              </div>
            </div>
          );
        };

        return (
          <motion.div
            className="bg-gradient-to-br from-gray-900/90 to-cricket-950/90 backdrop-blur-xl rounded-2xl p-5 border border-cricket-600/20 mb-4"
            {...fadeUp}
            transition={{ delay: 0.15 }}
          >
            {/* Header with info tooltip */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 8h12M8 2v12" /><circle cx="8" cy="8" r="6" /></svg>
                AI vs Market
                <span
                  className="ml-0.5 w-4 h-4 rounded-full border border-gray-600 text-gray-500 text-[9px] font-bold flex items-center justify-center cursor-help"
                  title="Compares our AI win probability against the bookmaker's implied probability. When AI sees a team as meaningfully more likely to win than the market price suggests, that gap is a value signal."
                >i</span>
              </h2>
              <span className="text-[9px] text-gray-400 bg-gray-800/50 px-2 py-0.5 rounded-full">
                via {o.bookmaker}
              </span>
            </div>

            <div className="space-y-2.5 mb-4">
              <EdgeRow shortName={team1Meta.shortName} color={teamColor1} aiPct={ai1} impliedPct={implied1} edgePct={edge1} mktOddsStr={mktOdds1} fairOddsStr={fairOdds1} />
              <EdgeRow shortName={team2Meta.shortName} color={teamColor2} aiPct={ai2} impliedPct={implied2} edgePct={edge2} mktOddsStr={mktOdds2} fairOddsStr={fairOdds2} />
            </div>

            {/* Plain-English verdict */}
            <div className={`text-[10px] font-semibold ${verdictColor} flex items-center gap-1.5`}>
              <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="6" r="5"/><path d="M6 4v2.5l1.5 1.5"/></svg>
              {verdict}
            </div>
          </motion.div>
        );
      })()}

      {/* Key Battles — flip cards */}
      {enrichment?.key_players?.length ? (
        <motion.div
          className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border border-cricket-800/30 mb-4"
          {...fadeUp}
          transition={{ delay: 0.28 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
              <svg className="w-4 h-4 text-cricket-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 9.5L3 21M3 3l18 18M21 3L3 21" /><path d="M9.5 14.5L21 3" />
              </svg>
              Key Battles
            </h2>
            <span className="text-[10px] font-semibold text-gray-400 tracking-wide">
              {enrichment.key_players.length} duel{enrichment.key_players.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {enrichment.key_players.map((battle, i) => {
              if (!battle.batter || !battle.bowler) return null;
              const batterStats = playerStats.find(s => s.player_name === battle.batter);
              const bowlerStats = playerStats.find(s => s.player_name === battle.bowler);
              const bMeta = getTeamMeta(battle.batter_team ?? '');
              const wMeta = getTeamMeta(battle.bowler_team ?? '');
              const batterLast = battle.batter.split(' ').slice(-1)[0];
              const bowlerLast = battle.bowler.split(' ').slice(-1)[0];
              const isFlipped = flippedBattle === i;
              const h2h = battle.h2h;
              const batterImg = playerImageMap.get(battle.batter.toLowerCase()) || playerImageMap.get(batterLast.toLowerCase());
              const bowlerImg = playerImageMap.get(battle.bowler.toLowerCase()) || playerImageMap.get(bowlerLast.toLowerCase());
              const insightSentence = battle.insight?.split(/(?<=[.!?])\s+/)[0]?.trim();
              // Extract stat lead from first insight sentence (bold first number found)
              const insightParts = insightSentence
                ? insightSentence.replace(/(\d+(?:\.\d+)?(?:\s*%)?)/g, '|||$1|||').split('|||')
                : null;

              return (
                <div
                  key={i}
                  className="rounded-xl overflow-hidden border border-gray-700/25 cursor-pointer select-none transition-transform duration-150"
                  style={{
                    perspective: '1200px',
                    transform: pressedBattle === i ? 'scale(0.985)' : 'scale(1)',
                  }}
                  onClick={() => setFlippedBattle(isFlipped ? null : i)}
                  onPointerDown={() => setPressedBattle(i)}
                  onPointerUp={() => setPressedBattle(null)}
                  onPointerCancel={() => setPressedBattle(null)}
                  onPointerLeave={() => setPressedBattle(null)}
                >
                  {/* Flip container — grid so both faces share height naturally */}
                  <div
                    style={{
                      display: 'grid',
                      transformStyle: 'preserve-3d',
                      transition: 'transform 0.45s cubic-bezier(0.4,0,0.2,1)',
                      transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    }}
                  >
                    {/* ── FRONT FACE ─────────────────────────────── */}
                    <div className="w-full flex flex-col" style={{ backfaceVisibility: 'hidden', gridArea: '1 / 1' }}>
                      <div className="flex items-stretch">
                        {/* Batter */}
                        <div className="flex-1 p-3 flex flex-col" style={{ background: `linear-gradient(135deg, ${bMeta.primaryColor}1a 0%, transparent 60%)` }}>
                          {/* Team · Role pill */}
                          <div className="mb-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider text-white" style={{
                              background: `${bMeta.primaryColor}35`,
                              border: `1px solid ${bMeta.primaryColor}80`,
                            }}>
                              <BatIcon className="w-2.5 h-2.5 text-white/90" />
                              {bMeta.shortName} · Bat
                            </span>
                          </div>
                          {/* Photo + Name row */}
                          <div className="flex items-center gap-3 mb-2">
                            {batterImg && (
                              <img src={batterImg} alt={batterLast} className="w-16 h-16 rounded-xl object-cover object-top shrink-0 shadow-lg" style={{ outline: `2px solid ${bMeta.primaryColor}55` }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-[clamp(1.4rem,2.6vw,2rem)] font-black text-white leading-none tracking-tight">{batterLast}</p>
                              {batterStats ? (
                                <p className="text-[8px] font-mono text-gray-200 mt-1 leading-none whitespace-nowrap">{batterStats.batting_avg?.toFixed(0)} AVG · {batterStats.batting_sr?.toFixed(0)} SR</p>
                              ) : null}
                              {h2h && (
                                <p className="text-[8px] font-mono text-cricket-300 mt-1 leading-none whitespace-nowrap">{h2h.runs_scored} runs vs {bowlerLast}</p>
                              )}
                            </div>
                          </div>
                          {/* Form strip — last 5 scores */}
                          {battle.batter_scores && (
                            <div className="flex items-center gap-1 mt-auto pt-2">
                              <span className="text-[6.5px] font-bold uppercase tracking-widest text-gray-400 mr-0.5 shrink-0">Last 5</span>
                              {battle.batter_scores.map((score, fi) => (
                                <span key={fi} className="min-w-[22px] px-1 h-5 rounded text-[8px] font-black flex items-center justify-center shrink-0" style={{
                                  background: score >= 50 ? '#16a34a55' : score >= 25 ? '#d9770655' : '#dc262655',
                                  color: score >= 50 ? '#4ade80' : score >= 25 ? '#fb923c' : '#f87171',
                                  border: `1px solid ${score >= 50 ? '#16a34a88' : score >= 25 ? '#d9770688' : '#dc262688'}`,
                                }}>{score}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* VS divider */}
                        <div className="w-12 flex flex-col items-center justify-center bg-gray-900/50 shrink-0 gap-1 border-x border-gray-700/40">
                          <span className="text-[8px] font-black text-gray-500 tracking-widest">VS</span>
                          {h2h ? (
                            <>
                              <span className="text-[20px] font-black text-white leading-none">{h2h.dismissals}</span>
                              <span className="text-[7px] font-black tracking-wider text-gray-300">WKT</span>
                            </>
                          ) : (
                            <span className="text-[7px] text-gray-500">—</span>
                          )}
                        </div>
                        {/* Bowler */}
                        <div className="flex-1 p-3 flex flex-col text-right" style={{ background: `linear-gradient(225deg, ${wMeta.primaryColor}1a 0%, transparent 60%)` }}>
                          {/* Team · Role pill */}
                          <div className="mb-2 flex justify-end">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider text-white" style={{
                              background: `${wMeta.primaryColor}35`,
                              border: `1px solid ${wMeta.primaryColor}80`,
                            }}>
                              {wMeta.shortName} · Bowl
                              <BowlIcon className="w-2.5 h-2.5 text-white/90" />
                            </span>
                          </div>
                          {/* Photo + Name row */}
                          <div className="flex items-center justify-end gap-3 mb-2">
                            <div className="min-w-0 flex-1 text-right">
                              <p className="text-[clamp(1.4rem,2.6vw,2rem)] font-black text-white leading-none tracking-tight">{bowlerLast}</p>
                              {bowlerStats ? (
                                <p className="text-[8px] font-mono text-gray-200 mt-1 leading-none whitespace-nowrap">{bowlerStats.bowling_wickets} WKTS · {bowlerStats.bowling_economy?.toFixed(1)} ECO</p>
                              ) : null}
                              {h2h && (
                                <p className="text-[8px] font-mono text-amber-300 mt-1 leading-none whitespace-nowrap">{h2h.dot_pct}% dot balls</p>
                              )}
                            </div>
                            {bowlerImg && (
                              <img src={bowlerImg} alt={bowlerLast} className="w-16 h-16 rounded-xl object-cover object-top shrink-0 shadow-lg" style={{ outline: `2px solid ${wMeta.primaryColor}55` }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            )}
                          </div>
                          {/* Form strip — last 5 wicket hauls */}
                          {battle.bowler_figures && (
                            <div className="flex items-center justify-end gap-1 mt-auto pt-2">
                              {battle.bowler_figures.map((wkts, fi) => (
                                <span key={fi} className="min-w-[22px] px-1 h-5 rounded text-[8px] font-black flex items-center justify-center shrink-0" style={{
                                  background: wkts >= 3 ? '#16a34a55' : wkts >= 1 ? '#d9770655' : '#dc262655',
                                  color: wkts >= 3 ? '#4ade80' : wkts >= 1 ? '#fb923c' : '#f87171',
                                  border: `1px solid ${wkts >= 3 ? '#16a34a88' : wkts >= 1 ? '#d9770688' : '#dc262688'}`,
                                }}>{wkts}W</span>
                              ))}
                              <span className="text-[6.5px] font-bold uppercase tracking-widest text-gray-400 ml-0.5 shrink-0">Last 5</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Insight strip — single row */}
                      {insightParts && (
                        <div className="px-3 py-2 border-t border-gray-700/30 bg-gray-900/40 flex items-center gap-2">
                          <div className="text-[9px] text-gray-300 leading-tight flex-1 min-w-0 line-clamp-2 flex items-start gap-1">
                            <SparkleIcon className="w-3 h-3 text-cricket-300 shrink-0 mt-px" />
                            <span>{insightParts.map((part, j) => {
                              const isNum = /^\d/.test(part);
                              return isNum
                                ? <strong key={j} className="text-white font-bold">{part}</strong>
                                : <span key={j}>{part}</span>;
                            })}</span>
                          </div>
                          <span className="inline-flex items-center rounded-full border border-gray-600/60 bg-gray-800/70 px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-gray-300 shrink-0 whitespace-nowrap cursor-pointer">
                            <span className="relative mr-1 flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cricket-300 opacity-75" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-cricket-200" />
                            </span>
                            Flip →
                          </span>
                        </div>
                      )}
                    </div>

                    {/* ── BACK FACE — H2H Matchup Stats ─────────── */}
                    <div
                      className="w-full rounded-xl overflow-hidden"
                      style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', gridArea: '1 / 1' }}
                    >
                      <div
                        className="p-2.5 flex flex-col gap-1.5"
                        style={{
                          background: `radial-gradient(circle at 15% 20%, ${bMeta.primaryColor}33 0%, transparent 38%), radial-gradient(circle at 85% 80%, ${wMeta.primaryColor}33 0%, transparent 38%), linear-gradient(135deg, #0a1222 0%, #0f1a33 48%, #121a2c 100%)`,
                        }}
                      >
                        {h2h ? (
                          <>
                            {/* Header */}
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[8px] font-bold uppercase tracking-widest text-white">H2H Matchup</span>
                              <span className="text-[8px] font-mono text-gray-100">{batterLast} vs {bowlerLast}</span>
                            </div>
                            {/* Stats row */}
                            <div className="grid grid-cols-4 gap-1 mb-1">
                              {[
                                { label: 'DISMISSALS', value: String(h2h.dismissals), accent: wMeta.primaryColor },
                                { label: 'BALLS FACED', value: String(h2h.balls_faced), accent: '#f8fafc' },
                                { label: 'DOT %', value: `${h2h.dot_pct}%`, accent: '#f8fafc' },
                                { label: 'BDRY %', value: `${h2h.boundary_pct}%`, accent: bMeta.primaryColor },
                              ].map(stat => (
                                <div key={stat.label} className="rounded-lg p-1 text-center border border-white/20 shadow-[inset_0_0_0.5px_rgba(255,255,255,0.35)]" style={{ background: 'rgba(10,20,42,0.92)' }}>
                                  <p className="text-[19px] font-black leading-none drop-shadow-[0_0_8px_rgba(255,255,255,0.22)]" style={{ color: stat.accent }}>{stat.value}</p>
                                  <p className="text-[6px] font-bold uppercase tracking-widest text-gray-100 mt-1">{stat.label}</p>
                                </div>
                              ))}
                            </div>
                            {/* Visual pressure bars */}
                            <div className="grid grid-cols-2 gap-1.5 mb-1">
                              <div className="rounded-lg border border-white/20 p-1" style={{ background: 'rgba(10,20,42,0.9)' }}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[7px] font-bold uppercase tracking-wider text-white">Dot-ball pressure</span>
                                  <span className="text-[9px] font-black text-white">{h2h.dot_pct}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-gray-700/70 overflow-hidden">
                                  <div className="h-full rounded-full shadow-[0_0_10px_rgba(255,255,255,0.3)]" style={{ width: `${Math.min(100, Math.max(0, h2h.dot_pct))}%`, backgroundColor: wMeta.primaryColor }} />
                                </div>
                              </div>
                              <div className="rounded-lg border border-white/20 p-1" style={{ background: 'rgba(10,20,42,0.9)' }}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[7px] font-bold uppercase tracking-wider text-white">Boundary threat</span>
                                  <span className="text-[9px] font-black text-white">{h2h.boundary_pct}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-gray-700/70 overflow-hidden">
                                  <div className="h-full rounded-full shadow-[0_0_10px_rgba(255,255,255,0.3)]" style={{ width: `${Math.min(100, Math.max(0, h2h.boundary_pct))}%`, backgroundColor: bMeta.primaryColor }} />
                                </div>
                              </div>
                            </div>
                            {/* Last 5 encounters */}
                            <div className="rounded-lg border border-white/20 p-1" style={{ background: 'rgba(10,20,42,0.9)' }}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[7px] text-white font-bold uppercase tracking-wider shrink-0">Last 5</span>
                                <span className="text-[7px] text-gray-100">W = bowler wicket</span>
                              </div>
                              <div className="flex gap-1.5">
                                {h2h.last_5.map((r, j) => (
                                  <span
                                    key={j}
                                    className="w-[22px] h-[22px] rounded-md text-[8px] font-black flex items-center justify-center border border-white/20 shadow-[0_0_8px_rgba(255,255,255,0.15)]"
                                    style={{
                                      background: r === 'W' ? `${wMeta.primaryColor}88` : `${bMeta.primaryColor}66`,
                                      color: r === 'W' ? '#ffffff' : '#ffffff',
                                    }}
                                  >{r === 'W' ? 'W' : '—'}</span>
                                ))}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <p className="text-[9px] text-gray-500">No H2H data available</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      ) : null}

      {/* SixSense Edge Score™ */}
      {edgeScore && prediction && (() => {
        const edge = edgeScore;
        const f1 = edge.factors.team1;
        const f2 = edge.factors.team2;
        const edgeAbs = Math.abs(edge.net_edge);
        const total = edge.team1_score + edge.team2_score;
        const t1Pct = total > 0 ? (edge.team1_score / total) * 100 : 50;
        const isT1Edge = edge.edge_team === prediction.team1;

        const barColor1 = teamColor1;
        const barColor2 = teamColor2;

        const factors = [
          {
            label: 'Form',
            desc: 'Recent win rate',
            v1: f1.form,
            v2: f2.form,
          },
          {
            label: 'Momentum',
            desc: 'Win streak & margins',
            v1: f1.momentum,
            v2: f2.momentum,
          },
          {
            label: 'Pressure',
            desc: 'Series stakes',
            v1: f1.pressure,
            v2: f2.pressure,
          },
          {
            label: 'Odds',
            desc: 'Bookmaker signal',
            v1: f1.market,
            v2: f2.market,
          },
        ];

        // Count factor wins per team
        const t1Wins = factors.filter(f => f.v1 > f.v2).length;
        const t2Wins = factors.filter(f => f.v2 > f.v1).length;

        return (
          <motion.div
            className="bg-gradient-to-br from-gray-900/90 to-cricket-950/90 backdrop-blur-xl rounded-2xl p-5 border border-cricket-600/30 mb-4"
            {...fadeUp}
            transition={{ delay: 0.18 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="8,1 15,5 15,11 8,15 1,11 1,5" /></svg>
                Who has the edge?
              </h2>
              <span className="text-[9px] text-gray-300 bg-gray-800/60 px-2 py-0.5 rounded-full">
                SixSense Edge Score™
              </span>
            </div>
            <p className="text-[9px] text-gray-300 mb-4 pl-5">Based on form, venue, rankings & head-to-head stats</p>

            {/* Tug-of-war bar */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold" style={{ color: isT1Edge && edgeAbs > 5 ? barColor1 : '#e5e7eb', textShadow: '0 0 4px rgba(0,0,0,0.7)' }}>{prediction.team1}</span>
                <span className="text-xs font-bold" style={{ color: !isT1Edge && edgeAbs > 5 ? barColor2 : '#e5e7eb', textShadow: '0 0 4px rgba(0,0,0,0.7)' }}>{prediction.team2}</span>
              </div>
              <div className="h-8 rounded-full overflow-hidden flex bg-gray-800/40 border border-white/10 gap-[2px]">
                <motion.div
                  className="h-full rounded-l-full"
                  style={{ backgroundColor: barColor1, boxShadow: `0 0 8px ${barColor1}40` }}
                  initial={{ width: '50%' }}
                  animate={{ width: `${t1Pct}%` }}
                  transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
                />
                <motion.div
                  className="h-full rounded-r-full"
                  style={{ backgroundColor: barColor2, boxShadow: `0 0 8px ${barColor2}40` }}
                  initial={{ width: '50%' }}
                  animate={{ width: `${100 - t1Pct}%` }}
                  transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
                />
              </div>
              <div className="flex justify-between mt-1.5 px-0.5">
                <span className="text-[11px] font-bold" style={{ color: barColor1 }}>{Math.round(t1Pct)}%</span>
                <span className="text-[11px] font-bold" style={{ color: barColor2 }}>{Math.round(100 - t1Pct)}%</span>
              </div>
            </div>

            {/* Factor rows — who wins each */}
            <div className="space-y-2 mb-4">
              {factors.map(({ label, desc, v1, v2 }) => {
                const diff = v1 - v2;
                const isEven = Math.abs(diff) < 3;
                const t1Leads = diff > 0;
                const barPct = total > 0 ? (v1 / (v1 + v2)) * 100 : 50;

                return (
                  <div key={label} className="flex items-center gap-3">
                    {/* Factor label */}
                    <div className="w-24 shrink-0">
                      <div className="text-[10px] font-semibold text-gray-100 leading-tight">{label}</div>
                      <div className="text-[8px] text-gray-300 leading-tight">{desc}</div>
                    </div>

                    {/* Score left */}
                    <span className="text-[10px] font-bold w-6 text-right shrink-0" style={{ color: !isEven && t1Leads ? barColor1 : '#cbd5e1', textShadow: '0 0 4px rgba(0,0,0,0.7)' }}>
                      {Math.round(v1)}
                    </span>

                    {/* Mini tug bar */}
                    <div className="flex-1 h-3.5 rounded-full overflow-hidden flex bg-gray-800/40 border border-white/[0.06] gap-[1px]">
                      <motion.div
                        className="h-full rounded-l-full"
                        style={{ backgroundColor: barColor1, opacity: isEven ? 0.6 : t1Leads ? 1 : 0.5 }}
                        initial={{ width: '50%' }}
                        animate={{ width: `${barPct}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.5 }}
                      />
                      <motion.div
                        className="h-full rounded-r-full"
                        style={{ backgroundColor: barColor2, opacity: isEven ? 0.6 : !t1Leads ? 1 : 0.5 }}
                        initial={{ width: '50%' }}
                        animate={{ width: `${100 - barPct}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.5 }}
                      />
                    </div>

                    {/* Score right */}
                    <span className="text-[10px] font-bold w-6 shrink-0" style={{ color: !isEven && !t1Leads ? barColor2 : '#cbd5e1', textShadow: '0 0 4px rgba(0,0,0,0.7)' }}>
                      {Math.round(v2)}
                    </span>
                  </div>
                );
              })}
            </div>

          </motion.div>
        );
      })()}

      {/* Research Notes + Key Players to Watch */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">        {/* Key Players to Watch (ESPN H2H Leaders) */}
        {(espnData?.series_leaders?.length ?? 0) > 0 && (
          <motion.div
            className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-5 border border-cricket-800/30"
            {...fadeUp}
            transition={{ delay: 0.29 }}
          >
            <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="5" r="3" /><path d="M2 14c0-3 3-5 6-5s6 2 6 5" /></svg>
              Key Players to Watch
            </h2>
            <div className="space-y-1.5">
              {espnData!.series_leaders.map((leader, i) => {
                const isBatting = leader.category.toLowerCase().includes('run');
                const localImg = playerImageMap.get(leader.player_name.toLowerCase()) || playerImageMap.get(leader.player_name.split(' ').pop()?.toLowerCase() ?? '');
                const imgUrl = localImg || leader.headshot_url;
                return (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/30 border border-gray-800/50">
                    {imgUrl ? (
                      <img src={imgUrl} alt={leader.player_name} className="w-8 h-8 rounded-full object-cover ring-1 ring-gray-700 flex-shrink-0" />
                    ) : (
                      <span className="w-8 h-8 rounded-full bg-cricket-500/15 flex items-center justify-center flex-shrink-0">
                        {isBatting ? <BatIcon className="w-3.5 h-3.5 text-cricket-400" /> : <BowlIcon className="w-3.5 h-3.5 text-orange-400" />}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-white truncate">{leader.player_name}</p>
                      <p className="text-[8px] text-gray-300 truncate">{leader.team_abbr}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-[11px] font-bold ${isBatting ? 'text-cricket-400' : 'text-orange-400'}`}>{leader.value}</p>
                      <p className="text-[7px] text-gray-300 uppercase">{leader.category}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[7px] text-gray-400 mt-2 text-center">H2H career stats via ESPN Cricinfo</p>
          </motion.div>
        )}

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
              {expertPreview && (
                <p className="text-xs text-gray-300 leading-relaxed mb-3">{visiblePreview}</p>
              )}

              {visibleUpdates.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {visibleUpdates.map((update, index) => {
                    const statusText = update.status?.toLowerCase() ?? '';
                    const dot = statusText.match(/fit|available|ready|cleared|playing|train/)
                      ? 'bg-emerald-400'
                      : statusText.match(/doubt|uncertain|monitor|assess|possible/)
                      ? 'bg-amber-400'
                      : statusText.match(/out|ruled|miss|injur|withdraw/)
                      ? 'bg-red-400'
                      : 'bg-gray-500';
                    return (
                      <div
                        key={`${update.player ?? 'update'}-${index}`}
                        className="flex items-start gap-2 rounded-lg bg-gray-800/40 border border-gray-700/30 px-3 py-2"
                      >
                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                        <div>
                          <span className="text-[10px] font-bold text-white">{update.player ?? update.team ?? 'Update'}</span>
                          <span className="text-[10px] text-gray-400 ml-1.5">{update.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {visibleSources.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {visibleSources.map((source, index) => (
                    <a
                      key={`${source.url ?? source.title}-${index}`}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[9px] font-semibold text-cricket-400 hover:text-cricket-300 bg-cricket-400/8 hover:bg-cricket-400/15 border border-cricket-400/20 px-2 py-0.5 rounded-full transition-colors"
                    >
                      <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 2H2a1 1 0 00-1 1v5a1 1 0 001 1h5a1 1 0 001-1V6M6 1h3v3M9 1L5 5"/></svg>
                      {source.source || `[${index + 1}]`}
                    </a>
                  ))}
                </div>
              )}
              {researchNeedsAccordion && (
                <button
                  type="button"
                  onClick={() => setExpandedSections((prev) => ({ ...prev, researchNotes: !prev.researchNotes }))}
                  className="mt-3 text-[10px] font-medium text-cricket-300 hover:text-cricket-200 transition-colors"
                >
                  {expandedSections.researchNotes ? 'Show less' : 'Show more'}
                </button>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-300 text-center py-4">Research data not available</p>
          )}
        </motion.div>
      </div>

      {/* 3. Toss Insight | Squad — side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
        {/* Toss — AI-generated insight (2/5) */}
        <div className="lg:col-span-2">
          {prediction ? (
            <motion.div
              className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-4 border border-cricket-800/30 h-full flex flex-col"
              {...fadeUp}
              transition={{ delay: 0.35 }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M5 6h6M5 10h6" /></svg>
                  <h2 className="text-xs font-bold text-white uppercase tracking-wider">Toss Factor</h2>
                </div>
                {(() => {
                  const insight = prediction.toss_insight || enrichment?.toss_insight || '';
                  const level = insight.match(/significant|decisive|key|crucial|critical|huge|major/i)
                    ? { label: 'HIGH', color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' }
                    : insight.match(/slight|minor|some|modest|factor|matters/i)
                    ? { label: 'MED', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)' }
                    : { label: 'LOW', color: '#6b7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.25)' };
                  return (
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ color: level.color, background: level.bg, border: `1px solid ${level.border}` }}>
                      Impact · {level.label}
                    </span>
                  );
                })()}
              </div>
              <p className="text-xs text-gray-300 leading-relaxed flex-1">
                {prediction.toss_insight || enrichment?.toss_insight || 'Toss analysis not available for this match.'}
              </p>
              <p className="text-[9px] text-gray-500 mt-3 flex items-center gap-1">
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="6" r="5"/><path d="M6 3v3l2 1"/></svg>
                AI analysis · {espnData?.venue_name || enrichment?.venue_name || match.venue || 'venue'}
              </p>
            </motion.div>
          ) : (
            <motion.div
              className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-4 border border-gray-800/20 opacity-50 h-full"
              {...fadeUp}
              transition={{ delay: 0.35 }}
            >
              <h2 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Toss Factor</h2>
              <p className="text-xs text-gray-300 text-center py-4">Prediction pending</p>
            </motion.div>
          )}
        </div>

        {/* Squad — wider (3/5), clean avatar grid */}
        <motion.div
          className={`lg:col-span-3 bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl overflow-hidden border transition-all ${
            squads.length > 0 || hasSquadOrXi ? 'border-cricket-800/30' : 'border-gray-800/20 opacity-50'
          }`}
          {...fadeUp}
          transition={{ delay: 0.4 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="5" cy="4" r="2.5" /><circle cx="11" cy="4" r="2.5" /><path d="M1 13c0-2.2 1.8-4 4-4s4 1.8 4 4" /><path d="M8 13c0-2.2 1.3-4 3-4s3 1.8 3 4" /></svg>
              Squad
            </h2>
            {squads.length > 0 && (
              <span className="text-[9px] text-gray-400 uppercase tracking-wider">
                {squads.some(s => s.is_confirmed) ? 'Confirmed XI' : 'Probable'}
              </span>
            )}
          </div>

          {squads.length > 0 ? (
            <div className="divide-y divide-gray-800/40">
              {squads.map((squad) => {
                const meta = squad.team.toLowerCase().includes(displayTeam1.toLowerCase()) ? team1Meta : team2Meta;
                const teamDisplay = squad.team.toLowerCase().includes(displayTeam1.toLowerCase()) ? displayTeam1 : displayTeam2;
                const players = (squad.players ?? []).slice(0, 11);

                return (
                  <div key={squad.team}>
                    {/* Team strip */}
                    <div className="flex items-center gap-2 px-4 py-2" style={{ borderLeft: `3px solid ${meta.primaryColor}`, background: `${meta.primaryColor}10` }}>
                      <div className="w-4 h-4 rounded-full overflow-hidden flex-shrink-0">
                        {meta.countryCode ? (
                          <img src={getFlagUrl(meta.countryCode, 16)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full" style={{ backgroundColor: meta.primaryColor }} />
                        )}
                      </div>
                      <span className="text-[11px] font-black text-white">{teamDisplay}</span>
                    </div>

                    {/* Avatar grid */}
                    <div className="grid grid-cols-5 sm:grid-cols-6 gap-2 px-4 py-3">
                      {players.map((player) => {
                        const RoleIcon = player.is_keeper ? KeeperIcon :
                          player.role?.includes('All') ? AllRounderIcon :
                          player.role?.includes('Bowl') ? BowlIcon : BatIcon;
                        const roleColor = player.is_keeper ? '#a78bfa'
                          : player.role?.includes('All') ? '#34d399'
                          : player.role?.includes('Bowl') ? '#fb923c'
                          : '#60a5fa';
                        return (
                          <div key={player.id || player.name} className="flex flex-col items-center gap-1">
                            <div className="relative">
                              {player.image_url ? (
                                <img
                                  src={player.image_url}
                                  alt={player.name}
                                  className="w-11 h-11 rounded-full object-cover"
                                  style={{ boxShadow: `0 0 0 2px ${roleColor}66` }}
                                />
                              ) : (
                                <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: `${roleColor}15`, boxShadow: `0 0 0 2px ${roleColor}44` }}>
                                  <RoleIcon className="w-4 h-4" style={{ color: roleColor }} />
                                </span>
                              )}
                              {player.is_captain && (
                                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-yellow-400 flex items-center justify-center text-[7px] font-black text-gray-900 leading-none">C</span>
                              )}
                            </div>
                            <span className="text-[8px] text-gray-400 text-center leading-tight w-full truncate px-0.5">{player.name.split(' ').pop()}</span>
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
                    {meta.countryCode ? (
                      <img src={getFlagUrl(meta.countryCode, 16)} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full" style={{ backgroundColor: meta.primaryColor }} />
                    )}
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
          <p className="text-[10px] text-gray-300 text-center py-4">Squad not available yet</p>
        )}
        </motion.div>
      </div>

      {/* 4. Head to Head (ESPN data) */}
      {espnData && h2hGames.length > 0 && (
        <div className="grid grid-cols-1 gap-4 mb-4">
          <motion.div
            className="bg-gradient-to-br from-gray-900/80 to-cricket-950/80 backdrop-blur-xl rounded-2xl p-4 border border-cricket-800/30"
            {...fadeUp}
            transition={{ delay: 0.55 }}
          >
            {/* Header + win record summary */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-cricket-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 3v10M12 3v10M4 8h8" /></svg>
                Head to Head
              </h2>
              {(() => {
                const last5 = h2hGames.slice(0, 5);
                const t1wins = last5.filter(g => {
                  const w = g.teams.find(t => t.winner);
                  return w && (w.abbreviation === team1Meta.shortName || w.abbreviation === prediction?.team1);
                }).length;
                const t2wins = last5.length - t1wins;
                return (
                  <div className="flex items-center gap-2 text-[10px] font-black">
                    <span style={{ color: teamColor1 }}>{team1Meta.shortName} {t1wins}</span>
                    <span className="text-gray-600">—</span>
                    <span style={{ color: teamColor2 }}>{t2wins} {team2Meta.shortName}</span>
                    <span className="text-gray-500 font-normal ml-1">last {last5.length}</span>
                  </div>
                );
              })()}
            </div>

            {/* Win proportion bar */}
            {(() => {
              const last5 = h2hGames.slice(0, 5);
              const t1wins = last5.filter(g => {
                const w = g.teams.find(t => t.winner);
                return w && (w.abbreviation === team1Meta.shortName || w.abbreviation === prediction?.team1);
              }).length;
              const t1Pct = Math.round((t1wins / last5.length) * 100);
              return (
                <div className="flex h-1.5 rounded-full overflow-hidden mb-4 gap-0.5">
                  <div className="rounded-full transition-all" style={{ width: `${t1Pct}%`, backgroundColor: teamColor1 }} />
                  <div className="flex-1 rounded-full" style={{ backgroundColor: teamColor2 }} />
                </div>
              );
            })()}

            <div className="space-y-1.5">
              {h2hGames.slice(0, 5).map((game, i) => {
                const winner = game.teams.find(t => t.winner);
                const isTeam1Win = winner && (winner.abbreviation === team1Meta.shortName || winner.abbreviation === prediction?.team1);
                const winColor = isTeam1Win ? teamColor1 : teamColor2;
                return (
                  <div key={i} className="flex items-center gap-3 text-[10px] px-2.5 py-2 rounded-lg" style={{ background: winner ? `${winColor}10` : 'rgba(255,255,255,0.03)', borderLeft: winner ? `2px solid ${winColor}` : '2px solid transparent' }}>
                    <span className="text-gray-500 w-14 shrink-0 tabular-nums">{game.date ? new Date(game.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' }) : '?'}</span>
                    <div className="flex-1 flex items-center gap-1 min-w-0">
                      {game.teams.map((t, j) => {
                        const isT1 = t.abbreviation === team1Meta.shortName || t.abbreviation === prediction?.team1;
                        const tColor = isT1 ? teamColor1 : teamColor2;
                        return (
                          <span key={j} className="truncate" style={{ color: t.winner ? tColor : '#6b7280', fontWeight: t.winner ? 700 : 400 }}>
                            {t.abbreviation} {t.score}{j < game.teams.length - 1 ? ' vs ' : ''}
                          </span>
                        );
                      })}
                    </div>
                    {winner && (
                      <span className="text-[9px] font-black shrink-0 px-1.5 py-0.5 rounded" style={{ color: winColor, background: `${winColor}20` }}>
                        {winner.abbreviation} ✓
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}