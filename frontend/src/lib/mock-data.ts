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
  PredictionSnapshot,
} from './supabase';
import { compareMatchCenterMatches } from './competition';
import { buildAccuracyTrend } from './prediction-history';

const now = Date.now();

function futureIso(hoursAhead: number): string {
  return new Date(now + hoursAhead * 60 * 60 * 1000).toISOString();
}

function pastIso(daysAgo: number): string {
  return new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function pastHoursIso(hoursAgo: number): string {
  return new Date(now - hoursAgo * 60 * 60 * 1000).toISOString();
}

function sortMatches(matches: MatchWithPredictions[]): MatchWithPredictions[] {
  return [...matches].sort(compareMatchCenterMatches);
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

const IPL_LOGOS: Record<string, string> = {
  'Mumbai Indians': 'https://upload.wikimedia.org/wikipedia/en/thumb/c/cd/Mumbai_Indians_Logo.svg/1280px-Mumbai_Indians_Logo.svg.png',
  'Chennai Super Kings': 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2b/Chennai_Super_Kings_Logo.svg/1280px-Chennai_Super_Kings_Logo.svg.png',
};

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
    }, 'India', 0.68, 'high')],   // AI sees 68% but book prices India at 1.72 (~58%) → +10% EV
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
    team1_logo_url: IPL_LOGOS['Mumbai Indians'],
    team2_logo_url: IPL_LOGOS['Chennai Super Kings'],
    predictions: [makePrediction({
      match_id: 'demo-mi-vs-csk-ipl',
      name: 'Mumbai Indians vs Chennai Super Kings, Indian Premier League 2026',
      team1: 'Mumbai Indians',
      team2: 'Chennai Super Kings',
      date: futureIso(3),
      venue: 'Wankhede Stadium, Mumbai',
      match_type: 'T20',
      status: 'upcoming',
    }, 'Chennai Super Kings', 0.62, 'high')],  // AI: CSK 62%, book implies ~53.5% → +8.5% EV on CSK
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
    }, 'Nepal', 0.57, 'medium')],  // AI: Nepal 57%, book implies ~44% (2.25 odds) → +13% EV upset special
  },
]);

const demoMatchOdds: MatchOdds[] = [
  { match_id: 'demo-ind-vs-aus-odi', bookmaker: 'Tab', team1_odds: 1.72, team2_odds: 2.15, draw_odds: 8.5, market: 'match_winner', fetched_at: pastIso(1) },
  { match_id: 'demo-mi-vs-csk-ipl', bookmaker: 'SkyBet', team1_odds: 1.94, team2_odds: 1.87, draw_odds: null, market: 'match_winner', fetched_at: pastIso(1) },
  { match_id: 'demo-engw-vs-saw-t20', bookmaker: 'Unibet', team1_odds: 1.89, team2_odds: 1.92, draw_odds: null, market: 'match_winner', fetched_at: pastIso(1) },
  { match_id: 'demo-nep-vs-nam-odi', bookmaker: 'Bet365', team1_odds: 2.25, team2_odds: 1.68, draw_odds: null, market: 'match_winner', fetched_at: pastIso(1) },
];

const demoMatchOddsHistory: MatchOdds[] = demoMatchOdds.flatMap((latest) => [
  { ...latest, team1_odds: latest.team1_odds * 1.08, team2_odds: latest.team2_odds * 0.94, draw_odds: latest.draw_odds ? latest.draw_odds * 1.04 : null, fetched_at: pastHoursIso(60) },
  { ...latest, team1_odds: latest.team1_odds * 1.04, team2_odds: latest.team2_odds * 0.97, draw_odds: latest.draw_odds ? latest.draw_odds * 1.02 : null, fetched_at: pastHoursIso(48) },
  { ...latest, team1_odds: latest.team1_odds * 1.02, team2_odds: latest.team2_odds * 0.99, draw_odds: latest.draw_odds ? latest.draw_odds * 1.01 : null, fetched_at: pastHoursIso(36) },
  latest,
]);

