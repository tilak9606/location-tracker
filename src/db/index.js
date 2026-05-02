import dotenv from 'dotenv';
dotenv.config();

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set in .env file');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('sslmode=require') 
    ? { rejectUnauthorized: false } 
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('connect', () => {
    
});

pool.on('error', (err) => {
  console.error('Database pool error:', err.message);
});

export const db = drizzle(pool, { schema });
export { pool };