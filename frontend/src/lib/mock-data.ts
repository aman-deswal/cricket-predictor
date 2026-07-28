import type {
  EdgeScore,
  ESPNMatchData,
  Match,
  MatchEnrichment,
  MatchOdds,
  MatchSquad,
  MatchWithPredictions,
  PlayerStats,
  Prediction,
  PredictionHistoryItem,
} from './supabase';

const now = Date.now();

function futureIso(hoursAhead: number): string {
  return new Date(now + hoursAhead * 60 * 60 * 1000).toISOString();
}

function pastIso(daysAgo: number): string {
  return new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function getMatchSection(match: Match): 'International' | 'League' | 'Other' {
  const topInternationalTeams = new Set([
    'India',
    'Australia',
    'England',
    'South Africa',
    'New Zealand',
    'Pakistan',
    'Sri Lanka',
    'Bangladesh',
    'West Indies',
    'Afghanistan',
    'Zimbabwe',
    'Ireland',
  ]);

  const popularLeagues = [
    'indian premier league',
    'ipl',
    'womens premier league',
    'women premier league',
    'wpl',
    'big bash league',
    'bbl',
    'the hundred',
    'caribbean premier league',
    'cpl',
    'pakistan super league',
    'psl',
    'sa20',
    'major league cricket',
    'mlc',
    'lanka premier league',
    'lpl',
    'bangladesh premier league',
    'bpl',
  ];

  const team1 = match.team1.replace(/\s+Women$/, '').replace(/\s+Men$/, '').trim();
  const team2 = match.team2.replace(/\s+Women$/, '').replace(/\s+Men$/, '').trim();
  const haystack = `${match.name} ${match.venue}`.toLowerCase();

  if (topInternationalTeams.has(team1) && topInternationalTeams.has(team2)) {
    return 'International';
  }
  if (popularLeagues.some((league) => haystack.includes(league))) {
    return 'League';
  }
  return 'Other';
}

function sortMatches(matches: MatchWithPredictions[]): MatchWithPredictions[] {
  return [...matches].sort((a, b) => {
    const priority = (section: ReturnType<typeof getMatchSection>) => (section === 'International' ? 0 : section === 'League' ? 1 : 2);
    const sectionDiff = priority(getMatchSection(a)) - priority(getMatchSection(b));
    if (sectionDiff !== 0) return sectionDiff;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
}

function makePrediction(match: Match, winner: string, team1Prob: number, confidence: Prediction['confidence']): Prediction {
  return {
    match_id: match.match_id,
    team1: match.team1,
    team2: match.team2,
    predicted_winner: winner,
    team1_win_probability: team1Prob,
    team2_win_probability: 1 - team1Prob,
    confidence,
    reasoning:
      winner === match.team1
        ? `${match.team1} carry the stronger recent form and a better matchup profile in this mock dataset.`
        : `${match.team2} have the edge in this mock dataset thanks to stronger late-innings control and market support.`,
    toss_insight: 'If the toss goes the favored team’s way, the edge widens slightly.',
    model: 'gpt-4o',
    ensemble_size: 3,
    scored_at: pastIso(2),
  };
}

const demoMatches: MatchWithPredictions[] = sortMatches([
  {
    match_id: 'demo-ind-vs-aus-odi',
    name: 'India vs Australia, Australia tour of India 2026',
    team1: 'India',
    team2: 'Australia',
    date: futureIso(6),
    venue: 'Wankhede Stadium, Mumbai',
    match_type: 'ODI',
    status: 'upcoming',
    winner: undefined,
    team1_recent_form: ['W', 'W', 'L', 'W', 'W'],
    team2_recent_form: ['W', 'L', 'W', 'W', 'L'],
    bookmaker_odds: { bookmaker: 'Tab', team1_odds: 1.72, team2_odds: 2.15 },
    predictions: [makePrediction({
      match_id: 'demo-ind-vs-aus-odi',
      name: 'India vs Australia, Australia tour of India 2026',
      team1: 'India',
      team2: 'Australia',
      date: futureIso(6),
      venue: 'Wankhede Stadium, Mumbai',
      match_type: 'ODI',
      status: 'upcoming',
    }, 'India', 0.58, 'high')],
  },
  {
    match_id: 'demo-mi-vs-csk-ipl',
    name: 'Mumbai Indians vs Chennai Super Kings, Indian Premier League 2026',
    team1: 'Mumbai Indians',
    team2: 'Chennai Super Kings',
    date: futureIso(3),
    venue: 'Wankhede Stadium, Mumbai',
    match_type: 'T20',
    status: 'upcoming',
    winner: undefined,
    team1_recent_form: ['W', 'L', 'W', 'W', 'L'],
    team2_recent_form: ['W', 'W', 'W', 'L', 'W'],
    bookmaker_odds: { bookmaker: 'SkyBet', team1_odds: 1.94, team2_odds: 1.87 },
    predictions: [makePrediction({
      match_id: 'demo-mi-vs-csk-ipl',
      name: 'Mumbai Indians vs Chennai Super Kings, Indian Premier League 2026',
      team1: 'Mumbai Indians',
      team2: 'Chennai Super Kings',
      date: futureIso(3),
      venue: 'Wankhede Stadium, Mumbai',
      match_type: 'T20',
      status: 'upcoming',
    }, 'Chennai Super Kings', 0.46, 'high')],
  },
  {
    match_id: 'demo-engw-vs-saw-t20',
    name: 'England Women vs South Africa Women, Women’s T20 Tri-Series 2026',
    team1: 'England Women',
    team2: 'South Africa Women',
    date: futureIso(9),
    venue: 'The Oval, London',
    match_type: 'T20',
    status: 'upcoming',
    winner: undefined,
    team1_recent_form: ['W', 'W', 'W', 'L', 'W'],
    team2_recent_form: ['L', 'W', 'W', 'W', 'W'],
    bookmaker_odds: { bookmaker: 'Unibet', team1_odds: 1.89, team2_odds: 1.92 },
    predictions: [makePrediction({
      match_id: 'demo-engw-vs-saw-t20',
      name: 'England Women vs South Africa Women, Women’s T20 Tri-Series 2026',
      team1: 'England Women',
      team2: 'South Africa Women',
      date: futureIso(9),
      venue: 'The Oval, London',
      match_type: 'T20',
      status: 'upcoming',
    }, 'England Women', 0.54, 'medium')],
  },
  {
    match_id: 'demo-nep-vs-nam-odi',
    name: 'Nepal vs Namibia, ICC Cricket World Cup League 2',
    team1: 'Nepal',
    team2: 'Namibia',
    date: futureIso(12),
    venue: 'Tribhuvan University International Cricket Ground, Kirtipur',
    match_type: 'ODI',
    status: 'upcoming',
    winner: undefined,
    team1_recent_form: ['L', 'W', 'W', 'L', 'W'],
    team2_recent_form: ['W', 'L', 'W', 'L', 'W'],
    bookmaker_odds: { bookmaker: 'Bet365', team1_odds: 2.25, team2_odds: 1.68 },
    predictions: [makePrediction({
      match_id: 'demo-nep-vs-nam-odi',
      name: 'Nepal vs Namibia, ICC Cricket World Cup League 2',
      team1: 'Nepal',
      team2: 'Namibia',
      date: futureIso(12),
      venue: 'Tribhuvan University International Cricket Ground, Kirtipur',
      match_type: 'ODI',
      status: 'upcoming',
    }, 'Namibia', 0.41, 'medium')],
  },
]);

const demoMatchOdds: MatchOdds[] = [
  { match_id: 'demo-ind-vs-aus-odi', bookmaker: 'Tab', team1_odds: 1.72, team2_odds: 2.15, draw_odds: null, market: 'match_winner', fetched_at: pastIso(1) },
  { match_id: 'demo-mi-vs-csk-ipl', bookmaker: 'SkyBet', team1_odds: 1.94, team2_odds: 1.87, draw_odds: null, market: 'match_winner', fetched_at: pastIso(1) },
  { match_id: 'demo-engw-vs-saw-t20', bookmaker: 'Unibet', team1_odds: 1.89, team2_odds: 1.92, draw_odds: null, market: 'match_winner', fetched_at: pastIso(1) },
  { match_id: 'demo-nep-vs-nam-odi', bookmaker: 'Bet365', team1_odds: 2.25, team2_odds: 1.68, draw_odds: null, market: 'match_winner', fetched_at: pastIso(1) },
];

const miCskSquadPlayers = [
  { id: 'mi-1', name: 'Rohit Sharma', role: 'Bat', is_captain: true },
  { id: 'mi-2', name: 'Ishan Kishan', role: 'Keeper', is_keeper: true },
  { id: 'mi-3', name: 'Suryakumar Yadav', role: 'Bat' },
  { id: 'mi-4', name: 'Tilak Varma', role: 'Bat' },
  { id: 'mi-5', name: 'Hardik Pandya', role: 'All', is_captain: true },
  { id: 'mi-6', name: 'Tim David', role: 'Bat' },
  { id: 'mi-7', name: 'Nehal Wadhera', role: 'Bat' },
  { id: 'mi-8', name: 'Piyush Chawla', role: 'Bowl' },
  { id: 'mi-9', name: 'Jasprit Bumrah', role: 'Bowl' },
  { id: 'mi-10', name: 'Gerald Coetzee', role: 'Bowl' },
  { id: 'mi-11', name: 'Akash Madhwal', role: 'Bowl' },
];

const cskSquadPlayers = [
  { id: 'csk-1', name: 'Ruturaj Gaikwad', role: 'Bat', is_captain: true },
  { id: 'csk-2', name: 'Devon Conway', role: 'Bat' },
  { id: 'csk-3', name: 'Ajinkya Rahane', role: 'Bat' },
  { id: 'csk-4', name: 'Shivam Dube', role: 'Bat' },
  { id: 'csk-5', name: 'MS Dhoni', role: 'Keeper', is_keeper: true },
  { id: 'csk-6', name: 'Ravindra Jadeja', role: 'All' },
  { id: 'csk-7', name: 'Daryl Mitchell', role: 'All' },
  { id: 'csk-8', name: 'Deepak Chahar', role: 'Bowl' },
  { id: 'csk-9', name: 'Matheesha Pathirana', role: 'Bowl' },
  { id: 'csk-10', name: 'Tushar Deshpande', role: 'Bowl' },
  { id: 'csk-11', name: 'Maheesh Theekshana', role: 'Bowl' },
];

const indiaSquadPlayers = [
  { id: 'ind-1', name: 'Rohit Sharma', role: 'Bat', is_captain: true },
  { id: 'ind-2', name: 'Shubman Gill', role: 'Bat' },
  { id: 'ind-3', name: 'Virat Kohli', role: 'Bat' },
  { id: 'ind-4', name: 'KL Rahul', role: 'Keeper', is_keeper: true },
  { id: 'ind-5', name: 'Suryakumar Yadav', role: 'Bat' },
  { id: 'ind-6', name: 'Hardik Pandya', role: 'All' },
  { id: 'ind-7', name: 'Ravindra Jadeja', role: 'All' },
  { id: 'ind-8', name: 'Jasprit Bumrah', role: 'Bowl' },
  { id: 'ind-9', name: 'Mohammed Siraj', role: 'Bowl' },
  { id: 'ind-10', name: 'Kuldeep Yadav', role: 'Bowl' },
  { id: 'ind-11', name: 'Ravichandran Ashwin', role: 'Bowl' },
];

const australiaSquadPlayers = [
  { id: 'aus-1', name: 'Travis Head', role: 'Bat' },
  { id: 'aus-2', name: 'David Warner', role: 'Bat' },
  { id: 'aus-3', name: 'Steve Smith', role: 'Bat' },
  { id: 'aus-4', name: 'Marnus Labuschagne', role: 'Bat' },
  { id: 'aus-5', name: 'Glenn Maxwell', role: 'All' },
  { id: 'aus-6', name: 'Mitchell Marsh', role: 'All', is_captain: true },
  { id: 'aus-7', name: 'Alex Carey', role: 'Keeper', is_keeper: true },
  { id: 'aus-8', name: 'Pat Cummins', role: 'Bowl' },
  { id: 'aus-9', name: 'Josh Hazlewood', role: 'Bowl' },
  { id: 'aus-10', name: 'Adam Zampa', role: 'Bowl' },
  { id: 'aus-11', name: 'Mitchell Starc', role: 'Bowl' },
];

function makePlayerStats(team: string, players: Array<{ name: string; role: string }>, format: string): PlayerStats[] {
  return players.map((player, index) => ({
    player_name: player.name,
    team,
    format,
    role: player.role,
    batting_avg: 24 + index * 1.3,
    batting_sr: 118 + index * 2.1,
    batting_runs: 180 + index * 37,
    batting_innings: 10 + (index % 6),
    batting_highest: `${42 + index * 4}`,
    batting_fifties: index % 3,
    batting_hundreds: index % 6 === 0 ? 1 : 0,
    bowling_avg: 18 + index * 1.6,
    bowling_economy: 6.2 + index * 0.15,
    bowling_wickets: 4 + index,
    bowling_innings: 8 + (index % 5),
    bowling_best: `${2 + (index % 3)}/${14 + index}`,
    matches_played: 18 + index * 2,
  }));
}

const demoSquads: MatchSquad[] = [
  {
    match_id: 'demo-mi-vs-csk-ipl',
    team: 'Mumbai Indians',
    players: miCskSquadPlayers,
    is_confirmed: true,
    source: 'demo',
    fetched_at: pastIso(1),
  },
  {
    match_id: 'demo-mi-vs-csk-ipl',
    team: 'Chennai Super Kings',
    players: cskSquadPlayers,
    is_confirmed: true,
    source: 'demo',
    fetched_at: pastIso(1),
  },
  {
    match_id: 'demo-ind-vs-aus-odi',
    team: 'India',
    players: indiaSquadPlayers,
    is_confirmed: false,
    source: 'demo',
    fetched_at: pastIso(1),
  },
  {
    match_id: 'demo-ind-vs-aus-odi',
    team: 'Australia',
    players: australiaSquadPlayers,
    is_confirmed: false,
    source: 'demo',
    fetched_at: pastIso(1),
  },
];

const demoPlayerStats = [
  ...makePlayerStats('Mumbai Indians', miCskSquadPlayers, 't20i'),
  ...makePlayerStats('Chennai Super Kings', cskSquadPlayers, 't20i'),
  ...makePlayerStats('India', indiaSquadPlayers, 'odi'),
  ...makePlayerStats('Australia', australiaSquadPlayers, 'odi'),
];

const demoMatchEnrichment: MatchEnrichment[] = [
  {
    match_id: 'demo-mi-vs-csk-ipl',
    venue_name: 'Wankhede Stadium',
    venue_confidence: 'confirmed',
    possible_xi: {
      team1: miCskSquadPlayers.map((player) => player.name),
      team2: cskSquadPlayers.map((player) => player.name),
    },
    player_updates: [
      { player: 'Jasprit Bumrah', team: 'Mumbai Indians', status: 'Available after full training load', confidence: 'confirmed' },
      { player: 'Devon Conway', team: 'Chennai Super Kings', status: 'Travelled with squad; selection likely', confidence: 'reported' },
    ],
    key_players: [
      { batter: 'Suryakumar Yadav', batter_team: 'Mumbai Indians', bowler: 'Matheesha Pathirana', bowler_team: 'Chennai Super Kings', insight: 'This matchup can swing the middle overs if MI attack the short ball early.' },
      { batter: 'Ruturaj Gaikwad', batter_team: 'Chennai Super Kings', bowler: 'Jasprit Bumrah', bowler_team: 'Mumbai Indians', insight: 'New-ball discipline will decide whether CSK can get ahead of the chase.' },
    ],
    expert_preview: 'Mock preview: Mumbai have home advantage, but CSK’s bowling control keeps this close into the final overs. The demo data is designed to exercise the full prediction detail page without live feeds.',
    toss_insight: 'Chasing is slightly preferred if dew arrives late.',
    source_links: [
      { title: 'Demo team briefing', url: 'https://example.com/demo-brief-1', source: 'demo', published_at: pastIso(1) },
      { title: 'Demo scouting note', url: 'https://example.com/demo-brief-2', source: 'demo', published_at: pastIso(1) },
    ],
    confidence: 'high',
    generated_at: pastIso(1),
  },
];

const demoEdgeScores: EdgeScore[] = [
  {
    team1_score: 54,
    team2_score: 46,
    net_edge: 8,
    edge_team: 'Chennai Super Kings',
    narrative: 'CSK hold the tighter bowling and finishing edge in this mock card.',
    factors: {
      team1: { form: 7, momentum: 6, pressure: 5, market: 6 },
      team2: { form: 8, momentum: 7, pressure: 7, market: 7 },
    },
  },
];

const demoEspnData: ESPNMatchData[] = [
  {
    match_id: 'demo-mi-vs-csk-ipl',
    espn_event_id: 'demo-espn-mi-csk',
    venue_name: 'Wankhede Stadium',
    venue_city: 'Mumbai',
    venue_country: 'India',
    venue_capacity: 33108,
    venue_grass: true,
    venue_image_url: null,
    toss_winner: 'Chennai Super Kings',
    toss_decision: 'field',
    match_number: '55',
    match_days: '1',
    hours_of_play: '19:30 - 23:00',
    series_note: 'Mock IPL fixture used for local development.',
    series_scoreline: 'Mumbai Indians lead 1-0',
    series_leaders: [],
    officials: [],
    rosters: [],
    head_to_head: [
      {
        date: pastIso(20),
        note: 'Previous demo contest',
        teams: [
          { name: 'Mumbai Indians', abbreviation: 'MI', score: '176/6', winner: false },
          { name: 'Chennai Super Kings', abbreviation: 'CSK', score: '178/4', winner: true },
        ],
      },
      {
        date: pastIso(50),
        note: 'Another demo contest',
        teams: [
          { name: 'Mumbai Indians', abbreviation: 'MI', score: '184/5', winner: true },
          { name: 'Chennai Super Kings', abbreviation: 'CSK', score: '179/8', winner: false },
        ],
      },
    ],
    standings: [],
    scorecards: [],
    fetched_at: pastIso(1),
  },
];

type DemoFixture = {
  team1: string;
  team2: string;
  favorite: string;
  underdog: string;
  t1prob: number;
  t2prob: number;
  reasoning: string;
  toss_insight: string;
  confidence: 'low' | 'medium' | 'high';
};

const DEMO_FIXTURES: DemoFixture[] = [
  {
    team1: 'India', team2: 'Australia', favorite: 'India', underdog: 'Australia',
    t1prob: 0.64, t2prob: 0.36,
    reasoning: "India's formidable home record and depth across all departments make them strong favourites. Australia's pace attack is potent but India's batting lineup has handled similar threats well in recent series.",
    toss_insight: "The pitch historically assists spin in the second half, so the team batting first should look to post 320+.",
    confidence: 'high',
  },
  {
    team1: 'England', team2: 'Pakistan', favorite: 'England', underdog: 'Pakistan',
    t1prob: 0.58, t2prob: 0.42,
    reasoning: "England's aggressive Bazball approach has been highly effective in home conditions. Pakistan's bowling attack is impressive but their batting collapses under pressure remain a concern.",
    toss_insight: "Overcast conditions favour Pakistan's swing bowlers early. A batting side winning the toss may have an advantage.",
    confidence: 'medium',
  },
  {
    team1: 'Mumbai Indians', team2: 'Chennai Super Kings', favorite: 'Mumbai Indians', underdog: 'Chennai Super Kings',
    t1prob: 0.55, t2prob: 0.45,
    reasoning: "This is the most contested fixture in IPL history. MI edge this out based on their recent powerplay bowling and strong middle-order finishing. CSK's experience with dew in night games adds variance.",
    toss_insight: "Dew is expected post-innings. Chasing has won 7 of the last 10 MI vs CSK night games at Wankhede.",
    confidence: 'medium',
  },
  {
    team1: 'South Africa Women', team2: 'England Women', favorite: 'England Women', underdog: 'South Africa Women',
    t1prob: 0.38, t2prob: 0.62,
    reasoning: "England Women have been in exceptional form, led by strong performances from their top-3. South Africa Women have the bowling to compete but their batting has been inconsistent.",
    toss_insight: "Flat pitch expected. Toss less critical — batting conditions should remain consistent throughout.",
    confidence: 'medium',
  },
];

const demoHistory: PredictionHistoryItem[] = Array.from({ length: 60 }, (_, index) => {
  const fixture = DEMO_FIXTURES[index % DEMO_FIXTURES.length];
  const correct = index % 3 !== 0;
  const predictedProbability = fixture.t1prob + ((index % 5) * 0.02);
  return {
    prediction_id: `demo-pred-${index + 1}`,
    match_id: `demo-${index + 1}`,
    team1: fixture.team1,
    team2: fixture.team2,
    predicted_winner: fixture.favorite,
    actual_winner: correct ? fixture.favorite : fixture.underdog,
    correct,
    brier_score: correct ? 0.18 : 0.32,
    predicted_probability: Math.min(predictedProbability, 0.82),
    scored_at: pastIso(60 - index),
    reasoning: fixture.reasoning,
    toss_insight: fixture.toss_insight,
    confidence: fixture.confidence,
    team1_win_probability: fixture.t1prob,
    team2_win_probability: fixture.t2prob,
  };
}).reverse();

const demoCalibration = [
  { bin_center: 0.55, predicted_avg: 0.54, actual_avg: 0.52, count: 12 },
  { bin_center: 0.65, predicted_avg: 0.64, actual_avg: 0.61, count: 13 },
  { bin_center: 0.75, predicted_avg: 0.74, actual_avg: 0.71, count: 11 },
  { bin_center: 0.85, predicted_avg: 0.84, actual_avg: 0.81, count: 14 },
  { bin_center: 0.95, predicted_avg: 0.93, actual_avg: 0.9, count: 10 },
];

function buildRollingTrend(results: PredictionHistoryItem[]): Array<{ date: string; accuracy: number }> {
  const ordered = [...results].sort((a, b) => new Date(a.scored_at).getTime() - new Date(b.scored_at).getTime());
  const window = 10;
  const trend: Array<{ date: string; accuracy: number }> = [];
  for (let i = window - 1; i < ordered.length; i++) {
    const slice = ordered.slice(i - window + 1, i + 1);
    const correct = slice.filter((result) => result.correct).length;
    trend.push({
      date: new Date(ordered[i].scored_at).toLocaleDateString(),
      accuracy: (correct / window) * 100,
    });
  }
  return trend;
}

export function getMockUpcomingMatches(): MatchWithPredictions[] {
  return demoMatches;
}

export function getMockMatch(matchId: string): Match | null {
  return demoMatches.find((match) => match.match_id === matchId) ?? null;
}

export function getMockPrediction(matchId: string): Prediction | null {
  return demoMatches.find((match) => match.match_id === matchId)?.predictions?.[0] ?? null;
}

export function getMockMatchOdds(matchId: string): MatchOdds[] {
  return demoMatchOdds.filter((odds) => odds.match_id === matchId);
}

export function getMockEdgeScore(matchId: string): EdgeScore | null {
  if (matchId !== 'demo-mi-vs-csk-ipl') return null;
  return demoEdgeScores[0] ?? null;
}

export function getMockMatchEnrichment(matchId: string): MatchEnrichment | null {
  return demoMatchEnrichment.find((entry) => entry.match_id === matchId) ?? null;
}

export function getMockMatchSquads(matchId: string): MatchSquad[] {
  return demoSquads.filter((squad) => squad.match_id === matchId);
}

export function getMockESPNMatchData(matchId: string): ESPNMatchData | null {
  return demoEspnData.find((entry) => entry.match_id === matchId) ?? null;
}

export function getMockPlayerStats(playerNames: string[], format: string): PlayerStats[] {
  if (!playerNames.length) return [];
  return demoPlayerStats.filter(
    (player) => player.format === format && playerNames.includes(player.player_name),
  );
}

export function getMockPredictionHistory(): PredictionHistoryItem[] {
  return demoHistory;
}

export function getMockDashboardStats(): { total: number; correct: number; accuracy: number; avgBrier: number } {
  const total = demoHistory.length;
  const correct = demoHistory.filter((result) => result.correct).length;
  const brierScores = demoHistory.map((result) => result.brier_score).filter((score): score is number => score !== null);
  return {
    total,
    correct,
    accuracy: total > 0 ? correct / total : 0,
    avgBrier: brierScores.reduce((sum, score) => sum + score, 0) / brierScores.length,
  };
}

export function getMockCalibrationData(): Array<{ bin_center: number; predicted_avg: number; actual_avg: number; count: number }> {
  return demoCalibration;
}

export function getMockAccuracyTrend(): Array<{ date: string; accuracy: number }> {
  return buildRollingTrend(demoHistory);
}
