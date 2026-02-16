import dotenv from 'dotenv';
dotenv.config();

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

export const JWT_SECRET = required('JWT_SECRET');
export const DATABASE_URL = required('DATABASE_URL');
export const TMDB_API_KEY = required('TMDB_API_KEY');
export const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
export const PORT = parseInt(process.env.PORT || '3001', 10);
