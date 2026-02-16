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

async function fix() {
  const result = await pool.query("SELECT id, content FROM briefings WHERE id = '4062f537-b358-41e9-b070-ffcf65e296d6'");
  const row = result.rows[0];
  
  const lines = row.content.split('\n');
  console.log('Total lines:', lines.length);
  
  const cleanedLines = lines.map((line, i) => {
    if (line.startsWith('**Context:**') && line.includes('<')) {
      const clean = stripHtml(line.replace('**Context:**', '')).substring(0, 300);
      console.log('Fixing Context line', i);
      console.log('  Before:', line.substring(0, 60));
      console.log('  After:', ('**Context:** ' + (clean || 'See article.')).substring(0, 60));
      return '**Context:** ' + (clean || 'See article for details.') + '...';
    }
    if (line.startsWith('**Latest:**') && line.includes('<')) {
      const clean = stripHtml(line.replace('**Latest:**', '')).substring(0, 200);
      console.log('Fixing Latest line', i);
      return '**Latest:** ' + (clean || 'See article for details.');
    }
    return line;
  });
  
  const cleaned = cleanedLines.join('\n');
  console.log('\nContent changed:', cleaned !== row.content);
  
  if (cleaned !== row.content) {
    await pool.query('UPDATE briefings SET content = $1 WHERE id = $2', [cleaned, row.id]);
    console.log('Updated database!');
  }
  
  pool.end();
}

fix().catch(e => { console.error(e); process.exit(1); });
