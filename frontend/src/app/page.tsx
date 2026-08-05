'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { getMatchSection, getUpcomingMatches, MATCH_SECTIONS, MatchWithPredictions } from '@/lib/supabase';
import { MatchCard } from '@/components/MatchCard';
import { CricketLoader } from '@/components/CricketLoader';
import { getTeamMeta, getFlagUrl, getFlag2xUrl } from '@/lib/teams';
import { BarChartIcon, BowlIcon } from '@/components/CricketIcons';
import { Logo } from '@/components/Logo';
import Link from 'next/link';

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
  const popularityScore = section === 'International' ? 240 : section !== 'Other' ? 170 : 0;
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

function getMatchDayLabel(date: string): string {
  const raw = date.endsWith('Z') || date.includes('+') ? date : `${date}Z`;
  const kickoff = new Date(raw);
  if (Number.isNaN(kickoff.getTime())) return 'Upcoming';

  const now = new Date();
  const kickoffDay = new Date(kickoff.getFullYear(), kickoff.getMonth(), kickoff.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((kickoffDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return kickoff.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function isMatchToday(match: MatchWithPredictions): boolean {
  return getMatchDayLabel(match.date) === 'Today';
}

function decimalToAmerican(d: number): string {
  if (d <= 1) return '-';
  if (d >= 2) return '+' + Math.round((d - 1) * 100);
  return Math.round(-100 / (d - 1)).toString();
}

function SectionHeading({
  icon,
  children,
  className = '',
  bareIcon = false,
}: {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
  bareIcon?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className={bareIcon
        ? 'inline-flex h-8 w-8 items-center justify-center'
        : 'inline-flex h-8 w-8 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10 text-cricket-300 shadow-[0_0_18px_rgba(251,191,36,0.08)]'
      }>
        {icon}
      </span>
      {children}
    </div>
  );
}

function SixSensePickHeading() {
  return (
    <div className="flex items-center gap-3">
      <div className="shrink-0">
        <Logo size={32} />
      </div>
      <div className="leading-none">
        <p className="text-[10px] font-black uppercase tracking-[0.32em] text-cricket-300">SixSense</p>
        <h1 className="mt-1 text-3xl font-black uppercase tracking-[0.18em] text-white sm:text-4xl">
          Pick
        </h1>
      </div>
    </div>
  );
}

function MatchDiscoveryPanel({
  section,
  sectionMatches,
  sectionIdx,
}: {
  section: string;
  sectionMatches: MatchWithPredictions[];
  sectionIdx: number;
}) {
  return (
    <motion.section
      key={section}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: sectionIdx * 0.1 }}
      className="rounded-2xl border border-white/[0.1] bg-[#171308]/90 p-4 shadow-xl shadow-black/10"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-black text-white uppercase tracking-[0.16em]">{section}</h2>
        <span className="shrink-0 rounded-full border border-cricket-400/30 bg-cricket-400/15 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-cricket-200">
          {sectionMatches.length} match{sectionMatches.length > 1 ? 'es' : ''}
        </span>
      </div>

      <div className="grid gap-4">
        {sectionMatches.map((match, idx) => (
          <MatchCard
            key={match.match_id}
            match={match}
            prediction={getPrimaryPrediction(match)}
            index={idx}
            hot={sectionIdx === 0 && idx === 0}
          />
        ))}
      </div>
    </motion.section>
  );
}

function MatchBoardStrip({
  matches,
}: {
  matches: MatchWithPredictions[];
}) {
  const [activeFilter, setActiveFilter] = useState<'all' | 'live' | 'today' | 'upcoming'>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const tickerRef = useRef<HTMLDivElement>(null);
  const sortedMatches = [...matches].sort((a, b) => getMatchTimestamp(a) - getMatchTimestamp(b));
  const filteredMatches = sortedMatches.filter((match) => {
    if (activeFilter === 'live') return (match.status as string) === 'live';
    if (activeFilter === 'today') return isMatchToday(match);
    if (activeFilter === 'upcoming') return !isMatchToday(match) && (match.status as string) !== 'live';
    return true;
  });
  const predictedCount = matches.filter((match) => Boolean(getPrimaryPrediction(match))).length;
  const oddsCount = matches.filter((match) => Boolean(match.bookmaker_odds)).length;
  const filterOptions: Array<{ key: 'all' | 'live' | 'today' | 'upcoming'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'live', label: 'Live' },
    { key: 'today', label: 'Today' },
    { key: 'upcoming', label: 'Upcoming' },
  ];

  return (
    <section className="rounded-2xl border border-amber-500/25 bg-[#171308]/95 shadow-xl shadow-black/10">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-400/35 bg-gradient-to-br from-amber-400/20 to-amber-900/10 text-cricket-200 shadow-[0_0_24px_rgba(251,191,36,0.12)]">
              <BowlIcon className="h-5 w-5" />
            </span>
            <h2 className="text-base font-black uppercase tracking-[0.18em] text-white">Match center</h2>
          </div>
          <div className="hidden items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-400 sm:flex">
            <span><span className="text-white">{matches.length}</span> upcoming</span>
            <span className="text-gray-700">/</span>
            <span><span className="text-cricket-300">{predictedCount}</span> predicted</span>
            <span className="text-gray-700">/</span>
            <span><span className="text-emerald-300">{oddsCount}</span> odds</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-1 rounded-full border border-white/[0.08] bg-black/20 p-1 sm:flex">
            {filterOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setActiveFilter(option.key);
                  setFiltersOpen(false);
                }}
                className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest transition-colors ${
                  activeFilter === option.key
                    ? 'bg-cricket-400/15 text-cricket-200'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
              filtersOpen
                ? 'border-amber-400/45 bg-amber-400/15 text-amber-200'
                : 'border-amber-400/30 bg-amber-400/10 text-amber-300 hover:border-amber-300/50 hover:text-amber-100'
            }`}
            aria-label="Filter matches by status"
            aria-expanded={filtersOpen}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
          </button>
        </div>
      </div>

      {filtersOpen && (
        <div className="flex flex-wrap gap-2 border-b border-white/[0.07] px-4 py-3">
          {filterOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                setActiveFilter(option.key);
                setFiltersOpen(false);
              }}
              className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors ${
                activeFilter === option.key
                  ? 'border-cricket-400/30 bg-cricket-400/15 text-cricket-200'
                  : 'border-white/[0.1] bg-black/20 text-gray-400'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <div
          ref={tickerRef}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 py-3 pr-16 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden"
          aria-label="Swipe horizontally through upcoming matches"
        >
          {filteredMatches.map((match, index) => {
          const prediction = getPrimaryPrediction(match);
          const team1Meta = getTeamMeta(match.team1);
          const team2Meta = getTeamMeta(match.team2);
          const team1Leads = prediction
            ? prediction.team1_win_probability >= prediction.team2_win_probability
            : false;
          const team2Leads = prediction
            ? prediction.team2_win_probability > prediction.team1_win_probability
            : false;
          const ev1 = prediction && match.bookmaker_odds
            ? Math.round((prediction.team1_win_probability - 1 / match.bookmaker_odds.team1_odds) * 100)
            : 0;
          const ev2 = prediction && match.bookmaker_odds
            ? Math.round((prediction.team2_win_probability - 1 / match.bookmaker_odds.team2_odds) * 100)
            : 0;
          const edgePct = Math.max(ev1, ev2);
          const hasEdge = edgePct >= 7;

          return (
            <Link
              key={match.match_id}
              href={`/predict?id=${encodeURIComponent(match.match_id)}`}
              className={`group min-w-[17rem] snap-start rounded-xl border px-3 py-3 transition-colors hover:border-amber-400/50 hover:bg-amber-400/[0.07] sm:min-w-[18.5rem] ${
                index === 0
                  ? 'border-amber-400/45 bg-amber-400/[0.08]'
                  : 'border-white/[0.08] bg-black/20'
              }`}
            >
              <div className="mb-3 flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="shrink-0 rounded-full border border-cricket-400/25 bg-cricket-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-cricket-300">
                    {match.match_type}
                  </span>
                  {hasEdge && (
                    <span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-300">
                      +{edgePct} edge
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-right text-[10px] font-bold text-gray-300">{getMatchDayLabel(match.date)}</span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className={`truncate text-sm font-black ${team1Leads ? 'text-white' : 'text-gray-300'}`}>
                      {team1Meta.shortName}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-gray-400">
                      {match.bookmaker_odds ? decimalToAmerican(match.bookmaker_odds.team1_odds) : '-'}
                    </span>
                  </span>
                  <span className={`w-12 shrink-0 text-right font-mono text-sm font-black tabular-nums ${team1Leads ? 'text-cricket-300' : 'text-gray-400'}`}>
                    {prediction ? `${Math.round(prediction.team1_win_probability * 100)}%` : '-'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className={`truncate text-sm font-black ${team2Leads ? 'text-white' : 'text-gray-300'}`}>
                      {team2Meta.shortName}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-gray-400">
                      {match.bookmaker_odds ? decimalToAmerican(match.bookmaker_odds.team2_odds) : '-'}
                    </span>
                  </span>
                  <span className={`w-12 shrink-0 text-right font-mono text-sm font-black tabular-nums ${team2Leads ? 'text-cricket-300' : 'text-gray-400'}`}>
                    {prediction ? `${Math.round(prediction.team2_win_probability * 100)}%` : '-'}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2">
                <span className="truncate text-[10px] font-semibold text-gray-400">
                  {getMatchSection(match)}
                </span>
                <span className="text-[10px] font-bold text-gray-300 group-hover:text-amber-200">Open →</span>
              </div>
            </Link>
          );
          })}
          {filteredMatches.length === 0 && (
            <div className="min-w-[17rem] rounded-xl border border-white/[0.08] bg-black/20 px-3 py-6 text-center text-xs font-bold text-gray-400 sm:min-w-[18.5rem]">
              No {activeFilter} matches
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center bg-gradient-to-l from-[#171308] via-[#171308]/90 to-transparent pl-10 pr-3">
          <button
            type="button"
            onClick={() => tickerRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
            className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-400/35 bg-amber-400/15 text-amber-200 shadow-lg shadow-black/20 transition-colors hover:border-amber-300/60 hover:bg-amber-400/25 hover:text-amber-100"
            aria-label="Scroll match center"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
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

  return (
    <Link href={`/predict?id=${encodeURIComponent(match.match_id)}`} className="block group">
      <motion.div
        className="relative rounded-2xl overflow-hidden border border-white/[0.08]"
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
          {/* Row 1: match context */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="rounded-full border border-cricket-400/25 bg-cricket-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-cricket-300">
              {match.match_type}
            </span>
            <span className="text-[10px] font-bold text-gray-200 uppercase tracking-widest">
              {match.venue?.split(',')[0]}
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
                  <p className="text-[10px] font-mono text-gray-300 mt-1">
                    {decimalToAmerican(match.bookmaker_odds.team1_odds)}
                  </p>
                )}
              </div>
            </div>

            {/* Center VS */}
            <div className="flex flex-col items-center flex-shrink-0 px-2">
              <span className="text-xs font-black text-gray-500 uppercase tracking-widest">vs</span>
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
                  <p className="text-[10px] font-mono text-gray-300 mt-1">
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
          <p className="mt-3 text-[9px] font-semibold text-gray-400 text-right group-hover:text-amber-200 transition-colors">
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

  const matchesBySection = MATCH_SECTIONS.map((section) => ({
    section,
    matches: sectionPool
      .filter((match) => getMatchSection(match) === section)
      .sort((a, b) => {
        const aScore = a.predictions?.length ? 1 : 0;
        const bScore = b.predictions?.length ? 1 : 0;
        return bScore - aScore;
      }),
  })).filter(({ matches }) => matches.length > 0);

  const boardMatchCount = matchesBySection.reduce((count, section) => count + section.matches.length, 0);

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
      {matches.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center text-gray-500 py-20 bg-gradient-to-br from-gray-900/50 to-cricket-950/50 rounded-2xl border border-gray-800/30"
        >
          <p className="text-lg font-medium text-gray-400">No upcoming matches</p>
          <p className="mt-1 text-sm">Check back later for new fixtures</p>
          <p className="mt-2 text-xs text-gray-400">Use the Demo toggle in the nav to load mock fixtures.</p>
        </motion.div>
      ) : (
        <div className="space-y-6">
          <MatchBoardStrip matches={matches} />

          {featuredMatch && (
            <section>
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="mb-4"
              >
                <SixSensePickHeading />
              </motion.div>
              <FeaturedHero match={featuredMatch} />
            </section>
          )}

          {/* Match discovery board */}
          <div className="min-w-0">
            <div className="mb-5 flex items-center justify-between gap-3">
              <SectionHeading icon={<BarChartIcon className="h-4 w-4" />}>
                <h2 className="text-lg font-black text-white tracking-tight">Match discovery</h2>
              </SectionHeading>
              <span className="text-[10px] font-bold uppercase tracking-widest text-cricket-300">
                {boardMatchCount} match{boardMatchCount === 1 ? '' : 'es'}
              </span>
            </div>

            {matchesBySection.length > 0 ? (
              <div className="grid gap-5 lg:grid-cols-2">
                {matchesBySection.map(({ section, matches: sectionMatches }, sectionIdx) => (
                  <MatchDiscoveryPanel
                    key={section}
                    section={section}
                    sectionMatches={sectionMatches}
                    sectionIdx={sectionIdx}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[0.1] bg-[#171308]/90 p-6 text-center">
                <p className="text-sm font-bold text-gray-200">Only the spotlight match is available right now.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
