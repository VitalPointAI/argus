import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sources, domains } from './apps/api/src/db/schema';
import { eq } from 'drizzle-orm';

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

// Additional RSS sources for domains without coverage
const additionalSources: Record<string, { name: string; url: string }[]> = {
  'china': [
    { name: 'South China Morning Post', url: 'https://www.scmp.com/rss/91/feed' },
    { name: 'China Digital Times', url: 'https://chinadigitaltimes.net/feed/' },
    { name: 'Caixin Global', url: 'https://www.caixinglobal.com/rss/' },
    { name: 'Sinocism', url: 'https://sinocism.com/feed' },
  ],
  'russia-ukraine': [
    { name: 'Kyiv Independent', url: 'https://kyivindependent.com/feed/' },
    { name: 'Moscow Times', url: 'https://www.themoscowtimes.com/rss/news' },
    { name: 'Meduza', url: 'https://meduza.io/rss/en/all' },
    { name: 'Institute for Study of War', url: 'https://www.understandingwar.org/rss.xml' },
  ],
  'middle-east': [
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { name: 'Middle East Eye', url: 'https://www.middleeasteye.net/rss' },
    { name: 'Times of Israel', url: 'https://www.timesofisrael.com/feed/' },
    { name: 'Al-Monitor', url: 'https://www.al-monitor.com/rss' },
  ],
  'energy': [
    { name: 'Oil Price', url: 'https://oilprice.com/rss/main' },
    { name: 'Energy Intelligence', url: 'https://www.energyintel.com/rss' },
    { name: 'Rigzone', url: 'https://www.rigzone.com/news/rss/rigzone_latest.aspx' },
    { name: 'Renewable Energy World', url: 'https://www.renewableenergyworld.com/feed/' },
  ],
  'climate': [
    { name: 'Carbon Brief', url: 'https://www.carbonbrief.org/feed/' },
    { name: 'Climate Home News', url: 'https://www.climatechangenews.com/feed/' },
    { name: 'Inside Climate News', url: 'https://insideclimatenews.org/feed/' },
    { name: 'E&E News', url: 'https://www.eenews.net/rss/' },
  ],
  'defense': [
    { name: 'Defense News', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml' },
    { name: 'Breaking Defense', url: 'https://breakingdefense.com/feed/' },
    { name: 'The Drive - War Zone', url: 'https://www.thedrive.com/the-war-zone/feed' },
    { name: 'Defense One', url: 'https://www.defenseone.com/rss/' },
  ],
  'supply-chain': [
    { name: 'Supply Chain Dive', url: 'https://www.supplychaindive.com/feeds/news/' },
    { name: 'Logistics Management', url: 'https://www.logisticsmgmt.com/rss' },
    { name: 'FreightWaves', url: 'https://www.freightwaves.com/news/feed' },
  ],
  'biotech': [
    { name: 'STAT News', url: 'https://www.statnews.com/feed/' },
    { name: 'BioPharma Dive', url: 'https://www.biopharmadive.com/feeds/news/' },
    { name: 'Endpoints News', url: 'https://endpts.com/feed/' },
    { name: 'FierceBiotech', url: 'https://www.fiercebiotech.com/rss/xml' },
  ],
  'space': [
    { name: 'SpaceNews', url: 'https://spacenews.com/feed/' },
    { name: 'Ars Technica Space', url: 'https://feeds.arstechnica.com/arstechnica/science' },
    { name: 'Space.com', url: 'https://www.space.com/feeds/all' },
    { name: 'NASA Breaking News', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss' },
  ],
  'trade': [
    { name: 'Trade Compliance Flash', url: 'https://www.jdsupra.com/resources/syndication/rss.aspx?t=trade' },
    { name: 'PIIE Trade', url: 'https://www.piie.com/rss/publications' },
    { name: 'International Trade Today', url: 'https://internationaltradetoday.com/feed/' },
  ],
  'elections': [
    { name: 'FiveThirtyEight', url: 'https://fivethirtyeight.com/politics/feed/' },
    { name: 'Cook Political Report', url: 'https://www.cookpolitical.com/feed' },
    { name: 'Ballotpedia', url: 'https://ballotpedia.org/wiki/index.php?title=Special:RecentChanges&feed=rss' },
  ],
  'terrorism': [
    { name: 'Long War Journal', url: 'https://www.longwarjournal.org/feed' },
    { name: 'Combating Terrorism Center', url: 'https://ctc.westpoint.edu/feed/' },
    { name: 'SITE Intelligence', url: 'https://ent.siteintelgroup.com/rss' },
  ],
  'latam': [
    { name: 'Americas Quarterly', url: 'https://www.americasquarterly.org/feed/' },
    { name: 'Buenos Aires Times', url: 'https://www.batimes.com.ar/feed' },
    { name: 'Brazil Reports', url: 'https://brazilian.report/feed/' },
    { name: 'Mexico News Daily', url: 'https://mexiconewsdaily.com/feed/' },
  ],
  'africa': [
    { name: 'African Arguments', url: 'https://africanarguments.org/feed/' },
    { name: 'The Africa Report', url: 'https://www.theafricareport.com/feed/' },
    { name: 'AllAfrica', url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf' },
    { name: 'Quartz Africa', url: 'https://qz.com/africa/feed/' },
  ],
};

async function seedMoreSources() {
  console.log('Seeding additional sources...\n');

  for (const [slug, feedSources] of Object.entries(additionalSources)) {
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
          reliabilityScore: 65,
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

seedMoreSources().catch(console.error);
