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

  // Fallback
  return {
    name: teamName,
    shortName: teamName.slice(0, 3).toUpperCase(),
    countryCode: 'un', // UN flag as fallback
    primaryColor: '#6B7280',
    secondaryColor: '#374151',
  };
}

export function getFlagUrl(countryCode: string, size: number = 64): string {
  // flagcdn.com provides free country flag images
  return `https://flagcdn.com/w${size}/${countryCode}.png`;
}

export function getFlag2xUrl(countryCode: string, size: number = 64): string {
  return `https://flagcdn.com/w${size * 2}/${countryCode}.png`;
}
