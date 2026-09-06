// Convert a Wrangler SELECT id,name JSON export into an atomic backfill.
const fs = require('node:fs');
const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error('Usage: node scripts/weapon-name-keys.cjs rows.json output.sql');
const data = JSON.parse(fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, ''));
const rows = data.flatMap(result => result.results || []);
const seen = new Set();
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const updates = rows.map(row => {
  const key = row.name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
  if (seen.has(key)) throw new Error('Duplicate normalized name: ' + row.name + '. Resolve before migration.');
  seen.add(key);
  if (!Number.isSafeInteger(row.id)) throw new Error('Invalid ID');
  return `UPDATE weapons SET name_key = ${quote(key)} WHERE id = ${row.id} AND name = ${quote(row.name)};`;
});
fs.writeFileSync(output, updates.join('\n') + '\n');
console.log(`Prepared ${rows.length} name keys; no duplicates.`);
