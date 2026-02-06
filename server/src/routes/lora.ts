import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

const ACESTEP_API_URL = process.env.ACESTEP_API_URL || 'http://127.0.0.1:8001';
const ACESTEP_API_KEY = process.env.ACESTEP_API_KEY || '';

async function proxyToAceStep(endpoint: string, method: string, data?: any) {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (ACESTEP_API_KEY) {
      headers['x-api-key'] = ACESTEP_API_KEY;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(`${ACESTEP_API_URL}${endpoint}`, options);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(errorData.error || errorData.message || 'Request failed');
    }

    const result = await response.json();
    
    if (result && typeof result === 'object' && 'data' in result) {
      return result.data;
    }
    return result;
  } catch (error: any) {
    throw new Error(error.message || 'Request failed');
  }
}

router.post('/load', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await proxyToAceStep('/v1/lora/load', 'POST', req.body);
    res.json(result || { message: 'LoRA loaded' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/unload', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await proxyToAceStep('/v1/lora/unload', 'POST');
    res.json(result || { message: 'LoRA unloaded' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/toggle', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await proxyToAceStep('/v1/lora/toggle', 'POST', req.body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/scale', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await proxyToAceStep('/v1/lora/scale', 'POST', req.body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
