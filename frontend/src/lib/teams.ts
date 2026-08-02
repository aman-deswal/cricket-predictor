/**
 * Team metadata: country codes for flags and display information.
 * Flags are loaded from flagcdn.com, team logos from bundled SVGs.
 */

export interface TeamMeta {
  name: string;
  shortName: string;
  countryCode: string; // ISO 3166-1 alpha-2 for flagcdn.com
  primaryColor: string;
  secondaryColor: string;
}

const TEAMS: Record<string, TeamMeta> = {
  // International teams
  'India': { name: 'India', shortName: 'IND', countryCode: 'in', primaryColor: '#0047AB', secondaryColor: '#FF9933' },
  'Australia': { name: 'Australia', shortName: 'AUS', countryCode: 'au', primaryColor: '#FFCD00', secondaryColor: '#006B3A' },
  'England': { name: 'England', shortName: 'ENG', countryCode: 'gb-eng', primaryColor: '#003478', secondaryColor: '#CF142B' },
  'South Africa': { name: 'South Africa', shortName: 'SA', countryCode: 'za', primaryColor: '#007749', secondaryColor: '#FFB81C' },
  'New Zealand': { name: 'New Zealand', shortName: 'NZ', countryCode: 'nz', primaryColor: '#000000', secondaryColor: '#FFFFFF' },
  'Pakistan': { name: 'Pakistan', shortName: 'PAK', countryCode: 'pk', primaryColor: '#01411C', secondaryColor: '#FFFFFF' },
  'Sri Lanka': { name: 'Sri Lanka', shortName: 'SL', countryCode: 'lk', primaryColor: '#0033A0', secondaryColor: '#FFB81C' },
  'Bangladesh': { name: 'Bangladesh', shortName: 'BAN', countryCode: 'bd', primaryColor: '#006A4E', secondaryColor: '#F42A41' },
  'West Indies': { name: 'West Indies', shortName: 'WI', countryCode: 'jm', primaryColor: '#7B0041', secondaryColor: '#FFD700' },
  'Afghanistan': { name: 'Afghanistan', shortName: 'AFG', countryCode: 'af', primaryColor: '#0066FF', secondaryColor: '#D32011' },
  'Zimbabwe': { name: 'Zimbabwe', shortName: 'ZIM', countryCode: 'zw', primaryColor: '#DE2010', secondaryColor: '#FFD200' },
  'Ireland': { name: 'Ireland', shortName: 'IRE', countryCode: 'ie', primaryColor: '#169B62', secondaryColor: '#FFFFFF' },
  'Netherlands': { name: 'Netherlands', shortName: 'NED', countryCode: 'nl', primaryColor: '#FF6600', secondaryColor: '#FFFFFF' },
  'Scotland': { name: 'Scotland', shortName: 'SCO', countryCode: 'gb-sct', primaryColor: '#0065BD', secondaryColor: '#FFFFFF' },
  'Nepal': { name: 'Nepal', shortName: 'NEP', countryCode: 'np', primaryColor: '#DC143C', secondaryColor: '#003893' },
  'Namibia': { name: 'Namibia', shortName: 'NAM', countryCode: 'na', primaryColor: '#003580', secondaryColor: '#C8102E' },
  'USA': { name: 'USA', shortName: 'USA', countryCode: 'us', primaryColor: '#002868', secondaryColor: '#BF0A30' },
  'Canada': { name: 'Canada', shortName: 'CAN', countryCode: 'ca', primaryColor: '#FF0000', secondaryColor: '#FFFFFF' },
  'Argentina': { name: 'Argentina', shortName: 'ARG', countryCode: 'ar', primaryColor: '#74ACDF', secondaryColor: '#FFFFFF' },
  'Oman': { name: 'Oman', shortName: 'OMA', countryCode: 'om', primaryColor: '#DB161B', secondaryColor: '#008000' },
  'UAE': { name: 'UAE', shortName: 'UAE', countryCode: 'ae', primaryColor: '#00732F', secondaryColor: '#FF0000' },
  'United Arab Emirates': { name: 'UAE', shortName: 'UAE', countryCode: 'ae', primaryColor: '#00732F', secondaryColor: '#FF0000' },

  // Women's teams
  'India Women': { name: 'India Women', shortName: 'INDW', countryCode: 'in', primaryColor: '#0047AB', secondaryColor: '#FF9933' },
  'Australia Women': { name: 'Australia Women', shortName: 'AUSW', countryCode: 'au', primaryColor: '#FFCD00', secondaryColor: '#006B3A' },
  'England Women': { name: 'England Women', shortName: 'ENGW', countryCode: 'gb-eng', primaryColor: '#003478', secondaryColor: '#CF142B' },
  'South Africa Women': { name: 'South Africa Women', shortName: 'SAW', countryCode: 'za', primaryColor: '#007749', secondaryColor: '#FFB81C' },
  'New Zealand Women': { name: 'New Zealand Women', shortName: 'NZW', countryCode: 'nz', primaryColor: '#000000', secondaryColor: '#FFFFFF' },
  'Pakistan Women': { name: 'Pakistan Women', shortName: 'PAKW', countryCode: 'pk', primaryColor: '#01411C', secondaryColor: '#FFFFFF' },
  'Sri Lanka Women': { name: 'Sri Lanka Women', shortName: 'SLW', countryCode: 'lk', primaryColor: '#0033A0', secondaryColor: '#FFB81C' },
  'West Indies Women': { name: 'West Indies Women', shortName: 'WIW', countryCode: 'jm', primaryColor: '#7B0041', secondaryColor: '#FFD700' },
  'Bangladesh Women': { name: 'Bangladesh Women', shortName: 'BANW', countryCode: 'bd', primaryColor: '#006A4E', secondaryColor: '#F42A41' },
  'Argentina Women': { name: 'Argentina Women', shortName: 'ARGW', countryCode: 'ar', primaryColor: '#74ACDF', secondaryColor: '#FFFFFF' },

  // IPL teams
  'Mumbai Indians': { name: 'Mumbai Indians', shortName: 'MI', countryCode: 'in', primaryColor: '#004BA0', secondaryColor: '#D4A017' },
  'Chennai Super Kings': { name: 'Chennai Super Kings', shortName: 'CSK', countryCode: 'in', primaryColor: '#FFCB05', secondaryColor: '#0081E9' },
  'Royal Challengers Bengaluru': { name: 'Royal Challengers Bengaluru', shortName: 'RCB', countryCode: 'in', primaryColor: '#EC1C24', secondaryColor: '#000000' },
  'Royal Challengers Bangalore': { name: 'Royal Challengers Bangalore', shortName: 'RCB', countryCode: 'in', primaryColor: '#EC1C24', secondaryColor: '#000000' },
  'Kolkata Knight Riders': { name: 'Kolkata Knight Riders', shortName: 'KKR', countryCode: 'in', primaryColor: '#3A225D', secondaryColor: '#B3A123' },
  'Delhi Capitals': { name: 'Delhi Capitals', shortName: 'DC', countryCode: 'in', primaryColor: '#004C93', secondaryColor: '#EF1B23' },
  'Punjab Kings': { name: 'Punjab Kings', shortName: 'PBKS', countryCode: 'in', primaryColor: '#ED1B24', secondaryColor: '#A7A9AC' },
  'Rajasthan Royals': { name: 'Rajasthan Royals', shortName: 'RR', countryCode: 'in', primaryColor: '#EA1A85', secondaryColor: '#254AA5' },
  'Sunrisers Hyderabad': { name: 'Sunrisers Hyderabad', shortName: 'SRH', countryCode: 'in', primaryColor: '#FF822A', secondaryColor: '#000000' },
  'Gujarat Titans': { name: 'Gujarat Titans', shortName: 'GT', countryCode: 'in', primaryColor: '#1C1C1C', secondaryColor: '#A0E4F1' },
  'Lucknow Super Giants': { name: 'Lucknow Super Giants', shortName: 'LSG', countryCode: 'in', primaryColor: '#A72056', secondaryColor: '#FFCC00' },

  // Lanka Premier League (current ESPN names)
  'Dambulla Sixers': { name: 'Dambulla Sixers', shortName: 'DS', countryCode: '', primaryColor: '#E63946', secondaryColor: '#FFFFFF' },
  'Kandy Royals': { name: 'Kandy Royals', shortName: 'KR', countryCode: '', primaryColor: '#9C27B0', secondaryColor: '#FFEB3B' },
  'Kandy Falcons': { name: 'Kandy Falcons', shortName: 'KF', countryCode: '', primaryColor: '#9C27B0', secondaryColor: '#FFEB3B' },
  'B-Love Kandy': { name: 'B-Love Kandy', shortName: 'BLK', countryCode: '', primaryColor: '#7B1FA2', secondaryColor: '#FFEB3B' },
  'Galle Gallants': { name: 'Galle Gallants', shortName: 'GG', countryCode: '', primaryColor: '#2196F3', secondaryColor: '#FFEB3B' },
  'Galle Titans': { name: 'Galle Titans', shortName: 'GT', countryCode: '', primaryColor: '#2196F3', secondaryColor: '#FFEB3B' },
  'Colombo Kaps': { name: 'Colombo Kaps', shortName: 'CLK', countryCode: '', primaryColor: '#00BCD4', secondaryColor: '#FFFFFF' },
  'Colombo Strikers': { name: 'Colombo Strikers', shortName: 'CS', countryCode: '', primaryColor: '#00BCD4', secondaryColor: '#FFFFFF' },

  // The Hundred (current ESPN names for 2025 season)
  'Sunrisers Leeds': { name: 'Sunrisers Leeds', shortName: 'SRL', countryCode: '', primaryColor: '#FF8F00', secondaryColor: '#1A237E' },
  'Manchester Super Giants': { name: 'Manchester Super Giants', shortName: 'MSG', countryCode: '', primaryColor: '#6A1B9A', secondaryColor: '#FFEB3B' },
  'Oval Invincibles': { name: 'Oval Invincibles', shortName: 'OI', countryCode: '', primaryColor: '#F4D03F', secondaryColor: '#1A1A2E' },
  'London Spirit': { name: 'London Spirit', shortName: 'LS', countryCode: '', primaryColor: '#1565C0', secondaryColor: '#FFFFFF' },
  'Southern Brave': { name: 'Southern Brave', shortName: 'SB', countryCode: '', primaryColor: '#C62828', secondaryColor: '#FFFFFF' },
  'Northern Superchargers': { name: 'Northern Superchargers', shortName: 'NS', countryCode: '', primaryColor: '#FF8F00', secondaryColor: '#1A237E' },
  'Trent Rockets': { name: 'Trent Rockets', shortName: 'TR', countryCode: '', primaryColor: '#00838F', secondaryColor: '#FFFFFF' },
  'Welsh Fire': { name: 'Welsh Fire', shortName: 'WF', countryCode: '', primaryColor: '#FF6F00', secondaryColor: '#FFFFFF' },
  'Birmingham Phoenix': { name: 'Birmingham Phoenix', shortName: 'BP', countryCode: '', primaryColor: '#00C853', secondaryColor: '#1A1A1A' },
  'Manchester Originals': { name: 'Manchester Originals', shortName: 'MO', countryCode: '', primaryColor: '#6A1B9A', secondaryColor: '#FFEB3B' },

  // Global Super League / Desert T20
  'Desert Vipers': { name: 'Desert Vipers', shortName: 'DV', countryCode: '', primaryColor: '#C8A951', secondaryColor: '#1A2A1A' },
  'Perth Scorchers XI': { name: 'Perth Scorchers XI', shortName: 'PS', countryCode: '', primaryColor: '#FF6600', secondaryColor: '#0047AB' },

  // CPL
  'Trinbago Knight Riders': { name: 'Trinbago Knight Riders', shortName: 'TKR', countryCode: '', primaryColor: '#3A225D', secondaryColor: '#B3A123' },
  'Barbados Royals': { name: 'Barbados Royals', shortName: 'BR', countryCode: '', primaryColor: '#EA1A85', secondaryColor: '#254AA5' },
  'Guyana Amazon Warriors': { name: 'Guyana Amazon Warriors', shortName: 'GAW', countryCode: '', primaryColor: '#007A33', secondaryColor: '#FFD700' },
  'Jamaica Tallawahs': { name: 'Jamaica Tallawahs', shortName: 'JT', countryCode: '', primaryColor: '#FF6D00', secondaryColor: '#000000' },
  'Saint Lucia Kings': { name: 'Saint Lucia Kings', shortName: 'SLK', countryCode: '', primaryColor: '#0D47A1', secondaryColor: '#FFD600' },
  'St Kitts and Nevis Patriots': { name: 'St Kitts & Nevis Patriots', shortName: 'SNP', countryCode: '', primaryColor: '#B71C1C', secondaryColor: '#F9A825' },
  'Antigua and Barbuda Falcons': { name: 'Antigua & Barbuda Falcons', shortName: 'ABF', countryCode: '', primaryColor: '#1B5E20', secondaryColor: '#FFEB3B' },

  // Big Bash League
  'Sydney Sixers': { name: 'Sydney Sixers', shortName: 'SIX', countryCode: '', primaryColor: '#FF69B4', secondaryColor: '#FFFFFF' },
  'Sydney Thunder': { name: 'Sydney Thunder', shortName: 'THU', countryCode: '', primaryColor: '#FFCC00', secondaryColor: '#1A1A1A' },
  'Melbourne Stars': { name: 'Melbourne Stars', shortName: 'STA', countryCode: '', primaryColor: '#00A651', secondaryColor: '#FFFFFF' },
  'Melbourne Renegades': { name: 'Melbourne Renegades', shortName: 'REN', countryCode: '', primaryColor: '#CC2529', secondaryColor: '#FFFFFF' },
  'Brisbane Heat': { name: 'Brisbane Heat', shortName: 'HEA', countryCode: '', primaryColor: '#FF6600', secondaryColor: '#1A1A1A' },
  'Perth Scorchers': { name: 'Perth Scorchers', shortName: 'SCO', countryCode: '', primaryColor: '#FF6600', secondaryColor: '#0047AB' },
  'Hobart Hurricanes': { name: 'Hobart Hurricanes', shortName: 'HUR', countryCode: '', primaryColor: '#9B59B6', secondaryColor: '#FFFFFF' },
  'Adelaide Strikers': { name: 'Adelaide Strikers', shortName: 'STR', countryCode: '', primaryColor: '#003087', secondaryColor: '#E21E26' },
};

// Normalize team name for lookup (handles minor variations)
function normalizeTeamName(name: string): string {
  return name.trim();
}

export function getTeamMeta(teamName: string): TeamMeta {
  const normalized = normalizeTeamName(teamName);

  // Direct match
  if (TEAMS[normalized]) return TEAMS[normalized];

  // Try partial match
  const key = Object.keys(TEAMS).find(
    (k) => normalized.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(normalized.toLowerCase())
  );
  if (key) return TEAMS[key];

  // Fallback — no flag; TeamBadge will render an initials badge using primaryColor
  return {
    name: teamName,
    shortName: teamName.slice(0, 3).toUpperCase(),
    countryCode: '',
    primaryColor: '#6B7280',
    secondaryColor: '#374151',
  };
}

export function getFlagUrl(countryCode: string, size: number = 64): string {
  // flagcdn.com uses {width}x{height} format for PNG flags
  const height = Math.round(size * 0.75);
  return `https://flagcdn.com/${size}x${height}/${countryCode}.png`;
}

export function getFlag2xUrl(countryCode: string, size: number = 64): string {
  const s = size * 2;
  const height = Math.round(s * 0.75);
  return `https://flagcdn.com/${s}x${height}/${countryCode}.png`;
}
