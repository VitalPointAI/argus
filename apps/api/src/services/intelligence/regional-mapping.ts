/**
 * Regional Source Mapping
 * Maps sources to geopolitical regions for propaganda analysis
 */

export type Region = 
  | 'western'      // US, UK, Canada, Australia, NZ
  | 'european'     // EU (excluding UK)
  | 'russian'      // Russia, Belarus
  | 'chinese'      // China, Hong Kong
  | 'asian'        // Japan, Korea, India, Southeast Asia
  | 'middle_east'  // Israel, Iran, Saudi, Gulf, Turkey
  | 'latam'        // Central/South America
  | 'african';     // Africa

export const REGION_LABELS: Record<Region, string> = {
  western: '🇺🇸 Western',
  european: '🇪🇺 European',
  russian: '🇷🇺 Russian',
  chinese: '🇨🇳 Chinese',
  asian: '🌏 Asian',
  middle_east: '🌍 Middle East',
  latam: '🌎 Latin America',
  african: '🌍 African',
};

// Keywords in source names/URLs to identify region
const REGION_PATTERNS: Record<Region, RegExp[]> = {
  western: [
    /\b(cnn|fox|nbc|abc|cbs|nytimes|washingtonpost|wsj|reuters|ap\s?news|bloomberg|bbc|guardian|telegraph|times\suk|sky\snews)\b/i,
    /\.(com|org|gov)\b.*\b(us|usa|america)/i,
    /\b(american|pentagon|white\s?house|congress)\b/i,
  ],
  european: [
    /\b(dw|deutsche|spiegel|le\s?monde|afp|france24|euronews|politico\.eu|ansa|el\s?pais|publico)\b/i,
    /\.(de|fr|it|es|nl|be|at|pl|eu)\b/i,
    /\b(brussels|berlin|paris|european\sunion|eu\s)\b/i,
  ],
  russian: [
    /\b(rt\b|russia\stoday|tass|ria|sputnik|pravda|interfax|kommersant|izvestia)\b/i,
    /\.(ru|by)\b/i,
    /\b(moscow|kremlin|russian)\b/i,
  ],
  chinese: [
    /\b(xinhua|scmp|global\stimes|cgtn|china\sdaily|peoples\sdaily|caixin|sixth\stone)\b/i,
    /\.(cn|hk)\b/i,
    /\b(beijing|chinese|ccp|prc)\b/i,
  ],
  asian: [
    /\b(nhk|nikkei|yomiuri|asahi|korea\s?times|korea\s?herald|chosun|hankyoreh|straits\stimes|channel\snews\sasia|hindustan|times\sof\sindia|ndtv)\b/i,
    /\.(jp|kr|sg|in|th|vn|id|my|ph)\b/i,
    /\b(tokyo|seoul|singapore|delhi|mumbai|jakarta)\b/i,
  ],
  middle_east: [
    /\b(al\s?jazeera|al\s?arabiya|haaretz|jerusalem\spost|times\sof\sisrael|iran\sdaily|tehran\stimes|press\stv|arab\snews|gulf\snews|daily\ssabah|anadolu)\b/i,
    /\.(il|ir|sa|ae|qa|tr|eg)\b/i,
    /\b(jerusalem|tehran|riyadh|dubai|ankara|cairo)\b/i,
  ],
  latam: [
    /\b(telesur|folha|globo|clarin|la\s?nacion|el\s?universal|reforma|excelsior|el\stiempo|el\scomercio)\b/i,
    /\.(br|mx|ar|cl|co|pe|ve)\b/i,
    /\b(brazil|mexico|argentina|venezuela|colombia)\b/i,
  ],
  african: [
    /\b(africa\s?news|all\s?africa|daily\s?nation|the\s?star|citizen|sowetan|mail\s?guardian|punch|vanguard|daily\s?trust)\b/i,
    /\.(za|ng|ke|eg|gh|et)\b/i,
    /\b(johannesburg|lagos|nairobi|cairo|accra|addis)\b/i,
  ],
};

/**
 * Detect region from source name and URL
 */
export function detectSourceRegion(sourceName: string, sourceUrl: string): Region | null {
  const text = `${sourceName} ${sourceUrl}`.toLowerCase();
  
  for (const [region, patterns] of Object.entries(REGION_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return region as Region;
      }
    }
  }
  
  return null;
}

/**
 * Get region for a source, with caching
 */
const regionCache = new Map<string, Region | null>();

export function getSourceRegion(sourceId: string, sourceName: string, sourceUrl: string): Region | null {
  const cacheKey = sourceId;
  
  if (regionCache.has(cacheKey)) {
    return regionCache.get(cacheKey) || null;
  }
  
  const region = detectSourceRegion(sourceName, sourceUrl);
  regionCache.set(cacheKey, region);
  return region;
}

/**
 * Divergence level between regional perspectives
 */
export type DivergenceLevel = 'none' | 'partial' | 'strong';

export const DIVERGENCE_LABELS: Record<DivergenceLevel, { label: string; color: string; emoji: string }> = {
  none: { label: 'No Divergence', color: 'green', emoji: '✅' },
  partial: { label: 'Partial Divergence', color: 'yellow', emoji: '⚠️' },
  strong: { label: 'Strong Divergence', color: 'red', emoji: '🚨' },
};
