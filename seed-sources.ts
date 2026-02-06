import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sources, domains } from './apps/api/src/db/schema';
import { eq } from 'drizzle-orm';

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

// Starter RSS sources by domain
const starterSources: Record<string, { name: string; url: string }[]> = {
  'cyber': [
    { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/' },
    { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews' },
    { name: 'Bleeping Computer', url: 'https://www.bleepingcomputer.com/feed/' },
    { name: 'CISA Alerts', url: 'https://www.cisa.gov/uscert/ncas/alerts.xml' },
    { name: 'Schneier on Security', url: 'https://www.schneier.com/feed/' },
  ],
  'crypto': [
    { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { name: 'The Block', url: 'https://www.theblock.co/rss.xml' },
    { name: 'Decrypt', url: 'https://decrypt.co/feed' },
    { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  ],
  'geopolitics': [
    { name: 'Foreign Affairs', url: 'https://www.foreignaffairs.com/rss.xml' },
    { name: 'War on the Rocks', url: 'https://warontherocks.com/feed/' },
    { name: 'The Diplomat', url: 'https://thediplomat.com/feed/' },
  ],
  'ai-tech': [
    { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/' },
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  ],
  'markets': [
    { name: 'Reuters Business', url: 'https://www.reutersagency.com/feed/?taxonomy=best-sectors&post_type=best' },
    { name: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss' },
  ],
  'us-politics': [
    { name: 'Politico', url: 'https://www.politico.com/rss/politicopicks.xml' },
    { name: 'The Hill', url: 'https://thehill.com/feed/' },
    { name: 'AP Politics', url: 'https://rsshub.app/apnews/topics/politics' },
  ],
};

async function seedSources() {
  console.log('Seeding starter sources...\n');

  for (const [slug, feedSources] of Object.entries(starterSources)) {
    // Find domain
    const [domain] = await db.select().from(domains).where(eq(domains.slug, slug));
    
    if (!domain) {
      console.log(`  ⚠ Domain "${slug}" not found, skipping`);
      continue;
    }

    console.log(`${domain.name}:`);
    
    for (const source of feedSources) {
      try {
        await db.insert(sources).values({
          name: source.name,
          type: 'rss',
          url: source.url,
          domainId: domain.id,
          reliabilityScore: 70, // Default starting score
          isActive: true,
        }).onConflictDoNothing();
        console.log(`  ✓ ${source.name}`);
      } catch (error) {
        console.log(`  ✗ ${source.name}: ${error}`);
      }
    }
    console.log('');
  }

  console.log('Done!');
  process.exit(0);
}

seedSources().catch(console.error);
