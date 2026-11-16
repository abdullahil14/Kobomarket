require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.PG_URI });

(async () => {
  try {
    const r = await pool.query('SELECT NOW()');
    console.log('✅ POSTGRES WORKS:', r.rows[0]);
    const dbs = await pool.query("SELECT datname FROM pg_database WHERE datname='kobomarket'");
    console.log('kobomarket DB exists?', dbs.rows);
  } catch (e) {
    console.log('❌ POSTGRES FAILED:', e.message);
  }
  await pool.end();
})();