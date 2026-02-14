import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '../..');

function resolveServerPath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(SERVER_ROOT, inputPath);
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
    secret: process.env.JWT_SECRET || 'ace-step-ui-local-secret',
    expiresIn: '365d', // Long-lived for local app
  },
};
