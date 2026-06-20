import { Router, Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { isIP } from 'net';
import { pool } from '../db/pool.js';
import { generateUUID } from '../db/sqlite.js';
import { config } from '../config/index.js';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const jwtOptions = { expiresIn: config.jwt.expiresIn } as SignOptions;

const router = Router();

function isLoopbackRequest(req: Request): boolean {
  const forwardedFor = req.headers['x-forwarded-for'];
  const candidate = typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : '';
  const address = candidate || req.ip || req.socket.remoteAddress || '';

  if (!address) {
    return false;
  }

  if (address === '::1' || address === '127.0.0.1' || address === 'localhost') {
    return true;
  }

  if (address.startsWith('::ffff:127.')) {
    return true;
  }

  if (isIP(address) === 4) {
    return address.startsWith('127.');
  }

  return false;
}

interface SetupBody {
  username: string;
}

function issueAccessToken(payload: { id: string; username: string }): string {
  return jwt.sign(payload, config.jwt.secret, jwtOptions);
}

// Auto-login: Get the default user from database (for local single-user app)
router.get('/auto', async (req: Request, res: Response) => {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: 'Auto-login is only available from localhost' });
    return;
  }

  try {
    // Get the first user from the database (local app typically has one user)
    const result = await pool.query(
      'SELECT id, username, bio, avatar_url, banner_url, is_admin, created_at FROM users ORDER BY created_at ASC LIMIT 1'
    );

    if (result.rows.length === 0) {
      // No user exists yet - frontend should show username setup
      res.status(404).json({ error: 'No user found' });
      return;
    }

    const user = result.rows[0];

    // Generate token for the user
    const token = issueAccessToken({
      id: user.id,
      username: user.username,
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        bio: user.bio,
        avatar_url: user.avatar_url,
        banner_url: user.banner_url,
        isAdmin: Boolean(user.is_admin),
        createdAt: user.created_at,
      },
      token,
    });
  } catch (error) {
    console.error('Auto-login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Setup or get user by username (simplified auth for local app)
router.post('/setup', async (req: Request<object, object, SetupBody>, res: Response) => {
  try {
    const { username } = req.body;

    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    // Sanitize username
    const sanitizedUsername = username
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 50);

    if (sanitizedUsername.length < 2) {
      res.status(400).json({ error: 'Username must be at least 2 characters' });
      return;
    }

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id, username, bio, avatar_url, banner_url, is_admin, created_at FROM users WHERE username = ?',
      [sanitizedUsername]
    );

    let user;

    if (existingUser.rows.length > 0) {
      // User exists, return it
      user = existingUser.rows[0];
    } else {
      // Create new user
      const userId = generateUUID();
      await pool.query(
        `INSERT INTO users (id, username, is_admin, created_at, updated_at)
         VALUES (?, ?, 0, datetime('now'), datetime('now'))`,
        [userId, sanitizedUsername]
      );

      const newUser = await pool.query(
        'SELECT id, username, bio, avatar_url, banner_url, is_admin, created_at FROM users WHERE id = ?',
        [userId]
      );
      user = newUser.rows[0];
    }

    // Generate token
    const token = issueAccessToken({
      id: user.id,
      username: user.username,
    });

    res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        bio: user.bio,
        avatar_url: user.avatar_url,
        banner_url: user.banner_url,
        isAdmin: Boolean(user.is_admin),
        createdAt: user.created_at,
      },
      token,
    });
  } catch (error) {
    console.error('Auth setup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, username, bio, avatar_url, banner_url, is_admin, created_at FROM users WHERE id = ?',
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = result.rows[0];
    res.json({
      user: {
        id: user.id,
        username: user.username,
        bio: user.bio,
        avatar_url: user.avatar_url,
        banner_url: user.banner_url,
        isAdmin: Boolean(user.is_admin),
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update username
router.patch('/username', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { username } = req.body;

    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    // Sanitize username
    const sanitizedUsername = username
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 50);

    if (sanitizedUsername.length < 2) {
      res.status(400).json({ error: 'Username must be at least 2 characters' });
      return;
    }

    // Check if username is taken by another user
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = ? AND id != ?',
      [sanitizedUsername, req.user!.id]
    );

    if (existingUser.rows.length > 0) {
      res.status(409).json({ error: 'Username is already taken' });
      return;
    }

    // Update username
    await pool.query(
      `UPDATE users SET username = ?, updated_at = datetime('now') WHERE id = ?`,
      [sanitizedUsername, req.user!.id]
    );

    // Get updated user
    const result = await pool.query(
      'SELECT id, username, bio, avatar_url, banner_url, is_admin, created_at FROM users WHERE id = ?',
      [req.user!.id]
    );

    const user = result.rows[0];

    // Issue new token with updated username
    const token = issueAccessToken({
      id: user.id,
      username: user.username,
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        bio: user.bio,
        avatar_url: user.avatar_url,
        banner_url: user.banner_url,
        isAdmin: Boolean(user.is_admin),
        createdAt: user.created_at,
      },
      token,
    });
  } catch (error) {
    console.error('Update username error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout (no-op for local app, just for API compatibility)
router.post('/logout', async (_req: Request, res: Response) => {
  res.json({ success: true });
});

// Refresh token (for API compatibility - just returns current user if token valid)
router.post('/refresh', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, username, bio, avatar_url, banner_url, is_admin, created_at FROM users WHERE id = ?',
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = result.rows[0];
    const token = issueAccessToken({
      id: user.id,
      username: user.username,
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        bio: user.bio,
        avatar_url: user.avatar_url,
        banner_url: user.banner_url,
        isAdmin: Boolean(user.is_admin),
        createdAt: user.created_at,
      },
      token,
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
