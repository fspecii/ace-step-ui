import { getStorageProvider } from './storage/factory.js';

const S3_PREFIX = 's3://';
const SIGNED_URL_TTL_SECONDS = 3600;

function getStorageKey(audioUrl: string): string | null {
  return audioUrl.startsWith(S3_PREFIX) ? audioUrl.slice(S3_PREFIX.length) : null;
}

export async function resolveAudioUrl(audioUrl: string | null): Promise<string | null> {
  if (!audioUrl) return null;

  const storageKey = getStorageKey(audioUrl);
  if (!storageKey) return audioUrl;

  return getStorageProvider().getUrl(storageKey, SIGNED_URL_TTL_SECONDS);
}

export async function resolveAccessibleAudioUrl(audioUrl: string | null, isPublic: boolean): Promise<string | null> {
  if (!audioUrl) return null;

  const storageKey = getStorageKey(audioUrl);
  if (!storageKey) return audioUrl;

  const storage = getStorageProvider();
  return isPublic ? storage.getPublicUrl(storageKey) : storage.getUrl(storageKey, SIGNED_URL_TTL_SECONDS);
}

export async function resolvePublicAudioUrl(audioUrl: string | null): Promise<string | null> {
  if (!audioUrl) return null;

  const storageKey = getStorageKey(audioUrl);
  if (!storageKey) return audioUrl;

  return getStorageProvider().getPublicUrl(storageKey);
}
