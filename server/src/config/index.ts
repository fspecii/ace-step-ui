import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const musicProvider = process.env.MUSIC_GENERATION_PROVIDER?.toLowerCase() === 'minimax'
  ? 'minimax' as const
  : 'local' as const;
const minimaxRegion = process.env.MINIMAX_REGION === 'cn_zh' ? 'cn_zh' as const : 'global_en' as const;
const minimaxOutputFormat = process.env.MINIMAX_MUSIC_OUTPUT_FORMAT === 'hex' ? 'hex' as const : 'url' as const;
const minimaxAudioFormat = process.env.MINIMAX_MUSIC_AUDIO_FORMAT === 'wav'
  ? 'wav' as const
  : process.env.MINIMAX_MUSIC_AUDIO_FORMAT === 'pcm'
    ? 'pcm' as const
    : 'mp3' as const;

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // SQLite database
  database: {
    path: process.env.DATABASE_PATH || path.join(__dirname, '../../data/acestep.db'),
  },

  // ACE-Step API (local)
  acestep: {
    apiUrl: process.env.ACESTEP_API_URL || 'http://localhost:8001',
  },

  music: {
    provider: musicProvider,
    minimax: {
      apiKey: process.env.MINIMAX_API_KEY || '',
      region: minimaxRegion,
      model: process.env.MINIMAX_MUSIC_MODEL || 'music-3.0',
      stream: process.env.MINIMAX_MUSIC_STREAM === 'true',
      outputFormat: minimaxOutputFormat,
      audioFormat: minimaxAudioFormat,
    },
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
    audioDir: process.env.AUDIO_DIR || path.join(__dirname, '../../public/audio'),
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
