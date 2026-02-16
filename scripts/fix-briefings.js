const { Pool } = require('/opt/argus/node_modules/pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#[0-9]+;/g, '')
    .replace(/[\t\r]+/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
}

async function fixBriefings() {
  const result = await pool.query('SELECT id, content FROM briefings ORDER BY created_at DESC');
  console.log('Found', result.rows.length, 'briefings');
  
  let fixed = 0;
  for (const row of result.rows) {
    if (!row.content) continue;
    
    // Check if has any HTML
    if (/<img|<figure|<p>|<div/.test(row.content)) {
      console.log('Processing:', row.id.substring(0, 8), '- has HTML');
      
      // Split into lines and process each one
      const lines = row.content.split('\n');
      const cleanedLines = lines.map(line => {
        // If line starts with **Context:** or **Latest:** and has HTML, clean it
        if (line.startsWith('**Context:**') && /</.test(line)) {
          const clean = stripHtml(line.replace('**Context:**', '')).substring(0, 300);
          return '**Context:** ' + (clean || 'See article for details.') + '...';
        }
        if (line.startsWith('**Latest:**') && /</.test(line)) {
          const clean = stripHtml(line.replace('**Latest:**', '')).substring(0, 200);
          return '**Latest:** ' + (clean || 'See article for details.');
        }
        return line;
      });
      
      const cleaned = cleanedLines.join('\n');
      
      if (cleaned !== row.content) {
        await pool.query('UPDATE briefings SET content = $1 WHERE id = $2', [cleaned, row.id]);
        fixed++;
        console.log('Fixed:', row.id.substring(0, 8));
      } else {
        console.log('No changes needed for:', row.id.substring(0, 8));
      }
    }
  }
  
  console.log('\nFixed', fixed, 'briefings');
  pool.end();
}

fixBriefings().catch(e => { console.error(e); process.exit(1); });
