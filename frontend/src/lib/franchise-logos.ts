const FRANCHISE_LOGOS: Record<string, string> = {
  // IPL
  'mumbai indians': 'https://upload.wikimedia.org/wikipedia/en/thumb/c/cd/Mumbai_Indians_Logo.svg/1280px-Mumbai_Indians_Logo.svg.png',
  'chennai super kings': 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2b/Chennai_Super_Kings_Logo.svg/1280px-Chennai_Super_Kings_Logo.svg.png',
  'royal challengers bengaluru': 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Royal_Challengers_Bengaluru_Logo.svg/960px-Royal_Challengers_Bengaluru_Logo.svg.png',
  'royal challengers bangalore': 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Royal_Challengers_Bengaluru_Logo.svg/960px-Royal_Challengers_Bengaluru_Logo.svg.png',
  'kolkata knight riders': 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4c/Kolkata_Knight_Riders_Logo.svg/960px-Kolkata_Knight_Riders_Logo.svg.png',
  'delhi capitals': 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2f/Delhi_Capitals.svg/1280px-Delhi_Capitals.svg.png',
  'punjab kings': 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d4/Punjab_Kings_Logo.svg/960px-Punjab_Kings_Logo.svg.png',
  'rajasthan royals': 'https://upload.wikimedia.org/wikipedia/en/thumb/5/5c/This_is_the_logo_for_Rajasthan_Royals%2C_a_cricket_team_playing_in_the_Indian_Premier_League_%28IPL%29.svg/960px-This_is_the_logo_for_Rajasthan_Royals%2C_a_cricket_team_playing_in_the_Indian_Premier_League_%28IPL%29.svg.png',
  'sunrisers hyderabad': 'https://upload.wikimedia.org/wikipedia/en/thumb/5/51/Sunrisers_Hyderabad_Logo.svg/1280px-Sunrisers_Hyderabad_Logo.svg.png',
  'gujarat titans': 'https://upload.wikimedia.org/wikipedia/en/thumb/0/09/Gujarat_Titans_Logo.svg/1280px-Gujarat_Titans_Logo.svg.png',
  'lucknow super giants': 'https://upload.wikimedia.org/wikipedia/en/thumb/3/34/Lucknow_Super_Giants_Logo.svg/1280px-Lucknow_Super_Giants_Logo.svg.png',

  // The Hundred
  'sunrisers leeds': 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d7/Sunrisers_Leeds_Logo.svg/1280px-Sunrisers_Leeds_Logo.svg.png',
  'manchester super giants': 'https://upload.wikimedia.org/wikipedia/en/thumb/4/43/Manchester_Super_Giants.svg/1280px-Manchester_Super_Giants.svg.png',
  'oval invincibles': 'https://upload.wikimedia.org/wikipedia/en/thumb/0/0f/MI_London_Logo_svg.svg/1280px-MI_London_Logo_svg.svg.png',
  'london spirit': 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d2/London_Spirit_new_logo.svg/960px-London_Spirit_new_logo.svg.png',
  'southern brave': 'https://upload.wikimedia.org/wikipedia/en/thumb/e/e5/Southern_Brave_logo.svg/1280px-Southern_Brave_logo.svg.png',
  'northern superchargers': 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d7/Sunrisers_Leeds_Logo.svg/1280px-Sunrisers_Leeds_Logo.svg.png',
  'trent rockets': 'https://upload.wikimedia.org/wikipedia/en/thumb/6/6d/Trent_Rockets_svg_logo.svg/960px-Trent_Rockets_svg_logo.svg.png',
  'welsh fire': 'https://upload.wikimedia.org/wikipedia/en/thumb/7/7c/Welsh_Fire_logo.svg/1280px-Welsh_Fire_logo.svg.png',
  'birmingham phoenix': 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d1/Birmingham_Phoenix_logo.svg/1280px-Birmingham_Phoenix_logo.svg.png',
  'manchester originals': 'https://upload.wikimedia.org/wikipedia/en/thumb/4/43/Manchester_Super_Giants.svg/1280px-Manchester_Super_Giants.svg.png',

  // CPL
  'trinbago knight riders': 'https://upload.wikimedia.org/wikipedia/en/thumb/b/bf/Trinbago_Knight_Riders_logo.svg/960px-Trinbago_Knight_Riders_logo.svg.png',
  'barbados royals': 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d7/Barbados_Tridents_New_Logo.svg/1280px-Barbados_Tridents_New_Logo.svg.png',
  'guyana amazon warriors': 'https://upload.wikimedia.org/wikipedia/en/thumb/e/eb/Guyana_Amazon_Warriors_%28logo%29.svg/1280px-Guyana_Amazon_Warriors_%28logo%29.svg.png',
  'jamaica tallawahs': 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4f/CPL_JAM.svg/960px-CPL_JAM.svg.png',
  'saint lucia kings': 'https://upload.wikimedia.org/wikipedia/en/thumb/7/77/Saint_Lucia_Kings_svg_logo.svg/960px-Saint_Lucia_Kings_svg_logo.svg.png',
  'st kitts and nevis patriots': 'https://upload.wikimedia.org/wikipedia/en/d/dc/St_Kitts_and_Nevis_Patriots.png',
  'antigua and barbuda falcons': 'https://upload.wikimedia.org/wikipedia/en/8/83/Antigua_%26_Barbuda_Falcon.png',

  // Big Bash League
  'sydney sixers': 'https://upload.wikimedia.org/wikipedia/en/thumb/9/95/Sydney_Sixers_logo.svg/1280px-Sydney_Sixers_logo.svg.png',
  'sydney thunder': 'https://upload.wikimedia.org/wikipedia/en/thumb/8/86/Sydney_Thunder_logo.svg/1280px-Sydney_Thunder_logo.svg.png',
  'melbourne stars': 'https://upload.wikimedia.org/wikipedia/en/thumb/7/74/Melbourne_Stars_logo.svg/1280px-Melbourne_Stars_logo.svg.png',
  'melbourne renegades': 'https://upload.wikimedia.org/wikipedia/en/thumb/6/63/Melbourne_Renegades_Logo.svg/1280px-Melbourne_Renegades_Logo.svg.png',
  'brisbane heat': 'https://upload.wikimedia.org/wikipedia/en/thumb/c/cf/Brisbane_Heat_logo.svg/960px-Brisbane_Heat_logo.svg.png',
  'perth scorchers': 'https://upload.wikimedia.org/wikipedia/en/thumb/1/15/Perth_Scorchers_logo.svg/1280px-Perth_Scorchers_logo.svg.png',
  'hobart hurricanes': 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c3/Hobart_Hurricanes_logo.svg/1280px-Hobart_Hurricanes_logo.svg.png',
  'adelaide strikers': 'https://upload.wikimedia.org/wikipedia/en/thumb/7/72/Adelaide_Strikers_logo.svg/1280px-Adelaide_Strikers_logo.svg.png',

  // PSL
  'islamabad united': 'https://upload.wikimedia.org/wikipedia/en/9/92/Islamabad_United.png',
  'karachi kings': 'https://upload.wikimedia.org/wikipedia/en/2/2a/Karachi_Kings.png',
  'lahore qalandars': 'https://upload.wikimedia.org/wikipedia/en/6/63/Lahore_Qalandars.png',
  'multan sultans': 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c2/Multan_Sultans.svg/1280px-Multan_Sultans.svg.png',
  'peshawar zalmi': 'https://upload.wikimedia.org/wikipedia/en/9/9c/Peshawar_Zalmi_logo.png',
  'quetta gladiators': 'https://upload.wikimedia.org/wikipedia/en/d/d2/Quetta_Gladiators.png',

  // SA20
  'mi cape town': 'https://upload.wikimedia.org/wikipedia/en/thumb/5/53/MI_Cape_Town_%E2%80%93_Logo.svg/1280px-MI_Cape_Town_%E2%80%93_Logo.svg.png',
  'joburg super kings': 'https://upload.wikimedia.org/wikipedia/en/thumb/c/ca/Joburg_Super_Kings_Logo.svg/1280px-Joburg_Super_Kings_Logo.svg.png',
  'paarl royals': 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Paarl_Royals_logo_%282%29.svg/1280px-Paarl_Royals_logo_%282%29.svg.png',
  'pretoria capitals': 'https://upload.wikimedia.org/wikipedia/en/thumb/f/fa/Pretoria_Capitals_logo.svg/1280px-Pretoria_Capitals_logo.svg.png',
  'sunrisers eastern cape': 'https://upload.wikimedia.org/wikipedia/en/thumb/8/82/Sunrisers_Eastern_Cape_Logo.svg/1280px-Sunrisers_Eastern_Cape_Logo.svg.png',

  // MLC
  'mi new york': 'https://upload.wikimedia.org/wikipedia/en/2/2c/MI_New_York_logo.png',
  'los angeles knight riders': 'https://upload.wikimedia.org/wikipedia/en/thumb/3/39/Los_Angeles_Knight_Riders_official_logo.svg/1280px-Los_Angeles_Knight_Riders_official_logo.svg.png',
  'seattle orcas': 'https://upload.wikimedia.org/wikipedia/en/thumb/1/1f/Seattle_Orcas_Logo.svg/1280px-Seattle_Orcas_Logo.svg.png',
  'texas super kings': 'https://upload.wikimedia.org/wikipedia/en/thumb/2/23/Texas_Super_Kings_Logo.svg/1280px-Texas_Super_Kings_Logo.svg.png',

  // LPL
  'colombo kaps': 'https://upload.wikimedia.org/wikipedia/en/a/ac/Colombo_Kaps_logo.png',
  'colombo strikers': 'https://upload.wikimedia.org/wikipedia/en/a/ac/Colombo_Kaps_logo.png',

  // BPL
  'comilla victorians': 'https://upload.wikimedia.org/wikipedia/commons/9/93/Comilla_Victorians.png',
  'dhaka dominators': 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a4/Logo_of_Dhaka_Capitals.svg/1280px-Logo_of_Dhaka_Capitals.svg.png',
  'fortune barishal': 'https://upload.wikimedia.org/wikipedia/en/e/ea/Fortune_Barishal.png',
  'khulna tigers': 'https://upload.wikimedia.org/wikipedia/en/7/7f/Khulna_Tigers.png',
  'rangpur riders': 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2e/Rangpur_Riders_logo.svg/1280px-Rangpur_Riders_logo.svg.png',
  'sylhet strikers': 'https://upload.wikimedia.org/wikipedia/en/4/43/Sylhet_Titans_logo.jpg',
};

function normalizeFranchiseKey(teamName: string): string {
  return teamName
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\((men|women)\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getFranchiseLogoUrl(teamName: string): string | undefined {
  return FRANCHISE_LOGOS[normalizeFranchiseKey(teamName)];
}