const demoPredictionSnapshots: PredictionSnapshot[] = demoMatches.flatMap((match) => {
  const prediction = match.predictions[0];
  const openingTeam1 = Math.max(0.18, Math.min(0.82, prediction.team1_win_probability - 0.04));
  const middleTeam1 = Math.max(0.18, Math.min(0.82, prediction.team1_win_probability - 0.015));
  return [
    {
      ...prediction,
      team1_win_probability: openingTeam1,
      team2_win_probability: 1 - openingTeam1,
      edge_score: {},
      input_state: {},
      change_events: [{
        event_at: pastHoursIso(60),
        category: 'baseline',
        type: 'initial_snapshot',
        label: 'Initial pre-match model snapshot',
        summary: 'The first deterministic pre-match probability was captured.',
        affected_team: null,
        affected_input: 'deterministic_core',
        relationship: 'coincided_input_change',
        probability_delta: null,
        source: { name: 'SixSense deterministic pipeline' },
      }],
      captured_at: pastHoursIso(60),
    },
    {
      ...prediction,
      team1_win_probability: middleTeam1,
      team2_win_probability: 1 - middleTeam1,
      edge_score: {},
      input_state: {},
      change_events: [{
        event_at: pastHoursIso(36),
        category: 'form',
        type: 'recent_form_changed',
        label: `${match.team1} recent-form inputs changed`,
        summary: 'The structured recent-form sample refreshed and coincided with this model move.',
        affected_team: match.team1,
        affected_input: 'team_form.team1',
        relationship: 'coincided_input_change',
        probability_delta: middleTeam1 - openingTeam1,
        source: { name: 'Cricsheet/statistics cache' },
      }],
      captured_at: pastHoursIso(36),
    },
    {
      ...prediction,
      edge_score: {},
      input_state: {},
      change_events: [{
        event_at: pastHoursIso(12),
        category: 'market',
        type: 'market_price_changed',
        label: `${demoMatchOdds.find((row) => row.match_id === match.match_id)?.bookmaker ?? 'Sportsbook'} market input changed`,
        summary: 'The refreshed sportsbook prices coincided with this model move; this is correlation, not a proven cause.',
        affected_team: null,
        affected_input: 'market_odds',
        relationship: 'coincided_input_change',
        probability_delta: prediction.team1_win_probability - middleTeam1,
        source: { name: demoMatchOdds.find((row) => row.match_id === match.match_id)?.bookmaker ?? 'sportsbook market', reference: 'match_odds' },
      }],
      captured_at: pastHoursIso(12),
    },
  ];
});

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
  { id: 'ind-1', name: 'Rohit Sharma', role: 'Bat', is_captain: true, image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/34102.png' },
  { id: 'ind-2', name: 'Shubman Gill', role: 'Bat', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/1070173.png' },
  { id: 'ind-3', name: 'Virat Kohli', role: 'Bat', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/253802.png' },
  { id: 'ind-4', name: 'KL Rahul', role: 'Keeper', is_keeper: true, image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/422108.png' },
  { id: 'ind-5', name: 'Suryakumar Yadav', role: 'Bat', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/446507.png' },
  { id: 'ind-6', name: 'Hardik Pandya', role: 'All', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/625371.png' },
  { id: 'ind-7', name: 'Ravindra Jadeja', role: 'All', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/234675.png' },
  { id: 'ind-8', name: 'Jasprit Bumrah', role: 'Bowl', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/625383.png' },
  { id: 'ind-9', name: 'Mohammed Siraj', role: 'Bowl', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/940973.png' },
  { id: 'ind-10', name: 'Kuldeep Yadav', role: 'Bowl', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/559235.png' },
  { id: 'ind-11', name: 'Ravichandran Ashwin', role: 'Bowl', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/26421.png' },
];

const australiaSquadPlayers = [
  { id: 'aus-1', name: 'Travis Head', role: 'Bat', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/530011.png' },
  { id: 'aus-2', name: 'David Warner', role: 'Bat', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/219889.png' },
  { id: 'aus-3', name: 'Steve Smith', role: 'Bat', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/267192.png' },
  { id: 'aus-4', name: 'Marnus Labuschagne', role: 'Bat', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/787987.png' },
  { id: 'aus-5', name: 'Glenn Maxwell', role: 'All', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/325026.png' },
  { id: 'aus-6', name: 'Mitchell Marsh', role: 'All', is_captain: true, image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/272450.png' },
  { id: 'aus-7', name: 'Alex Carey', role: 'Keeper', is_keeper: true, image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/326434.png' },
  { id: 'aus-8', name: 'Pat Cummins', role: 'Bowl', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/489889.png' },
  { id: 'aus-9', name: 'Josh Hazlewood', role: 'Bowl', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/288284.png' },
  { id: 'aus-10', name: 'Adam Zampa', role: 'Bowl', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/379504.png' },
  { id: 'aus-11', name: 'Mitchell Starc', role: 'Bowl', image_url: 'https://a.espncdn.com/i/headshots/cricket/players/full/311592.png' },
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
    expert_preview: 'Mumbai have home advantage at Wankhede, but CSK\'s bowling control — especially Pathirana\'s slippage and Jadeja\'s spin — keeps this tight into the final overs. Hardik Pandya\'s role as finisher is pivotal: if MI need 30 off 18, he\'s the difference. CSK\'s experience in knockout-pressure scenarios gives them the edge in a close chase.',
    toss_insight: 'Dew is expected post-innings. Chasing has won 7 of the last 10 MI vs CSK night games at Wankhede — winning the toss and fielding first is almost mandatory.',
    source_links: [
      { title: 'MI squad update — Bumrah confirmed fit', url: 'https://example.com/mi-squad', source: 'demo', published_at: pastIso(1) },
      { title: 'Wankhede curator: dew likely to play a role', url: 'https://example.com/wankhede-dew', source: 'demo', published_at: pastIso(1) },
    ],
    confidence: 'high',
    generated_at: pastIso(1),
  },
  {
    match_id: 'demo-ind-vs-aus-odi',
    venue_name: 'Wankhede Stadium',
    venue_confidence: 'confirmed',
    possible_xi: {
      team1: indiaSquadPlayers.map((player) => player.name),
      team2: australiaSquadPlayers.map((player) => player.name),
    },
    player_updates: [
      { player: 'Jasprit Bumrah', team: 'India', status: 'Full training load completed — fit and raring to go', confidence: 'confirmed' },
      { player: 'Shubman Gill', team: 'India', status: 'Career-best ODI form — 3 fifties in last 4 innings', confidence: 'confirmed' },
      { player: 'Pat Cummins', team: 'Australia', status: 'Shoulder scan cleared; will lead the attack', confidence: 'reported' },
      { player: 'David Warner', team: 'Australia', status: 'Strong record at Wankhede; confirmed to open', confidence: 'confirmed' },
    ],
    key_players: [
      {
        batter: 'Virat Kohli', batter_team: 'India', bowler: 'Pat Cummins', bowler_team: 'Australia',
        insight: 'Kohli averages 65 against Cummins in ODIs — one of cricket\'s great modern rivalries. If Cummins gets him early, Australia are firmly back in it.',
        batter_scores: [76, 112, 58, 33, 89],
        bowler_figures: [3, 1, 2, 0, 2],
        h2h: { dismissals: 4, balls_faced: 112, runs_scored: 93, dot_pct: 41, boundary_pct: 19, last_5: ['NW', 'W', 'NW', 'W', 'NW'] },
      },
      {
        batter: 'Travis Head', batter_team: 'Australia', bowler: 'Jasprit Bumrah', bowler_team: 'India',
        insight: 'Head\'s aggressive powerplay approach runs straight into Bumrah\'s reverse swing at Wankhede — this battle in overs 1–10 sets the tone for the chase.',
        batter_scores: [72, 18, 4, 91, 44],
        bowler_figures: [3, 3, 2, 1, 2],
        h2h: { dismissals: 5, balls_faced: 67, runs_scored: 41, dot_pct: 55, boundary_pct: 13, last_5: ['W', 'W', 'NW', 'W', 'W'] },
      },
      {
        batter: 'Shubman Gill', batter_team: 'India', bowler: 'Mitchell Starc', bowler_team: 'Australia',
        insight: 'Starc\'s left-arm angle targets Gill\'s off stump hard — if Gill survives the new ball, India can post 340+.',
        batter_scores: [87, 56, 24, 103, 8],
        bowler_figures: [1, 2, 2, 1, 3],
        h2h: { dismissals: 3, balls_faced: 58, runs_scored: 47, dot_pct: 38, boundary_pct: 24, last_5: ['NW', 'NW', 'W', 'NW', 'W'] },
      },
    ],
    expert_preview: 'India go into this ODI as clear favourites at Wankhede. Rohit\'s side have won 8 of their last 10 home ODIs and their spin-heavy attack on a turning track will trouble Australia\'s middle order. The danger for India is Australia\'s pace: Starc and Cummins with the new ball can make the first 10 overs treacherous. If India\'s top-3 navigate that phase, they should post 320+. The 10% AI Edge on India is the biggest value signal on today\'s card — book pricing hasn\'t fully adjusted for India\'s home dominance.',
    toss_insight: 'Chasing is slightly preferred at Wankhede in day-night ODIs. Dew arrives after 8pm and flattens the pitch for the team batting second — winning the toss and fielding first is the smart call.',
    source_links: [
      { title: 'India announce squad — Bumrah fit', url: 'https://example.com/ind-squad-aus', source: 'demo', published_at: pastIso(2) },
      { title: 'Wankhede pitch report — spin expected from mid-innings', url: 'https://example.com/wankhede-pitch-report', source: 'demo', published_at: pastIso(1) },
      { title: 'Head: "Australia ready for the battle"', url: 'https://example.com/head-quote', source: 'demo', published_at: pastIso(1) },
    ],
    confidence: 'high',
    generated_at: pastIso(1),
  },
  {
    match_id: 'demo-engw-vs-saw-t20',
    venue_name: 'The Oval',
    venue_confidence: 'confirmed',
    possible_xi: { team1: [], team2: [] },
    player_updates: [
      { player: 'Nat Sciver-Brunt', team: 'England Women', status: '3 fifties in last 4 T20Is — in devastating form', confidence: 'confirmed' },
      { player: 'Shabnim Ismail', team: 'South Africa Women', status: 'Fit and leading SA\'s pace attack', confidence: 'confirmed' },
    ],
    key_players: [
      { batter: 'Nat Sciver-Brunt', batter_team: 'England Women', bowler: 'Shabnim Ismail', bowler_team: 'South Africa Women', insight: 'SA\'s pace spearhead against England\'s most destructive batter. Ismail must get Sciver-Brunt cheaply — if she goes past 30, England are in a commanding position.' },
      { batter: 'Laura Wolvaardt', batter_team: 'South Africa Women', bowler: 'Sophie Ecclestone', bowler_team: 'England Women', insight: 'Ecclestone\'s left-arm spin is the biggest threat to SA\'s chase. Wolvaardt needs to read the turn early and rotate strike effectively.' },
    ],
    expert_preview: 'A closely matched contest at The Oval. England\'s depth and home conditions make them slight favourites, but South Africa have beaten them in 3 of the last 5 T20Is. England\'s top order has been in great nick — Sciver-Brunt and Jones especially — but SA\'s bowling discipline has been exceptional in this tri-series. Whoever wins the powerplay controls the game.',
    toss_insight: 'Flat pitch expected at The Oval. Neither team gains an obvious toss advantage — batting conditions are expected to remain consistent throughout.',
    source_links: [
      { title: 'England Women name unchanged XI', url: 'https://example.com/engw-xi', source: 'demo', published_at: pastIso(1) },
      { title: 'Ismail fit to bowl — SA confirm', url: 'https://example.com/sa-ismail', source: 'demo', published_at: pastIso(1) },
    ],
    confidence: 'medium',
    generated_at: pastIso(1),
  },
  {
    match_id: 'demo-nep-vs-nam-odi',
    venue_name: 'Tribhuvan University Ground',
    venue_confidence: 'confirmed',
    possible_xi: { team1: [], team2: [] },
    player_updates: [
      { player: 'Sandeep Lamichhane', team: 'Nepal', status: 'Back from absence — sharp in training, strong favourite to start', confidence: 'reported' },
      { player: 'Ruben Trumpelmann', team: 'Namibia', status: 'Fit and leading Namibia\'s pace attack', confidence: 'confirmed' },
      { player: 'Kushal Bhurtel', team: 'Nepal', status: 'Top-scorer in last 3 home ODIs — key for Nepal\'s power-hitting phase', confidence: 'confirmed' },
    ],
    key_players: [
      { batter: 'Kushal Bhurtel', batter_team: 'Nepal', bowler: 'Ruben Trumpelmann', bowler_team: 'Namibia', insight: 'Trumpelmann\'s outswing with the new ball at high altitude in Kirtipur has historically troubled top-order batters. Bhurtel needs to survive those first 5 overs.' },
      { batter: 'Gerhard Erasmus', batter_team: 'Namibia', bowler: 'Sandeep Lamichhane', bowler_team: 'Nepal', insight: 'Lamichhane\'s leg spin exploited Erasmus last time out at this ground — both captains know this duel is potentially decisive for the chase.' },
    ],
    expert_preview: 'This is the value bet of the day. Despite being priced as underdogs at +125, Nepal have an exceptional home record at Kirtipur — the 1,400m altitude and local conditions consistently disrupt touring teams. Our model gives Nepal 57% while the bookmaker implies just 44%, a +13% gap making this the highest AI Edge on today\'s card. Lamichhane\'s spin on a turning Kirtipur track is a serious weapon. Namibia are dangerous — Baard and Erasmus can accelerate — but Nepal\'s familiarity with these conditions is a structural edge the market is underpricing.',
    toss_insight: 'Batting first is strongly preferred at Kirtipur. The pitch historically offers more pace and bounce in the first 25 overs before slowing. Altitude means the ball carries further — spinners become increasingly effective from overs 30+.',
    source_links: [
      { title: 'Nepal home record at Kirtipur: 14W from last 17', url: 'https://example.com/nepal-home', source: 'demo', published_at: pastIso(3) },
      { title: 'Lamichhane included in Nepal XI after clearance', url: 'https://example.com/lamichhane-return', source: 'demo', published_at: pastIso(1) },
    ],
    confidence: 'medium',
    generated_at: pastIso(1),
  },
];

const demoEdgeScores: Record<string, EdgeScore> = {
  'demo-mi-vs-csk-ipl': {
    team1_score: 54,
    team2_score: 46,
    net_edge: 8,
    edge_team: 'Chennai Super Kings',
    narrative: 'CSK hold the tighter bowling and finishing edge — Jadeja and Pathirana against MI\'s lower-middle order is the key advantage.',
    factors: {
      team1: { form: 7, momentum: 6, pressure: 5, market: 6 },
      team2: { form: 8, momentum: 7, pressure: 7, market: 7 },
    },
  },
  'demo-ind-vs-aus-odi': {
    team1_score: 63,
    team2_score: 37,
    net_edge: 26,
    edge_team: 'India',
    narrative: 'India\'s superior home record, spin depth, and explosive top-3 give them a commanding edge at Wankhede.',
    factors: {
      team1: { form: 9, momentum: 8, pressure: 7, market: 6 },
      team2: { form: 6, momentum: 5, pressure: 6, market: 7 },
    },
  },
  'demo-engw-vs-saw-t20': {
    team1_score: 55,
    team2_score: 45,
    net_edge: 10,
    edge_team: 'England Women',
    narrative: 'England\'s batting depth and home conditions give them a slight but clear edge — SA need a perfect bowling performance.',
    factors: {
      team1: { form: 8, momentum: 7, pressure: 6, market: 6 },
      team2: { form: 7, momentum: 6, pressure: 6, market: 7 },
    },
  },
  'demo-nep-vs-nam-odi': {
    team1_score: 58,
    team2_score: 42,
    net_edge: 16,
    edge_team: 'Nepal',
    narrative: 'Nepal\'s altitude advantage and Lamichhane\'s spin make Kirtipur a fortress — the market is significantly underpricing their home edge.',
    factors: {
      team1: { form: 7, momentum: 7, pressure: 8, market: 4 },
      team2: { form: 6, momentum: 5, pressure: 5, market: 8 },
    },
  },
};

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
    series_note: 'IPL 2026 — Group stage',
    series_scoreline: 'Mumbai Indians lead 1-0',
    series_leaders: [],
    officials: [],
    rosters: [],
    head_to_head: [
      {
        date: pastIso(20),
        note: 'IPL 2026, Wankhede',
        teams: [
          { name: 'Mumbai Indians', abbreviation: 'MI', score: '176/6', winner: false },
          { name: 'Chennai Super Kings', abbreviation: 'CSK', score: '178/4', winner: true },
        ],
      },
      {
        date: pastIso(50),
        note: 'IPL 2026, Chepauk',
        teams: [
          { name: 'Mumbai Indians', abbreviation: 'MI', score: '184/5', winner: true },
          { name: 'Chennai Super Kings', abbreviation: 'CSK', score: '179/8', winner: false },
        ],
      },
      {
        date: pastIso(380),
        note: 'IPL 2025, Wankhede',
        teams: [
          { name: 'Chennai Super Kings', abbreviation: 'CSK', score: '192/3', winner: true },
          { name: 'Mumbai Indians', abbreviation: 'MI', score: '183/7', winner: false },
        ],
      },
    ],
    standings: [],
    scorecards: [],
    fetched_at: pastIso(1),
  },
  {
    match_id: 'demo-ind-vs-aus-odi',
    espn_event_id: 'demo-espn-ind-aus',
    venue_name: 'Wankhede Stadium',
    venue_city: 'Mumbai',
    venue_country: 'India',
    venue_capacity: 33108,
    venue_grass: true,
    venue_image_url: null,
    toss_winner: null,
    toss_decision: null,
    match_number: '1',
    match_days: '1',
    hours_of_play: '13:30 - 21:00',
    series_note: 'Australia tour of India — 3-match ODI series',
    series_scoreline: 'Series level 0-0',
    series_leaders: [],
    officials: [],
    rosters: [],
    head_to_head: [
      {
        date: pastIso(60),
        note: 'ODI, Sydney',
        teams: [
          { name: 'Australia', abbreviation: 'AUS', score: '287/9', winner: true },
          { name: 'India', abbreviation: 'IND', score: '284/7', winner: false },
        ],
      },
      {
        date: pastIso(180),
        note: 'ODI, Kolkata',
        teams: [
          { name: 'India', abbreviation: 'IND', score: '349/7', winner: true },
          { name: 'Australia', abbreviation: 'AUS', score: '298/6', winner: false },
        ],
      },
      {
        date: pastIso(270),
        note: 'World Cup Final, Ahmedabad',
        teams: [
          { name: 'India', abbreviation: 'IND', score: '240/10', winner: false },
          { name: 'Australia', abbreviation: 'AUS', score: '241/4', winner: true },
        ],
      },
      {
        date: pastIso(400),
        note: 'ODI, Rajkot',
        teams: [
          { name: 'India', abbreviation: 'IND', score: '304/6', winner: true },
          { name: 'Australia', abbreviation: 'AUS', score: '271/9', winner: false },
        ],
      },
      {
        date: pastIso(500),
        note: 'ODI, Melbourne',
        teams: [
          { name: 'Australia', abbreviation: 'AUS', score: '310/5', winner: true },
          { name: 'India', abbreviation: 'IND', score: '276/8', winner: false },
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

export function getMockMatchOddsHistory(matchId: string): MatchOdds[] {
  return demoMatchOddsHistory.filter((odds) => odds.match_id === matchId);
}

export function getMockPredictionSnapshots(matchId: string): PredictionSnapshot[] {
  return demoPredictionSnapshots.filter((snapshot) => snapshot.match_id === matchId);
}

export function getMockEdgeScore(matchId: string): EdgeScore | null {
  return demoEdgeScores[matchId] ?? null;
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
  return buildAccuracyTrend(demoHistory, 10);
}
