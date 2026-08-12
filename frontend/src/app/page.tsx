'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { getUpcomingMatches, MatchWithPredictions } from '@/lib/supabase';
import {
  compareMatchCenterMatches,
  compareMatchesByCompetition,
  getCompetitionPriority,
  getCompetitionProfile,
  getMatchTimestamp,
  hasValidMarketOdds,
} from '@/lib/competition';
import { selectFeaturedMatch } from '@/lib/featured-selection';
import { MatchCard } from '@/components/MatchCard';
import { MatchFormatBadge } from '@/components/MatchFormatBadge';
import { CricketLoader } from '@/components/CricketLoader';
import { getTeamMeta, getFlagUrl, isInternationalTeam } from '@/lib/teams';
import { getFranchiseLogoUrl } from '@/lib/franchise-logos';
import { BowlIcon, GroundsIcon } from '@/components/CricketIcons';
import { Logo } from '@/components/Logo';
import Link from 'next/link';

function getPrimaryPrediction(match: MatchWithPredictions) {
  return Array.isArray(match.predictions) ? match.predictions[0] ?? null : match.predictions ?? null;
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

function getMatchDateLabel(date: string): string {
  const raw = date.endsWith('Z') || date.includes('+') ? date : `${date}Z`;
  const kickoff = new Date(raw);
  if (Number.isNaN(kickoff.getTime())) return 'Date TBD';
  return kickoff.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isMatchLive(match: MatchWithPredictions): boolean {
  return String(match.status).toLowerCase() === 'live';
}

function getCountdown(date: string): { days: number; hours: number; mins: number } | null {
  const raw = date.endsWith('Z') || date.includes('+') ? date : `${date}Z`;
  const kickoff = new Date(raw).getTime();
  if (Number.isNaN(kickoff)) return null;

  const diff = kickoff - Date.now();
  if (diff <= 0) return null;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours, mins };
}

function decimalToAmerican(d: number): string {
  if (d <= 1) return '-';
  if (d >= 2) return '+' + Math.round((d - 1) * 100);
  return Math.round(-100 / (d - 1)).toString();
}

function getCompetitionLabel(match: MatchWithPredictions): string {
  return getCompetitionProfile(match).label;
}

function SparseSlateNotice({ matchCount }: { matchCount: number }) {
  if (matchCount > 2) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-500/20 bg-slate-500/[0.05] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-200">Verified slate</p>
        <p className="mt-1 text-sm text-gray-300">
          {matchCount === 1
            ? 'One scheduled match is available right now. SixSense only displays fixtures received from the live schedule feed.'
            : 'Two scheduled matches are available right now. More appear automatically as official fixture feeds publish them.'}
        </p>
      </div>
      <Link
        href="/history"
        className="shrink-0 text-xs font-black uppercase tracking-widest text-amber-600 transition-colors hover:text-amber-500"
      >
        Recent results →
      </Link>
    </div>
  );
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
        ? 'inline-flex h-10 w-10 items-center justify-center'
        : 'inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-500/25 bg-white/[0.04] text-amber-600 shadow-[0_0_18px_rgba(148,163,184,0.08)]'
      }>
        {icon}
      </span>
      {children}
    </div>
  );
}

function SixSensePickHeading() {
  return (
    <SectionHeading icon={<Logo size={40} />} bareIcon>
      <h2 className="text-base font-black uppercase tracking-[0.18em] text-white">
        <span className="text-amber-600">SixSense</span>
        <sup className="ml-0.5 text-[0.55em] tracking-normal text-amber-600">™</sup> Pick
      </h2>
    </SectionHeading>
  );
}

function MatchCenterTeamMark({
  team,
  logoUrl,
}: {
  team: string;
  logoUrl?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const meta = getTeamMeta(team);
  const isInternational = isInternationalTeam(team);
  const imageUrl = !imageFailed
    ? logoUrl || getFranchiseLogoUrl(team) || (isInternational && meta.countryCode ? getFlagUrl(meta.countryCode, 24) : '')
    : '';

  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-[#0f1620] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      aria-hidden="true"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className={`h-full w-full ${isInternational ? 'rounded-lg object-cover' : 'object-contain'}`}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-lg text-[10px] font-black text-white"
          style={{ background: `linear-gradient(145deg, ${meta.primaryColor}, ${meta.secondaryColor})` }}
        >
          {meta.shortName.slice(0, 2)}
        </span>
      )}
    </span>
  );
}

