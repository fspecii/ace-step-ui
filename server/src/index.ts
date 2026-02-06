import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root (parent of server directory)
const __filename_init = fileURLToPath(import.meta.url);
const __dirname_init = path.dirname(__filename_init);
dotenv.config({ path: path.join(__dirname_init, '../../.env') });
import cron from 'node-cron';
import { config } from './config/index.js';
import { runCleanupJob, cleanupDeletedSongs } from './services/cleanup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import authRoutes from './routes/auth.js';
import songsRoutes from './routes/songs.js';
import generateRoutes from './routes/generate.js';
import usersRoutes from './routes/users.js';
import playlistsRoutes from './routes/playlists.js';
import contactRoutes from './routes/contact.js';
import referenceTrackRoutes from './routes/referenceTrack.js';
import trainingRoutes from './routes/training.js';
import loraRoutes from './routes/lora.js';
import { pool } from './db/pool.js';
import './db/migrate.js';

const app = express();

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
      upgradeInsecureRequests: [],
    },
  },
}));

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow localhost and 127.0.0.1 on any port in development
    if (config.nodeEnv === 'development') {
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
      // Allow LAN IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
      const lanPattern = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/;
      if (lanPattern.test(origin)) {
        return callback(null, true);
      }
    }
    // Allow configured frontend URL
    if (origin === config.frontendUrl) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json());

// Serve static audio files
app.use('/audio', express.static(path.join(__dirname, '../public/audio')));

// Audio Editor (AudioMass) - needs relaxed CSP for inline scripts and external images
app.use('/editor', (req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' blob: data: http://localhost:* https:; connect-src 'self' http://localhost:* https:; worker-src 'self' blob:");
  next();
}, express.static(path.join(__dirname, '../audio-editor')));

// Demucs Web (Stem Extraction) - requires COOP/COEP headers for SharedArrayBuffer and relaxed CSP for ONNX runtime
app.use('/demucs-web', (req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "media-src 'self' blob: data: http://localhost:* https:",
    "connect-src 'self' blob: http://localhost:* https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co",
    "worker-src 'self' blob:",
    "child-src 'self' blob:"
  ].join('; '));
  next();
}, express.static(path.join(__dirname, '../public/demucs-web')));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ACE-Step UI API' });
});

// oEmbed endpoint for rich embeds
app.get('/api/oembed', async (req, res) => {
  const url = req.query.url as string;
  if (!url) {
    res.status(400).json({ error: 'URL required' });
    return;
  }

  const match = url.match(/\/song\/([a-zA-Z0-9-]+)/);
  if (!match) {
    res.status(404).json({ error: 'Song not found' });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT s.id, s.title, s.style, s.cover_url, s.duration,
              COALESCE(u.username, 'Anonymous') as creator
       FROM songs s
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.id = ? AND s.is_public = 1`,
      [match[1]]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Song not found' });
      return;
    }

    const song = result.rows[0];
    res.json({
      version: '1.0',
      type: 'rich',
      provider_name: 'ACE-Step UI',
      provider_url: config.frontendUrl,
      title: song.title,
      author_name: song.creator,
      thumbnail_url: song.cover_url,
      thumbnail_width: 400,
      thumbnail_height: 400,
      html: `<iframe src="${config.frontendUrl}/embed/${song.id}" width="100%" height="152" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`,
      width: 400,
      height: 152
    });
  } catch (error) {
    console.error('oEmbed error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Song share page handler
app.get('/song/:id', async (req, res) => {
  const songId = req.params.id;
  const userAgent = req.get('User-Agent') || '';

  // Check if request is from a social media bot
  const isSocialBot = /twitterbot|facebookexternalhit|linkedinbot|slackbot|redditbot|discordbot|telegrambot|whatsapp|pinterestbot|tumblr|embedly|quora|outbrain|vkshare|w3c_validator|baiduspider|bingbot/i.test(userAgent);

  if (!isSocialBot) {
    res.redirect(`${config.frontendUrl}?song=${songId}`);
    return;
  }

  try {
    const result = await pool.query(
      `SELECT s.id, s.title, s.style, s.cover_url, s.audio_url, s.duration, s.like_count, s.view_count,
              COALESCE(u.username, 'Anonymous') as creator
       FROM songs s
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.id = ? AND s.is_public = 1`,
      [songId]
    );

    if (result.rows.length === 0) {
      res.redirect(config.frontendUrl);
      return;
    }

    const song = result.rows[0];
    const coverUrl = song.cover_url || `https://picsum.photos/seed/${song.id}/1200/630`;
    const title = `${song.title} by ${song.creator}`;
    const description = `🎵 ${song.style} • Create your own AI music free on ACE-Step UI`;
    const pageUrl = `${config.frontendUrl}/song/${song.id}`;

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | ACE-Step UI</title>
  <meta name="title" content="${title}">
  <meta name="description" content="${description}">
  <meta property="og:type" content="music.song">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${coverUrl}">
  <meta property="og:site_name" content="ACE-Step UI">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${coverUrl}">
  <meta http-equiv="refresh" content="0;url=${config.frontendUrl}?song=${song.id}">
</head>
<body>
  <p>Redirecting to <a href="${config.frontendUrl}?song=${song.id}">ACE-Step UI</a>...</p>
</body>
</html>`);
  } catch (error) {
    console.error('Error serving song share page:', error);
    res.redirect(config.frontendUrl);
  }
});

// Image proxy for CORS
app.get('/api/proxy/image', async (req, res) => {
  const url = req.query.url as string;
  if (!url) {
    res.status(400).json({ error: 'URL required' });
    return;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      res.status(response.status).json({ error: 'Failed to fetch image' });
      return;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Image proxy error:', error);
    res.status(500).json({ error: 'Failed to proxy image' });
  }
});

// Pexels API proxy - accepts API key from header or uses server config
app.get('/api/pexels/photos', async (req, res) => {
  const query = req.query.query as string;
  if (!query) {
    res.status(400).json({ error: 'Query required' });
    return;
  }

  // Accept API key from header (user-provided) or fall back to server config
  const apiKey = req.headers['x-pexels-api-key'] as string || config.pexels.apiKey;

  if (!apiKey) {
    res.status(400).json({ error: 'Pexels API key not configured. Please set your API key in the Video Generator settings.' });
    return;
  }

  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20&orientation=landscape`,
      { headers: { Authorization: apiKey } }
    );

    if (!response.ok) {
      if (response.status === 401) {
        res.status(401).json({ error: 'Invalid Pexels API key' });
        return;
      }
      res.status(response.status).json({ error: 'Pexels API error' });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Pexels photos error:', error);
    res.status(500).json({ error: 'Failed to fetch from Pexels' });
  }
});

