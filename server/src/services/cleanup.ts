import { pool } from '../db/pool.js';
import { getStorageProvider } from './storage/factory.js';

export interface CleanupResult {
  deleted: number;
  errors: number;
}

export async function runCleanupJob(): Promise<CleanupResult> {
  console.log('Starting audio file cleanup job...');

  const result = await pool.query(
    `SELECT af.id, af.song_id, af.storage_key, af.storage_provider
     FROM audio_files af
     WHERE af.expires_at < datetime('now')
       AND af.deleted_at IS NULL`
  );

  if (result.rows.length === 0) {
    console.log('No expired audio files to clean up');
    return { deleted: 0, errors: 0 };
  }

  console.log(`Found ${result.rows.length} expired audio files`);

  const storage = getStorageProvider();
  let deleted = 0;
  let errors = 0;

  for (const audioFile of result.rows) {
    try {
      await storage.delete(audioFile.storage_key);

      await pool.query(
        'UPDATE audio_files SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
        [audioFile.id]
      );

      await pool.query(
        'UPDATE songs SET audio_url = NULL WHERE id = $1',
        [audioFile.song_id]
      );

      deleted++;
      console.log(`Deleted expired audio: ${audioFile.storage_key}`);
    } catch (err) {
      errors++;
      console.error(`Failed to delete audio ${audioFile.storage_key}:`, err);
    }
  }

  console.log(`Cleanup complete: ${deleted} deleted, ${errors} errors`);
  return { deleted, errors };
}

export async function cleanupDeletedSongs(): Promise<number> {
  const result = await pool.query(
    `DELETE FROM songs
     WHERE audio_url IS NULL
       AND created_at < datetime('now', '-7 days')
     RETURNING id`
  );

  const count = result.rowCount || 0;
  if (count > 0) {
    console.log(`Cleaned up ${count} orphaned songs`);
  }
  return count;
}
