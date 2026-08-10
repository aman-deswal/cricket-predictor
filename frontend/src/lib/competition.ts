export interface CompetitionMatch {
  match_id?: string;
  name: string;
  team1: string;
  team2: string;
  date: string;
  match_type: string;
  status: string;
  competition_name?: string | null;
  bookmaker_odds?: {
    bookmaker: string;
    team1_odds: number;
    team2_odds: number;
  };
}

export type MatchSection =
  | 'International'
  | 'Associate International'
  | 'Indian Premier League'
  | "Women's Premier League"
  | 'Big Bash League'
  | "Women's Big Bash League"
  | 'Caribbean Premier League'
  | 'Major League Cricket'
  | "The Hundred Men's Competition"
  | "The Hundred Women's Competition"
  | 'Pakistan Super League'
  | 'SA20'
  | 'Lanka Premier League'
  | 'Bangladesh Premier League'
  | 'Established League'
  | 'Other';

export type CompetitionKind = 'International series' | 'Tournament' | 'League';

export interface CompetitionProfile {
  key: string;
  label: string;
  filterLabel: string;
  section: MatchSection;
  priority: number;
  kind: CompetitionKind;
}

export const COMPETITION_PRIORITY = {
  IPL: 0,
  LEADING_INTERNATIONAL: 10,
  WPL: 20,
  BBL: 30,
  WBBL: 30,
  CPL: 31,
  MLC: 32,
  HUNDRED: 33,
  PSL: 40,
  SA20: 41,
  LPL: 42,
  BPL: 43,
  ESTABLISHED_LEAGUE: 50,
  ASSOCIATE_INTERNATIONAL: 70,
  UNKNOWN: 90,
} as const;

export function getMatchFormatLabel(match: { match_type?: string; name: string; competition_name?: string | null }): string {
  const source = normalizeText([
    match.competition_name,
    match.match_type,
    match.name,
  ].filter(Boolean).join(' '));

  if (/(^|\b)(test|tests?|red ball|first class)(\b|$)/.test(source)) return 'TEST';
  if (source.includes('hundred')) return '100-BALL';
  if (/(^|\b)(ipl|indian premier league|wpl|women'?s premier league|bbl|big bash league|wbbl|women'?s big bash league|cpl|caribbean premier league|psl|pakistan super league|sa20|mlc|major league cricket|lpl|lanka premier league|bpl|bangladesh premier league|ilt20|t20 blast|vitality blast|super smash|csa t20 challenge|global super league|t20 world cup|t20i)(\b|$)/.test(source)) return 'T20';
  if (/(^|\b)(cricket world cup|world cup league 2|champions trophy|odi series|odi tri series|odi super league|one day cup)(\b|$)/.test(source)) return 'ODI';
  if (/(^|\b)(odi|one day|one-day|50 over|50-over)(\b|$)/.test(source)) return 'ODI';
  if (/(^|\b)(t20|twenty20|twenty 20)(\b|$)/.test(source)) return 'T20';
  if (/(^|\b)t10(\b|$)/.test(source)) return 'T10';

  const fallback = match.match_type?.trim();
  if (fallback && normalizeText(fallback) !== 'cricket') return fallback.toUpperCase();
  return 'FORMAT TBD';
}

interface LeagueDefinition {
  key: string;
  label: string;
  filterLabel: string;
  section: MatchSection;
  priority: number;
  aliases: string[];
  teams: string[];
}

const TOP_INTERNATIONAL_TEAMS = new Set([
  'afghanistan',
  'australia',
  'bangladesh',
  'england',
  'india',
  'ireland',
  'new zealand',
  'pakistan',
  'south africa',
  'sri lanka',
  'west indies',
  'zimbabwe',
]);

const INTERNATIONAL_TEAMS = new Set([
  ...TOP_INTERNATIONAL_TEAMS,
  'bermuda',
  'canada',
  'hong kong',
  'kenya',
  'namibia',
  'nepal',
  'netherlands',
  'oman',
  'papua new guinea',
  'scotland',
  'united arab emirates',
  'united states of america',
  'usa',
]);

const HUNDRED_TEAMS = [
  'birmingham phoenix',
  'london spirit',
  'manchester originals',
  'manchester super giants',
  'northern superchargers',
  'oval invincibles',
  'southern brave',
  'sunrisers leeds',
  'trent rockets',
  'welsh fire',
];

