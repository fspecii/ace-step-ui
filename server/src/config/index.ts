import dotenv from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '../..');

function resolveServerPath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(SERVER_ROOT, inputPath);
}

const DEFAULT_JWT_SECRET = 'ace-step-ui-local-secret';

function loadJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET?.trim();
  if (envSecret && envSecret !== DEFAULT_JWT_SECRET) {
    return envSecret;
  }

  const secretPath = path.join(SERVER_ROOT, 'data/jwt.secret');
  if (existsSync(secretPath)) {
    const storedSecret = readFileSync(secretPath, 'utf-8').trim();
    if (storedSecret) {
      return storedSecret;
    }
  }

  const generatedSecret = randomBytes(32).toString('hex');
  try {
    writeFileSync(secretPath, `${generatedSecret}\n`, { mode: 0o600, flag: 'w' });
  } catch (error) {
    console.warn('Failed to persist JWT secret, continuing with an in-memory secret only:', error);
  }
  return generatedSecret;
}

const databasePathEnv = process.env.DATABASE_PATH;
const resolvedDatabasePath = databasePathEnv
  ? resolveServerPath(databasePathEnv)
  : path.join(SERVER_ROOT, 'data/acestep.db');

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // SQLite database
  database: {
    path: resolvedDatabasePath,
  },

  // ACE-Step API (local)
  acestep: {
    apiUrl: process.env.ACESTEP_API_URL || 'http://localhost:8001',
  },

  // Pexels (optional - for video backgrounds)
  pexels: {
    apiKey: process.env.PEXELS_API_KEY || '',
  },

  // Frontend URL
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Storage (local only)
  storage: {
    provider: 'local' as const,
    audioDir: process.env.AUDIO_DIR
      ? resolveServerPath(process.env.AUDIO_DIR)
      : path.join(SERVER_ROOT, 'public/audio'),
  },

  // Training datasets (inside ACE-Step-1.5 so Gradio can access them)
  datasets: {
    dir: process.env.DATASETS_DIR || path.join(__dirname, '../../../ACE-Step-1.5/datasets'),
    uploadsDir: process.env.DATASETS_UPLOADS_DIR || path.join(__dirname, '../../../ACE-Step-1.5/datasets/uploads'),
  },

  // Simplified JWT (for local session, not critical security)
  jwt: {
    secret: loadJwtSecret(),
    expiresIn: '365d', // Long-lived for local app
  },
};
