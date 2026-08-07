'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { getMatch, getMatchEnrichment, getMatchOdds, getMatchSquads, getPlayerStats, getPrediction, getESPNMatchData, getEdgeScore, Match, MatchEnrichment, MatchOdds, MatchSquad, PlayerStats, Prediction, ESPNMatchData, EdgeScore } from '@/lib/supabase';
import { getTeamMeta, getFlagUrl, getFlag2xUrl } from '@/lib/teams';
import { getFranchiseLogoUrl } from '@/lib/franchise-logos';
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

function truncateAtSentence(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };

  const slice = text.slice(0, maxChars);
  const sentenceEnd = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
  if (sentenceEnd > 0) {
    return { text: `${slice.slice(0, sentenceEnd + 1).trimEnd()}…`, truncated: true };
  }

  const lastSpace = slice.lastIndexOf(' ');
  const safeEnd = lastSpace > 0 ? lastSpace : maxChars;
  return { text: `${slice.slice(0, safeEnd).trimEnd()}…`, truncated: true };
}

const TRUSTED_SPORTSBOOKS: Record<string, { url: string; priority: number }> = {
  draftkings: { url: 'https://sportsbook.draftkings.com/leagues/cricket', priority: 1 },
  fanduel: { url: 'https://sportsbook.fanduel.com/navigation/cricket', priority: 2 },
  betmgm: { url: 'https://sports.betmgm.com/en/sports/cricket-29', priority: 3 },
  caesars: { url: 'https://www.caesars.com/sportsbook-and-casino/sports', priority: 4 },
  espnbet: { url: 'https://espnbet.com/sport/cricket', priority: 5 },
  bet365: { url: 'https://www.bet365.com/', priority: 6 },
  williamhill: { url: 'https://sports.williamhill.com/betting/en-gb/tags/cricket', priority: 7 },
  paddypower: { url: 'https://www.paddypower.com/cricket', priority: 8 },
  betfairsportsbook: { url: 'https://www.betfair.com/sport/cricket', priority: 9 },
  betfair: { url: 'https://www.betfair.com/sport/cricket', priority: 9 },
  skybet: { url: 'https://m.skybet.com/cricket', priority: 10 },
  unibet: { url: 'https://www.unibet.com/betting/sports/filter/cricket', priority: 11 },
  betway: { url: 'https://betway.com/sport/cricket', priority: 12 },
  boylesports: { url: 'https://www.boylesports.com/sports/cricket', priority: 13 },
  matchbook: { url: 'https://www.matchbook.com/events/cricket', priority: 14 },
  tab: { url: 'https://www.tab.com.au/sports/betting/Cricket', priority: 15 },
  sportsbet: { url: 'https://www.sportsbet.com.au/betting/cricket', priority: 16 },
  ladbrokes: { url: 'https://www.ladbrokes.com.au/sports/cricket', priority: 17 },
  neds: { url: 'https://www.neds.com.au/sports/cricket', priority: 18 },
  pointsbetau: { url: 'https://pointsbet.com.au/sports/cricket', priority: 19 },
  pointsbet: { url: 'https://pointsbet.com.au/sports/cricket', priority: 19 },
};