const LEAGUES: LeagueDefinition[] = [
  {
    key: 'wpl',
    label: "Women's Premier League",
    filterLabel: 'WPL',
    section: "Women's Premier League",
    priority: COMPETITION_PRIORITY.WPL,
    aliases: ['womens premier league', "women's premier league", 'women premier league', 'wpl'],
    teams: [
      'delhi capitals women',
      'gujarat giants women',
      'mumbai indians women',
      'royal challengers bangalore women',
      'royal challengers bengaluru women',
      'up warriorz',
    ],
  },
  {
    key: 'ipl',
    label: 'Indian Premier League',
    filterLabel: 'IPL',
    section: 'Indian Premier League',
    priority: COMPETITION_PRIORITY.IPL,
    aliases: ['indian premier league', 'ipl'],
    teams: [
      'chennai super kings',
      'delhi capitals',
      'gujarat titans',
      'kolkata knight riders',
      'lucknow super giants',
      'mumbai indians',
      'punjab kings',
      'rajasthan royals',
      'royal challengers bangalore',
      'royal challengers bengaluru',
      'sunrisers hyderabad',
    ],
  },
  {
    key: 'wbbl',
    label: "Women's Big Bash League",
    filterLabel: 'WBBL',
    section: "Women's Big Bash League",
    priority: COMPETITION_PRIORITY.WBBL,
    aliases: ['womens big bash league', "women's big bash league", 'wbbl'],
    teams: [
      'adelaide strikers women',
      'brisbane heat women',
      'hobart hurricanes women',
      'melbourne renegades women',
      'melbourne stars women',
      'perth scorchers women',
      'sydney sixers women',
      'sydney thunder women',
    ],
  },
  {
    key: 'bbl',
    label: 'Big Bash League',
    filterLabel: 'BBL',
    section: 'Big Bash League',
    priority: COMPETITION_PRIORITY.BBL,
    aliases: ['big bash league', 'bbl'],
    teams: [
      'adelaide strikers',
      'brisbane heat',
      'hobart hurricanes',
      'melbourne renegades',
      'melbourne stars',
      'perth scorchers',
      'sydney sixers',
      'sydney thunder',
    ],
  },
  {
    key: 'cpl',
    label: 'Caribbean Premier League',
    filterLabel: 'CPL',
    section: 'Caribbean Premier League',
    priority: COMPETITION_PRIORITY.CPL,
    aliases: ['caribbean premier league', 'cpl'],
    teams: [
      'antigua and barbuda falcons',
      'barbados royals',
      'guyana amazon warriors',
      'jamaica tallawahs',
      'saint lucia kings',
      'st kitts and nevis patriots',
      'trinbago knight riders',
    ],
  },
  {
    key: 'mlc',
    label: 'Major League Cricket',
    filterLabel: 'MLC',
    section: 'Major League Cricket',
    priority: COMPETITION_PRIORITY.MLC,
    aliases: ['major league cricket', 'mlc'],
    teams: [
      'los angeles knight riders',
      'mi new york',
      'san francisco unicorns',
      'seattle orcas',
      'texas super kings',
      'washington freedom',
    ],
  },
  {
    key: 'psl',
    label: 'Pakistan Super League',
    filterLabel: 'PSL',
    section: 'Pakistan Super League',
    priority: COMPETITION_PRIORITY.PSL,
    aliases: ['pakistan super league', 'psl'],
    teams: ['islamabad united', 'karachi kings', 'lahore qalandars', 'multan sultans', 'peshawar zalmi', 'quetta gladiators'],
  },
  {
    key: 'sa20',
    label: 'SA20',
    filterLabel: 'SA20',
    section: 'SA20',
    priority: COMPETITION_PRIORITY.SA20,
    aliases: ['sa20'],
    teams: ['durban super giants', 'joburg super kings', 'mi cape town', 'paarl royals', 'pretoria capitals', 'sunrisers eastern cape'],
  },
  {
    key: 'lpl',
    label: 'Lanka Premier League',
    filterLabel: 'LPL',
    section: 'Lanka Premier League',
    priority: COMPETITION_PRIORITY.LPL,
    aliases: ['lanka premier league', 'lpl'],
    teams: [
      'b love kandy',
      'colombo kaps',
      'colombo strikers',
      'dambulla sixers',
      'galle gallants',
      'galle titans',
      'kandy falcons',
      'kandy royals',
    ],
  },
  {
    key: 'bpl',
    label: 'Bangladesh Premier League',
    filterLabel: 'BPL',
    section: 'Bangladesh Premier League',
    priority: COMPETITION_PRIORITY.BPL,
    aliases: ['bangladesh premier league', 'bpl'],
    teams: [
      'comilla victorians',
      'dhaka dominators',
      'fortune barishal',
      'khulna tigers',
      'rangpur riders',
      'sylhet strikers',
    ],
  },
];