function FeaturedTeamCrest({
  team,
  logoUrl,
  selected,
}: {
  team: string;
  logoUrl?: string;
  selected: boolean;
}) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const meta = getTeamMeta(team);
  const isInternational = isInternationalTeam(team);
  const imageCandidates = [
    logoUrl,
    getFranchiseLogoUrl(team),
    isInternational && meta.countryCode ? getFlagUrl(meta.countryCode, 64) : undefined,
  ].filter((url): url is string => Boolean(url));
  const imageUrl = imageCandidates.find((url) => !failedUrls.includes(url));

  return (
    <motion.div
      className={`h-14 w-14 flex-shrink-0 overflow-hidden ring-2 shadow-xl sm:h-16 sm:w-16 ${
        isInternational ? 'rounded-xl' : 'rounded-full'
      }`}
      style={{ ['--tw-ring-color' as string]: selected ? meta.primaryColor : 'rgba(255,255,255,0.1)' }}
      whileHover={{ scale: 1.1 }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={team}
          className={`h-full w-full bg-slate-950/30 ${
            isInternational ? 'rounded-xl object-cover' : 'object-contain p-1'
          }`}
          onError={() => setFailedUrls((urls) => [...urls, imageUrl])}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center text-sm font-black text-white"
          style={{ backgroundColor: meta.primaryColor }}
        >
          {meta.shortName.slice(0, 3)}
        </div>
      )}
    </motion.div>
  );
}

function MatchDiscoveryPanel({
  competition,
  sectionMatches,
  sectionIdx,
}: {
  competition: string;
  sectionMatches: MatchWithPredictions[];
  sectionIdx: number;
}) {
  const leadMatch = sectionMatches[0];
  const competitionKind = getCompetitionProfile(leadMatch).kind;

  return (
    <motion.section
      key={competition}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: sectionIdx * 0.1 }}
      className="min-w-0 max-w-full"
    >
      <div className="mb-3 px-1">
        <div className="min-w-0">
          <p className="text-[8px] font-black uppercase tracking-[0.22em] text-slate-300">{competitionKind}</p>
          <h2 className="mt-1 min-w-0 truncate text-sm font-black uppercase tracking-[0.12em] text-white">{competition}</h2>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        {sectionMatches.map((match, idx) => (
          <MatchCard
            key={match.match_id}
            match={match}
            prediction={getPrimaryPrediction(match)}
            index={idx}
          />
        ))}
      </div>
    </motion.section>
  );
}

