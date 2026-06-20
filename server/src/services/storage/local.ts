import { writeFile, unlink, stat, mkdir, copyFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import type { StorageProvider } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUDIO_DIR = path.join(__dirname, '../../../public/audio');

export class LocalStorageProvider implements StorageProvider {
  private audioDir: string;

  constructor() {
    this.audioDir = AUDIO_DIR;
  }

  async upload(key: string, data: Buffer, _contentType: string): Promise<string> {
    const filepath = path.join(this.audioDir, key);
    await mkdir(path.dirname(filepath), { recursive: true });
    await writeFile(filepath, data);
    return key;
  }

  async getUrl(key: string, _expiresIn?: number): Promise<string> {
    const cleanKey = key.startsWith('/audio/') ? key.slice('/audio/'.length) : key;
    return `/audio/${cleanKey.replace(/^\/+/, '')}`;
  }

  getPublicUrl(key: string): string {
    const cleanKey = key.startsWith('/audio/') ? key.slice('/audio/'.length) : key;
    return `/audio/${cleanKey.replace(/^\/+/, '')}`;
  }

  async delete(key: string): Promise<void> {
    const filepath = path.join(this.audioDir, key);
    try {
      await unlink(filepath);
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    const filepath = path.join(this.audioDir, key);
    try {
      await stat(filepath);
      return true;
    } catch {
      return false;
    }
  }

  async copy(sourceKey: string, destKey: string): Promise<void> {
    const sourcePath = path.join(this.audioDir, sourceKey);
    const destPath = path.join(this.audioDir, destKey);
    await mkdir(path.dirname(destPath), { recursive: true });
    await copyFile(sourcePath, destPath);
  }
}
