import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { pool } from '../db/pool.js';
import { authMiddleware, optionalAuthMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { getStorageProvider } from '../services/storage/factory.js';

const router = Router();

async function resolvePublicAudioUrl(audioUrl: string | null): Promise<string | null> {
    if (!audioUrl) return null;
    if (audioUrl.startsWith('s3://')) {
        const storageKey = audioUrl.replace('s3://', '');
        const storage = getStorageProvider();
        return storage.getPublicUrl(storageKey);
    }
    return audioUrl;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'));
    }
  }
});

// Get featured creators (for search/explore page)
router.get('/public/featured', async (_req, res: Response) => {
    try {
        // First try to get users with public songs
        let result = await pool.query(
            `SELECT u.id, u.username, u.bio, u.avatar_url, u.created_at,
                    (SELECT COUNT(*) FROM followers WHERE following_id = u.id) as follower_count,
                    (SELECT COUNT(*) FROM songs WHERE user_id = u.id AND is_public = 1) as song_count
             FROM users u
             WHERE EXISTS (SELECT 1 FROM songs WHERE user_id = u.id AND is_public = 1)
             ORDER BY (SELECT COUNT(*) FROM songs WHERE user_id = u.id AND is_public = 1) DESC,
                      (SELECT COUNT(*) FROM followers WHERE following_id = u.id) DESC
             LIMIT 20`
        );

        // Fallback: if no users with public songs, get any recent users
        if (result.rows.length === 0) {
            result = await pool.query(
                `SELECT u.id, u.username, u.bio, u.avatar_url, u.created_at,
                        (SELECT COUNT(*) FROM followers WHERE following_id = u.id) as follower_count,
                        0 as song_count
                 FROM users u
                 ORDER BY u.created_at DESC
                 LIMIT 20`
            );
        }

        res.json({ creators: result.rows });
    } catch (error) {
        console.error('Get featured creators error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user profile by username
router.get('/:username', optionalAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const result = await pool.query(
            `SELECT u.id, u.username, u.created_at, u.bio, u.avatar_url, u.banner_url
             FROM users u
             WHERE u.username = $1`,
            [req.params.username]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const user = result.rows[0];

        res.json({ user });
    } catch (error) {
        console.error('Get user profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user's public songs
router.get('/:username/songs', async (req, res: Response) => {
    try {
        const userResult = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [req.params.username]
        );

        if (userResult.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const userId = userResult.rows[0].id;

        const songsResult = await pool.query(
            `SELECT s.id, s.title, s.lyrics, s.style, s.caption, s.cover_url, s.audio_url,
              s.duration, s.bpm, s.key_scale, s.time_signature, s.tags, s.like_count,
              s.view_count, s.model, s.created_at, u.username as creator
       FROM songs s
       LEFT JOIN users u ON s.user_id = u.id
       WHERE s.user_id = $1 AND s.is_public = 1
       ORDER BY s.created_at DESC`,
            [userId]
        );

        const songs = await Promise.all(
            songsResult.rows.map(async (row) => ({
                ...row,
                audio_url: await resolvePublicAudioUrl(row.audio_url),
            }))
        );

        res.json({ songs });
    } catch (error) {
        console.error('Get user songs error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user's public playlists
router.get('/:username/playlists', async (req, res: Response) => {
    try {
        const userResult = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [req.params.username]
        );

        if (userResult.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const userId = userResult.rows[0].id;

        const playlistsResult = await pool.query(
            `SELECT p.id, p.name, p.description, p.cover_url, p.created_at,
              COUNT(ps.song_id) as song_count
       FROM playlists p
       LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
       WHERE p.user_id = $1 AND p.is_public = 1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
            [userId]
        );

        res.json({ playlists: playlistsResult.rows });
    } catch (error) {
        console.error('Get user playlists error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Upload avatar image
router.post('/me/avatar', authMiddleware, upload.single('avatar'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const userId = req.user!.id;
        const ext = path.extname(req.file.originalname) || '.jpg';
        const key = `users/${userId}/avatar${ext}`;

        const storage = getStorageProvider();
        await storage.upload(key, req.file.buffer, req.file.mimetype);
        const url = storage.getPublicUrl(key);

        // Update user record
        const result = await pool.query(
            `UPDATE users SET avatar_url = $1, updated_at = datetime('now') WHERE id = $2 RETURNING id, username, created_at, bio, avatar_url, banner_url`,
            [url, userId]
        );

        res.json({ user: result.rows[0], url });
    } catch (error) {
        console.error('Avatar upload error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: 'Failed to upload avatar', details: errorMessage });
    }
});

// Upload banner image
router.post('/me/banner', authMiddleware, upload.single('banner'), async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const userId = req.user!.id;
        const ext = path.extname(req.file.originalname) || '.jpg';
        const key = `users/${userId}/banner${ext}`;

        const storage = getStorageProvider();
        await storage.upload(key, req.file.buffer, req.file.mimetype);
        const url = storage.getPublicUrl(key);

        // Update user record
        const result = await pool.query(
            `UPDATE users SET banner_url = $1, updated_at = datetime('now') WHERE id = $2 RETURNING id, username, created_at, bio, avatar_url, banner_url`,
            [url, userId]
        );

        res.json({ user: result.rows[0], url });
    } catch (error) {
        console.error('Banner upload error:', error);
        res.status(500).json({ error: 'Failed to upload banner' });
    }
});

// Update own profile
router.patch('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { username, bio, avatarUrl, bannerUrl } = req.body;

        const updates: string[] = [];
        const values: unknown[] = [];
        let paramCount = 1;

        if (username !== undefined) {
            // Check if username is already taken
            const existing = await pool.query(
                'SELECT id FROM users WHERE username = $1 AND id != $2',
                [username, req.user!.id]
            );
            if (existing.rows.length > 0) {
                res.status(400).json({ error: 'Username already taken' });
                return;
            }
            updates.push(`username = $${paramCount}`);
            values.push(username);
            paramCount++;
        }

        if (bio !== undefined) {
            updates.push(`bio = $${paramCount}`);
            values.push(bio);
            paramCount++;
        }

        if (avatarUrl !== undefined) {
            updates.push(`avatar_url = $${paramCount}`);
            values.push(avatarUrl);
            paramCount++;
        }

        if (bannerUrl !== undefined) {
            updates.push(`banner_url = $${paramCount}`);
            values.push(bannerUrl);
            paramCount++;
        }

        if (updates.length === 0) {
            res.status(400).json({ error: 'No fields to update' });
            return;
        }

        updates.push(`updated_at = datetime('now')`);
        values.push(req.user!.id);

        const result = await pool.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, username, created_at, bio, avatar_url, banner_url`,
            values
        );

        res.json({ user: result.rows[0] });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Toggle follow/unfollow user
router.post('/:username/follow', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userResult = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [req.params.username]
        );

        if (userResult.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const targetUserId = userResult.rows[0].id;
        const currentUserId = req.user!.id;

        if (targetUserId === currentUserId) {
            res.status(400).json({ error: 'Cannot follow yourself' });
            return;
        }

        // Check if already following
        const existingFollow = await pool.query(
            'SELECT 1 FROM followers WHERE follower_id = $1 AND following_id = $2',
            [currentUserId, targetUserId]
        );

        let following = false;

        if (existingFollow.rows.length > 0) {
            // Unfollow
            await pool.query(
                'DELETE FROM followers WHERE follower_id = $1 AND following_id = $2',
                [currentUserId, targetUserId]
            );
            following = false;
        } else {
            // Follow
            await pool.query(
                'INSERT INTO followers (follower_id, following_id) VALUES ($1, $2)',
                [currentUserId, targetUserId]
            );
            following = true;
        }

        // Get updated follower count
        const countResult = await pool.query(
            'SELECT COUNT(*) as count FROM followers WHERE following_id = $1',
            [targetUserId]
        );

        res.json({
            following,
            followerCount: parseInt(countResult.rows[0].count)
        });
    } catch (error) {
        console.error('Toggle follow error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user's followers
router.get('/:username/followers', async (req, res: Response) => {
    try {
        const userResult = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [req.params.username]
        );

        if (userResult.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const userId = userResult.rows[0].id;

        const followersResult = await pool.query(
            `SELECT u.id, u.username, u.created_at
             FROM followers f
             JOIN users u ON f.follower_id = u.id
             WHERE f.following_id = $1
             ORDER BY f.created_at DESC`,
            [userId]
        );

        res.json({ followers: followersResult.rows });
    } catch (error) {
        console.error('Get followers error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get users that this user follows
router.get('/:username/following', async (req, res: Response) => {
    try {
        const userResult = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [req.params.username]
        );

        if (userResult.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const userId = userResult.rows[0].id;

        const followingResult = await pool.query(
            `SELECT u.id, u.username, u.created_at
             FROM followers f
             JOIN users u ON f.following_id = u.id
             WHERE f.follower_id = $1
             ORDER BY f.created_at DESC`,
            [userId]
        );

        res.json({ following: followingResult.rows });
    } catch (error) {
        console.error('Get following error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user stats (follower/following counts)
router.get('/:username/stats', optionalAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userResult = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [req.params.username]
        );

        if (userResult.rows.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const userId = userResult.rows[0].id;

        const [followerCountResult, followingCountResult, isFollowingResult] = await Promise.all([
            pool.query('SELECT COUNT(*) as count FROM followers WHERE following_id = $1', [userId]),
            pool.query('SELECT COUNT(*) as count FROM followers WHERE follower_id = $1', [userId]),
            req.user
                ? pool.query(
                    'SELECT 1 FROM followers WHERE follower_id = $1 AND following_id = $2',
                    [req.user.id, userId]
                )
                : Promise.resolve({ rows: [] })
        ]);

        res.json({
            followerCount: parseInt(followerCountResult.rows[0].count),
            followingCount: parseInt(followingCountResult.rows[0].count),
            isFollowing: isFollowingResult.rows.length > 0
        });
    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