function MatchBoardStrip({
  matches,
  featuredMatchId,
}: {
  matches: MatchWithPredictions[];
  featuredMatchId: string | null;
}) {
  type MatchCenterFilter = 'all' | 'live' | 'today' | 'upcoming';

  const [activeFilter, setActiveFilter] = useState<MatchCenterFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const tickerRef = useRef<HTMLDivElement>(null);
  const sortedMatches = [...matches].sort(compareMatchCenterMatches);
  const filteredMatches = sortedMatches.filter((match) => {
    if (activeFilter === 'live') return isMatchLive(match);
    if (activeFilter === 'today') return isMatchToday(match);
    if (activeFilter === 'upcoming') return !isMatchToday(match) && !isMatchLive(match);
    return true;
  });
  const filterOptions: Array<{ key: MatchCenterFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'live', label: 'Live' },
    { key: 'today', label: 'Today' },
    { key: 'upcoming', label: 'Upcoming' },
  ];
  const selectedFilterLabel = filterOptions.find((option) => option.key === activeFilter)?.label ?? 'All';
  const filteredMatchKey = filteredMatches.map((match) => match.match_id).join('|');

  const updateScrollState = useCallback(() => {
    const ticker = tickerRef.current;
    if (!ticker) return;

    const maxScrollLeft = Math.max(0, ticker.scrollWidth - ticker.clientWidth);
    const edgeTolerance = 8;
    setHasOverflow(maxScrollLeft > edgeTolerance);
    setCanScrollLeft(ticker.scrollLeft > edgeTolerance);
    setCanScrollRight(ticker.scrollLeft < maxScrollLeft - edgeTolerance);
  }, []);

  const scrollTicker = (direction: -1 | 1) => {
    const ticker = tickerRef.current;
    if (!ticker) return;

    const tile = ticker.querySelector<HTMLElement>('[data-match-center-tile]');
    const gap = Number.parseFloat(window.getComputedStyle(ticker).columnGap) || 12;
    ticker.scrollBy({
      left: direction * ((tile?.offsetWidth ?? 288) + gap),
      behavior: 'smooth',
    });
  };

  useEffect(() => {
    const ticker = tickerRef.current;
    if (!ticker) return;

    setCanScrollLeft(false);
    ticker.scrollTo({ left: 0 });
    const frame = window.requestAnimationFrame(updateScrollState);
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(ticker);
    ticker.addEventListener('scroll', updateScrollState, { passive: true });

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      ticker.removeEventListener('scroll', updateScrollState);
    };
  }, [activeFilter, filteredMatchKey, updateScrollState]);

  return (
    <section className="rounded-2xl border border-slate-700/45 bg-[#111820]/95 shadow-xl shadow-black/10">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-500/35 bg-gradient-to-br from-slate-200/12 to-slate-900/10 text-amber-600 shadow-[0_0_24px_rgba(148,163,184,0.12)]">
              <BowlIcon className="h-5 w-5" />
            </span>
            <h2 className="text-base font-black uppercase tracking-[0.18em] text-white">Match center</h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {activeFilter !== 'all' && (
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-600">
              {selectedFilterLabel}
            </span>
          )}
          {hasOverflow && (
            <div className="hidden items-center gap-1 lg:flex">
              <button
                type="button"
                onClick={() => scrollTicker(-1)}
                disabled={!canScrollLeft}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-500/25 bg-white/[0.04] text-slate-200 transition-colors hover:border-slate-300/40 hover:bg-white/[0.07] disabled:cursor-default disabled:border-white/[0.07] disabled:bg-transparent disabled:text-gray-700"
                aria-label="Scroll Match Center left"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 5l-7 7 7 7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => scrollTicker(1)}
                disabled={!canScrollRight}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-500/25 bg-white/[0.04] text-slate-200 transition-colors hover:border-slate-300/40 hover:bg-white/[0.07] disabled:cursor-default disabled:border-white/[0.07] disabled:bg-transparent disabled:text-gray-700"
                aria-label="Scroll Match Center right"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
              filtersOpen
                ? 'border-amber-600/35 bg-amber-600/[0.12] text-amber-600'
                : 'border-slate-500/30 bg-white/[0.04] text-slate-300 hover:border-slate-300/50 hover:text-white'
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
                  ? 'border-amber-600/35 bg-amber-600/[0.12] text-amber-600'
                  : 'border-slate-500/30 bg-white/[0.04] text-slate-300 hover:border-slate-300/50 hover:text-white'
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
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 py-3 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden"
          aria-label="Swipe horizontally through Match Center"
        >
          {filteredMatches.map((match) => {
            const prediction = getPrimaryPrediction(match);
            const team1Meta = getTeamMeta(match.team1);
            const team2Meta = getTeamMeta(match.team2);
            const team1Leads = prediction
              ? prediction.team1_win_probability >= prediction.team2_win_probability
              : false;
            const team2Leads = prediction
              ? prediction.team2_win_probability > prediction.team1_win_probability
              : false;
            const hasMarket = hasValidMarketOdds(match);
            const ev1 = prediction && hasMarket && match.bookmaker_odds
              ? Math.round((prediction.team1_win_probability - 1 / match.bookmaker_odds.team1_odds) * 100)
              : 0;
            const ev2 = prediction && hasMarket && match.bookmaker_odds
              ? Math.round((prediction.team2_win_probability - 1 / match.bookmaker_odds.team2_odds) * 100)
              : 0;
            const edgePct = Math.max(ev1, ev2);
            const hasEdge = hasMarket && edgePct >= 7;
            const edgeTeam = hasEdge ? (ev1 >= ev2 ? 1 : 2) : null;
            const isFeatured = match.match_id === featuredMatchId;

            return (
              <Link
                key={match.match_id}
                href={`/predict?id=${encodeURIComponent(match.match_id)}`}
                data-match-center-tile
                className="group min-w-[17.75rem] snap-start rounded-xl border border-slate-600/35 bg-gradient-to-br from-[#141c25] via-[#101720] to-[#0c1218] px-3 py-3 shadow-[0_14px_26px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.04)] ring-1 ring-white/[0.03] transform-gpu transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-400/45 hover:shadow-[0_18px_36px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.06)] active:translate-y-0 active:shadow-[0_10px_18px_rgba(0,0,0,0.28)] sm:min-w-[18.5rem]"
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-xl bg-white/10" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-xl bg-gradient-to-t from-black/10 to-transparent" />
                <div>
                  <div className="mb-3 flex h-7 items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <MatchFormatBadge match={match} className="text-amber-100" />
                      {isFeatured && (
                        <span
                          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-500/25 bg-white/[0.04] px-1.5"
                          title={hasMarket ? 'SixSense Pick · Market backed' : 'SixSense Projection'}
                          aria-label={hasMarket ? 'SixSense Pick · Market backed' : 'SixSense Projection'}
                        >
                          <Logo size={18} />
                          <span className="leading-none">
                            <span className="block text-[6px] font-black uppercase tracking-[0.2em] text-amber-500">
                              SixSense<sup className="ml-px text-[0.55em] tracking-normal">™</sup>
                            </span>
                            <span className="mt-0.5 block text-[9px] font-black uppercase tracking-[0.12em] text-white">
                              {hasMarket ? 'Pick' : 'Projection'}
                            </span>
                          </span>
                        </span>
                      )}
                    </div>
                    {isMatchLive(match) ? (
                      <span className="shrink-0 rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-right text-[9px] font-black uppercase tracking-widest text-red-200">
                        Live
                      </span>
                    ) : (
                      <span className="shrink-0 text-right text-xs font-bold text-gray-300">{getMatchDateLabel(match.date)}</span>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <MatchCenterTeamMark team={match.team1} logoUrl={match.team1_logo_url} />
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <p
                              className={`shrink-0 text-[18px] font-black leading-none tracking-[0.02em] ${team1Leads ? 'text-white' : 'text-gray-300'}`}
                              title={match.team1}
                            >
                              {team1Meta.shortName}
                            </p>
                            <span
                              className="shrink-0 rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-gray-300"
                              title={hasMarket && match.bookmaker_odds ? `${match.bookmaker_odds.bookmaker} American odds` : 'Sportsbook odds unavailable'}
                            >
                              {hasMarket && match.bookmaker_odds ? decimalToAmerican(match.bookmaker_odds.team1_odds) : '—'}
                            </span>
                            {edgeTeam === 1 && (
                              <span
                                className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-emerald-200"
                                title={`${team1Meta.shortName} has a ${edgePct} percentage point model edge over the market`}
                                aria-label={`${team1Meta.shortName} has a ${edgePct} percentage point model edge over the market`}
                              >
                                +{edgePct} edge
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`w-14 shrink-0 text-right font-mono text-lg font-black tabular-nums ${team1Leads ? 'text-amber-100' : 'text-gray-400'}`}
                        title={team1Leads ? 'SixSense lean: higher model win probability' : 'SixSense model win probability'}
                      >
                        {prediction ? `${Math.round(prediction.team1_win_probability * 100)}%` : '—'}
                      </span>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <MatchCenterTeamMark team={match.team2} logoUrl={match.team2_logo_url} />
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <p
                              className={`shrink-0 text-[18px] font-black leading-none tracking-[0.02em] ${team2Leads ? 'text-white' : 'text-gray-300'}`}
                              title={match.team2}
                            >
                              {team2Meta.shortName}
                            </p>
                            <span
                              className="shrink-0 rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-gray-300"
                              title={hasMarket && match.bookmaker_odds ? `${match.bookmaker_odds.bookmaker} American odds` : 'Sportsbook odds unavailable'}
                            >
                              {hasMarket && match.bookmaker_odds ? decimalToAmerican(match.bookmaker_odds.team2_odds) : '—'}
                            </span>
                            {edgeTeam === 2 && (
                              <span
                                className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-emerald-200"
                                title={`${team2Meta.shortName} has a ${edgePct} percentage point model edge over the market`}
                                aria-label={`${team2Meta.shortName} has a ${edgePct} percentage point model edge over the market`}
                              >
                                +{edgePct} edge
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`w-14 shrink-0 text-right font-mono text-lg font-black tabular-nums ${team2Leads ? 'text-amber-100' : 'text-gray-400'}`}
                        title={team2Leads ? 'SixSense lean: higher model win probability' : 'SixSense model win probability'}
                      >
                        {prediction ? `${Math.round(prediction.team2_win_probability * 100)}%` : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2">
                    <span className="truncate text-[10px] font-semibold text-gray-400">
                      {getCompetitionLabel(match)}
                    </span>
                    <span className="shrink-0 text-[10px] font-bold text-gray-300 transition-colors group-hover:text-white">
                      Open →
                    </span>
                  </div>
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
        {hasOverflow && canScrollRight && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-24 items-center justify-end pr-2 lg:hidden">
            <span
              className="absolute inset-0 bg-gradient-to-l from-[#111820]/95 via-[#111820]/55 to-transparent"
              style={{ maskImage: 'linear-gradient(to left, black 0%, black 58%, transparent 100%)' }}
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => scrollTicker(1)}
              className="pointer-events-auto relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-500/30 bg-slate-200/[0.10] text-slate-100 shadow-[0_8px_24px_rgba(0,0,0,0.45),0_0_18px_rgba(148,163,184,0.08)] backdrop-blur-xl transition-colors active:bg-slate-200/20"
              aria-label="Scroll Match Center right"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
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
  const hasMarket = hasValidMarketOdds(match);
  const getHeroCountdown = useCallback(() => getCountdown(match.date), [match.date]);
  const [countdown, setCountdown] = useState(getHeroCountdown);

  useEffect(() => {
    setCountdown(getHeroCountdown());
    const interval = window.setInterval(() => setCountdown(getHeroCountdown()), 60_000);
    return () => window.clearInterval(interval);
  }, [getHeroCountdown]);

  return (
    <Link href={`/predict?id=${encodeURIComponent(match.match_id)}`} className="group relative block">
      <motion.div
        className="relative min-w-0 w-full max-w-full"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        whileHover={{ y: -5, scale: 1.015 }}
        whileTap={{ scale: 0.98 }}
      >
        <div className="absolute -inset-0.5 rounded-[20px] bg-gradient-to-r from-slate-400/0 via-amber-200/0 to-cyan-400/0 blur-md transition-all duration-500 group-hover:from-slate-400/12 group-hover:via-amber-200/8 group-hover:to-cyan-400/12" />
        <div className="featured-cricket-border relative overflow-hidden rounded-[18px] p-px">
        <div className="relative overflow-hidden rounded-[17px] bg-[#10161d]">
        {/* Dual-team color wash — left and right bleeds */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(105deg, ${team1Meta.primaryColor}18 0%, #10161d 40%, #10161d 60%, ${team2Meta.primaryColor}18 100%)`,
          }}
        />
        {/* Top neon line */}
        <div className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: `linear-gradient(90deg, ${team1Meta.primaryColor}, ${team2Meta.primaryColor})` }}
        />
        <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.02] to-transparent transition-transform duration-[1200ms] group-hover:translate-x-full" />

        <div className="relative px-5 py-5 sm:px-8 sm:py-6">
          {/* Row 1: match context */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <MatchFormatBadge match={match} />
            <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-widest text-slate-200">
              {getCompetitionLabel(match)}
            </span>
            <span className="order-first inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-300 sm:order-none sm:ml-auto sm:w-auto sm:py-0.5">
              <svg className="h-3 w-3 shrink-0 text-amber-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 4v4l3 2" />
              </svg>
              {countdown ? (
                <span className="whitespace-nowrap">
                  Begins in{' '}
                  {countdown.days > 0 && <span className="text-white">{countdown.days}d </span>}
                  <span className="text-white">{String(countdown.hours).padStart(2, '0')}h</span>
                  <span className="text-slate-400"> </span>
                  <span className="text-white">{String(countdown.mins).padStart(2, '0')}m</span>
                </span>
              ) : (
                <span className="whitespace-nowrap">{getMatchDateLabel(match.date)}</span>
              )}
            </span>
          </div>

          {/* Row 2: Teams + chart */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 sm:gap-8">
            {/* Team 1 */}
            <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:gap-3 sm:text-left">
              <FeaturedTeamCrest
                team={match.team1}
                logoUrl={match.team1_logo_url}
                selected={winner === match.team1}
              />
              <div className="min-w-0">
                <p className="text-base sm:text-lg font-black text-white leading-none">{team1Meta.shortName}</p>
                {prediction && (
                  <p className="text-2xl sm:text-3xl font-black tabular-nums mt-0.5 leading-none"
                     style={{ color: team1Meta.primaryColor }}>
                    {(prediction.team1_win_probability * 100).toFixed(0)}%
                  </p>
                )}
                {hasMarket && match.bookmaker_odds && (
                  <p className="text-[10px] font-mono text-slate-300 mt-1">
                    {decimalToAmerican(match.bookmaker_odds.team1_odds)}
                  </p>
                )}
              </div>
            </div>

            {/* Center VS */}
            <div className="flex flex-col items-center flex-shrink-0 px-1 sm:px-2">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">vs</span>
            </div>

            {/* Team 2 */}
            <div className="flex min-w-0 flex-col-reverse items-center gap-2 text-center sm:flex-row sm:justify-end sm:gap-3 sm:text-right">
              <div className="min-w-0">
                <p className="text-base sm:text-lg font-black text-white leading-none">{team2Meta.shortName}</p>
                {prediction && (
                  <p className="text-2xl sm:text-3xl font-black tabular-nums mt-0.5 leading-none"
                     style={{ color: team2Meta.primaryColor }}>
                    {(prediction.team2_win_probability * 100).toFixed(0)}%
                  </p>
                )}
                {hasMarket && match.bookmaker_odds && (
                  <p className="text-[10px] font-mono text-slate-300 mt-1">
                    {decimalToAmerican(match.bookmaker_odds.team2_odds)}
                  </p>
                )}
              </div>
              <FeaturedTeamCrest
                team={match.team2}
                logoUrl={match.team2_logo_url}
                selected={winner === match.team2}
              />
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

          <div className="mt-3 flex items-center justify-between gap-3 text-[9px] font-semibold">
            <span className="min-w-0 truncate text-slate-500">{match.venue || 'Venue TBC'}</span>
            <span className="shrink-0 text-slate-400 transition-colors group-hover:text-white">
              Full breakdown →
            </span>
          </div>
        </div>
        </div>
        </div>
      </motion.div>
    </Link>
  );
}

export default function HomePage() {
  const [matches, setMatches] = useState<MatchWithPredictions[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCompetition, setActiveCompetition] = useState('all');
  const [competitionFiltersOpen, setCompetitionFiltersOpen] = useState(false);

  const featuredMatch = selectFeaturedMatch(matches);

  const sectionPool = matches;

  const competitionGroups = new Map<string, {
    competition: string;
    filterLabel: string;
    priority: number;
    matches: MatchWithPredictions[];
  }>();
  sectionPool.forEach((match) => {
    const profile = getCompetitionProfile(match);
    const group = competitionGroups.get(profile.key);
    if (group) {
      group.matches.push(match);
      return;
    }
    competitionGroups.set(profile.key, {
      competition: profile.label,
      filterLabel: profile.filterLabel,
      priority: profile.priority,
      matches: [match],
    });
  });
  const matchesByCompetition = Array.from(competitionGroups, ([key, group]) => ({
    key,
    ...group,
    matches: group.matches.sort(compareMatchesByCompetition),
  })).sort((a, b) => {
    const priorityDiff = a.priority - b.priority;
    if (priorityDiff !== 0) return priorityDiff;

    const kickoffDiff = getMatchTimestamp(a.matches[0]) - getMatchTimestamp(b.matches[0]);
    if (kickoffDiff !== 0) return kickoffDiff;

    return a.key.localeCompare(b.key);
  });

  const discoveryMatchCount = matchesByCompetition.reduce((count, group) => count + group.matches.length, 0);
  const visibleCompetitionGroups = activeCompetition === 'all'
    ? matchesByCompetition
    : matchesByCompetition.filter((group) => group.key === activeCompetition);
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
    <div className="-mt-4 sm:mt-0">
      {matches.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="overflow-hidden rounded-2xl border border-slate-600/25 bg-gradient-to-br from-[#111820] to-slate-950/60 px-6 py-14 text-center"
        >
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-500/25 bg-white/[0.04] text-amber-100">
            <BowlIcon className="h-6 w-6" />
          </div>
          <p className="text-lg font-black text-white">The next slate has not landed yet</p>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-gray-400">
            SixSense only publishes scheduled fixtures received from its cricket feeds. New matches will appear here automatically when they are available.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link href="/history" className="rounded-lg border border-slate-500/25 bg-white/[0.04] px-4 py-2 text-xs font-black uppercase tracking-widest text-amber-100">
              Review recent picks
            </Link>
            <Link href="/dashboard" className="px-3 py-2 text-xs font-black uppercase tracking-widest text-gray-400 transition-colors hover:text-white">
              Model dashboard →
            </Link>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-6">
          <MatchBoardStrip matches={matches} featuredMatchId={featuredMatch?.match_id ?? null} />

          {featuredMatch && (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="min-w-0 overflow-hidden rounded-2xl border border-slate-700/45 bg-[#111820]/95 shadow-xl shadow-black/10"
            >
              <div className="border-b border-white/[0.07] px-4 py-3">
                <SixSensePickHeading />
              </div>
              <div className="p-3">
                <FeaturedHero key={featuredMatch.match_id} match={featuredMatch} />
              </div>
            </motion.section>
          )}

          <SparseSlateNotice matchCount={matches.length} />

          {/* Match discovery board */}
          <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-700/45 bg-[#111820]/95 shadow-xl shadow-black/10">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
                <SectionHeading icon={<GroundsIcon className="h-6 w-6" />}>
                  <h2 className="text-sm font-black uppercase tracking-[0.1em] text-white sm:text-base sm:tracking-[0.18em]">Around the grounds</h2>
                </SectionHeading>
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => setCompetitionFiltersOpen((open) => !open)}
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors sm:h-8 sm:w-8 ${
                      competitionFiltersOpen
                        ? 'border-amber-600/35 bg-amber-600/[0.12] text-amber-600'
                        : 'border-slate-500/30 bg-white/[0.04] text-slate-300 hover:border-slate-300/50 hover:text-white'
                    }`}
                    aria-label="Filter matches by competition"
                    aria-expanded={competitionFiltersOpen}
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 6h16M7 12h10M10 18h4" />
                    </svg>
                  </button>
                </div>
            </div>

            {competitionFiltersOpen && matchesByCompetition.length > 0 && (
                <div className="flex flex-wrap gap-2 border-b border-white/[0.07] px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCompetition('all');
                      setCompetitionFiltersOpen(false);
                    }}
                    className={`min-h-11 shrink-0 rounded-full border px-4 py-2 text-[9px] font-black uppercase tracking-widest transition-colors sm:min-h-0 sm:px-3 sm:py-1.5 ${
                      activeCompetition === 'all'
                        ? 'border-amber-600/35 bg-amber-600/[0.12] text-amber-600'
                        : 'border-slate-500/30 bg-white/[0.04] text-slate-300 hover:border-slate-300/50 hover:text-white'
                    }`}
                  >
                    All <span className="ml-1 font-mono opacity-70">{discoveryMatchCount}</span>
                  </button>
                  {matchesByCompetition.map(({ key, filterLabel, matches: competitionMatches }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setActiveCompetition(key);
                        setCompetitionFiltersOpen(false);
                      }}
                      className={`min-h-11 shrink-0 rounded-full border px-4 py-2 text-[9px] font-black uppercase tracking-widest transition-colors sm:min-h-0 sm:px-3 sm:py-1.5 ${
                        activeCompetition === key
                          ? 'border-amber-600/35 bg-amber-600/[0.12] text-amber-600'
                          : 'border-slate-500/30 bg-white/[0.04] text-slate-300 hover:border-slate-300/50 hover:text-white'
                      }`}
                    >
                      {filterLabel} <span className="ml-1 font-mono opacity-70">{competitionMatches.length}</span>
                    </button>
                  ))}
                </div>
            )}

            <div className="p-3">
            {visibleCompetitionGroups.length > 0 ? (
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {visibleCompetitionGroups.map(({ key, competition, matches: sectionMatches }, sectionIdx) => (
                  <MatchDiscoveryPanel
                    key={key}
                    competition={competition}
                    sectionMatches={sectionMatches}
                    sectionIdx={sectionIdx}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[0.1] bg-[#111820]/90 p-6 text-center">
                <p className="text-sm font-bold text-gray-200">Only the spotlight match is available right now.</p>
              </div>
            )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
