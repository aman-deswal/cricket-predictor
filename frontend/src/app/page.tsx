'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getMatchSection, getUpcomingMatches, MatchSection, MatchWithPredictions } from '@/lib/supabase';
import { MatchCard } from '@/components/MatchCard';
import { CricketLoader } from '@/components/CricketLoader';
import { getTeamMeta, getFlagUrl, getFlag2xUrl } from '@/lib/teams';
import Link from 'next/link';

const SECTIONS: MatchSection[] = ['International', 'League', 'Other'];

function getPrimaryPrediction(match: MatchWithPredictions) {
  return Array.isArray(match.predictions) ? match.predictions[0] ?? null : match.predictions ?? null;
}

function getMatchTimestamp(match: MatchWithPredictions): number {
  const raw = match.date.endsWith('Z') || match.date.includes('+') ? match.date : `${match.date}Z`;
  const timestamp = new Date(raw).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function getDataRichnessScore(match: MatchWithPredictions): number {
  const prediction = getPrimaryPrediction(match);
  const signals = match.spotlight_signals;
  return [
    prediction ? 35 : 0,
    match.bookmaker_odds ? 30 : 0,
    signals?.has_expert_preview ? 25 : 0,
    signals?.has_espn_context ? 20 : 0,
    signals?.enrichment_confidence === 'high' ? 18 : signals?.enrichment_confidence === 'medium' ? 10 : 0,
    Math.min((signals?.h2h_match_count ?? 0) * 4, 20),
    Math.min((signals?.source_link_count ?? 0) * 5, 20),
    Math.min((signals?.key_player_count ?? 0) * 4, 20),
    Math.min((signals?.possible_xi_player_count ?? 0) * 2, 20),
    Math.min((signals?.player_update_count ?? 0) * 3, 12),
    Math.min(((match.team1_recent_form?.length ?? 0) + (match.team2_recent_form?.length ?? 0)) * 2, 20),
  ].reduce((sum, score) => sum + score, 0);
}

function getSpotlightScore(match: MatchWithPredictions): number {
  const prediction = getPrimaryPrediction(match);
  const kickoff = getMatchTimestamp(match);
  const hoursAway = Math.max(0, (kickoff - Date.now()) / (1000 * 60 * 60));
  const soonScore = Math.max(0, 12 - Math.min(hoursAway, 12));
  const section = getMatchSection(match);
  const popularityScore = section === 'International' ? 240 : section === 'League' ? 170 : 0;
  const dataRichnessScore = getDataRichnessScore(match);
  const confidenceScore = prediction?.confidence === 'high' ? 45 : prediction?.confidence === 'medium' ? 25 : prediction ? 8 : 0;
  const edgeScore = prediction && match.bookmaker_odds
    ? Math.max(
        0,
        Math.round((prediction.team1_win_probability - 1 / match.bookmaker_odds.team1_odds) * 100),
        Math.round((prediction.team2_win_probability - 1 / match.bookmaker_odds.team2_odds) * 100)
      )
    : 0;

  return popularityScore + dataRichnessScore + confidenceScore + Math.min(edgeScore, 30) + soonScore;
}

/** Spotlight hero for the highest-ranked upcoming match */
function FeaturedHero({ match }: { match: MatchWithPredictions }) {
  const prediction = getPrimaryPrediction(match);
  const team1Meta = getTeamMeta(match.team1);
  const team2Meta = getTeamMeta(match.team2);
  const winner = prediction?.predicted_winner;

  const ev1 = prediction && match.bookmaker_odds
    ? Math.round((prediction.team1_win_probability - 1 / match.bookmaker_odds.team1_odds) * 100)
    : 0;
  const ev2 = prediction && match.bookmaker_odds
    ? Math.round((prediction.team2_win_probability - 1 / match.bookmaker_odds.team2_odds) * 100)
    : 0;
  // Always pick the team with POSITIVE edge (AI thinks they're underpriced by market)
  const valueIsT1 = ev1 >= ev2 && ev1 >= 7;
  const valueIsT2 = !valueIsT1 && ev2 >= 7;
  const hasEdge = valueIsT1 || valueIsT2;
  const edgePct  = valueIsT1 ? ev1 : ev2;
  const edgeTeam = valueIsT1 ? team1Meta.shortName : team2Meta.shortName;
  const edgeAiPct      = valueIsT1 ? Math.round((prediction?.team1_win_probability ?? 0) * 100) : Math.round((prediction?.team2_win_probability ?? 0) * 100);
  const edgeImpliedPct = valueIsT1
    ? Math.round((1 / (match.bookmaker_odds?.team1_odds ?? 1)) * 100)
    : Math.round((1 / (match.bookmaker_odds?.team2_odds ?? 1)) * 100);

  function decimalToAmerican(d: number): string {
    if (d <= 1) return '-';
    if (d >= 2) return '+' + Math.round((d - 1) * 100);
    return Math.round(-100 / (d - 1)).toString();
  }

  return (
    <Link href={`/predict?id=${encodeURIComponent(match.match_id)}`} className="block group">
      <motion.div
        className="relative rounded-2xl overflow-hidden border border-white/[0.08] mb-10"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        whileHover={{ scale: 1.008 }}
      >
        {/* Dual-team color wash — left and right bleeds */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(105deg, ${team1Meta.primaryColor}22 0%, #111008 40%, #111008 60%, ${team2Meta.primaryColor}22 100%)`,
          }}
        />
        {/* Top neon line */}
        <div className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: `linear-gradient(90deg, ${team1Meta.primaryColor}, ${team2Meta.primaryColor})` }}
        />

        <div className="relative px-5 py-5 sm:px-8 sm:py-6">
          {/* Row 1: unified spotlight label + match context */}
          <div className="flex items-center gap-2 mb-4">
            <motion.span
              className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.2em] text-amber-200 bg-amber-500/10 border border-amber-400/30 px-2.5 py-1 rounded-full shadow-[0_0_18px_rgba(251,191,36,0.12)]"
              animate={{ opacity: [1, 0.75, 1] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            >
              ✦ Spotlight Game
            </motion.span>
            {match.bookmaker_odds && (
              <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.2em] text-orange-300 bg-orange-500/10 border border-orange-500/25 px-2.5 py-1 rounded-full">
                🔥 Best Bet
              </span>
            )}
            <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest">
              {match.match_type} · {match.venue?.split(',')[0]}
            </span>
            {hasEdge && (
              <span
                className="ml-auto text-[9px] font-bold tabular-nums text-emerald-400 cursor-help"
                title={`${edgeTeam}: AI says ${edgeAiPct}% win chance, bookmaker implies ${edgeImpliedPct}%. Our model sees +${edgePct}% extra value here.`}
              >
                ↑ AI Edge +{edgePct}%
              </span>
            )}
          </div>

          {/* Row 2: Teams + chart */}
          <div className="flex items-center gap-4 sm:gap-8">
            {/* Team 1 */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <motion.div
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden flex-shrink-0 ring-2 shadow-xl"
                style={{ ['--tw-ring-color' as string]: winner === match.team1 ? team1Meta.primaryColor : 'rgba(255,255,255,0.1)' }}
                whileHover={{ scale: 1.1 }}
              >
                {team1Meta.countryCode ? (
                  <img src={getFlagUrl(team1Meta.countryCode, 64)} srcSet={`${getFlag2xUrl(team1Meta.countryCode, 64)} 2x`} alt={match.team1} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-black text-white text-sm" style={{ backgroundColor: team1Meta.primaryColor }}>
                    {team1Meta.shortName.slice(0, 3)}
                  </div>
                )}
              </motion.div>
              <div className="min-w-0">
                <p className="text-base sm:text-lg font-black text-white leading-none">{team1Meta.shortName}</p>
                {prediction && (
                  <p className="text-2xl sm:text-3xl font-black tabular-nums mt-0.5 leading-none"
                     style={{ color: team1Meta.primaryColor }}>
                    {(prediction.team1_win_probability * 100).toFixed(0)}%
                  </p>
                )}
                {match.bookmaker_odds && (
                  <p className="text-[10px] font-mono text-gray-500 mt-1">
                    {decimalToAmerican(match.bookmaker_odds.team1_odds)}
                  </p>
                )}
              </div>
            </div>

            {/* Center VS */}
            <div className="flex flex-col items-center flex-shrink-0 px-2">
              <span className="text-xs font-black text-gray-700 uppercase tracking-widest">vs</span>
            </div>

            {/* Team 2 */}
            <div className="flex items-center gap-3 flex-1 min-w-0 justify-end">
              <div className="min-w-0 text-right">
                <p className="text-base sm:text-lg font-black text-white leading-none">{team2Meta.shortName}</p>
                {prediction && (
                  <p className="text-2xl sm:text-3xl font-black tabular-nums mt-0.5 leading-none"
                     style={{ color: team2Meta.primaryColor }}>
                    {(prediction.team2_win_probability * 100).toFixed(0)}%
                  </p>
                )}
                {match.bookmaker_odds && (
                  <p className="text-[10px] font-mono text-gray-500 mt-1">
                    {decimalToAmerican(match.bookmaker_odds.team2_odds)}
                  </p>
                )}
              </div>
              <motion.div
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden flex-shrink-0 ring-2 shadow-xl"
                style={{ ['--tw-ring-color' as string]: winner === match.team2 ? team2Meta.primaryColor : 'rgba(255,255,255,0.1)' }}
                whileHover={{ scale: 1.1 }}
              >
                {team2Meta.countryCode ? (
                  <img src={getFlagUrl(team2Meta.countryCode, 64)} srcSet={`${getFlag2xUrl(team2Meta.countryCode, 64)} 2x`} alt={match.team2} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-black text-white text-sm" style={{ backgroundColor: team2Meta.primaryColor }}>
                    {team2Meta.shortName.slice(0, 3)}
                  </div>
                )}
              </motion.div>
            </div>
          </div>

          {/* Probability bar */}
          {prediction && (
            <div className="mt-4 w-full h-1 rounded-full overflow-hidden flex bg-white/[0.05]">
              <motion.div className="h-full rounded-l-full" style={{ backgroundColor: team1Meta.primaryColor }}
                initial={{ width: 0 }} animate={{ width: `${prediction.team1_win_probability * 100}%` }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }} />
              <motion.div className="h-full rounded-r-full" style={{ backgroundColor: team2Meta.primaryColor }}
                initial={{ width: 0 }} animate={{ width: `${prediction.team2_win_probability * 100}%` }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }} />
            </div>
          )}

          {/* CTA hint */}
          <p className="mt-3 text-[9px] text-gray-600 text-right group-hover:text-gray-500 transition-colors">
            Full breakdown →
          </p>
        </div>
      </motion.div>
    </Link>
  );
}

