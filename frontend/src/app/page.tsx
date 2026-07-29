'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getMatchSection, getUpcomingMatches, MatchSection, MatchWithPredictions } from '@/lib/supabase';
import { MatchCard } from '@/components/MatchCard';
import { CricketLoader } from '@/components/CricketLoader';
import { getTeamMeta, getFlagUrl, getFlag2xUrl } from '@/lib/teams';
import Link from 'next/link';

const SECTIONS: MatchSection[] = ['International', 'League', 'Other'];

/** Featured hero for the highest-confidence, highest-EV match */
function FeaturedHero({ match }: { match: MatchWithPredictions }) {
  const prediction = Array.isArray(match.predictions) ? match.predictions[0] ?? null : match.predictions ?? null;
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
          {/* Row 1: label + badge */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.2em] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full">
                ⚡ Best Bet
              </span>
              <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest">{match.match_type} · {match.venue?.split(',')[0]}</span>
            </div>
            {hasEdge && (
              <motion.span
                className="flex items-center gap-1 text-[10px] font-black tabular-nums px-2.5 py-1 rounded-full border cursor-help text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
                animate={{ opacity: [1, 0.7, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                title={`${edgeTeam}: AI says ${edgeAiPct}% win chance, bookmaker implies ${edgeImpliedPct}%. Our model sees +${edgePct}% extra value here.`}
              >
                ↑ AI Edge: {edgeTeam} +{edgePct}% vs market
              </motion.span>
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
              {prediction?.confidence && (
                <span className={`mt-1.5 text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                  prediction.confidence === 'high'   ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' :
                  prediction.confidence === 'medium' ? 'text-amber-300 border-amber-500/30 bg-amber-500/10' :
                                                       'text-red-400 border-red-500/25 bg-red-500/10'
                }`}>
                  {prediction.confidence} conf.
                </span>
              )}
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

  const matchesBySection = SECTIONS.map((section) => ({
    section,
    matches: matches
      .filter((match) => getMatchSection(match) === section)
      .sort((a, b) => {
        const aScore = a.predictions?.length ? 1 : 0;
        const bScore = b.predictions?.length ? 1 : 0;
        return bScore - aScore;
      }),
  })).filter(({ matches }) => matches.length > 0);

  // Pick featured match: highest confidence with bookmaker odds (most gamble-worthy)
  const featuredMatch = matches.find(m => {
    const pred = Array.isArray(m.predictions) ? m.predictions[0] : m.predictions;
    return pred?.confidence === 'high' && m.bookmaker_odds;
  }) ?? matches.find(m => {
    const pred = Array.isArray(m.predictions) ? m.predictions[0] : m.predictions;
    return pred != null && m.bookmaker_odds;
  }) ?? matches[0] ?? null;

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
          Up <span className="text-cricket-400">Next</span>
        </h1>
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
          {/* Featured hero pick — the best bet at a glance */}
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
