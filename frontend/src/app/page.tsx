'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { getMatchSection, getUpcomingMatches, MatchWithPredictions } from '@/lib/supabase';
import { MatchCard } from '@/components/MatchCard';
import { CricketLoader } from '@/components/CricketLoader';
import { getTeamMeta, getFlagUrl, getFlag2xUrl, isInternationalTeam } from '@/lib/teams';
import { BowlIcon, GroundsIcon } from '@/components/CricketIcons';
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

function getMatchDateLabel(date: string): string {
  const raw = date.endsWith('Z') || date.includes('+') ? date : `${date}Z`;
  const kickoff = new Date(raw);
  if (Number.isNaN(kickoff.getTime())) return 'Date TBD';
  return kickoff.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isMatchLive(match: MatchWithPredictions): boolean {
  return String(match.status).toLowerCase() === 'live';
}

function decimalToAmerican(d: number): string {
  if (d <= 1) return '-';
  if (d >= 2) return '+' + Math.round((d - 1) * 100);
  return Math.round(-100 / (d - 1)).toString();
}

function getCompetitionLabel(match: MatchWithPredictions): string {
  if (match.competition_name?.trim()) return match.competition_name.trim();

  const namedCompetition = match.name.split(',').slice(1).join(',').trim();
  if (namedCompetition) return namedCompetition;

  const section = getMatchSection(match);
  return section === 'Other' ? `${match.match_type} cricket` : section;
}

function getCompetitionKind(competition: string, match: MatchWithPredictions): string {
  if (getMatchSection(match) === 'International') return 'International series';
  if (/(cup|trophy|championship|qualifier|world|finals?)/i.test(competition)) return 'Tournament';
  return 'League';
}

function getCompetitionFilterLabel(competition: string): string {
  const knownLabels: Array<[RegExp, string]> = [
    [/Indian Premier League/i, 'IPL'],
    [/Women'?s Premier League/i, 'WPL'],
    [/Women'?s Big Bash/i, 'WBBL'],
    [/Big Bash/i, 'BBL'],
    [/Major League Cricket/i, 'MLC'],
    [/Caribbean Premier League/i, 'CPL'],
    [/Pakistan Super League/i, 'PSL'],
    [/Lanka Premier League/i, 'LPL'],
    [/(Men'?s |Women'?s )?Hundred/i, 'The Hundred'],
  ];
  return knownLabels.find(([pattern]) => pattern.test(competition))?.[1] ?? competition;
}

function SparseSlateNotice({ matchCount }: { matchCount: number }) {
  if (matchCount > 2) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-200">Verified slate</p>
        <p className="mt-1 text-sm text-gray-300">
          {matchCount === 1
            ? 'One scheduled match is available right now. SixSense only displays fixtures received from the live schedule feed.'
            : 'Two scheduled matches are available right now. More appear automatically as official fixture feeds publish them.'}
        </p>
      </div>
      <Link
        href="/history"
        className="shrink-0 text-xs font-black uppercase tracking-widest text-cricket-300 transition-colors hover:text-amber-200"
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
        : 'inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10 text-cricket-300 shadow-[0_0_18px_rgba(251,191,36,0.08)]'
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
        <span className="text-cricket-300">SixSense</span>
        <sup className="ml-0.5 text-[0.55em] tracking-normal text-cricket-300">™</sup> Pick
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
    ? logoUrl || (isInternational && meta.countryCode ? getFlagUrl(meta.countryCode, 24) : '')
    : '';

  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-sm text-[6px] font-black text-white"
      style={{ backgroundColor: imageUrl ? 'transparent' : meta.primaryColor }}
      aria-hidden="true"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className={`h-full w-full ${isInternational ? 'rounded-sm object-cover' : 'object-contain'}`}
          onError={() => setImageFailed(true)}
        />
      ) : (
        meta.shortName.slice(0, 2)
      )}
    </span>
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
  const competitionKind = getCompetitionKind(competition, leadMatch);

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
          <p className="text-[8px] font-black uppercase tracking-[0.22em] text-amber-300">{competitionKind}</p>
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
  const sortedMatches = [...matches].sort((a, b) => getMatchTimestamp(a) - getMatchTimestamp(b));
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
    <section className="rounded-2xl border border-amber-500/25 bg-[#171308]/95 shadow-xl shadow-black/10">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-400/35 bg-gradient-to-br from-amber-400/20 to-amber-900/10 text-cricket-200 shadow-[0_0_24px_rgba(251,191,36,0.12)]">
              <BowlIcon className="h-5 w-5" />
            </span>
            <h2 className="text-base font-black uppercase tracking-[0.18em] text-white">Match center</h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {activeFilter !== 'all' && (
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-300">
              {selectedFilterLabel}
            </span>
          )}
          {hasOverflow && (
            <div className="hidden items-center gap-1 lg:flex">
              <button
                type="button"
                onClick={() => scrollTicker(-1)}
                disabled={!canScrollLeft}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-400/25 bg-amber-400/[0.08] text-amber-200 transition-colors hover:border-amber-300/50 hover:bg-amber-400/15 disabled:cursor-default disabled:border-white/[0.07] disabled:bg-transparent disabled:text-gray-700"
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
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-400/25 bg-amber-400/[0.08] text-amber-200 transition-colors hover:border-amber-300/50 hover:bg-amber-400/15 disabled:cursor-default disabled:border-white/[0.07] disabled:bg-transparent disabled:text-gray-700"
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
                  ? 'border-amber-400/40 bg-amber-400/15 text-amber-200'
                  : 'border-white/[0.1] bg-black/20 text-gray-400 hover:border-white/[0.18] hover:text-gray-200'
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
            const ev1 = prediction && match.bookmaker_odds
              ? Math.round((prediction.team1_win_probability - 1 / match.bookmaker_odds.team1_odds) * 100)
              : 0;
            const ev2 = prediction && match.bookmaker_odds
              ? Math.round((prediction.team2_win_probability - 1 / match.bookmaker_odds.team2_odds) * 100)
              : 0;
            const edgePct = Math.max(ev1, ev2);
            const hasEdge = edgePct >= 7;
            const isFeatured = match.match_id === featuredMatchId;

            return (
              <Link
                key={match.match_id}
                href={`/predict?id=${encodeURIComponent(match.match_id)}`}
                data-match-center-tile
                className="group min-w-[17rem] snap-start rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3 transition-colors hover:border-amber-400/50 sm:min-w-[18.5rem]"
              >
                <div>
                  <div className="mb-3 flex h-7 items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="shrink-0 rounded-full border border-cricket-400/25 bg-cricket-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-cricket-300">
                        {match.match_type}
                      </span>
                      {isFeatured && (
                        <span
                          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-amber-300/20 bg-black/25 px-1.5"
                          title="SixSense Pick"
                          aria-label="SixSense Pick"
                        >
                          <Logo size={18} />
                          <span className="leading-none">
                            <span className="block text-[6px] font-black uppercase tracking-[0.2em] text-amber-300">
                              SixSense<sup className="ml-px text-[0.55em] tracking-normal">™</sup>
                            </span>
                            <span className="mt-0.5 block text-[9px] font-black uppercase tracking-[0.2em] text-white">Pick</span>
                          </span>
                        </span>
                      )}
                      {hasEdge && (
                        <span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-300">
                          +{edgePct} edge
                        </span>
                      )}
                    </div>
                    {isMatchLive(match) ? (
                      <span className="shrink-0 rounded-full border border-red-400/30 bg-red-400/10 px-2 py-0.5 text-right text-[9px] font-black uppercase tracking-widest text-red-300">
                        Live
                      </span>
                    ) : (
                      <span className="shrink-0 text-right text-xs font-bold text-gray-300">{getMatchDateLabel(match.date)}</span>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <MatchCenterTeamMark team={match.team1} logoUrl={match.team1_logo_url} />
                        <span className={`truncate text-base font-black ${team1Leads ? 'text-white' : 'text-gray-300'}`}>
                          {team1Meta.shortName}
                        </span>
                        <span
                          className="shrink-0 rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums text-gray-300"
                          title={match.bookmaker_odds ? `${match.bookmaker_odds.bookmaker} American odds` : 'Sportsbook odds unavailable'}
                        >
                          {match.bookmaker_odds ? decimalToAmerican(match.bookmaker_odds.team1_odds) : '—'}
                        </span>
                      </span>
                      <span
                        className={`w-14 shrink-0 text-right font-mono text-lg font-black tabular-nums ${team1Leads ? 'text-cricket-300' : 'text-gray-400'}`}
                        title={team1Leads ? 'SixSense lean: higher model win probability' : 'SixSense model win probability'}
                      >
                        {prediction ? `${Math.round(prediction.team1_win_probability * 100)}%` : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <MatchCenterTeamMark team={match.team2} logoUrl={match.team2_logo_url} />
                        <span className={`truncate text-base font-black ${team2Leads ? 'text-white' : 'text-gray-300'}`}>
                          {team2Meta.shortName}
                        </span>
                        <span
                          className="shrink-0 rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums text-gray-300"
                          title={match.bookmaker_odds ? `${match.bookmaker_odds.bookmaker} American odds` : 'Sportsbook odds unavailable'}
                        >
                          {match.bookmaker_odds ? decimalToAmerican(match.bookmaker_odds.team2_odds) : '—'}
                        </span>
                      </span>
                      <span
                        className={`w-14 shrink-0 text-right font-mono text-lg font-black tabular-nums ${team2Leads ? 'text-cricket-300' : 'text-gray-400'}`}
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
                    <span className="shrink-0 text-[10px] font-bold text-gray-300 transition-colors group-hover:text-amber-200">
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
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-16 items-center justify-end bg-gradient-to-l from-[#171308] via-[#171308]/80 to-transparent pr-1 backdrop-blur-[2px] lg:hidden">
            <button
              type="button"
              onClick={() => scrollTicker(1)}
              className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-300/35 bg-amber-200/10 text-amber-100 shadow-lg shadow-black/40 backdrop-blur-md transition-colors active:bg-amber-200/20"
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
            <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-widest text-gray-200">
              {getCompetitionLabel(match)}
            </span>
          </div>

          {/* Row 2: Teams + chart */}
          <div className="flex items-center gap-4 sm:gap-8">
            {/* Team 1 */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <motion.div
                className={`w-14 h-14 sm:w-16 sm:h-16 overflow-hidden flex-shrink-0 ring-2 shadow-xl ${
                  team1Meta.countryCode ? 'rounded-xl' : 'rounded-full'
                }`}
                style={{ ['--tw-ring-color' as string]: winner === match.team1 ? team1Meta.primaryColor : 'rgba(255,255,255,0.1)' }}
                whileHover={{ scale: 1.1 }}
              >
                {team1Meta.countryCode ? (
                  <img src={getFlagUrl(team1Meta.countryCode, 64)} srcSet={`${getFlag2xUrl(team1Meta.countryCode, 64)} 2x`} alt={match.team1} className="w-full h-full rounded-xl object-cover" />
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
                className={`w-14 h-14 sm:w-16 sm:h-16 overflow-hidden flex-shrink-0 ring-2 shadow-xl ${
                  team2Meta.countryCode ? 'rounded-xl' : 'rounded-full'
                }`}
                style={{ ['--tw-ring-color' as string]: winner === match.team2 ? team2Meta.primaryColor : 'rgba(255,255,255,0.1)' }}
                whileHover={{ scale: 1.1 }}
              >
                {team2Meta.countryCode ? (
                  <img src={getFlagUrl(team2Meta.countryCode, 64)} srcSet={`${getFlag2xUrl(team2Meta.countryCode, 64)} 2x`} alt={match.team2} className="w-full h-full rounded-xl object-cover" />
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

          <div className="mt-3 flex items-center justify-between gap-3 text-[9px] font-semibold">
            <span className="min-w-0 truncate text-gray-500">{match.venue || 'Venue TBC'}</span>
            <span className="shrink-0 text-gray-400 transition-colors group-hover:text-amber-200">
              Full breakdown →
            </span>
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

  const featuredMatch = [...matches].sort((a, b) => {
    const scoreDiff = getSpotlightScore(b) - getSpotlightScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return getMatchTimestamp(a) - getMatchTimestamp(b);
  })[0] ?? null;

  const sectionPool = featuredMatch
    ? matches.filter((match) => match.match_id !== featuredMatch.match_id)
    : matches;

  const competitionGroups = new Map<string, MatchWithPredictions[]>();
  sectionPool.forEach((match) => {
    const competition = getCompetitionLabel(match);
    competitionGroups.set(competition, [...(competitionGroups.get(competition) ?? []), match]);
  });
  const matchesByCompetition = Array.from(competitionGroups, ([competition, competitionMatches]) => ({
    competition,
    matches: competitionMatches.sort((a, b) => getMatchTimestamp(a) - getMatchTimestamp(b)),
  })).sort((a, b) => getMatchTimestamp(a.matches[0]) - getMatchTimestamp(b.matches[0]));

  const discoveryMatchCount = matchesByCompetition.reduce((count, group) => count + group.matches.length, 0);
  const visibleCompetitionGroups = activeCompetition === 'all'
    ? matchesByCompetition
    : matchesByCompetition.filter((group) => group.competition === activeCompetition);
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
          className="overflow-hidden rounded-2xl border border-amber-300/15 bg-gradient-to-br from-[#171308] to-cricket-950/50 px-6 py-14 text-center"
        >
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] text-cricket-300">
            <BowlIcon className="h-6 w-6" />
          </div>
          <p className="text-lg font-black text-white">The next slate has not landed yet</p>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-gray-400">
            SixSense only publishes scheduled fixtures received from its cricket feeds. New matches will appear here automatically when they are available.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link href="/history" className="rounded-lg border border-amber-300/20 bg-amber-300/[0.07] px-4 py-2 text-xs font-black uppercase tracking-widest text-amber-200">
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
              className="min-w-0 overflow-hidden rounded-2xl border border-amber-500/25 bg-[#171308]/95 shadow-xl shadow-black/10"
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
          <section className="min-w-0 overflow-hidden rounded-2xl border border-amber-500/25 bg-[#171308]/95 shadow-xl shadow-black/10">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
                <SectionHeading icon={<GroundsIcon className="h-6 w-6" />}>
                  <h2 className="text-base font-black uppercase tracking-[0.18em] text-white">Around the grounds</h2>
                </SectionHeading>
                <div className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => setCompetitionFiltersOpen((open) => !open)}
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      competitionFiltersOpen
                        ? 'border-amber-400/45 bg-amber-400/15 text-amber-200'
                        : 'border-amber-400/30 bg-amber-400/10 text-amber-300 hover:border-amber-300/50 hover:text-amber-100'
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
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors ${
                      activeCompetition === 'all'
                        ? 'border-amber-300/35 bg-amber-300/[0.12] text-amber-200'
                        : 'border-white/[0.1] bg-white/[0.03] text-gray-400 hover:text-white'
                    }`}
                  >
                    All <span className="ml-1 font-mono opacity-70">{discoveryMatchCount}</span>
                  </button>
                  {matchesByCompetition.map(({ competition, matches: competitionMatches }) => (
                    <button
                      key={competition}
                      type="button"
                      onClick={() => {
                        setActiveCompetition(competition);
                        setCompetitionFiltersOpen(false);
                      }}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors ${
                        activeCompetition === competition
                          ? 'border-amber-300/35 bg-amber-300/[0.12] text-amber-200'
                          : 'border-white/[0.1] bg-white/[0.03] text-gray-400 hover:text-white'
                      }`}
                    >
                      {getCompetitionFilterLabel(competition)} <span className="ml-1 font-mono opacity-70">{competitionMatches.length}</span>
                    </button>
                  ))}
                </div>
            )}

            <div className="p-3">
            {visibleCompetitionGroups.length > 0 ? (
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {visibleCompetitionGroups.map(({ competition, matches: sectionMatches }, sectionIdx) => (
                  <MatchDiscoveryPanel
                    key={competition}
                    competition={competition}
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
          </section>
        </div>
      )}
    </div>
  );
}