const ESTABLISHED_LEAGUE_ALIASES: Array<[string, string]> = [
  ['international league t20', 'International League T20'],
  ['ilt20', 'International League T20'],
  ['t20 blast', 'T20 Blast'],
  ['vitality blast', 'T20 Blast'],
  ['super smash', 'Super Smash'],
  ['county championship', 'County Championship'],
  ['one day cup', 'One-Day Cup'],
  ['csa t20 challenge', 'CSA T20 Challenge'],
  ['global super league', 'Global Super League'],
];

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[’‘]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeTeam(team: string): string {
  return normalizeText(team)
    .replace(/\s+(men|mens|men's)$/, '')
    .trim();
}

function normalizeTeamBase(team: string): string {
  return normalizeTeam(team)
    .replace(/\s+(women|womens|women's)$/, '')
    .trim();
}

function teamIsWomen(team: string): boolean {
  return /\s+(women|womens|women's)$/.test(normalizeText(team));
}

function includesAlias(source: string, alias: string): boolean {
  const normalizedAlias = normalizeText(alias);
  return source === normalizedAlias
    || source.startsWith(`${normalizedAlias} `)
    || source.endsWith(` ${normalizedAlias}`)
    || source.includes(` ${normalizedAlias} `);
}

function getCompetitionSource(match: CompetitionMatch): string {
  const explicit = match.competition_name?.trim();
  if (explicit) return explicit;

  const commaIndex = match.name.indexOf(',');
  return commaIndex >= 0 ? match.name.slice(commaIndex + 1).trim() : '';
}

function getCompetitionSearchText(match: CompetitionMatch): string {
  const commaIndex = match.name.indexOf(',');
  const namedCompetition = commaIndex >= 0 ? match.name.slice(commaIndex + 1).trim() : '';
  return normalizeText([match.competition_name?.trim(), namedCompetition].filter(Boolean).join(' '));
}

function isExhibition(source: string): boolean {
  return ['exhibition', 'friendly', 'warm up', 'warmup', 'legends'].some((marker) => includesAlias(source, marker));
}

function bothTeamsIn(match: CompetitionMatch, teams: string[]): boolean {
  const roster = new Set(teams.map(normalizeTeam));
  return roster.has(normalizeTeam(match.team1)) && roster.has(normalizeTeam(match.team2));
}

function getHundredProfile(match: CompetitionMatch, source: string): CompetitionProfile | null {
  const isHundredAlias = [
    'the hundred',
    'hundred mens competition',
    "hundred men's competition",
    'hundred womens competition',
    "hundred women's competition",
    'mens hundred',
    "men's hundred",
    'womens hundred',
    "women's hundred",
    'hundred men',
    'hundred women',
  ]
    .some((alias) => includesAlias(source, alias));
  const hundredRoster = new Set(HUNDRED_TEAMS);
  const sameRoster = hundredRoster.has(normalizeTeamBase(match.team1)) && hundredRoster.has(normalizeTeamBase(match.team2));
  if (!isHundredAlias && (!sameRoster || isExhibition(source))) return null;

  const sourceIsWomen = /\b(women|womens|women's)\b/.test(source);
  const sourceIsMen = /\b(men|mens|men's)\b/.test(source);
  const bothWomen = teamIsWomen(match.team1) && teamIsWomen(match.team2);
  const women = sourceIsWomen || (!sourceIsMen && bothWomen);
  const key = women ? 'hundred-women' : 'hundred-men';
  const label = women ? "The Hundred Women's Competition" : "The Hundred Men's Competition";

  return {
    key,
    label,
    filterLabel: women ? 'The Hundred Women' : 'The Hundred Men',
    section: label,
    priority: COMPETITION_PRIORITY.HUNDRED,
    kind: 'League',
  };
}

function getInternationalTournamentLabel(source: string): string | null {
  const women = /\b(women|womens|women's)\b/.test(source);
  if (includesAlias(source, 't20 world cup')) {
    return women ? "ICC Women's T20 World Cup" : "ICC Men's T20 World Cup";
  }
  if (includesAlias(source, 'cricket world cup')) {
    return women ? "ICC Women's Cricket World Cup" : 'ICC Cricket World Cup';
  }
  if (includesAlias(source, 'champions trophy')) return 'ICC Champions Trophy';
  if (includesAlias(source, 'world test championship')) return 'ICC World Test Championship';
  return null;
}

function getInternationalQualifierLabel(source: string): string | null {
  if (!includesAlias(source, 'qualifier')) return null;

  const women = /\b(women|womens|women's)\b/.test(source);
  if (includesAlias(source, 't20 world cup')) {
    return women ? "ICC Women's T20 World Cup Qualifier" : "ICC Men's T20 World Cup Qualifier";
  }
  if (includesAlias(source, 'cricket world cup')) {
    return women ? "ICC Women's Cricket World Cup Qualifier" : 'ICC Cricket World Cup Qualifier';
  }
  return null;
}

function getFallbackLabel(match: CompetitionMatch): string {
  const source = getCompetitionSource(match);
  if (source && !['cricket', 'match', 't20', 't20 cricket'].includes(normalizeText(source))) {
    return source;
  }
  return `${match.match_type} cricket`;
}

export function getCompetitionProfile(match: CompetitionMatch): CompetitionProfile {
  const source = getCompetitionSearchText(match);
  const hundred = getHundredProfile(match, source);
  if (hundred) return hundred;

  const aliasedLeague = LEAGUES.find((league) => league.aliases.some((alias) => includesAlias(source, alias)));
  if (aliasedLeague) {
    return {
      key: aliasedLeague.key,
      label: aliasedLeague.label,
      filterLabel: aliasedLeague.filterLabel,
      section: aliasedLeague.section,
      priority: aliasedLeague.priority,
      kind: 'League',
    };
  }

  const internationalQualifier = getInternationalQualifierLabel(source);
  if (internationalQualifier) {
    return {
      key: normalizeText(internationalQualifier).replace(/\s+/g, '-'),
      label: internationalQualifier,
      filterLabel: internationalQualifier,
      section: 'Associate International',
      priority: COMPETITION_PRIORITY.ASSOCIATE_INTERNATIONAL,
      kind: 'Tournament',
    };
  }

  const internationalTournament = getInternationalTournamentLabel(source);
  if (internationalTournament) {
    return {
      key: normalizeText(internationalTournament).replace(/\s+/g, '-'),
      label: internationalTournament,
      filterLabel: internationalTournament,
      section: 'International',
      priority: COMPETITION_PRIORITY.LEADING_INTERNATIONAL,
      kind: 'Tournament',
    };
  }

  const internationalTeams = [normalizeTeamBase(match.team1), normalizeTeamBase(match.team2)];
  if (internationalTeams.every((team) => TOP_INTERNATIONAL_TEAMS.has(team))) {
    const label = source ? getFallbackLabel(match) : `${match.match_type} International`;
    return {
      key: normalizeText(label).replace(/\s+/g, '-') || 'international',
      label,
      filterLabel: label,
      section: 'International',
      priority: COMPETITION_PRIORITY.LEADING_INTERNATIONAL,
      kind: 'International series',
    };
  }

  if (!isExhibition(source)) {
    const rosterLeague = LEAGUES.find((league) => bothTeamsIn(match, league.teams));
    if (rosterLeague) {
      return {
        key: rosterLeague.key,
        label: rosterLeague.label,
        filterLabel: rosterLeague.filterLabel,
        section: rosterLeague.section,
        priority: rosterLeague.priority,
        kind: 'League',
      };
    }
  }

  const establishedLeague = ESTABLISHED_LEAGUE_ALIASES.find(([alias]) => includesAlias(source, alias));
  if (establishedLeague) {
    const [, label] = establishedLeague;
    return {
      key: normalizeText(label).replace(/\s+/g, '-'),
      label,
      filterLabel: label,
      section: 'Established League',
      priority: COMPETITION_PRIORITY.ESTABLISHED_LEAGUE,
      kind: 'League',
    };
  }

  if (internationalTeams.every((team) => INTERNATIONAL_TEAMS.has(team))) {
    const label = source ? getFallbackLabel(match) : `${match.match_type} International`;
    return {
      key: normalizeText(label).replace(/\s+/g, '-') || 'associate-international',
      label,
      filterLabel: label,
      section: 'Associate International',
      priority: COMPETITION_PRIORITY.ASSOCIATE_INTERNATIONAL,
      kind: 'International series',
    };
  }

  const label = getFallbackLabel(match);
  return {
    key: normalizeText(label).replace(/\s+/g, '-') || 'other',
    label,
    filterLabel: label,
    section: 'Other',
    priority: COMPETITION_PRIORITY.UNKNOWN,
    kind: /(cup|trophy|championship|qualifier|world|finals?)/i.test(label) ? 'Tournament' : 'League',
  };
}

export function getMatchSection(match: CompetitionMatch): MatchSection {
  return getCompetitionProfile(match).section;
}

export function getCompetitionPriority(match: CompetitionMatch): number {
  return getCompetitionProfile(match).priority;
}

export function getMatchTimestamp(match: CompetitionMatch): number {
  const raw = match.date.endsWith('Z') || match.date.includes('+') ? match.date : `${match.date}Z`;
  const timestamp = new Date(raw).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function compareStableMatchIdentity(a: CompetitionMatch, b: CompetitionMatch): number {
  return (a.match_id ?? `${a.team1}-${a.team2}`).localeCompare(b.match_id ?? `${b.team1}-${b.team2}`);
}

const LIVE_MATCH_PRIORITY_BONUS = 8;

function getMatchCenterPriority(match: CompetitionMatch): number {
  const liveBoost = match.status.toLowerCase() === 'live' ? LIVE_MATCH_PRIORITY_BONUS : 0;
  return getCompetitionPriority(match) - liveBoost;
}

export function hasValidMarketOdds(match: CompetitionMatch): boolean {
  const odds = match.bookmaker_odds;
  return Boolean(
    odds?.bookmaker.trim()
    && Number.isFinite(odds.team1_odds)
    && odds.team1_odds > 1
    && Number.isFinite(odds.team2_odds)
    && odds.team2_odds > 1,
  );
}

export function getFeaturedHorizonMatches<T extends CompetitionMatch>(matches: T[], now = Date.now()): T[] {
  const hour = 60 * 60 * 1000;
  const futureMatches = matches
    .filter((match) => {
      const kickoff = getMatchTimestamp(match);
      return match.status.toLowerCase() === 'upcoming'
        && kickoff > now
        && kickoff !== Number.MAX_SAFE_INTEGER;
    })
    .sort((a, b) => {
      const kickoffDiff = getMatchTimestamp(a) - getMatchTimestamp(b);
      return kickoffDiff !== 0 ? kickoffDiff : compareStableMatchIdentity(a, b);
    });

  const within24Hours = futureMatches.filter((match) => getMatchTimestamp(match) <= now + 24 * hour);
  if (within24Hours.length > 0) return within24Hours;

  const within48Hours = futureMatches.filter((match) => getMatchTimestamp(match) <= now + 48 * hour);
  if (within48Hours.length > 0) return within48Hours;

  return futureMatches;
}

export function compareMatchesByCompetition(a: CompetitionMatch, b: CompetitionMatch): number {
  const priorityDiff = getCompetitionPriority(a) - getCompetitionPriority(b);
  if (priorityDiff !== 0) return priorityDiff;

  const kickoffDiff = getMatchTimestamp(a) - getMatchTimestamp(b);
  if (kickoffDiff !== 0) return kickoffDiff;

  return compareStableMatchIdentity(a, b);
}

export function compareMatchCenterMatches(a: CompetitionMatch, b: CompetitionMatch): number {
  const priorityDiff = getMatchCenterPriority(a) - getMatchCenterPriority(b);
  if (priorityDiff !== 0) return priorityDiff;

  const liveDiff = (a.status.toLowerCase() === 'live' ? 0 : 1) - (b.status.toLowerCase() === 'live' ? 0 : 1);
  if (liveDiff !== 0) return liveDiff;
  return compareMatchesByCompetition(a, b);
}
