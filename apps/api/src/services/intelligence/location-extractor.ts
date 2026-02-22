/**
 * Location Extraction Service
 * Extracts geographic locations from article text
 */

// Country/region keywords to ISO codes
export const LOCATION_KEYWORDS: Record<string, string[]> = {
  // Major powers
  'US': ['united states', 'u.s.', 'usa', 'america', 'washington dc', 'pentagon', 'white house', 'congress'],
  'CN': ['china', 'chinese', 'beijing', 'shanghai', 'prc', 'ccp', 'xi jinping', 'pla'],
  'RU': ['russia', 'russian', 'moscow', 'kremlin', 'putin', 'siberia'],
  'GB': ['britain', 'british', 'uk', 'united kingdom', 'london', 'england', 'scotland', 'wales'],
  
  // Europe
  'DE': ['germany', 'german', 'berlin', 'bundeswehr'],
  'FR': ['france', 'french', 'paris', 'macron'],
  'IT': ['italy', 'italian', 'rome'],
  'ES': ['spain', 'spanish', 'madrid'],
  'PL': ['poland', 'polish', 'warsaw'],
  'UA': ['ukraine', 'ukrainian', 'kyiv', 'kiev', 'zelensky', 'donbas', 'crimea', 'kharkiv', 'odesa'],
  'BY': ['belarus', 'belarusian', 'minsk', 'lukashenko'],
  'NL': ['netherlands', 'dutch', 'amsterdam', 'the hague'],
  'BE': ['belgium', 'belgian', 'brussels'],
  'SE': ['sweden', 'swedish', 'stockholm'],
  'NO': ['norway', 'norwegian', 'oslo'],
  'FI': ['finland', 'finnish', 'helsinki'],
  'AT': ['austria', 'austrian', 'vienna'],
  'CH': ['switzerland', 'swiss', 'zurich', 'geneva'],
  'GR': ['greece', 'greek', 'athens'],
  'RO': ['romania', 'romanian', 'bucharest'],
  'HU': ['hungary', 'hungarian', 'budapest'],
  'CZ': ['czech', 'czechia', 'prague'],
  
  // Asia Pacific
  'JP': ['japan', 'japanese', 'tokyo', 'osaka'],
  'KR': ['south korea', 'korean', 'seoul', 'rok'],
  'KP': ['north korea', 'pyongyang', 'kim jong', 'dprk'],
  'TW': ['taiwan', 'taiwanese', 'taipei'],
  'IN': ['india', 'indian', 'delhi', 'mumbai', 'modi'],
  'PK': ['pakistan', 'pakistani', 'islamabad', 'karachi'],
  'PH': ['philippines', 'filipino', 'manila', 'duterte', 'marcos'],
  'VN': ['vietnam', 'vietnamese', 'hanoi', 'ho chi minh'],
  'TH': ['thailand', 'thai', 'bangkok'],
  'MY': ['malaysia', 'malaysian', 'kuala lumpur'],
  'SG': ['singapore'],
  'ID': ['indonesia', 'indonesian', 'jakarta'],
  'AU': ['australia', 'australian', 'canberra', 'sydney'],
  'NZ': ['new zealand', 'wellington', 'auckland'],
  'MM': ['myanmar', 'burma', 'burmese', 'yangon', 'naypyidaw'],
  'BD': ['bangladesh', 'bangladeshi', 'dhaka'],
  
  // Middle East
  'IL': ['israel', 'israeli', 'tel aviv', 'jerusalem', 'netanyahu', 'idf', 'mossad'],
  'PS': ['palestine', 'palestinian', 'gaza', 'west bank', 'hamas', 'ramallah'],
  'IR': ['iran', 'iranian', 'tehran', 'khamenei', 'irgc', 'persian'],
  'IQ': ['iraq', 'iraqi', 'baghdad', 'mosul'],
  'SY': ['syria', 'syrian', 'damascus', 'assad', 'aleppo'],
  'SA': ['saudi', 'saudi arabia', 'riyadh', 'mbs'],
  'AE': ['uae', 'emirates', 'dubai', 'abu dhabi'],
  'QA': ['qatar', 'qatari', 'doha'],
  'KW': ['kuwait', 'kuwaiti'],
  'JO': ['jordan', 'jordanian', 'amman'],
  'LB': ['lebanon', 'lebanese', 'beirut', 'hezbollah'],
  'YE': ['yemen', 'yemeni', 'sanaa', 'houthi'],
  'TR': ['turkey', 'turkish', 'ankara', 'istanbul', 'erdogan'],
  'EG': ['egypt', 'egyptian', 'cairo', 'suez'],
  
  // Africa
  'ZA': ['south africa', 'johannesburg', 'cape town', 'pretoria'],
  'NG': ['nigeria', 'nigerian', 'lagos', 'abuja'],
  'KE': ['kenya', 'kenyan', 'nairobi'],
  'ET': ['ethiopia', 'ethiopian', 'addis ababa'],
  'SD': ['sudan', 'sudanese', 'khartoum'],
  'LY': ['libya', 'libyan', 'tripoli', 'benghazi'],
  'MA': ['morocco', 'moroccan', 'rabat', 'casablanca'],
  'DZ': ['algeria', 'algerian', 'algiers'],
  'TN': ['tunisia', 'tunisian', 'tunis'],
  'GH': ['ghana', 'ghanaian', 'accra'],
  'CD': ['congo', 'congolese', 'kinshasa', 'drc'],
  'SO': ['somalia', 'somali', 'mogadishu'],
  'ML': ['mali', 'malian', 'bamako'],
  'NE': ['niger', 'niamey'],
  'BF': ['burkina faso', 'ouagadougou'],
  
  // Americas
  'CA': ['canada', 'canadian', 'ottawa', 'toronto'],
  'MX': ['mexico', 'mexican', 'mexico city'],
  'BR': ['brazil', 'brazilian', 'brasilia', 'sao paulo', 'lula'],
  'AR': ['argentina', 'argentine', 'buenos aires', 'milei'],
  'VE': ['venezuela', 'venezuelan', 'caracas', 'maduro'],
  'CO': ['colombia', 'colombian', 'bogota'],
  'PE': ['peru', 'peruvian', 'lima'],
  'CL': ['chile', 'chilean', 'santiago'],
  'CU': ['cuba', 'cuban', 'havana'],
  
  // Strategic regions (multi-country)
  'TAIWAN_STRAIT': ['taiwan strait', 'formosa strait'],
  'SOUTH_CHINA_SEA': ['south china sea', 'spratlys', 'paracel'],
  'BALTIC': ['baltic', 'kaliningrad'],
  'BLACK_SEA': ['black sea', 'azov'],
  'ARCTIC': ['arctic', 'north pole', 'svalbard'],
  'INDO_PACIFIC': ['indo-pacific', 'indo pacific'],
};

