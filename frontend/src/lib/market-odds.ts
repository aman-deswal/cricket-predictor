export interface MarketOddsLike {
  bookmaker: string;
  team1_odds: number;
  team2_odds: number;
  draw_odds?: number | null;
  fetched_at?: string | null;
}

export const TRUSTED_SPORTSBOOKS: Record<string, { url: string; priority: number }> = {
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

export function normalizeBookmaker(bookmaker: string): string {
  return bookmaker.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getTrustedSportsbook(bookmaker: string): { url: string; priority: number } | null {
  return TRUSTED_SPORTSBOOKS[normalizeBookmaker(bookmaker)] ?? null;
}

export function getBookmakerMarketUrl(bookmaker: string): string | null {
  return getTrustedSportsbook(bookmaker)?.url ?? null;
}

export function hasValidTwoSidedOdds(snapshot: Pick<MarketOddsLike, 'team1_odds' | 'team2_odds'>): boolean {
  return Number.isFinite(snapshot.team1_odds)
    && snapshot.team1_odds > 1
    && Number.isFinite(snapshot.team2_odds)
    && snapshot.team2_odds > 1;
}

export function selectFreshestTrustedSportsbookOdds<T extends MarketOddsLike>(odds: T[]): T[] {
  const trusted = odds.filter((entry) => (
    getTrustedSportsbook(entry.bookmaker) !== null && hasValidTwoSidedOdds(entry)
  ));
  if (trusted.length === 0) return [];

  const freshestTimestamp = trusted.reduce((latest, entry) => {
    const timestamp = entry.fetched_at ? new Date(entry.fetched_at).getTime() : Number.NEGATIVE_INFINITY;
    return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
  }, Number.NEGATIVE_INFINITY);

  const freshestCohort = Number.isFinite(freshestTimestamp)
    ? trusted.filter((entry) => new Date(entry.fetched_at ?? '').getTime() === freshestTimestamp)
    : trusted;

  return [...freshestCohort].sort((left, right) => {
    const leftPriority = getTrustedSportsbook(left.bookmaker)?.priority ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = getTrustedSportsbook(right.bookmaker)?.priority ?? Number.MAX_SAFE_INTEGER;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return left.bookmaker.localeCompare(right.bookmaker);
  });
}