app.get('/api/pexels/videos', async (req, res) => {
  const query = req.query.query as string;
  if (!query) {
    res.status(400).json({ error: 'Query required' });
    return;
  }

  // Accept API key from header (user-provided) or fall back to server config
  const apiKey = req.headers['x-pexels-api-key'] as string || config.pexels.apiKey;

  if (!apiKey) {
    res.status(400).json({ error: 'Pexels API key not configured. Please set your API key in the Video Generator settings.' });
    return;
  }

  try {
    const response = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`,
      { headers: { Authorization: apiKey } }
    );

    if (!response.ok) {
      if (response.status === 401) {
        res.status(401).json({ error: 'Invalid Pexels API key' });
        return;
      }
      res.status(response.status).json({ error: 'Pexels API error' });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Pexels videos error:', error);
    res.status(500).json({ error: 'Failed to fetch from Pexels' });
  }
});

// Search endpoint
app.get('/api/search', async (req, res) => {
  const query = (req.query.q as string)?.trim();
  const type = req.query.type as string;

  if (!query) {
    res.status(400).json({ error: 'Search query required' });
    return;
  }

  try {
    const searchPattern = `%${query}%`;
    const results: { songs: unknown[]; creators: unknown[]; playlists: unknown[] } = {
      songs: [],
      creators: [],
      playlists: [],
    };

    if (!type || type === 'all' || type === 'songs') {
      const songsResult = await pool.query(
        `SELECT s.id, s.title, s.lyrics, s.style, s.caption, s.cover_url, s.audio_url,
                s.duration, s.tags, s.like_count, s.view_count, s.is_public, s.created_at,
                u.username as creator, u.avatar_url as creator_avatar
         FROM songs s
         LEFT JOIN users u ON s.user_id = u.id
         WHERE s.is_public = 1
           AND (s.title LIKE ? COLLATE NOCASE OR s.style LIKE ? COLLATE NOCASE)
         ORDER BY s.like_count DESC
         LIMIT 20`,
        [searchPattern, searchPattern]
      );
      results.songs = songsResult.rows;
    }

    if (!type || type === 'all' || type === 'creators') {
      const creatorsResult = await pool.query(
        `SELECT u.id, u.username, u.bio, u.avatar_url, u.created_at,
                (SELECT COUNT(*) FROM followers WHERE following_id = u.id) as follower_count
         FROM users u
         WHERE u.username LIKE ? COLLATE NOCASE
         ORDER BY (SELECT COUNT(*) FROM followers WHERE following_id = u.id) DESC
         LIMIT 20`,
        [searchPattern]
      );
      results.creators = creatorsResult.rows;
    }

    if (!type || type === 'all' || type === 'playlists') {
      const playlistsResult = await pool.query(
        `SELECT p.id, p.name, p.description, p.cover_url, p.created_at,
                u.username as creator, u.avatar_url as creator_avatar,
                (SELECT COUNT(*) FROM playlist_songs ps WHERE ps.playlist_id = p.id) as song_count
         FROM playlists p
         JOIN users u ON p.user_id = u.id
         WHERE p.is_public = 1 AND p.name LIKE ? COLLATE NOCASE
         ORDER BY (SELECT COUNT(*) FROM playlist_songs ps WHERE ps.playlist_id = p.id) DESC
         LIMIT 20`,
        [searchPattern]
      );
      results.playlists = playlistsResult.rows;
    }

    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/songs', songsRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/playlists', playlistsRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/reference-tracks', referenceTrackRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/lora', loraRoutes);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Schedule cleanup job to run daily at 3 AM
cron.schedule('0 3 * * *', async () => {
  console.log('Running scheduled cleanup job...');
  try {
    await runCleanupJob();
    await cleanupDeletedSongs();
  } catch (error) {
    console.error('Cleanup job failed:', error);
  }
});

// Start server on all interfaces for LAN access
app.listen(config.port, '0.0.0.0', () => {
  console.log(`ACE-Step UI Server running on http://localhost:${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`ACE-Step API: ${config.acestep.apiUrl}`);

  // Show LAN access info
  import('os').then(os => {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`LAN access: http://${net.address}:${config.port}`);
        }
      }
    }
  });
});
