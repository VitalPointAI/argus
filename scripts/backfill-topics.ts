/**
 * Backfill article topics for existing content
 * Run with: npx tsx scripts/backfill-topics.ts
 */

import 'dotenv/config';
import { db } from '../apps/api/src/db';
import { content } from '../apps/api/src/db/schema';
import { eq, sql } from 'drizzle-orm';
import { classifyArticleTopics } from '../apps/api/src/services/intelligence/topic-classifier';

const BATCH_SIZE = 10;
const DELAY_MS = 500; // Delay between batches to avoid rate limits

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function backfillTopics() {
  console.log('Starting topic backfill...');
  
  let processed = 0;
  let errors = 0;
  
  while (true) {
    // Get batch of articles without topics
    const articles = await db.select({
      id: content.id,
      title: content.title,
      body: content.body,
    })
      .from(content)
      .where(sql`${content.topics} = '[]'::jsonb`)
      .limit(BATCH_SIZE);
    
    if (articles.length === 0) {
      console.log('No more articles to process');
      break;
    }
    
    // Process batch
    for (const article of articles) {
      try {
        const result = await classifyArticleTopics(article.title, article.body);
        
        await db.update(content)
          .set({
            topics: result.topics,
            summary: result.summary,
          })
          .where(eq(content.id, article.id));
        
        processed++;
        
        if (processed % 100 === 0) {
          console.log(`Processed ${processed} articles...`);
        }
      } catch (err) {
        console.error(`Error processing ${article.id}:`, err);
        errors++;
        
        // Set empty topics to skip on next iteration
        await db.update(content)
          .set({ topics: ['Unknown'] })
          .where(eq(content.id, article.id));
      }
    }
    
    // Delay between batches
    await sleep(DELAY_MS);
  }
  
  console.log(`\nBackfill complete!`);
  console.log(`Processed: ${processed}`);
  console.log(`Errors: ${errors}`);
}

backfillTopics()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