function normalizeBookmaker(bookmaker: string): string {
  return bookmaker.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getTrustedSportsbook(bookmaker: string): { url: string; priority: number } | null {
  return TRUSTED_SPORTSBOOKS[normalizeBookmaker(bookmaker)] ?? null;
}

function getBookmakerMarketUrl(bookmaker: string): string | null {
  const normalized = bookmaker.toLowerCase().replace(/[^a-z0-9]/g, '');
  return TRUSTED_SPORTSBOOKS[normalized]?.url ?? null;
}

function openExternalMarket(url: string): void {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function normalizeTeamIdentity(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\((men|women)\)/g, ' $1 ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamIdentityMatches(candidate: string | undefined, expected: string): boolean {
  if (!candidate || !expected) return false;
  const candidateKey = normalizeTeamIdentity(candidate);
  const expectedKey = normalizeTeamIdentity(expected);
  return candidateKey === expectedKey || candidateKey.includes(expectedKey) || expectedKey.includes(candidateKey);
}

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const detailTileClass = 'bg-gradient-to-br from-[#121922]/90 to-[#0c1218]/90 backdrop-blur-xl rounded-2xl p-4 sm:p-5 lg:p-6 border border-slate-700/40';
const detailTileStrongClass = 'bg-gradient-to-br from-[#141c25]/95 to-[#0c1218]/95 backdrop-blur-xl rounded-2xl p-4 sm:p-5 lg:p-6 border border-amber-600/25';
const detailTileTitleClass = 'text-[clamp(0.8rem,1vw,1rem)] font-bold text-white uppercase tracking-wider flex items-center gap-1.5';
const detailTileMetaClass = 'text-[clamp(0.65rem,0.8vw,0.8rem)]';
const detailTileBodyClass = 'text-[clamp(0.875rem,1.05vw,1.05rem)] text-slate-300 leading-relaxed';

function ComingSoonTile({ title, body, eyebrow = 'Coming soon' }: { title: string; body: string; eyebrow?: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-[#121922]/90 to-[#0c1218]/90 px-4 py-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="absolute -top-20 left-1/2 h-36 w-36 -translate-x-1/2 rounded-full bg-amber-600/10 blur-3xl" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
      <div className="relative mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-amber-600/25 bg-amber-600/10 text-amber-500">
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 13h10M4 10l2-5 2 3 2-5 2 7" />
        </svg>
      </div>
      <p className={`${detailTileMetaClass} relative mb-1 font-black uppercase tracking-[0.24em] text-amber-500`}>{eyebrow}</p>
      <p className="relative text-[clamp(0.95rem,1.15vw,1.15rem)] font-black text-white">{title}</p>
      <p className={`${detailTileMetaClass} relative mx-auto mt-1 max-w-md text-slate-400`}>{body}</p>
    </div>
  );
}

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
  const [showStickySummary, setShowStickySummary] = useState(false);
  const [scrollDepth, setScrollDepth] = useState(0);
  const heroRef = useRef<HTMLDivElement | null>(null);

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
  const [flippedBattles, setFlippedBattles] = useState<Set<number>>(() => new Set());
  const [pressedBattle, setPressedBattle] = useState<number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setEdgeBarsReady(true), 50);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    setFlippedBattles(new Set());
  }, [matchId]);
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowStickySummary(!entry.isIntersecting && entry.boundingClientRect.top < 64);
      },
      { rootMargin: '-64px 0px 0px 0px', threshold: 0.05 }
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [loading, matchId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let raf = 0;
    const updateScrollDepth = () => {
      const start = 80;
      const end = 520;
      const depth = (window.scrollY - start) / (end - start);
      setScrollDepth(Math.max(0, Math.min(1, depth)));
      raf = 0;
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(updateScrollDepth);
    };

    updateScrollDepth();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
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
      <motion.div {...fadeUp} className="text-center text-slate-300 py-16">
        <p className="text-xl">Match not found</p>
      </motion.div>
    );
  }

  const displayTeam1 = prediction?.team1 ?? match.team1;
  const displayTeam2 = prediction?.team2 ?? match.team2;
  const team1Meta = getTeamMeta(displayTeam1);
  const team2Meta = getTeamMeta(displayTeam2);
  const team1LogoUrl = match.team1_logo_url;
  const team2LogoUrl = match.team2_logo_url;
  const predictionMargin = prediction ? Math.abs(prediction.team1_win_probability - prediction.team2_win_probability) : 0;
  const hasClearPick = predictionMargin >= 0.01;
  const hasSquadOrXi = enrichment?.possible_xi && ((enrichment.possible_xi.team1?.length ?? 0) > 0 || (enrichment.possible_xi.team2?.length ?? 0) > 0);
  const isModelEstimated = enrichment !== null && (enrichment.source_links?.length ?? 0) === 0;
  const squadLabel = isModelEstimated ? 'Recent-player candidates' : 'Source-backed squad';
  const h2hGames = (espnData?.head_to_head ?? []).filter(g => g.teams && g.teams.length > 0);
  const isH2HTeam1 = (team: { abbreviation?: string; name?: string }) =>
    team.abbreviation?.toUpperCase() === team1Meta.shortName.toUpperCase()
    || teamIdentityMatches(team.name, displayTeam1);
  const h2hLast5 = h2hGames.slice(0, 5);
  const h2hTeam1Wins = h2hLast5.filter(g => {
    const winner = g.teams.find(t => t.winner);
    return winner && isH2HTeam1(winner);
  }).length;
  const h2hTeam2Wins = h2hLast5.length - h2hTeam1Wins;

  // Derive form from ESPN H2H (most recent and accurate for this matchup)
  // Falls back to Cricsheet format form if no ESPN data
  const deriveH2HForm = (teamName: string, teamShortName: string): Array<'W' | 'L'> => {
    if (h2hGames.length === 0) return [];
    return h2hGames
      .slice(0, 5)
      .map(game => {
        const team = game.teams.find((t: { abbreviation?: string; name?: string }) =>
          t.abbreviation?.toUpperCase() === teamShortName.toUpperCase() || teamIdentityMatches(t.name, teamName)
        );
        if (!team) return null;
        return team.winner ? 'W' as const : 'L' as const;
      })
      .filter((r): r is 'W' | 'L' => r !== null)
      .reverse(); // oldest first → left-to-right chronological
  };
  const team1H2H = deriveH2HForm(displayTeam1, team1Meta.shortName);
  const team2H2H = deriveH2HForm(displayTeam2, team2Meta.shortName);
  const team1Form = team1H2H.length > 0 ? team1H2H : (match.team1_recent_form ?? []).slice(-5);
  const team2Form = team2H2H.length > 0 ? team2H2H : (match.team2_recent_form ?? []).slice(-5);
  const sportsbookOdds = odds
    .map((odd) => ({ odd, sportsbook: getTrustedSportsbook(odd.bookmaker) }))
    .filter((entry): entry is { odd: MatchOdds; sportsbook: { url: string; priority: number } } => entry.sportsbook !== null)
    .sort((a, b) => a.sportsbook.priority - b.sportsbook.priority)
    .map((entry) => entry.odd);
  const featuredBookmakerUrl = sportsbookOdds.length > 0
    ? getBookmakerMarketUrl(sportsbookOdds[0].bookmaker)
    : null;
  const rawReasoningSentences = (prediction?.reasoning || '')
    .split(/(?<=[.!?])\s+/)
    .filter((s: string) => s.trim().length > 10);
  const reasoningSentences = odds.length > 0
    ? rawReasoningSentences.filter((s) => !/No live sportsbook line was available/i.test(s))
    : rawReasoningSentences;
  const visibleReasoning = expandedSections.ourTake ? reasoningSentences : reasoningSentences.slice(0, 3);

  const expertPreview = enrichment?.expert_preview?.trim() || '';
  const playerUpdates = enrichment?.player_updates ?? [];
  const sourceLinks = (enrichment?.source_links ?? []).filter((s) => s.source !== 'demo');
  const weakResearchCopy = !expertPreview || /No recent reputable source-backed updates|unavailable until a reliable source is found/i.test(expertPreview);
  const researchFacts = [
    espnData?.venue_name ? `ESPN confirms ${espnData.venue_name}${espnData.venue_city ? `, ${espnData.venue_city}` : ''} as the venue.` : '',
    h2hGames.length > 0 ? `ESPN has ${h2hGames.slice(0, 5).length} recent head-to-head results for this matchup.` : '',
    sportsbookOdds.length > 0 ? `Live market data is available from ${sportsbookOdds.length} trusted ${sportsbookOdds.length === 1 ? 'sportsbook' : 'sportsbooks'}.` : '',
    squads.length === 0 && !hasSquadOrXi ? 'Confirmed squads or XIs are not available yet.' : '',
  ].filter(Boolean);
  const fullResearchSummary = weakResearchCopy && researchFacts.length > 0
    ? researchFacts.join(' ')
    : expertPreview;
  const collapsedResearchSummary = truncateAtSentence(fullResearchSummary, 260);
  const researchSummary = expandedSections.researchNotes
    ? fullResearchSummary
    : collapsedResearchSummary.text;
  const visibleUpdates = expandedSections.researchNotes ? playerUpdates.slice(0, 6) : playerUpdates.slice(0, 2);
  const visibleSources = expandedSections.researchNotes ? sourceLinks.slice(0, 6) : sourceLinks.slice(0, 2);
  const researchNeedsAccordion = collapsedResearchSummary.truncated || playerUpdates.length > 2 || sourceLinks.length > 2;
  const h2hLeader = h2hTeam1Wins > h2hTeam2Wins
    ? displayTeam1
    : h2hTeam2Wins > h2hTeam1Wins
    ? displayTeam2
    : null;
  const modelPick = prediction && hasClearPick ? prediction.predicted_winner : null;
  const h2hContradictsPick = Boolean(
    h2hLeader
    && modelPick
    && !teamIdentityMatches(h2hLeader, modelPick)
  );
  const h2hContextSource = expertPreview || reasoningSentences.join(' ');
  const h2hContextSentences = h2hContextSource
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 10)
    .slice(0, 2)
    .join(' ');
  const h2hReconciliationNote = h2hContradictsPick && h2hContextSentences
    ? `Despite ${h2hLeader} leading the recent H2H, ${modelPick} is the model pick. ${h2hContextSentences}`
    : '';

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
      <div
        className={`fixed inset-x-0 top-16 z-40 border-b border-amber-600/15 bg-[#10151b]/95 shadow-lg shadow-black/25 backdrop-blur-xl transition-all duration-200 ${
          showStickySummary ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
        }`}
        style={{
          height: '44px',
        }}
        aria-hidden={!showStickySummary}
      >
        <div className="mx-auto grid h-full max-w-7xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <div className={`h-6 w-6 shrink-0 overflow-hidden border border-white/10 ${team1Meta.countryCode ? 'rounded-md' : 'rounded-full'}`}>
              {team1LogoUrl || getFranchiseLogoUrl(displayTeam1) ? (
                <img src={team1LogoUrl || getFranchiseLogoUrl(displayTeam1)} alt="" className="h-full w-full rounded-md object-contain bg-slate-950/30 p-0.5" />
              ) : team1Meta.countryCode ? (
                <img src={getFlagUrl(team1Meta.countryCode, 32)} alt="" className="h-full w-full rounded-md object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[8px] font-black text-white" style={{ backgroundColor: team1Meta.primaryColor }}>
                  {team1Meta.shortName.slice(0, 2)}
                </div>
              )}
            </div>
            <span className="truncate text-[12px] sm:text-[13px] font-black text-white">
              {team1Meta.shortName} <span className="font-mono text-amber-400">{prediction ? `${Math.round(prediction.team1_win_probability * 100)}%` : '—'}</span>
            </span>
            <span className="shrink-0 rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] sm:text-[11px] font-bold text-gray-300">
              {sportsbookOdds.length > 0 ? decimalToAmerican(sportsbookOdds[0].team1_odds) : '—'}
            </span>
          </div>

          <div className="text-center">
            <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.18em] text-amber-500">SixSense™ Pick</p>
            <p className="text-[10px] sm:text-[11px] font-black text-white">{modelPick ? getTeamMeta(modelPick).shortName : 'Pending'}</p>
          </div>

          <div className="flex min-w-0 items-center justify-end gap-2">
            <span className="shrink-0 rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] sm:text-[11px] font-bold text-gray-300">
              {sportsbookOdds.length > 0 ? decimalToAmerican(sportsbookOdds[0].team2_odds) : '—'}
            </span>
            <span className="truncate text-right text-[12px] sm:text-[13px] font-black text-white">
              {team2Meta.shortName} <span className="font-mono text-amber-400">{prediction ? `${Math.round(prediction.team2_win_probability * 100)}%` : '—'}</span>
            </span>
            <div className={`h-6 w-6 shrink-0 overflow-hidden border border-white/10 ${team2Meta.countryCode ? 'rounded-md' : 'rounded-full'}`}>
              {team2LogoUrl || getFranchiseLogoUrl(displayTeam2) ? (
                <img src={team2LogoUrl || getFranchiseLogoUrl(displayTeam2)} alt="" className="h-full w-full rounded-md object-contain bg-slate-950/30 p-0.5" />
              ) : team2Meta.countryCode ? (
                <img src={getFlagUrl(team2Meta.countryCode, 32)} alt="" className="h-full w-full rounded-md object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[8px] font-black text-white" style={{ backgroundColor: team2Meta.primaryColor }}>
                  {team2Meta.shortName.slice(0, 2)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Back link + Countdown */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 min-h-11 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.04] text-[clamp(0.8rem,1vw,0.95rem)] text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors group"
        >
          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 3L5 8l5 5" /></svg>
          All Matches
        </Link>
        {countdown && (
          <div className="inline-flex items-center gap-2 min-h-11 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.04] text-[clamp(0.8rem,1vw,0.95rem)] text-slate-300">
            <svg className="w-4 h-4 text-amber-500 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M8 4v4l3 2" /></svg>
            <span className="font-semibold whitespace-nowrap">Begins in</span>
            <span className="font-mono tracking-[0.02em] whitespace-nowrap">
              {countdown.days > 0 && <span className="text-white font-semibold">{countdown.days}</span>}
              {countdown.days > 0 && <span className="text-slate-300">d </span>}
              <span className="text-white font-semibold">{String(countdown.hours).padStart(2, '0')}</span>
              <span className="text-slate-300">h </span>
              <span className="text-white font-semibold">{String(countdown.mins).padStart(2, '0')}</span>
              <span className="text-slate-300">m </span>
              <span className="text-white font-semibold">{String(countdown.secs).padStart(2, '0')}</span>
              <span className="text-slate-300">s</span>
            </span>
          </div>
        )}
      </div>
      {/* Hero: Teams + Prediction (replaces VS with chart) */}
      <style>{`
        @keyframes pickEntrance {
          0%   { opacity: 0; box-shadow: 0 0 0 0 rgba(251,191,36,0); transform: scale(0.88); }
          55%  { opacity: 1; box-shadow: 0 0 24px 6px rgba(245,158,11,0.48); transform: scale(1.06); }
          100% { opacity: 1; box-shadow: 0 0 10px 2px rgba(245,158,11,0.28); transform: scale(1); }
        }
        @keyframes pickBreath {
          0%, 100% { box-shadow: 0 0 6px 1px rgba(245,158,11,0.20); }
          50%       { box-shadow: 0 0 16px 4px rgba(245,158,11,0.36); }
        }
        .pick-badge {
          animation: pickEntrance 0.65s cubic-bezier(0.22,1,0.36,1) forwards,
                     pickBreath 2.8s ease-in-out 0.65s infinite;
        }
      `}</style>
      <motion.div
        ref={heroRef}
        className="relative rounded-3xl bg-gradient-to-br from-[#121922]/95 via-[#0c1218]/95 to-[#121922]/95 border border-slate-700/40 p-6 sm:p-8 lg:p-10 mb-6 overflow-hidden"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Background glow */}
        <div className="absolute top-0 left-1/4 w-1/2 h-32 bg-amber-600/10 blur-3xl rounded-full" />

        <div className="relative flex items-center justify-between gap-4 sm:gap-6 lg:gap-10">
          {/* Team 1 */}
          <motion.div
            className="flex-1 text-center"
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {/* Pick badge above flag */}
            {prediction && hasClearPick && prediction.team1_win_probability > prediction.team2_win_probability ? (
              <div className="mb-2 flex items-center justify-center">
                <span className="pick-badge inline-flex items-center gap-1.5 text-[clamp(0.65rem,0.8vw,0.8rem)] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.42)', boxShadow: '0 0 0 1px rgba(245,158,11,0.08) inset' }}>
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,6 5,9 10,3"/></svg>
                  Our Pick
                </span>
              </div>
            ) : <div className="mb-2 h-[26px]" />}
            <motion.div
              className={`w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 mx-auto mb-2 overflow-hidden shadow-xl ${
                team1Meta.countryCode ? 'rounded-xl' : 'rounded-full'
              }`}
              style={prediction && hasClearPick && prediction.team1_win_probability > prediction.team2_win_probability
                ? { boxShadow: `0 0 0 3px ${teamColor1}, 0 0 0 5px ${teamColor1}44, 0 0 20px ${teamColor1}55`, outline: 'none' }
                : { boxShadow: `0 0 0 2px ${team1Meta.primaryColor}55` }
              }
              whileHover={{ scale: 1.1 }}
            >
              {team1LogoUrl || getFranchiseLogoUrl(displayTeam1) ? (
                <img
                  src={team1LogoUrl || getFranchiseLogoUrl(displayTeam1)}
                  alt={displayTeam1}
                  className="w-full h-full rounded-xl object-contain bg-slate-950/30 p-1"
                />
              ) : team1Meta.countryCode ? (
                <img
                  src={getFlagUrl(team1Meta.countryCode, 80)}
                  srcSet={`${getFlag2xUrl(team1Meta.countryCode, 80)} 2x`}
                  alt={displayTeam1}
                  className="w-full h-full rounded-xl object-cover"
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
            <h2 className="text-[clamp(1rem,1.5vw,1.35rem)] font-bold text-white">{team1Meta.shortName}</h2>
            {/* Form strip — last 5 */}
            {team1Form.length > 0 && (
              <div className="mt-1.5 flex max-w-full flex-wrap items-center justify-center gap-0.5 sm:gap-1 px-1">
                {team1Form.map((r, i) => (
                  <span key={`t1f-${i}`} className={`flex h-4 w-4 items-center justify-center rounded text-[7px] leading-none font-bold text-white sm:h-6 sm:w-6 sm:text-[11px] ${r === 'W' ? 'bg-emerald-500' : 'bg-red-500/80'}`}>{r}</span>
                ))}
              </div>
            )}
            {prediction && (
              <p className="text-lg sm:text-2xl lg:text-3xl font-black mt-1" style={{ color: teamColor1, textShadow: '0 0 6px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.6)' }}>
                {(prediction.team1_win_probability * 100).toFixed(0)}%
              </p>
            )}
            {!prediction && (
              <p className={`${detailTileMetaClass} mt-1 font-black uppercase tracking-[0.24em] text-gray-500`}>Queued</p>
            )}
            {prediction && (
              <span
                className={`inline-flex items-center justify-center mt-1 px-2.5 py-0.5 rounded-full border text-[clamp(0.75rem,0.95vw,0.95rem)] font-mono font-semibold ${
                  featuredBookmakerUrl
                    ? 'border-amber-600/35 bg-amber-600/10 text-gray-100 cursor-pointer hover:bg-amber-600/20'
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
                {sportsbookOdds.length > 0
                  ? decimalToAmerican(sportsbookOdds[0].team1_odds)
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
              <div className="flex flex-col items-center gap-2">
                <div className="w-28 h-28 sm:w-36 sm:h-36 lg:w-44 lg:h-44">
                  <PredictionChart
                    team1={prediction.team1}
                    team2={prediction.team2}
                    team1Prob={prediction.team1_win_probability}
                    team2Prob={prediction.team2_win_probability}
                    compact
                  />
                </div>
                {/* Color legend */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: teamColor1 }} />
                    <span className="text-[clamp(0.65rem,0.8vw,0.8rem)] font-bold uppercase tracking-wider" style={{ color: teamColor1 }}>{team1Meta.shortName}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: teamColor2 }} />
                    <span className="text-[clamp(0.65rem,0.8vw,0.8rem)] font-bold uppercase tracking-wider" style={{ color: teamColor2 }}>{team2Meta.shortName}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="relative w-28 h-28 sm:w-36 sm:h-36 lg:w-44 lg:h-44 rounded-full border border-amber-600/20 bg-gradient-to-br from-[#121922] via-[#0c1218] to-[#121922] flex items-center justify-center overflow-hidden shadow-[0_0_40px_rgba(217,119,6,0.12)]">
                  <div className="absolute inset-5 rounded-full border border-dashed border-amber-600/20" />
                  <div className="absolute h-16 w-16 rounded-full bg-amber-600/10 blur-2xl" />
                  <div className="relative text-center">
                    <p className="text-[clamp(0.62rem,0.8vw,0.8rem)] font-black uppercase tracking-[0.22em] text-amber-500">Coming</p>
                    <p className="text-[clamp(0.62rem,0.8vw,0.8rem)] font-black uppercase tracking-[0.22em] text-amber-500">Soon</p>
                  </div>
                </div>
                <p className={`${detailTileMetaClass} max-w-40 text-center text-slate-500`}>SixSense model run is warming up</p>
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
            {prediction && hasClearPick && prediction.team2_win_probability > prediction.team1_win_probability ? (
              <div className="mb-2 flex items-center justify-center">
                <span className="pick-badge inline-flex items-center gap-1.5 text-[clamp(0.65rem,0.8vw,0.8rem)] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.42)', boxShadow: '0 0 0 1px rgba(245,158,11,0.08) inset' }}>
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,6 5,9 10,3"/></svg>
                  Our Pick
                </span>
              </div>
            ) : <div className="mb-2 h-[26px]" />}
            <motion.div
              className={`w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 mx-auto mb-2 overflow-hidden shadow-xl ${
                team2Meta.countryCode ? 'rounded-xl' : 'rounded-full'
              }`}
              style={prediction && hasClearPick && prediction.team2_win_probability > prediction.team1_win_probability
                ? { boxShadow: `0 0 0 3px ${teamColor2}, 0 0 0 5px ${teamColor2}44, 0 0 20px ${teamColor2}55` }
                : { boxShadow: `0 0 0 2px ${team2Meta.primaryColor}55` }
              }
              whileHover={{ scale: 1.1 }}
            >
              {team2LogoUrl || getFranchiseLogoUrl(displayTeam2) ? (
                <img
                  src={team2LogoUrl || getFranchiseLogoUrl(displayTeam2)}
                  alt={displayTeam2}
                  className="w-full h-full rounded-xl object-contain bg-slate-950/30 p-1"
                />
              ) : team2Meta.countryCode ? (
                <img
                  src={getFlagUrl(team2Meta.countryCode, 80)}
                  srcSet={`${getFlag2xUrl(team2Meta.countryCode, 80)} 2x`}
                  alt={displayTeam2}
                  className="w-full h-full rounded-xl object-cover"
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
            <h2 className="text-[clamp(1rem,1.5vw,1.35rem)] font-bold text-white">{team2Meta.shortName}</h2>
            {/* Form strip — last 5 */}
            {team2Form.length > 0 && (
              <div className="mt-1.5 flex max-w-full flex-wrap items-center justify-center gap-0.5 sm:gap-1 px-1">
                {team2Form.map((r, i) => (
                  <span key={`t2f-${i}`} className={`flex h-4 w-4 items-center justify-center rounded text-[7px] leading-none font-bold text-white sm:h-6 sm:w-6 sm:text-[11px] ${r === 'W' ? 'bg-emerald-500' : 'bg-red-500/80'}`}>{r}</span>
                ))}
              </div>
            )}
            {prediction && (
              <p className="text-lg sm:text-2xl lg:text-3xl font-black mt-1" style={{ color: teamColor2, textShadow: '0 0 6px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.6)' }}>
                {(prediction.team2_win_probability * 100).toFixed(0)}%
              </p>
            )}
            {!prediction && (
              <p className={`${detailTileMetaClass} mt-1 font-black uppercase tracking-[0.24em] text-gray-500`}>Queued</p>
            )}
            {prediction && (
              <span
                className={`inline-flex items-center justify-center mt-1 px-2.5 py-0.5 rounded-full border text-[clamp(0.75rem,0.95vw,0.95rem)] font-mono font-semibold ${
                  featuredBookmakerUrl
                    ? 'border-amber-500/30 bg-amber-500/10 text-gray-100 cursor-pointer hover:bg-amber-500/15'
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
                {sportsbookOdds.length > 0
                  ? decimalToAmerican(sportsbookOdds[0].team2_odds)
                  : toAmericanOdds(prediction.team2_win_probability)}
              </span>
            )}
          </motion.div>
        </div>

        {/* Match info bar */}
        <motion.div
          className="relative mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[clamp(0.7rem,0.85vw,0.85rem)] text-slate-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <span className="uppercase font-semibold text-amber-500">
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
          className={`${detailTileClass} transition-all ${
            sportsbookOdds.length > 0 ? 'border-white/10' : 'border-white/[0.06]'
          }`}
          {...fadeUp}
          transition={{ delay: 0.22 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className={detailTileTitleClass}>
              <svg className="w-3.5 h-3.5 text-amber-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 14V6l4-4 4 4v8" /><path d="M10 14V8l4-4v10" /><line x1="2" y1="14" x2="14" y2="14" /></svg>
              Sportsbook Odds
            </h2>
            {sportsbookOdds.length > 0 && <span className={`${detailTileMetaClass} text-slate-300`}>{sportsbookOdds.length} trusted {sportsbookOdds.length === 1 ? 'sportsbook' : 'sportsbooks'}</span>}
          </div>
          {sportsbookOdds.length > 0 ? (
            <div className="space-y-2">
              {sportsbookOdds.slice(0, 4).map((o) => {
                const aiProb1 = prediction?.team1_win_probability;
                const impliedProb1 = o.team1_odds > 0 ? (1 / o.team1_odds) : null;
                const diff1 = aiProb1 && impliedProb1 ? ((aiProb1 - impliedProb1) * 100).toFixed(0) : null;
                const isValue1 = diff1 && Number(diff1) > 10;
                const isValue2 = diff1 && Number(diff1) < -10;

                return (
                  <button
                    key={`${o.bookmaker}-${o.fetched_at}`}
                    type="button"
                    onClick={() => {
                      const url = getBookmakerMarketUrl(o.bookmaker);
                      if (url) openExternalMarket(url);
                    }}
                    className="w-full appearance-none flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg bg-white/[0.04] border border-white/10 hover:border-amber-500/25 hover:bg-white/[0.06] transition-colors text-left"
                  >
                    <span className="text-[clamp(0.72rem,0.9vw,0.9rem)] text-slate-300 font-medium w-24 sm:w-32 truncate">{o.bookmaker}</span>
                    <div className="flex items-center gap-2.5">
                      <span className={`inline-flex items-center rounded-md border px-2 sm:px-2.5 py-0.5 sm:py-1 text-[clamp(0.75rem,0.95vw,0.95rem)] font-mono font-bold ${isValue1 ? 'text-yellow-300 border-yellow-400/30 bg-yellow-400/5' : 'text-white border-white/10 bg-white/[0.03]'}`}>
                        {decimalToAmerican(o.team1_odds)}
                        {isValue1 && <span className="ml-1 text-[clamp(0.7rem,0.85vw,0.85rem)] text-yellow-400">↑</span>}
                      </span>
                      <span className="text-slate-500 text-[clamp(0.7rem,0.85vw,0.85rem)]">|</span>
                      <span className={`inline-flex items-center rounded-md border px-2 sm:px-2.5 py-0.5 sm:py-1 text-[clamp(0.75rem,0.95vw,0.95rem)] font-mono font-bold ${isValue2 ? 'text-yellow-300 border-yellow-400/30 bg-yellow-400/5' : 'text-white border-white/10 bg-white/[0.03]'}`}>
                        {decimalToAmerican(o.team2_odds)}
                        {isValue2 && <span className="ml-1 text-[clamp(0.7rem,0.85vw,0.85rem)] text-yellow-400">↑</span>}
                      </span>
                      <svg className="w-3 h-3 text-slate-300" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 4h6v6" /><path d="M10 4L4 10" /><path d="M4 6v6h6" /></svg>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <ComingSoonTile
              title="Market board opening soon"
              body="Odds will appear here as soon as the bookmaker feed prices this fixture."
            />
          )}
        </motion.div>

        {/* Our Take */}
        {prediction ? (
          <motion.div
            className={detailTileClass}
            {...fadeUp}
            transition={{ delay: 0.25 }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className={detailTileTitleClass}>
                <svg className="w-3.5 h-3.5 text-amber-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1a5 5 0 013 9v2a1 1 0 01-1 1H6a1 1 0 01-1-1v-2A5 5 0 018 1z" /><line x1="6" y1="14" x2="10" y2="14" /></svg>
                Our Take
              </h2>
              <span
                className={`text-[clamp(0.7rem,0.85vw,0.85rem)] px-2.5 py-0.5 rounded-full font-semibold ${
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
                  <div key={i} className={`pl-3 border-l-2 border-amber-500/30 ${detailTileBodyClass}`}>
                    {sentence.trim()}
                  </div>
                ))}
            </div>
            {reasoningSentences.length > 3 && (
              <button
                type="button"
                onClick={() => setExpandedSections((prev) => ({ ...prev, ourTake: !prev.ourTake }))}
                className="mt-3 text-[clamp(0.75rem,0.9vw,0.9rem)] font-medium text-amber-400 hover:text-amber-300 transition-colors"
              >
                {expandedSections.ourTake ? 'Show less' : 'Show more'}
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            {...fadeUp}
            transition={{ delay: 0.25 }}
            className={detailTileClass}
          >
            <ComingSoonTile
              title="Prediction premiere queued"
              body="The deterministic model will publish this tile after fixture context, odds, and matchup signals finish ingesting."
              eyebrow="Analysis warming up"
            />
          </motion.div>
        )}
      </div>

      {/* AI vs Market Edge — the betting value signal */}
      {sportsbookOdds.length > 0 && prediction && (() => {
        const o = sportsbookOdds[0];
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
        let verdictColor = 'text-slate-400';
        if (bestEdge >= 7) {
          verdict = `${bestEdgeTeam} underpriced by ${bestEdge}pts — value exists`;
          verdictColor = 'text-emerald-400';
        } else if (worstEdge <= -7) {
          verdict = `${worstEdgeTeam} may be overpriced — consider fading`;
          verdictColor = 'text-amber-400';
        } else {
          verdict = 'Market fairly priced — no exploitable edge detected';
          verdictColor = 'text-slate-400';
        }

        const EdgeRow = ({ shortName, color, aiPct, impliedPct, edgePct, mktOddsStr, fairOddsStr }: {
          shortName: string; color: string; aiPct: number; impliedPct: number; edgePct: number; mktOddsStr: string; fairOddsStr: string;
        }) => {
          const isValue = edgePct >= 7;
          return (
            <div className="rounded-xl p-3.5 sm:p-4" style={{ background: `${color}12`, border: `1px solid ${color}28` }}>
              {/* Team name + odds row + edge badge */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-[clamp(0.9rem,1.1vw,1.1rem)] font-black text-white tracking-wider">{shortName}</span>
                <div className="flex items-center gap-2">
                  {/* Odds comparison */}
                  <div className="flex items-center gap-1.5 text-[clamp(0.7rem,0.85vw,0.85rem)] font-mono">
                    <span className="text-gray-500">Fair</span>
                    <span className="font-black text-gray-200">{fairOddsStr}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-gray-500">Mkt</span>
                    <span className="font-black" style={{ color }}>{mktOddsStr}</span>
                  </div>
                  {isValue ? (
                    <span className="inline-flex items-center gap-1 text-[clamp(0.7rem,0.85vw,0.85rem)] font-black uppercase tracking-widest text-emerald-300 bg-emerald-400/10 border border-emerald-400/25 px-2 py-0.5 rounded-full">
                      ↑ +{edgePct}pt
                    </span>
                  ) : (
                    <span className="text-[clamp(0.7rem,0.85vw,0.85rem)] text-slate-500 font-semibold">No edge</span>
                  )}
                </div>
              </div>
              {/* AI bar */}
              <div className="flex items-center gap-2.5 mb-2">
                <span className="text-[clamp(0.65rem,0.8vw,0.8rem)] font-black uppercase tracking-widest text-slate-400 w-9 shrink-0">AI</span>
                <div className="flex-1 h-3 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: edgeBarsReady ? `${aiPct}%` : '0%',
                      backgroundColor: color,
                      transition: 'width 0.9s ease-out 0.4s',
                    }}
                  />
                </div>
                <span className="text-[clamp(0.9rem,1.1vw,1.1rem)] font-black tabular-nums w-11 text-right" style={{ color }}>{aiPct}%</span>
              </div>
              {/* Market bar */}
              <div className="flex items-center gap-2.5">
                <span className="text-[clamp(0.65rem,0.8vw,0.8rem)] font-black uppercase tracking-widest text-gray-500 w-9 shrink-0">MKT</span>
                <div className="flex-1 h-3 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full opacity-40"
                    style={{ width: `${impliedPct}%`, backgroundColor: color }}
                  />
                </div>
                <span className="text-[clamp(0.9rem,1.1vw,1.1rem)] font-black tabular-nums w-11 text-right text-slate-400">{impliedPct}%</span>
              </div>
            </div>
          );
        };

        return (
          <motion.div
            className={`${detailTileStrongClass} border-amber-500/15 mb-4`}
            {...fadeUp}
            transition={{ delay: 0.15 }}
          >
            {/* Header with info tooltip */}
            <div className="flex items-center justify-between mb-4">
              <h2 className={detailTileTitleClass}>
                <svg className="w-3.5 h-3.5 text-amber-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 8h12M8 2v12" /><circle cx="8" cy="8" r="6" /></svg>
                AI vs Market
                <span
                  className="ml-0.5 w-4 h-4 rounded-full border border-gray-600 text-gray-500 text-[clamp(0.65rem,0.8vw,0.8rem)] font-bold flex items-center justify-center cursor-help"
                  title="Compares our AI win probability against the bookmaker's implied probability. When AI sees a team as meaningfully more likely to win than the market price suggests, that gap is a value signal."
                >i</span>
              </h2>
              <span className={`${detailTileMetaClass} text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded-full`}>
                via {o.bookmaker}
              </span>
            </div>

            <div className="space-y-2.5 mb-4">
              <EdgeRow shortName={team1Meta.shortName} color={teamColor1} aiPct={ai1} impliedPct={implied1} edgePct={edge1} mktOddsStr={mktOdds1} fairOddsStr={fairOdds1} />
              <EdgeRow shortName={team2Meta.shortName} color={teamColor2} aiPct={ai2} impliedPct={implied2} edgePct={edge2} mktOddsStr={mktOdds2} fairOddsStr={fairOdds2} />
            </div>

            {/* Plain-English verdict */}
            <div className={`text-[clamp(0.78rem,0.95vw,0.95rem)] font-semibold ${verdictColor} flex items-center gap-1.5`}>
              <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6" cy="6" r="5"/><path d="M6 4v2.5l1.5 1.5"/></svg>
              {verdict}
            </div>
          </motion.div>
        );
      })()}

      {/* Key Battles — flip cards */}
      {enrichment?.key_players?.length ? (
        <motion.div
          className={`${detailTileClass} mb-4`}
          {...fadeUp}
          transition={{ delay: 0.28 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 9.5L3 21M3 3l18 18M21 3L3 21" /><path d="M9.5 14.5L21 3" />
              </svg>
              Key Battles
            </h2>
            <span className={`${detailTileMetaClass} font-semibold text-slate-400 tracking-wide`}>
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
              const isFlipped = flippedBattles.has(i);
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
                  className="mx-1 sm:mx-0 rounded-xl overflow-hidden border border-white/10 cursor-pointer select-none transition-transform duration-150"
                  style={{
                    perspective: '1200px',
                    transform: pressedBattle === i ? 'scale(0.985)' : 'scale(1)',
                  }}
                  onClick={() => setFlippedBattles((current) => {
                    const next = new Set(current);
                    if (next.has(i)) {
                      next.delete(i);
                    } else {
                      next.add(i);
                    }
                    return next;
                  })}
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
                            <span className="inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 rounded-full text-[7px] sm:text-[clamp(0.65rem,0.75vw,0.8rem)] font-bold uppercase tracking-wider text-white" style={{
                              background: `${bMeta.primaryColor}35`,
                              border: `1px solid ${bMeta.primaryColor}80`,
                            }}>
                              <BatIcon className="hidden sm:block w-2.5 h-2.5 text-white/90" />
                              {bMeta.shortName} · Bat
                            </span>
                          </div>
                          {/* Photo + Name row */}
                          <div className="flex items-center gap-2 sm:gap-3 mb-2">
                            {batterImg && (
                              <img src={batterImg} alt={batterLast} className="w-10 h-10 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl object-cover object-top shrink-0 shadow-lg" style={{ outline: `2px solid ${bMeta.primaryColor}55` }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-xl sm:text-[clamp(1.4rem,2.6vw,2rem)] font-black text-white leading-none tracking-tight truncate">{batterLast}</p>
                              {batterStats ? (
                                <p className="hidden sm:block text-[clamp(0.7rem,0.85vw,0.9rem)] font-mono text-gray-200 mt-2 leading-none whitespace-nowrap">{batterStats.batting_avg?.toFixed(0)} AVG · {batterStats.batting_sr?.toFixed(0)} SR</p>
                              ) : null}
                              {h2h && (
                                <p className="text-[clamp(0.7rem,0.85vw,0.9rem)] font-mono text-amber-400 mt-1.5 leading-none">{h2h.runs_scored} runs vs {bowlerLast}</p>
                              )}
                            </div>
                          </div>
                          {/* Form strip — last 5 scores */}
                          {battle.batter_scores && (
                            <div className="flex items-center gap-1 mt-auto pt-2">
                              <span className="hidden sm:inline text-[clamp(0.62rem,0.72vw,0.75rem)] font-bold uppercase tracking-widest text-slate-400 mr-0.5 shrink-0">Last 5</span>
                              {battle.batter_scores.slice(0, 5).map((score, fi) => (
                                <span key={fi} className="min-w-[20px] sm:min-w-[28px] px-1 h-5 sm:h-7 rounded text-[clamp(0.65rem,0.8vw,0.8rem)] font-black flex items-center justify-center shrink-0" style={{
                                  background: score >= 50 ? '#16a34a55' : score >= 25 ? '#d9770655' : '#dc262655',
                                  color: score >= 50 ? '#4ade80' : score >= 25 ? '#fb923c' : '#f87171',
                                  border: `1px solid ${score >= 50 ? '#16a34a88' : score >= 25 ? '#d9770688' : '#dc262688'}`,
                                }}>{score}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* VS divider */}
                        <div className="w-10 sm:w-12 flex flex-col items-center justify-center bg-white/[0.04] shrink-0 gap-1 border-x border-white/10">
                          <span className="text-[8px] font-black text-gray-500 tracking-widest">VS</span>
                          {h2h ? (
                            <>
                              <span className="text-[20px] font-black text-white leading-none">{h2h.dismissals}</span>
                              <span className="text-[7px] font-black tracking-wider text-slate-300">WKT</span>
                            </>
                          ) : (
                            <span className="text-[7px] text-gray-500">—</span>
                          )}
                        </div>
                        {/* Bowler */}
                        <div className="flex-1 p-3 flex flex-col text-right" style={{ background: `linear-gradient(225deg, ${wMeta.primaryColor}1a 0%, transparent 60%)` }}>
                          {/* Team · Role pill */}
                          <div className="mb-2 flex justify-end">
                            <span className="inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 rounded-full text-[7px] sm:text-[clamp(0.65rem,0.75vw,0.8rem)] font-bold uppercase tracking-wider text-white" style={{
                              background: `${wMeta.primaryColor}35`,
                              border: `1px solid ${wMeta.primaryColor}80`,
                            }}>
                              {wMeta.shortName} · Bowl
                              <BowlIcon className="hidden sm:block w-2.5 h-2.5 text-white/90" />
                            </span>
                          </div>
                          {/* Photo + Name row */}
                          <div className="flex items-center justify-end gap-2 sm:gap-3 mb-2">
                            <div className="min-w-0 flex-1 text-right">
                              <p className="text-xl sm:text-[clamp(1.4rem,2.6vw,2rem)] font-black text-white leading-none tracking-tight truncate">{bowlerLast}</p>
                              {bowlerStats ? (
                                <p className="hidden sm:block text-[clamp(0.7rem,0.85vw,0.9rem)] font-mono text-gray-200 mt-2 leading-none whitespace-nowrap">{bowlerStats.bowling_wickets} WKTS · {bowlerStats.bowling_economy?.toFixed(1)} ECO</p>
                              ) : null}
                              {h2h && (
                                <p className="text-[clamp(0.7rem,0.85vw,0.9rem)] font-mono text-amber-300 mt-1.5 leading-none">{h2h.dot_pct}% dot balls</p>
                              )}
                            </div>
                            {bowlerImg && (
                              <img src={bowlerImg} alt={bowlerLast} className="w-10 h-10 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl object-cover object-top shrink-0 shadow-lg" style={{ outline: `2px solid ${wMeta.primaryColor}55` }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            )}
                          </div>
                          {/* Form strip — last 5 wicket hauls */}
                          {battle.bowler_figures && (
                            <div className="flex items-center justify-end gap-1 mt-auto pt-2">
                              {battle.bowler_figures.slice(0, 5).map((wkts, fi) => (
                                <span key={fi} className="min-w-[20px] sm:min-w-[28px] px-1 h-5 sm:h-7 rounded text-[clamp(0.65rem,0.8vw,0.8rem)] font-black flex items-center justify-center shrink-0" style={{
                                  background: wkts >= 3 ? '#16a34a55' : wkts >= 1 ? '#d9770655' : '#dc262655',
                                  color: wkts >= 3 ? '#4ade80' : wkts >= 1 ? '#fb923c' : '#f87171',
                                  border: `1px solid ${wkts >= 3 ? '#16a34a88' : wkts >= 1 ? '#d9770688' : '#dc262688'}`,
                                }}>{wkts}W</span>
                              ))}
                              <span className="hidden sm:inline text-[clamp(0.62rem,0.72vw,0.75rem)] font-bold uppercase tracking-widest text-slate-400 ml-0.5 shrink-0">Last 5</span>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Insight strip — single row */}
                      {insightParts && (
                        <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-t border-white/10 bg-white/[0.04] flex items-center gap-2.5 sm:gap-3">
                          <div className="text-[clamp(0.72rem,2.8vw,0.875rem)] md:text-[clamp(0.95rem,1.15vw,1.125rem)] text-slate-300 leading-snug flex-1 min-w-0 line-clamp-2 flex items-start gap-1.5 sm:gap-2">
                            <SparkleIcon className="w-[clamp(0.85rem,3vw,1rem)] md:w-4 h-[clamp(0.85rem,3vw,1rem)] md:h-4 text-amber-400 shrink-0 mt-px" />
                            <span>{insightParts.map((part, j) => {
                              const isNum = /^\d/.test(part);
                              return isNum
                                ? <strong key={j} className="text-white font-bold">{part}</strong>
                                : <span key={j}>{part}</span>;
                            })}</span>
                          </div>
                          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 sm:px-4 py-0.5 sm:py-1.5 text-[clamp(0.65rem,0.85vw,0.9rem)] font-semibold uppercase tracking-wider text-slate-300 shrink-0 whitespace-nowrap cursor-pointer">
                            <span className="relative mr-1 flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cricket-300 opacity-75" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-cricket-200" />
                            </span>
                            <span className="sm:hidden">Flip</span>
                            <span className="hidden sm:inline">Flip →</span>
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
                        className="p-3 sm:p-4 flex flex-col gap-2.5 sm:gap-3"
                        style={{
                          background: `radial-gradient(circle at 15% 20%, ${bMeta.primaryColor}33 0%, transparent 38%), radial-gradient(circle at 85% 80%, ${wMeta.primaryColor}33 0%, transparent 38%), linear-gradient(135deg, #0a1222 0%, #0f1a33 48%, #121a2c 100%)`,
                        }}
                      >
                        {h2h ? (
                          <>
                            {/* Header */}
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[clamp(0.75rem,0.95vw,0.95rem)] font-bold uppercase tracking-widest text-white">H2H Matchup</span>
                              <span className="text-[clamp(0.75rem,0.95vw,0.95rem)] font-mono text-gray-100">{batterLast} vs {bowlerLast}</span>
                            </div>
                            {/* Stats row */}
                            <div className="grid grid-cols-4 gap-1.5 sm:gap-2 mb-1">
                              {[
                                { label: 'DISMISSALS', value: String(h2h.dismissals), accent: wMeta.primaryColor },
                                { label: 'BALLS FACED', value: String(h2h.balls_faced), accent: '#f8fafc' },
                                { label: 'DOT %', value: `${h2h.dot_pct}%`, accent: '#f8fafc' },
                                { label: 'BDRY %', value: `${h2h.boundary_pct}%`, accent: bMeta.primaryColor },
                              ].map(stat => (
                                <div key={stat.label} className="rounded-lg p-1.5 sm:p-2 text-center border border-white/20 shadow-[inset_0_0_0.5px_rgba(255,255,255,0.35)]" style={{ background: 'rgba(10,20,42,0.92)' }}>
                                  <p className="text-[clamp(1.25rem,2.2vw,2rem)] font-black leading-none drop-shadow-[0_0_8px_rgba(255,255,255,0.22)]" style={{ color: stat.accent }}>{stat.value}</p>
                                  <p className="text-[clamp(0.48rem,0.7vw,0.75rem)] font-bold uppercase tracking-widest text-gray-100 mt-1.5">{stat.label}</p>
                                </div>
                              ))}
                            </div>
                            {/* Visual pressure bars */}
                            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 mb-1">
                              <div className="rounded-lg border border-white/20 p-1.5 sm:p-2" style={{ background: 'rgba(10,20,42,0.9)' }}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[clamp(0.55rem,0.8vw,0.8rem)] font-bold uppercase tracking-wider text-white">Dot-ball pressure</span>
                                  <span className="text-[clamp(0.7rem,1vw,1rem)] font-black text-white">{h2h.dot_pct}%</span>
                                </div>
                                <div className="h-2 sm:h-3 rounded-full bg-gray-700/70 overflow-hidden">
                                  <div className="h-full rounded-full shadow-[0_0_10px_rgba(255,255,255,0.3)]" style={{ width: `${Math.min(100, Math.max(0, h2h.dot_pct))}%`, backgroundColor: wMeta.primaryColor }} />
                                </div>
                              </div>
                              <div className="rounded-lg border border-white/20 p-1.5 sm:p-2" style={{ background: 'rgba(10,20,42,0.9)' }}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[clamp(0.55rem,0.8vw,0.8rem)] font-bold uppercase tracking-wider text-white">Boundary threat</span>
                                  <span className="text-[clamp(0.7rem,1vw,1rem)] font-black text-white">{h2h.boundary_pct}%</span>
                                </div>
                                <div className="h-2 sm:h-3 rounded-full bg-gray-700/70 overflow-hidden">
                                  <div className="h-full rounded-full shadow-[0_0_10px_rgba(255,255,255,0.3)]" style={{ width: `${Math.min(100, Math.max(0, h2h.boundary_pct))}%`, backgroundColor: bMeta.primaryColor }} />
                                </div>
                              </div>
                            </div>
                            {/* Last 5 encounters */}
                            <div className="rounded-lg border border-white/20 p-1.5 sm:p-2" style={{ background: 'rgba(10,20,42,0.9)' }}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[clamp(0.55rem,0.8vw,0.8rem)] text-white font-bold uppercase tracking-wider shrink-0">Last 5</span>
                                <span className="text-[clamp(0.55rem,0.8vw,0.8rem)] text-gray-100">W = bowler wicket</span>
                              </div>
                              <div className="flex gap-1.5">
                                {h2h.last_5.map((r, j) => (
                                  <span
                                    key={j}
                                    className="w-[22px] sm:w-8 h-[22px] sm:h-8 rounded-md text-[8px] sm:text-sm font-black flex items-center justify-center border border-white/20 shadow-[0_0_8px_rgba(255,255,255,0.15)]"
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
                            <div className="text-center px-2">
                              <p className={`${detailTileMetaClass} font-bold text-slate-400 mb-1`}>Stats loading</p>
                              <p className="text-[8px] text-slate-500 leading-tight">H2H data will appear once<br/>Cricsheet delivery data is fetched</p>
                            </div>
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
      {edgeScore && prediction ? (() => {
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
            className={`${detailTileStrongClass} mb-4`}
            {...fadeUp}
            transition={{ delay: 0.18 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-1">
              <h2 className={detailTileTitleClass}>
                <svg className="w-3.5 h-3.5 text-amber-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="8,1 15,5 15,11 8,15 1,11 1,5" /></svg>
                Who has the edge?
              </h2>
              <span className={`${detailTileMetaClass} text-slate-300 bg-white/[0.04] px-2 py-0.5 rounded-full`}>
                SixSense Edge Score™
              </span>
            </div>
            <p className={`${detailTileMetaClass} text-slate-300 mb-4 pl-5`}>Based on form, venue, rankings & head-to-head stats</p>

            {/* Tug-of-war bar */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[clamp(0.8rem,1vw,1rem)] font-bold" style={{ color: isT1Edge && edgeAbs > 5 ? barColor1 : '#e5e7eb', textShadow: '0 0 4px rgba(0,0,0,0.7)' }}>{prediction.team1}</span>
                <span className="text-[clamp(0.8rem,1vw,1rem)] font-bold" style={{ color: !isT1Edge && edgeAbs > 5 ? barColor2 : '#e5e7eb', textShadow: '0 0 4px rgba(0,0,0,0.7)' }}>{prediction.team2}</span>
              </div>
              <div className="h-8 rounded-full overflow-hidden flex bg-gray-800/40 border border-white/10 gap-[2px]">
                <motion.div
                  className="h-full flex items-center justify-center relative rounded-l-full"
                  style={{ backgroundColor: barColor1, boxShadow: `0 0 8px ${barColor1}40` }}
                  initial={{ width: '50%' }}
                  animate={{ width: `${t1Pct}%` }}
                  transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
                >
                  <span className="text-[clamp(0.8rem,1vw,1rem)] font-bold text-white drop-shadow-lg px-1">{Math.round(t1Pct)}%</span>
                </motion.div>
                <motion.div
                  className="h-full flex items-center justify-center relative rounded-r-full"
                  style={{ backgroundColor: barColor2, boxShadow: `0 0 8px ${barColor2}40` }}
                  initial={{ width: '50%' }}
                  animate={{ width: `${100 - t1Pct}%` }}
                  transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
                >
                  <span className="text-[clamp(0.8rem,1vw,1rem)] font-bold text-white drop-shadow-lg px-1">{Math.round(100 - t1Pct)}%</span>
                </motion.div>
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
                    <div className="w-28 sm:w-32 shrink-0">
                    <div className="text-[clamp(0.75rem,0.95vw,0.95rem)] font-semibold text-gray-100 leading-tight">{label}</div>
                    <div className={`${detailTileMetaClass} text-slate-300 leading-tight`}>{desc}</div>
                    </div>

                    {/* Score left */}
                    <span className="text-[clamp(0.75rem,0.95vw,0.95rem)] font-bold w-7 text-right shrink-0" style={{ color: !isEven && t1Leads ? barColor1 : '#cbd5e1', textShadow: '0 0 4px rgba(0,0,0,0.7)' }}>
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
                    <span className="text-[clamp(0.75rem,0.95vw,0.95rem)] font-bold w-7 shrink-0" style={{ color: !isEven && !t1Leads ? barColor2 : '#cbd5e1', textShadow: '0 0 4px rgba(0,0,0,0.7)' }}>
                      {Math.round(v2)}
                    </span>
                  </div>
                );
              })}
            </div>

          </motion.div>
        );
      })() : (
        <motion.div
          className={`${detailTileStrongClass} mb-4`}
          {...fadeUp}
          transition={{ delay: 0.18 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className={detailTileTitleClass}>
              <svg className="w-3.5 h-3.5 text-amber-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="8,1 15,5 15,11 8,15 1,11 1,5" /></svg>
              Who has the edge?
            </h2>
            <span className={`${detailTileMetaClass} text-slate-300 bg-white/[0.04] px-2 py-0.5 rounded-full`}>
              SixSense Edge Score™
            </span>
          </div>
          <ComingSoonTile
            title="Edge score rendering soon"
            body="Form, momentum, pressure, and market factors will light up here after the prediction pass finishes."
          />
        </motion.div>
      )}

      {/* Research Notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <motion.div
          className={`${detailTileClass} transition-all md:col-span-2 lg:col-span-3 ${
            enrichment || researchFacts.length > 0 ? 'border-white/10' : 'border-white/[0.06]'
          }`}
          {...fadeUp}
          transition={{ delay: 0.3 }}
        >
          <h2 className={`${detailTileTitleClass} mb-3`}>
            <svg className="w-3.5 h-3.5 text-amber-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="1" width="10" height="14" rx="1" /><line x1="5" y1="5" x2="11" y2="5" /><line x1="5" y1="8" x2="11" y2="8" /><line x1="5" y1="11" x2="9" y2="11" /></svg>
            Research Notes
          </h2>
          {enrichment || researchFacts.length > 0 ? (
            <div className="space-y-4">
              <div className={`grid gap-4 ${visibleUpdates.length > 0 ? 'xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.9fr)] xl:items-start' : ''}`}>
                <div className="space-y-3">
                  {researchSummary && (
                    <p className={`${detailTileBodyClass} max-w-4xl`}>{researchSummary}</p>
                  )}

                  {visibleSources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {visibleSources.map((source, index) => (
                        <a
                          key={`${source.url ?? source.title}-${index}`}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex items-center gap-1 ${detailTileMetaClass} font-semibold text-amber-600 hover:text-amber-500 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 px-2 py-0.5 rounded-full transition-colors`}
                        >
                          <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 2H2a1 1 0 00-1 1v5a1 1 0 001 1h5a1 1 0 001-1V6M6 1h3v3M9 1L5 5"/></svg>
                          {source.source || `[${index + 1}]`}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {visibleUpdates.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
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
                          className="flex min-w-0 items-start gap-2 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2"
                        >
                          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                          <div className="min-w-0">
                            <span className={`${detailTileMetaClass} font-bold text-white`}>{update.player ?? update.team ?? 'Update'}</span>
                            <span className={`${detailTileMetaClass} text-slate-400 ml-1.5`}>{update.status}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {researchNeedsAccordion && (
                <button
                  type="button"
                  onClick={() => setExpandedSections((prev) => ({ ...prev, researchNotes: !prev.researchNotes }))}
                  className={`mt-3 ${detailTileMetaClass} font-medium text-amber-400 hover:text-amber-300 transition-colors`}
                >
                  {expandedSections.researchNotes ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          ) : (
            <ComingSoonTile
              title="Research room opening soon"
              body="Venue, team news, squads, and matchup notes will appear here after trusted sources are ingested."
            />
          )}
        </motion.div>
      </div>

      {/* 3. Toss Insight | Squad — side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
        {/* Toss — AI-generated insight (2/5) */}
        <div className="lg:col-span-2">
          {prediction ? (
            <motion.div
              className={`${detailTileClass} h-full flex flex-col`}
              {...fadeUp}
              transition={{ delay: 0.35 }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-amber-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M5 6h6M5 10h6" /></svg>
                  <h2 className={detailTileTitleClass}>Toss Factor</h2>
                </div>
                {(() => {
                  const insight = prediction.toss_insight || enrichment?.toss_insight || '';
                  const level = insight.match(/significant|decisive|key|crucial|critical|huge|major/i)
                    ? { label: 'HIGH', color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' }
                    : insight.match(/slight|minor|some|modest|factor|matters/i)
                    ? { label: 'MED', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)' }
                    : { label: 'LOW', color: '#6b7280', bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.25)' };
                  return (
                    <span className={`${detailTileMetaClass} font-black uppercase tracking-widest px-2 py-0.5 rounded-full`} style={{ color: level.color, background: level.bg, border: `1px solid ${level.border}` }}>
                      Impact · {level.label}
                    </span>
                  );
                })()}
              </div>
              <p className={`${detailTileBodyClass} flex-1`}>
                {prediction.toss_insight || enrichment?.toss_insight || 'Toss analysis not available for this match.'}
              </p>
              <p className={`${detailTileMetaClass} text-gray-500 mt-3 flex items-center gap-1`}>
                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="6" r="5"/><path d="M6 3v3l2 1"/></svg>
                AI analysis · {espnData?.venue_name || enrichment?.venue_name || match.venue || 'venue'}
              </p>
            </motion.div>
          ) : (
            <motion.div
              className={`${detailTileClass} h-full`}
              {...fadeUp}
              transition={{ delay: 0.35 }}
            >
              <h2 className={`${detailTileTitleClass} mb-3`}>
                <svg className="w-3.5 h-3.5 text-amber-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6" /><path d="M5 6h6M5 10h6" /></svg>
                Toss Factor
              </h2>
              <ComingSoonTile
                title="Toss read coming soon"
                body="Venue and format context will shape this once the model run completes."
              />
            </motion.div>
          )}
        </div>

        {/* Squad — wider (3/5), clean avatar grid */}
        <motion.div
          className={`lg:col-span-3 bg-gradient-to-br from-[#111722]/85 to-[#0b1117]/85 backdrop-blur-xl rounded-2xl overflow-hidden border transition-all ${
            squads.length > 0 || hasSquadOrXi ? 'border-white/10' : 'border-white/[0.06]'
          }`}
          {...fadeUp}
          transition={{ delay: 0.4 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h2 className={detailTileTitleClass}>
              <svg className="w-3.5 h-3.5 text-amber-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="5" cy="4" r="2.5" /><circle cx="11" cy="4" r="2.5" /><path d="M1 13c0-2.2 1.8-4 4-4s4 1.8 4 4" /><path d="M8 13c0-2.2 1.3-4 3-4s3 1.8 3 4" /></svg>
              Squad
            </h2>
            {squads.length > 0 && (
              <span className={`${detailTileMetaClass} text-slate-400 uppercase tracking-wider`}>
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
                      <div className={`w-4 h-4 overflow-hidden flex-shrink-0 ${meta.countryCode ? 'rounded-sm' : 'rounded-full'}`}>
                        {meta.countryCode ? (
                          <img src={getFlagUrl(meta.countryCode, 16)} alt="" className="w-full h-full rounded-sm object-cover" />
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
                                <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: `${roleColor}15`, boxShadow: `0 0 0 2px ${roleColor}44`, color: roleColor }}>
                                  <RoleIcon className="w-4 h-4" />
                                </span>
                              )}
                              {player.is_captain && (
                                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-yellow-400 flex items-center justify-center text-[7px] font-black text-gray-900 leading-none">C</span>
                              )}
                            </div>
                            <span className="text-[8px] text-slate-400 text-center leading-tight w-full truncate px-0.5">{player.name.split(' ').pop()}</span>
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
                  <div className={`w-4 h-4 overflow-hidden ${meta.countryCode ? 'rounded-sm' : 'rounded-full'}`}>
                    {meta.countryCode ? (
                      <img src={getFlagUrl(meta.countryCode, 16)} alt="" className="w-full h-full rounded-sm object-cover" />
                    ) : (
                      <div className="w-full h-full" style={{ backgroundColor: meta.primaryColor }} />
                    )}
                  </div>
                  <span className={`${detailTileMetaClass} font-semibold text-white`}>{team}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {players.map((p) => (
                    <span key={p} className={`${detailTileMetaClass} text-slate-400 px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/10`}>
                      {p.split(' ').pop()}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 pb-4">
            <ComingSoonTile
              title="Squad reveal pending"
              body="Confirmed XIs and player cards will unlock when squad sources publish reliable lists."
            />
          </div>
        )}
        </motion.div>
      </div>

      {/* 4. Head to Head (ESPN data) */}
      {espnData && h2hGames.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 mb-4">
          <motion.div
            className={detailTileClass}
            {...fadeUp}
            transition={{ delay: 0.55 }}
          >
            {/* Header + win record summary */}
            <div className="flex items-center justify-between mb-3">
              <h2 className={detailTileTitleClass}>
                <svg className="w-3.5 h-3.5 text-amber-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 3v10M12 3v10M4 8h8" /></svg>
                Head to Head
              </h2>
              <div className={`flex items-center gap-2 ${detailTileMetaClass} font-black`}>
                <span style={{ color: teamColor1 }}>{team1Meta.shortName} {h2hTeam1Wins}</span>
                <span className="text-slate-500">—</span>
                <span style={{ color: teamColor2 }}>{h2hTeam2Wins} {team2Meta.shortName}</span>
                <span className="text-gray-500 font-normal ml-1">last {h2hLast5.length}</span>
              </div>
            </div>

            {/* Win proportion bar */}
            {(() => {
              const t1Pct = Math.round((h2hTeam1Wins / h2hLast5.length) * 100);
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
                const isTeam1Win = winner && isH2HTeam1(winner);
                const winColor = isTeam1Win ? teamColor1 : teamColor2;
                return (
                  <div key={i} className={`flex items-center gap-3 ${detailTileMetaClass} px-2.5 py-2 rounded-lg`} style={{ background: winner ? `${winColor}10` : 'rgba(255,255,255,0.03)', borderLeft: winner ? `2px solid ${winColor}` : '2px solid transparent' }}>
                    <span className="text-gray-500 w-14 shrink-0 tabular-nums">{game.date ? new Date(game.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' }) : '?'}</span>
                    <div className="flex-1 flex items-center gap-1 min-w-0">
                      {game.teams.map((t, j) => {
                        const isT1 = isH2HTeam1(t);
                        const tColor = isT1 ? teamColor1 : teamColor2;
                        return (
                          <span key={j} className="truncate" style={{ color: t.winner ? tColor : '#6b7280', fontWeight: t.winner ? 700 : 400 }}>
                            {t.abbreviation} {t.score}{j < game.teams.length - 1 ? ' vs ' : ''}
                          </span>
                        );
                      })}
                    </div>
                    {winner && (
                      <span className={`${detailTileMetaClass} font-black shrink-0 px-1.5 py-0.5 rounded`} style={{ color: winColor, background: `${winColor}20` }}>
                        {winner.abbreviation} ✓
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {h2hReconciliationNote && (
              <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3.5 py-3 text-[clamp(0.78rem,0.95vw,0.95rem)] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-amber-300">⚡</span>
                  <p className="leading-relaxed">{h2hReconciliationNote}</p>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 mb-4">
          <motion.div
            className={detailTileClass}
            {...fadeUp}
            transition={{ delay: 0.55 }}
          >
            <h2 className={`${detailTileTitleClass} mb-3`}>
              <svg className="w-3.5 h-3.5 text-amber-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 3v10M12 3v10M4 8h8" /></svg>
              Head to Head
            </h2>
            <ComingSoonTile
              title="Rivalry reel coming soon"
              body="Recent matchup history will appear once ESPN or scorecard history is available for this fixture."
            />
          </motion.div>
        </div>
      )}
    </div>
  );
}