// Coordinates for map plotting (approximate centers)
export const LOCATION_COORDS: Record<string, [number, number]> = {
  'US': [39.8, -98.5],
  'CN': [35.9, 104.2],
  'RU': [61.5, 105.3],
  'GB': [55.4, -3.4],
  'DE': [51.2, 10.4],
  'FR': [46.2, 2.2],
  'UA': [48.4, 31.2],
  'JP': [36.2, 138.3],
  'KR': [35.9, 127.8],
  'KP': [40.3, 127.5],
  'TW': [23.7, 121.0],
  'IN': [20.6, 79.0],
  'IL': [31.0, 34.9],
  'PS': [31.9, 35.2],
  'IR': [32.4, 53.7],
  'IQ': [33.2, 43.7],
  'SY': [35.0, 38.5],
  'SA': [23.9, 45.1],
  'TR': [39.0, 35.2],
  'EG': [26.8, 30.8],
  'ZA': [-30.6, 22.9],
  'NG': [9.1, 8.7],
  'BR': [-14.2, -51.9],
  'MX': [23.6, -102.6],
  'AU': [-25.3, 133.8],
  'PK': [30.4, 69.3],
  'BY': [53.7, 27.9],
  'PL': [51.9, 19.1],
  'SE': [60.1, 18.6],
  'FI': [61.9, 25.7],
  'MM': [21.9, 95.9],
  'YE': [15.6, 48.5],
  'LB': [33.9, 35.9],
  'VE': [6.4, -66.6],
  'TAIWAN_STRAIT': [24.5, 119.5],
  'SOUTH_CHINA_SEA': [12.0, 114.0],
  'BLACK_SEA': [43.5, 34.0],
  'BALTIC': [58.0, 20.0],
  'ARCTIC': [75.0, 0.0],
};

export interface LocationResult {
  locations: string[];
  primary: string | null;
}

/**
 * Extract locations from article text using keyword matching
 */
export function extractLocations(title: string, body: string): LocationResult {
  const text = `${title} ${body}`.toLowerCase();
  const found: Map<string, number> = new Map();
  
  for (const [code, keywords] of Object.entries(LOCATION_KEYWORDS)) {
    for (const keyword of keywords) {
      // Count occurrences
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches) {
        const current = found.get(code) || 0;
        found.set(code, current + matches.length);
      }
    }
  }
  
  // Sort by frequency
  const sorted = Array.from(found.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => code)
    .slice(0, 5); // Max 5 locations per article
  
  return {
    locations: sorted,
    primary: sorted[0] || null,
  };
}

/**
 * Get map data aggregated by location
 */
export interface MapDataPoint {
  code: string;
  name: string;
  lat: number;
  lng: number;
  articleCount: number;
  topics: Record<string, number>;
  trend: 'up' | 'down' | 'stable';
  importance: 'critical' | 'high' | 'medium' | 'low';
  recentArticles: Array<{ id: string; title: string; topic: string }>;
}

// Country code to name mapping
export const COUNTRY_NAMES: Record<string, string> = {
  'US': 'United States',
  'CN': 'China',
  'RU': 'Russia',
  'GB': 'United Kingdom',
  'DE': 'Germany',
  'FR': 'France',
  'UA': 'Ukraine',
  'JP': 'Japan',
  'KR': 'South Korea',
  'KP': 'North Korea',
  'TW': 'Taiwan',
  'IN': 'India',
  'IL': 'Israel',
  'PS': 'Palestine/Gaza',
  'IR': 'Iran',
  'IQ': 'Iraq',
  'SY': 'Syria',
  'SA': 'Saudi Arabia',
  'TR': 'Turkey',
  'EG': 'Egypt',
  'ZA': 'South Africa',
  'NG': 'Nigeria',
  'BR': 'Brazil',
  'MX': 'Mexico',
  'AU': 'Australia',
  'PK': 'Pakistan',
  'BY': 'Belarus',
  'PL': 'Poland',
  'SE': 'Sweden',
  'FI': 'Finland',
  'MM': 'Myanmar',
  'YE': 'Yemen',
  'LB': 'Lebanon',
  'VE': 'Venezuela',
  'TAIWAN_STRAIT': 'Taiwan Strait',
  'SOUTH_CHINA_SEA': 'South China Sea',
  'BLACK_SEA': 'Black Sea',
  'BALTIC': 'Baltic Region',
  'ARCTIC': 'Arctic',
};

export function getLocationName(code: string): string {
  return COUNTRY_NAMES[code] || code;
}

export function getLocationCoords(code: string): [number, number] | null {
  return LOCATION_COORDS[code] || null;
}
