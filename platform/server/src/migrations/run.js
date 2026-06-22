const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function runMigrations() {
  const dir = __dirname;
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`Running ${file}...`);
    await pool.query(sql);
    console.log(`  ✓ ${file}`);
  }

  await pool.end();
  console.log('Migrations complete.');
}

runMigrations().catch(err => { console.error(err); process.exit(1); });
