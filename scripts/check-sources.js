const { Pool } = require('/opt/argus/node_modules/pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  // Get sources in USAWC list
  const sources = await pool.query("SELECT source_id FROM source_list_items WHERE source_list_id = 'ac9b275b-7327-4b2c-bcc1-a95cd06ff360'");
  const sourceIds = sources.rows.map(r => r.source_id);
  console.log('Sources in USAWC list:', sourceIds.length);
  
  // Get recent articles from those sources
  const since = new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString();
  const articles = await pool.query(
    'SELECT COUNT(*) as count FROM content WHERE source_id = ANY($1) AND fetched_at >= $2',
    [sourceIds, since]
  );
  console.log('Articles from those sources (last 14h):', articles.rows[0]?.count);
  
  // Get total recent articles for comparison
  const total = await pool.query('SELECT COUNT(*) as count FROM content WHERE fetched_at >= $1', [since]);
  console.log('Total articles (last 14h):', total.rows[0]?.count);
  
  pool.end();
}

check().catch(e => { console.error(e); process.exit(1); });
