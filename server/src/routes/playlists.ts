import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db/pool.js';
import { authMiddleware, optionalAuthMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { resolveAccessibleAudioUrl } from '../services/audioUrls.js';

const router = Router();

// Create playlist
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { name, description, isPublic, coverUrl } = req.body;

        if (!name) {
            res.status(400).json({ error: 'Name is required' });
            return;
        }

        const result = await pool.query(
            `INSERT INTO playlists (user_id, name, description, is_public, cover_url)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [req.user!.id, name, description, isPublic || false, coverUrl]
        );

        res.status(201).json({ playlist: result.rows[0] });
    } catch (error) {
        console.error('Create playlist error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get my playlists
router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const result = await pool.query(
            `SELECT p.*, COUNT(ps.song_id) as song_count
             FROM playlists p
             LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
             WHERE p.user_id = $1
             GROUP BY p.id
             ORDER BY p.created_at DESC`,
            [req.user!.id]
        );

        res.json({ playlists: result.rows });
    } catch (error) {
        console.error('Get playlists error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get featured public playlists (for search/explore page)
router.get('/public/featured', async (_req, res: Response) => {
    try {
        // First try to get playlists with songs
        let result = await pool.query(
            `SELECT p.id, p.name, p.description, p.cover_url, p.created_at,
                    u.username as creator, u.avatar_url as creator_avatar,
                    COUNT(ps.song_id) as song_count
             FROM playlists p
             JOIN users u ON p.user_id = u.id
             LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
             WHERE p.is_public = true
             GROUP BY p.id, u.username, u.avatar_url
             HAVING COUNT(ps.song_id) > 0
             ORDER BY COUNT(ps.song_id) DESC
             LIMIT 20`
        );

        // Fallback: if no playlists with songs, get any public playlists
        if (result.rows.length === 0) {
            result = await pool.query(
                `SELECT p.id, p.name, p.description, p.cover_url, p.created_at,
                        u.username as creator, u.avatar_url as creator_avatar,
                        0 as song_count
                 FROM playlists p
                 JOIN users u ON p.user_id = u.id
                 WHERE p.is_public = true
                 ORDER BY p.created_at DESC
                 LIMIT 20`
            );
        }

        res.json({ playlists: result.rows });
    } catch (error) {
        console.error('Get featured playlists error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get playlist by ID
router.get('/:id', optionalAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const playlistResult = await pool.query(
            `SELECT p.*, u.username as creator, u.avatar_url as creator_avatar
             FROM playlists p
             JOIN users u ON p.user_id = u.id
             WHERE p.id = $1`,
            [req.params.id]
        );

        if (playlistResult.rows.length === 0) {
            res.status(404).json({ error: 'Playlist not found' });
            return;
        }

        const playlist = playlistResult.rows[0];

        // Access control
        if (!playlist.is_public && (!req.user || req.user.id !== playlist.user_id)) {
            res.status(403).json({ error: 'Access denied' });
            return;
        }

        // Get songs
        const songsResult = await pool.query(
            `SELECT s.id, s.title, s.lyrics, s.style, s.cover_url, s.audio_url, s.duration,
                    s.user_id, s.is_public, u.username as creator, ps.added_at, ps.position
             FROM playlist_songs ps
             JOIN songs s ON ps.song_id = s.id
             JOIN users u ON s.user_id = u.id
             WHERE ps.playlist_id = $1
             ORDER BY ps.position ASC`,
            [req.params.id]
        );

        const songs = await Promise.all(
            songsResult.rows.map(async (row) => ({
                ...row,
                audio_url: await resolveAccessibleAudioUrl(row.audio_url, row.is_public),
            }))
        );

        res.json({
            playlist,
            songs
        });
    } catch (error) {
        console.error('Get playlist details error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add song to playlist
router.post('/:id/songs', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { songId } = req.body;

        // Verify playlist ownership
        const playlistCheck = await pool.query('SELECT user_id FROM playlists WHERE id = $1', [req.params.id]);
        if (playlistCheck.rows.length === 0) return res.status(404).json({ error: 'Playlist not found' });
        if (playlistCheck.rows[0].user_id !== req.user!.id) return res.status(403).json({ error: 'Access denied' });

        // Get max position
        const positionResult = await pool.query(
            'SELECT MAX(position) as max_pos FROM playlist_songs WHERE playlist_id = $1',
            [req.params.id]
        );
        const position = (positionResult.rows[0].max_pos || 0) + 1;

        await pool.query(
            `INSERT INTO playlist_songs (playlist_id, song_id, position)
             VALUES ($1, $2, $3)
             ON CONFLICT (playlist_id, song_id) DO NOTHING`,
            [req.params.id, songId, position]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Add song to playlist error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Remove song from playlist
router.delete('/:id/songs/:songId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        // Verify playlist ownership
        const playlistCheck = await pool.query('SELECT user_id FROM playlists WHERE id = $1', [req.params.id]);
        if (playlistCheck.rows.length === 0) return res.status(404).json({ error: 'Playlist not found' });
        if (playlistCheck.rows[0].user_id !== req.user!.id) return res.status(403).json({ error: 'Access denied' });

        await pool.query(
            'DELETE FROM playlist_songs WHERE playlist_id = $1 AND song_id = $2',
            [req.params.id, req.params.songId]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Remove song from playlist error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update playlist
router.patch('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        // Verify playlist ownership
        const playlistCheck = await pool.query('SELECT user_id FROM playlists WHERE id = $1', [req.params.id]);
        if (playlistCheck.rows.length === 0) return res.status(404).json({ error: 'Playlist not found' });
        if (playlistCheck.rows[0].user_id !== req.user!.id) return res.status(403).json({ error: 'Access denied' });

        const { name, description, isPublic, coverUrl } = req.body;
        const updates: string[] = [];
        const values: unknown[] = [];
        let paramCount = 1;

        if (name !== undefined) { updates.push(`name = $${paramCount}`); values.push(name); paramCount++; }
        if (description !== undefined) { updates.push(`description = $${paramCount}`); values.push(description); paramCount++; }
        if (isPublic !== undefined) { updates.push(`is_public = $${paramCount}`); values.push(isPublic); paramCount++; }
        if (coverUrl !== undefined) { updates.push(`cover_url = $${paramCount}`); values.push(coverUrl); paramCount++; }

        if (updates.length > 0) {
            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(req.params.id);
            await pool.query(
                `UPDATE playlists SET ${updates.join(', ')} WHERE id = $${paramCount}`,
                values
            );
        }

        const updated = await pool.query('SELECT * FROM playlists WHERE id = $1', [req.params.id]);
        res.json({ playlist: updated.rows[0] });
    } catch (error) {
        console.error('Update playlist error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete playlist
router.delete('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        // Verify playlist ownership
        const playlistCheck = await pool.query('SELECT user_id FROM playlists WHERE id = $1', [req.params.id]);
        if (playlistCheck.rows.length === 0) return res.status(404).json({ error: 'Playlist not found' });
        if (playlistCheck.rows[0].user_id !== req.user!.id) return res.status(403).json({ error: 'Access denied' });

        await pool.query('DELETE FROM playlists WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete playlist error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
