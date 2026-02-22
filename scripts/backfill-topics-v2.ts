/**
 * Backfill article topics using existing topic-classifier service
 * Run with: npx tsx scripts/backfill-topics-v2.ts
 */

import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL!;
const NEAR_AI_BASE = 'https://api.near.ai/v1';
const NEAR_AI_API_KEY = process.env.NEAR_AI_API_KEY!;
const NEAR_AI_MODEL = process.env.NEAR_AI_MODEL || 'fireworks::accounts/fireworks/models/deepseek-v3';

const KNOWN_TOPICS = [
  'China', 'Russia', 'Ukraine', 'Taiwan', 'North Korea', 'Iran', 'Israel', 'Gaza',
  'Middle East', 'Europe', 'Asia Pacific', 'Africa', 'Latin America',
  'Defense', 'Military', 'Nuclear', 'Cyber Security', 'Intelligence',
  'AI', 'Technology', 'Semiconductors', 'Space',
  'Energy', 'Oil & Gas', 'Climate', 'Environment',
  'Economy', 'Trade', 'Sanctions', 'Markets',
  'Geopolitics', 'Diplomacy', 'Elections', 'Human Rights',
];

async function classifyArticle(title: string, body: string): Promise<{ topics: string[]; summary: string }> {
  const truncatedBody = body.length > 2000 ? body.substring(0, 2000) : body;
  
  const prompt = `Analyze this article and extract:
1. Topics (1-5 from this list: ${KNOWN_TOPICS.join(', ')})
2. One-sentence summary (max 150 chars)

Title: ${title}
Content: ${truncatedBody}

Respond in JSON only:
{"topics": ["Topic1", "Topic2"], "summary": "Brief summary"}`;

  try {
    const response = await fetch(`${NEAR_AI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NEAR_AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: NEAR_AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('API error:', response.status, err);
      return { topics: [], summary: '' };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const validTopics = (parsed.topics || []).filter((t: string) => KNOWN_TOPICS.includes(t));
      return {
        topics: validTopics.slice(0, 5),
        summary: (parsed.summary || '').substring(0, 200),
      };
    }
  } catch (e) {
    console.error('Parse error:', e);
  }
  
  return { topics: [], summary: '' };
}

async function main() {
  if (!DATABASE_URL) throw new Error('DATABASE_URL required');
  if (!NEAR_AI_API_KEY) throw new Error('NEAR_AI_API_KEY required');
  
  console.log('Starting backfill...');
  console.log('Model:', NEAR_AI_MODEL);
  
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  // Reset bad classifications
  console.log('Resetting bad classifications...');
  await pool.query("UPDATE content SET topics = '[]'::jsonb, summary = NULL WHERE topics = '[\"Geopolitics\"]'::jsonb");
  
  const { rows: countRows } = await pool.query("SELECT COUNT(*) as cnt FROM content WHERE topics = '[]'::jsonb");
  console.log(`Articles to classify: ${countRows[0].cnt}`);
  
  let processed = 0;
  let successful = 0;
  const start = Date.now();
  const BATCH_SIZE = 5;
  
  while (true) {
    const { rows } = await pool.query(
      "SELECT id, title, body FROM content WHERE topics = '[]'::jsonb ORDER BY fetched_at DESC LIMIT $1",
      [BATCH_SIZE]
    );
    
    if (rows.length === 0) break;
    
    // Process batch in parallel
    const results = await Promise.all(
      rows.map(async (row) => {
        const { topics, summary } = await classifyArticle(row.title, row.body || '');
        return { id: row.id, topics, summary };
      })
    );
    
    // Update database
    for (const { id, topics, summary } of results) {
      if (topics.length > 0) {
        await pool.query(
          "UPDATE content SET topics = $1, summary = $2 WHERE id = $3",
          [JSON.stringify(topics), summary || null, id]
        );
        successful++;
      }
    }
    
    processed += rows.length;
    
    if (processed % 50 === 0) {
      const elapsed = (Date.now() - start) / 1000;
      const rate = processed / elapsed;
      console.log(`Processed: ${processed} | Success: ${successful} | Rate: ${rate.toFixed(1)}/sec`);
    }
    
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 200));
  }
  
  const totalTime = (Date.now() - start) / 1000;
  console.log(`\nDONE! Processed: ${processed} | Successful: ${successful} | Time: ${totalTime.toFixed(1)}s`);
  
  await pool.end();
}

main().catch(console.error);
