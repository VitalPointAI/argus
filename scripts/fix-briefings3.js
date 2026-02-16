const { Pool } = require('/opt/argus/node_modules/pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function stripHtml(html) {
  if (!html) return '';
  let result = html
    // Remove complete HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove incomplete/unclosed tags (from < to end if no >)
    .replace(/<[^>]*$/g, '')
    // Also handle tags at start with no closing
    .replace(/^[^<]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#[0-9]+;/g, '')
    .replace(/[\t\r]+/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
  
  // If the result is empty or very short after stripping, return a default
  if (result.length < 10) {
    return 'See article for full details.';
  }
  return result;
}

async function fix() {
  const result = await pool.query('SELECT id, content FROM briefings ORDER BY created_at DESC');
  console.log('Found', result.rows.length, 'briefings');
  
  let fixed = 0;
  for (const row of result.rows) {
    if (!row.content) continue;
    
    // Check if has any HTML (including unclosed tags)
    if (/<img|<figure|<p>|<div/.test(row.content)) {
      console.log('Processing:', row.id.substring(0, 8));
      
      const lines = row.content.split('\n');
      const cleanedLines = lines.map((line) => {
        if (line.startsWith('**Context:**') && line.includes('<')) {
          const clean = stripHtml(line.replace('**Context:**', '')).substring(0, 300);
          return '**Context:** ' + clean + '...';
        }
        if (line.startsWith('**Latest:**') && line.includes('<')) {
          const clean = stripHtml(line.replace('**Latest:**', '')).substring(0, 200);
          return '**Latest:** ' + clean;
        }
        return line;
      });
      
      const cleaned = cleanedLines.join('\n');
      
      if (cleaned !== row.content) {
        await pool.query('UPDATE briefings SET content = $1 WHERE id = $2', [cleaned, row.id]);
        fixed++;
        console.log('Fixed:', row.id.substring(0, 8));
      }
    }
  }
  
  console.log('\nFixed', fixed, 'briefings');
  pool.end();
}

fix().catch(e => { console.error(e); process.exit(1); });