export default function HomePage() {
  const [matches, setMatches] = useState<MatchWithPredictions[]>([]);
  const [loading, setLoading] = useState(true);

  const featuredMatch = [...matches].sort((a, b) => {
    const scoreDiff = getSpotlightScore(b) - getSpotlightScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return getMatchTimestamp(a) - getMatchTimestamp(b);
  })[0] ?? null;

  const sectionPool = featuredMatch
    ? matches.filter((match) => match.match_id !== featuredMatch.match_id)
    : matches;

  const matchesBySection = SECTIONS.map((section) => ({
    section,
    matches: sectionPool
      .filter((match) => getMatchSection(match) === section)
      .sort((a, b) => {
        const aScore = a.predictions?.length ? 1 : 0;
        const bScore = b.predictions?.length ? 1 : 0;
        return bScore - aScore;
      }),
  })).filter(({ matches }) => matches.length > 0);

  useEffect(() => {
    async function load() {
      try {
        const data = await getUpcomingMatches();
        setMatches(data);
      } catch (err) {
        console.error('Failed to load matches:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <CricketLoader />;

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-black text-white tracking-tight">
          Spotlight <span className="text-cricket-400">Game</span>
        </h1>
        <p className="mt-1 text-xs text-gray-600">
          Featured by popularity, enrichment depth, prediction quality, market coverage, and relevance.
        </p>
      </motion.div>

      {matches.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center text-gray-500 py-20 bg-gradient-to-br from-gray-900/50 to-cricket-950/50 rounded-2xl border border-gray-800/30"
        >
          <p className="text-lg font-medium text-gray-400">No upcoming matches</p>
          <p className="mt-1 text-sm">Check back later for new fixtures</p>
          <p className="mt-2 text-xs text-gray-600">Use the Demo toggle in the nav to load mock fixtures.</p>
        </motion.div>
      ) : (
        <div>
          {/* Spotlight game — the featured match at a glance */}
          {featuredMatch && <FeaturedHero match={featuredMatch} />}

          {/* Section grids */}
          <div className="space-y-12">
            {matchesBySection.map(({ section, matches: sectionMatches }, sectionIdx) => (
              <motion.section
                key={section}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: sectionIdx * 0.12 }}
              >
                <div className="flex items-center gap-3 mb-5">
                  <h2 className="text-sm font-bold text-white uppercase tracking-widest">{section}</h2>
                  <div className="flex-1 h-px bg-gradient-to-r from-cricket-800/40 to-transparent" />
                  <span className="text-[9px] text-gray-700 font-semibold tracking-widest uppercase">
                    {sectionMatches.length} match{sectionMatches.length > 1 ? 'es' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sectionMatches.map((match, idx) => (
                    <MatchCard
                      key={match.match_id}
                      match={match}
                      prediction={Array.isArray(match.predictions) ? match.predictions[0] ?? null : match.predictions ?? null}
                      index={idx}
                      hot={sectionIdx === 0 && idx === 0}
                    />
                  ))}
                </div>
              </motion.section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
