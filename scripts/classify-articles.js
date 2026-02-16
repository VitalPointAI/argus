/**
 * Backfill domain classification for existing articles
 * Run with: node scripts/classify-articles.js
 */

import pg from 'pg';
const { Client } = pg;

const DOMAIN_KEYWORDS = {
  'russia-ukraine': ['russia', 'ukraine', 'putin', 'zelensky', 'kremlin', 'moscow', 'kyiv', 'donbas', 'crimea', 'nato expansion'],
  'defense': ['military', 'defense', 'pentagon', 'armed forces', 'weapon', 'missile', 'army', 'navy', 'air force', 'warfare', 'combat', 'troops', 'soldier'],
  'ai-tech': ['artificial intelligence', 'ai ', ' ai,', 'machine learning', 'deep learning', 'chatgpt', 'openai', 'technology', 'semiconductor', 'chip', 'quantum'],
  'cyber': ['cyber', 'hacking', 'ransomware', 'malware', 'data breach', 'cybersecurity', 'infosec'],
  'china': ['china', 'beijing', 'chinese', 'xi jinping', 'taiwan', 'south china sea', 'ccp'],
  'middle-east': ['middle east', 'israel', 'iran', 'saudi', 'gaza', 'hamas', 'hezbollah', 'syria', 'iraq', 'yemen'],
  'climate': ['climate', 'carbon', 'emissions', 'global warming', 'renewable', 'solar', 'wind energy', 'environment'],
  'energy': ['oil', 'gas', 'opec', 'energy', 'petroleum', 'pipeline', 'lng', 'fossil fuel'],
  'markets': ['stock', 'market', 'fed', 'interest rate', 'inflation', 'economy', 'gdp', 'recession', 'bond', 'treasury'],
  'trade': ['tariff', 'trade war', 'sanctions', 'export', 'import', 'wto', 'trade deal'],
  'geopolitics': ['geopolitical', 'diplomacy', 'foreign policy', 'alliance', 'summit', 'treaty', 'international relations'],
};

function classifyText(title, body) {
  const text = `${title} ${body}`.toLowerCase();
  
  let bestMatch = null;
  
  for (const [slug, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      const regex = new RegExp(keyword.toLowerCase(), 'gi');
      const matches = text.match(regex);
      if (matches) {
        score += matches.length;
      }
    }
    
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { slug, score };
    }
  }
  
  return bestMatch?.slug || 'geopolitics';
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgres://argus:argus@localhost:5432/argus'
  });
  
  await client.connect();
  console.log('Connected to database');
  
  // Get domain ID mapping
  const domainsRes = await client.query('SELECT id, slug FROM domains');
  const domainMap = {};
  for (const row of domainsRes.rows) {
    domainMap[row.slug] = row.id;
  }
  console.log(`Loaded ${Object.keys(domainMap).length} domains`);
  
  // Get articles without domain classification
  const articlesRes = await client.query(`
    SELECT id, title, body 
    FROM content 
    WHERE domain_id IS NULL
    LIMIT 1000
  `);
  
  console.log(`Found ${articlesRes.rows.length} articles to classify`);
  
  let updated = 0;
  for (const article of articlesRes.rows) {
    const slug = classifyText(article.title, article.body);
    const domainId = domainMap[slug];
    
    if (domainId) {
      await client.query(
        'UPDATE content SET domain_id = $1 WHERE id = $2',
        [domainId, article.id]
      );
      updated++;
      
      if (updated % 100 === 0) {
        console.log(`Updated ${updated} articles...`);
      }
    }
  }
  
  console.log(`\nDone! Classified ${updated} articles`);
  
  // Show distribution
  const distRes = await client.query(`
    SELECT d.name, d.slug, COUNT(*) as count
    FROM content c
    JOIN domains d ON d.id = c.domain_id
    GROUP BY d.name, d.slug
    ORDER BY count DESC
  `);
  
  console.log('\nDomain distribution:');
  for (const row of distRes.rows) {
    console.log(`  ${row.name}: ${row.count}`);
  }
  
  await client.end();
}

main().catch(console.error);
