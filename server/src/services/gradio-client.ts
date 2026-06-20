import { Client } from "@gradio/client";
import { config } from '../config/index.js';

let clientInstance: Client | null = null;
let connectionPromise: Promise<Client> | null = null;
let resolvedBaseUrl: string | null = null;

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function candidateBaseUrls(rawBaseUrl: string): string[] {
  const base = normalizeUrl(rawBaseUrl);
  const candidates = new Set<string>([
    base,
    `${base}/gradio`,
  ]);
  return Array.from(candidates);
}

async function isReachableGradioBase(baseUrl: string): Promise<boolean> {
  const candidates = [
    `${baseUrl}/gradio_api/info`,
    `${baseUrl}/info`,
    `${baseUrl}/`,
  ];

  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok || response.status < 500) {
        return true;
      }
    } catch {
      // Try next candidate
    }
  }

  return false;
}

/**
 * Get a lazy-initialized Gradio client connected to the ACE-Step Gradio app.
 * Caches the connection for reuse across requests.
 */
export async function getGradioClient(): Promise<Client> {
  if (clientInstance) return clientInstance;
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    const configuredUrl = config.acestep.apiUrl;
    const bases = candidateBaseUrls(configuredUrl);

    for (const baseUrl of bases) {
      if (!(await isReachableGradioBase(baseUrl))) {
        continue;
      }

      try {
        const client = await Client.connect(baseUrl, {
          events: ["data", "status"],
        });
        clientInstance = client;
        resolvedBaseUrl = baseUrl;
        console.log(`[Gradio] Connected to ${baseUrl}`);
        return client;
      } catch (error) {
        console.warn(`[Gradio] Connect failed for ${baseUrl}:`, error);
      }
    }

    // Last resort: try the configured URL directly, so error details are surfaced.
    try {
      const client = await Client.connect(configuredUrl, {
        events: ["data", "status"],
      });
      clientInstance = client;
      resolvedBaseUrl = normalizeUrl(configuredUrl);
      console.log(`[Gradio] Connected to ${resolvedBaseUrl}`);
      return client;
    } catch (error) {
      console.error(`[Gradio] Failed to connect to ${configuredUrl}. Tried: ${bases.join(', ')}`, error);
      throw error;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

/**
 * Reset the cached Gradio client, forcing a new connection on next use.
 */
export function resetGradioClient(): void {
  clientInstance = null;
  connectionPromise = null;
  resolvedBaseUrl = null;
}

/**
 * Check if the Gradio app is reachable.
 * Tries multiple well-known endpoints to handle version differences.
 */
export async function isGradioAvailable(): Promise<boolean> {
  if (resolvedBaseUrl && await isReachableGradioBase(resolvedBaseUrl)) {
    return true;
  }
  for (const baseUrl of candidateBaseUrls(config.acestep.apiUrl)) {
    if (await isReachableGradioBase(baseUrl)) {
      resolvedBaseUrl = baseUrl;
      return true;
    }
  }
  return false;
}
