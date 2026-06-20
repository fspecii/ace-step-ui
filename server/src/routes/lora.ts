import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { getGradioClient } from '../services/gradio-client.js';
import { config } from '../config/index.js';
import path from 'path';

const router = Router();

function resolveContainedPath(baseDir: string, inputPath: string, label: string): string {
  const base = path.resolve(baseDir);
  const resolved = path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(base, inputPath);
  const withinBase = resolved === base || resolved.startsWith(`${base}${path.sep}`);
  if (!withinBase) {
    throw new Error(`${label} must be inside ${baseDir}`);
  }
  return resolved;
}

// Local LoRA state tracking (Gradio doesn't have a dedicated status endpoint)
let loraState = {
  loaded: false,
  active: false,
  scale: 1.0,
  path: '',
};

// POST /api/lora/load — Load a LoRA adapter
router.post('/load', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { lora_path } = req.body;
    if (!lora_path || typeof lora_path !== 'string') {
      res.status(400).json({ error: 'lora_path is required' });
      return;
    }

    const aceStepRoot = process.env.ACESTEP_PATH
      ? (path.isAbsolute(process.env.ACESTEP_PATH) ? process.env.ACESTEP_PATH : path.resolve(process.cwd(), process.env.ACESTEP_PATH))
      : path.resolve(config.datasets.dir, '..');
    const resolvedLoraPath = resolveContainedPath(aceStepRoot, lora_path, 'lora_path');

    const client = await getGradioClient();
    const payloads: unknown[][] = [
      [resolvedLoraPath],
      [resolvedLoraPath, loraState.scale],
    ];

    let lastError: unknown;
    for (const payload of payloads) {
      try {
        const result = await client.predict('/load_lora', payload);
        const status = (result.data as unknown[])[0] as string;
        loraState = { loaded: true, active: true, scale: loraState.scale, path: resolvedLoraPath };
        res.json({ message: status, lora_path: resolvedLoraPath, loaded: true });
        return;
      } catch (err) {
        lastError = err;
      }
    }

    // ACE-Step Gradio can throw after LoRA has already been loaded (post-load UI event mismatch).
    // Attempt to validate/recover by toggling LoRA on and re-applying scale.
    try {
      await client.predict('/set_use_lora', [true]);
      await client.predict('/set_lora_scale', [loraState.scale]);
      loraState = { loaded: true, active: true, scale: loraState.scale, path: resolvedLoraPath };
      res.json({
        message: 'LoRA loaded (recovered from Gradio post-load UI error)',
        lora_path: resolvedLoraPath,
        loaded: true,
      });
      return;
    } catch {
      throw lastError;
    }
  } catch (error) {
    console.error('[LoRA] Load error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load LoRA' });
  }
});

// POST /api/lora/unload — Unload the current LoRA adapter
router.post('/unload', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const client = await getGradioClient();
    const result = await client.predict('/unload_lora', []);
    const status = (result.data as unknown[])[0] as string;

    loraState = { loaded: false, active: false, scale: 1.0, path: '' };

    res.json({ message: status });
  } catch (error) {
    console.error('[LoRA] Unload error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to unload LoRA' });
  }
});

// POST /api/lora/scale — Set LoRA scale (0.0 - 1.0)
router.post('/scale', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { scale } = req.body;
    if (typeof scale !== 'number' || scale < 0 || scale > 1) {
      res.status(400).json({ error: 'scale must be a number between 0 and 1' });
      return;
    }

    const client = await getGradioClient();
    const result = await client.predict('/set_lora_scale', [scale]);
    const status = (result.data as unknown[])[0] as string;

    loraState.scale = scale;

    res.json({ message: status, scale });
  } catch (error) {
    console.error('[LoRA] Scale error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to set LoRA scale' });
  }
});

// POST /api/lora/toggle — Toggle LoRA on/off
router.post('/toggle', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { enabled } = req.body;
    const useLoRA = typeof enabled === 'boolean' ? enabled : !loraState.active;

    const client = await getGradioClient();
    const result = await client.predict('/set_use_lora', [useLoRA]);
    const status = (result.data as unknown[])[0] as string;

    loraState.active = useLoRA;

    res.json({ message: status, active: useLoRA });
  } catch (error) {
    console.error('[LoRA] Toggle error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to toggle LoRA' });
  }
});

// GET /api/lora/status — Get current LoRA state
router.get('/status', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  res.json(loraState);
});

export default router;
