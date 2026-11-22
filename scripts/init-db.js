import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing. Copy .env.example to .env and configure it first.');
  process.exit(1);
}

const schemaPath = path.resolve('server/schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(schema);
  console.log('EngageKit database schema applied successfully.');
} catch (error) {
  console.error('Database setup failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
