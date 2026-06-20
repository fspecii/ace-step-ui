import { Router, Request, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { getGradioClient } from '../services/gradio-client.js';
import { config } from '../config/index.js';
import { resolvePythonPath } from '../services/acestep.js';
import multer from 'multer';
import path from 'path';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { execSync, spawn } from 'child_process';
import { randomUUID } from 'crypto';

const router = Router();

// --- Audio upload via multer disk storage ---
const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.flac', '.ogg', '.opus'];

const audioStorage = multer.diskStorage({
  destination: async (_req: Request, _file, cb) => {
    const datasetName = (_req.body?.datasetName as string) || 'default';
    const dest = path.join(config.datasets.uploadsDir, datasetName);
    try {
      await mkdir(dest, { recursive: true });
      cb(null, dest);
    } catch (err) {
      cb(err as Error, dest);
    }
  },
  filename: (_req, file, cb) => {
    // Preserve original filename but ensure uniqueness
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext);
    const safeName = base.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    cb(null, `${safeName}${ext}`);
  },
});

const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB per file
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (AUDIO_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: ${AUDIO_EXTENSIONS.join(', ')}`));
    }
  },
});

// Get audio duration via ffprobe
function getAudioDuration(filePath: string): number {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    const duration = parseFloat(result.trim());
    return isNaN(duration) ? 0 : Math.round(duration);
  } catch {
    return 0;
  }
}

// Resolve ACE-Step base directory
function getAceStepDir(): string {
  const envPath = process.env.ACESTEP_PATH;
  if (envPath) {
    return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
  }
  return path.resolve(config.datasets.dir, '..');
}

// ================== NEW ROUTES ==================

// POST /api/training/upload-audio — Upload audio files for a dataset
router.post('/upload-audio', authMiddleware, audioUpload.array('audio', 50), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No audio files uploaded' });
      return;
    }

    const datasetName = (req.body?.datasetName as string) || 'default';
    const uploadDir = path.join(config.datasets.uploadsDir, datasetName);

    res.json({
      files: files.map(f => ({
        filename: f.filename,
        originalName: f.originalname,
        size: f.size,
        path: f.path,
      })),
      uploadDir,
      count: files.length,
    });
  } catch (error) {
    console.error('[Training] Upload audio error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Upload failed' });
  }
});

// POST /api/training/build-dataset — Scan audio directory + create dataset JSON
router.post('/build-dataset', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      datasetName = 'my_lora_dataset',
      customTag = '',
      tagPosition = 'prepend',
      allInstrumental = true,
    } = req.body;

    const audioDir = path.join(config.datasets.uploadsDir, datasetName);
    if (!existsSync(audioDir)) {
      res.status(400).json({ error: `Audio directory not found: uploads/${datasetName}` });
      return;
    }

    // Scan for audio files
    const entries = readdirSync(audioDir);
    const audioFiles = entries.filter(f => AUDIO_EXTENSIONS.includes(path.extname(f).toLowerCase()));
    if (audioFiles.length === 0) {
      res.status(400).json({ error: 'No audio files found in directory' });
      return;
    }

    // Build samples in Gradio's exact format
    const samples = audioFiles.map(filename => {
      const audioPath = path.join(audioDir, filename);
      const duration = getAudioDuration(audioPath);
      const baseName = path.basename(filename, path.extname(filename));

      // Check for companion .txt lyrics file
      let rawLyrics = '';
      const lyricsPath = path.join(audioDir, `${baseName}.txt`);
      if (existsSync(lyricsPath)) {
        try {
          rawLyrics = readFileSync(lyricsPath, 'utf-8').trim();
        } catch { /* ignore */ }
      }

      const isInstrumental = allInstrumental || !rawLyrics;

      return {
        id: randomUUID().slice(0, 8),
        audio_path: audioPath,
        filename,
        caption: '',
        genre: '',
        lyrics: isInstrumental ? '[Instrumental]' : rawLyrics,
        raw_lyrics: rawLyrics,
        formatted_lyrics: '',
        bpm: null as number | null,
        keyscale: '',
        timesignature: '',
        duration,
        language: isInstrumental ? 'instrumental' : 'unknown',
        is_instrumental: isInstrumental,
        custom_tag: customTag,
        labeled: false,
        prompt_override: null as string | null,
      };
    });

    // Build dataset JSON
    const dataset = {
      metadata: {
        name: datasetName,
        custom_tag: customTag,
        tag_position: tagPosition,
        created_at: new Date().toISOString(),
        num_samples: samples.length,
        all_instrumental: allInstrumental,
        genre_ratio: 0,
      },
      samples,
    };

    // Save JSON to datasets dir
    await mkdir(config.datasets.dir, { recursive: true });
    const jsonPath = path.join(config.datasets.dir, `${datasetName}.json`);
    await writeFile(jsonPath, JSON.stringify(dataset, null, 2), 'utf-8');

    // Now load into Gradio state via the existing endpoint
    try {
      const client = await getGradioClient();
      const result = await client.predict('/load_existing_dataset_for_preprocess', [jsonPath]);
      const data = result.data as unknown[];

      res.json({
        status: data[0],
        dataframe: data[1],
        sampleCount: samples.length,
        sample: {
          index: data[2],
          audio: data[3],
          filename: data[4],
          caption: data[5],
          genre: data[6],
          promptOverride: data[7],
          lyrics: data[8],
          bpm: data[9],
          key: data[10],
          timeSignature: data[11],
          duration: data[12],
          language: data[13],
          instrumental: data[14],
          rawLyrics: data[15],
        },
        settings: {
          datasetName: data[16],
          customTag: data[17],
          tagPosition: data[18],
          allInstrumental: data[19],
          genreRatio: data[20],
        },
        datasetPath: jsonPath,
      });
    } catch (gradioError) {
      // Gradio may not be running — still return dataset info
      console.warn('[Training] Gradio load failed, returning dataset JSON only:', gradioError);
      res.json({
        status: `Dataset saved (${samples.length} samples). Gradio not available for live preview.`,
        dataframe: null,
        sampleCount: samples.length,
        sample: samples.length > 0 ? {
          index: 0,
          audio: null,
          filename: samples[0].filename,
          caption: samples[0].caption,
          genre: samples[0].genre,
          promptOverride: null,
          lyrics: samples[0].lyrics,
          bpm: samples[0].bpm,
          key: samples[0].keyscale,
          timeSignature: samples[0].timesignature,
          duration: samples[0].duration,
          language: samples[0].language,
          instrumental: samples[0].is_instrumental,
          rawLyrics: samples[0].raw_lyrics,
        } : null,
        settings: {
          datasetName,
          customTag,
          tagPosition,
          allInstrumental,
          genreRatio: 0,
        },
        datasetPath: jsonPath,
      });
    }
  } catch (error) {
    console.error('[Training] Build dataset error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to build dataset' });
  }
});

// GET /api/training/audio — Proxy audio files from datasets directory
router.get('/audio', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let filePath: string;
    const aceStepDir = getAceStepDir();

    if (req.query.path) {
      filePath = req.query.path as string;
    } else if (req.query.file) {
      // Relative path within datasets dir
      filePath = path.join(config.datasets.dir, req.query.file as string);
    } else {
      res.status(400).json({ error: 'path or file parameter required' });
      return;
    }

    // Path traversal protection
    const resolved = path.resolve(filePath);
    if (resolved.includes('..') || !resolved.startsWith(aceStepDir)) {
      res.status(403).json({ error: 'Access denied: path outside ACE-Step directory' });
      return;
    }

    if (!existsSync(resolved)) {
      res.status(404).json({ error: 'Audio file not found' });
      return;
    }

    // Determine content type
    const ext = path.extname(resolved).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus',
    };

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.sendFile(resolved);
  } catch (error) {
    console.error('[Training] Audio proxy error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to serve audio' });
  }
});

// POST /api/training/preprocess — Spawn Python preprocessing script
router.post('/preprocess', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { datasetPath, outputDir } = req.body;
    if (!datasetPath) {
      res.status(400).json({ error: 'datasetPath is required' });
      return;
    }

    const aceStepDir = getAceStepDir();
    const scriptPath = path.resolve(__dirname, '../../scripts/preprocess_dataset.py');
    const pythonPath = resolvePythonPath(aceStepDir);
    const resolvedOutput = outputDir || path.join(config.datasets.dir, 'preprocessed_tensors');

    // Ensure output dir exists
    await mkdir(resolvedOutput, { recursive: true });

    // Spawn Python process
    const child = spawn(pythonPath, [
      scriptPath,
      '--dataset', datasetPath,
      '--output', resolvedOutput,
      '--json',
    ], {
      cwd: aceStepDir,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        // Try to parse JSON output
        try {
          const result = JSON.parse(stdout.trim().split('\n').pop() || '{}');
          res.json({ status: 'Preprocessing complete', ...result });
        } catch {
          res.json({ status: 'Preprocessing complete', output: stdout.trim() });
        }
      } else {
        res.status(500).json({
          error: 'Preprocessing failed',
          code,
          stderr: stderr.trim(),
          stdout: stdout.trim(),
        });
      }
    });

    child.on('error', (err: Error) => {
      res.status(500).json({ error: `Failed to spawn process: ${err.message}` });
    });
  } catch (error) {
    console.error('[Training] Preprocess error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Preprocessing failed' });
  }
});

// POST /api/training/scan-directory — Scan a directory for audio files (Node.js implementation)
router.post('/scan-directory', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      audioDir,
      datasetName = 'my_lora_dataset',
      customTag = '',
      tagPosition = 'prepend',
      allInstrumental = true,
    } = req.body;

    if (!audioDir || typeof audioDir !== 'string') {
      res.status(400).json({ error: 'audioDir is required' });
      return;
    }

    // Resolve path — if relative, resolve from ACE-Step dir
    const aceStepDir = getAceStepDir();
    const resolvedDir = path.isAbsolute(audioDir)
      ? audioDir
      : path.resolve(aceStepDir, audioDir);

    if (!existsSync(resolvedDir)) {
      res.status(400).json({ error: `Directory not found: ${audioDir}` });
      return;
    }

    // Scan for audio files
    const entries = readdirSync(resolvedDir);
    const audioFiles = entries.filter(f => AUDIO_EXTENSIONS.includes(path.extname(f).toLowerCase()));
    if (audioFiles.length === 0) {
      res.status(400).json({ error: 'No audio files found in directory' });
      return;
    }

    // Build table data matching Gradio's format: [#, Filename, Duration, Lyrics, Labeled, BPM, Key, Caption]
    const tableHeaders = ['#', 'Filename', 'Duration', 'Lyrics', 'Labeled', 'BPM', 'Key', 'Caption'];
    const tableData = audioFiles.map((filename, i) => {
      const audioPath = path.join(resolvedDir, filename);
      const duration = getAudioDuration(audioPath);
      const baseName = path.basename(filename, path.extname(filename));

      // Check for companion .txt lyrics file
      let lyrics = allInstrumental ? '[Instrumental]' : '';
      const lyricsPath = path.join(resolvedDir, `${baseName}.txt`);
      if (existsSync(lyricsPath)) {
        try {
          lyrics = readFileSync(lyricsPath, 'utf-8').trim().slice(0, 50) + '...';
        } catch { /* ignore */ }
      }

      return [i + 1, filename, `${duration}s`, lyrics, '❌', '', '', ''];
    });

    res.json({
      status: `Found ${audioFiles.length} audio files`,
      dataframe: {
        headers: tableHeaders,
        data: tableData,
      },
      sampleCount: audioFiles.length,
      audioDir: resolvedDir,
    });
  } catch (error) {
    console.error('[Training] Scan directory error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to scan directory' });
  }
});

// POST /api/training/auto-label — Auto-label dataset samples
// NOTE: Auto-labeling requires the DIT model + LLM to be loaded in Gradio.
// This endpoint attempts to call the Gradio handler. If the Gradio app does not
// expose auto_label_all as a named API, this will fail and the user should use
// the Gradio UI directly.
router.post('/auto-label', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      skipMetas = false,
      formatLyrics = false,
      transcribeLyrics = false,
      onlyUnlabeled = false,
    } = req.body;

    // auto_label_all is a lambda-wrapped handler in Gradio, so it may not be accessible
    // by name. We try the likely endpoint name; if it fails, return a helpful message.
    const client = await getGradioClient();
    try {
      const result = await client.predict('/auto_label_all', [
        skipMetas,
        formatLyrics,
        transcribeLyrics,
        onlyUnlabeled,
      ]);
      const data = result.data as unknown[];
      res.json({
        dataframe: data[0],
        status: data[1],
      });
    } catch (gradioError) {
      // Lambda endpoints aren't named — suggest using Gradio UI
      res.status(501).json({
        error: 'Auto-labeling requires the Gradio UI. The model must be initialized and the dataset loaded in the Gradio training tab.',
        hint: 'Use the Gradio UI at the ACE-Step server URL to auto-label your dataset, then reload it here.',
      });
    }
  } catch (error) {
    console.error('[Training] Auto-label error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Auto-label failed' });
  }
});

// POST /api/training/init-model — Initialize or change model for training
// NOTE: Model initialization requires the Gradio app. This endpoint attempts to
// call the init_service_wrapper. Since it's a lambda, this may not be accessible.
router.post('/init-model', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      checkpoint,
      configPath,
      device = 'auto',
      initLlm = false,
      lmModelPath = '',
      backend = 'pt',
      useFlashAttention = false,
      offloadToCpu = false,
      offloadDitToCpu = false,
      compileModel = false,
      quantization = false,
    } = req.body;

    const client = await getGradioClient();
    try {
      // Try calling by function name (may work if Gradio auto-names it)
      const result = await client.predict('/init_service_wrapper', [
        checkpoint ?? '',
        configPath ?? '',
        device,
        initLlm,
        lmModelPath,
        backend,
        useFlashAttention,
        offloadToCpu,
        offloadDitToCpu,
        compileModel,
        quantization,
      ]);
      const data = result.data as unknown[];
      res.json({
        status: data[0],
        modelReady: !!data[1],
      });
    } catch (gradioError) {
      // Lambda endpoints aren't named — suggest using Gradio UI
      res.status(501).json({
        error: 'Model initialization requires the Gradio UI.',
        hint: 'Initialize the model in the ACE-Step Gradio UI service configuration section, then return here for training.',
      });
    }
  } catch (error) {
    console.error('[Training] Init model error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Model init failed' });
  }
});

// GET /api/training/checkpoints — List available model checkpoints
router.get('/checkpoints', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const aceStepDir = getAceStepDir();
    const checkpointDir = path.join(aceStepDir, 'checkpoints');
    if (!existsSync(checkpointDir)) {
      res.json({ checkpoints: [], configs: [] });
      return;
    }

    // List checkpoint directories
    const entries = readdirSync(checkpointDir);
    const checkpoints = entries.filter(e => {
      const fullPath = path.join(checkpointDir, e);
      return statSync(fullPath).isDirectory();
    });

    // List config directories (acestep-v15-*)
    const configDirs = entries.filter(e =>
      e.startsWith('acestep-v15') && statSync(path.join(checkpointDir, e)).isDirectory()
    );

    res.json({ checkpoints, configs: configDirs });
  } catch (error) {
    console.error('[Training] List checkpoints error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list checkpoints' });
  }
});

// GET /api/training/lora-checkpoints — List LoRA training checkpoints in output dir
router.get('/lora-checkpoints', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const outputDir = (req.query.dir as string) || './lora_output';
    const aceStepDir = getAceStepDir();
    const resolvedDir = path.isAbsolute(outputDir)
      ? outputDir
      : path.resolve(aceStepDir, outputDir);

    if (!existsSync(resolvedDir)) {
      res.json({ checkpoints: [] });
      return;
    }

    const entries = readdirSync(resolvedDir);
    const checkpointsDir = path.join(resolvedDir, 'checkpoints');
    const checkpoints: string[] = [];

    if (existsSync(checkpointsDir)) {
      const cpEntries = readdirSync(checkpointsDir);
      cpEntries.forEach(e => {
        if (statSync(path.join(checkpointsDir, e)).isDirectory()) {
          checkpoints.push(path.join(checkpointsDir, e));
        }
      });
    }

    // Also check for "final" directory
    const finalDir = path.join(resolvedDir, 'final');
    if (existsSync(finalDir)) {
      checkpoints.push(finalDir);
    }

    res.json({ checkpoints, outputDir: resolvedDir });
  } catch (error) {
    console.error('[Training] List LoRA checkpoints error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list checkpoints' });
  }
});

// ================== EXISTING ROUTES ==================

// POST /api/training/load-dataset — Load an existing dataset JSON for preprocessing
router.post('/load-dataset', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { datasetPath } = req.body;
    if (!datasetPath || typeof datasetPath !== 'string') {
      res.status(400).json({ error: 'datasetPath is required' });
      return;
    }
    // Reject path traversal
    if (datasetPath.includes('..')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    const client = await getGradioClient();
    const result = await client.predict('/load_existing_dataset_for_preprocess', [datasetPath]);
    const data = result.data as unknown[];

    // Returns: [status, dataframe, sampleIdx, audioPreview, filename, caption, genre,
    //           promptOverride, lyrics, bpm, key, timesig, duration, language, instrumental,
    //           rawLyrics, datasetName, customTag, tagPosition, allInstrumental, genreRatio]
    res.json({
      status: data[0],
      dataframe: data[1],
      sampleCount: Array.isArray((data[1] as any)?.data) ? (data[1] as any).data.length : 0,
      sample: {
        index: data[2],
        audio: data[3],
        filename: data[4],
        caption: data[5],
        genre: data[6],
        promptOverride: data[7],
        lyrics: data[8],
        bpm: data[9],
        key: data[10],
        timeSignature: data[11],
        duration: data[12],
        language: data[13],
        instrumental: data[14],
        rawLyrics: data[15],
      },
      settings: {
        datasetName: data[16],
        customTag: data[17],
        tagPosition: data[18],
        allInstrumental: data[19],
        genreRatio: data[20],
      },
    });
  } catch (error) {
    console.error('[Training] Load dataset error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load dataset' });
  }
});

// GET /api/training/sample-preview — Get preview data for a specific sample
router.get('/sample-preview', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const idx = parseInt(req.query.idx as string) || 0;

    const client = await getGradioClient();
    const result = await client.predict('/get_sample_preview', [idx]);
    const data = result.data as unknown[];

    // Returns: [audio, filename, caption, genre, promptOverride, lyrics, bpm, key, timesig, duration, language, instrumental, rawLyrics]
    res.json({
      audio: data[0],
      filename: data[1],
      caption: data[2],
      genre: data[3],
      promptOverride: data[4],
      lyrics: data[5],
      bpm: data[6],
      key: data[7],
      timeSignature: data[8],
      duration: data[9],
      language: data[10],
      instrumental: data[11],
      rawLyrics: data[12],
    });
  } catch (error) {
    console.error('[Training] Sample preview error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get sample preview' });
  }
});

// POST /api/training/save-sample — Save edits to a dataset sample
router.post('/save-sample', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sampleIdx, caption, genre, promptOverride, lyrics, bpm, key, timeSignature, language, instrumental } = req.body;

    const client = await getGradioClient();
    const result = await client.predict('/save_sample_edit', [
      sampleIdx ?? 0,
      caption ?? '',
      genre ?? '',
      promptOverride ?? 'Use Global Ratio',
      lyrics ?? '',
      bpm ?? 120,
      key ?? '',
      timeSignature ?? '',
      language ?? 'instrumental',
      instrumental ?? true,
    ]);
    const data = result.data as unknown[];

    // Returns: [dataframe, editStatus]
    res.json({
      dataframe: data[0],
      status: data[1],
    });
  } catch (error) {
    console.error('[Training] Save sample error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save sample edit' });
  }
});

// POST /api/training/update-settings — Update dataset global settings
// Settings are applied directly when saving (via REST API), so no Gradio call needed here.
router.post('/update-settings', authMiddleware, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true });
});

// POST /api/training/save-dataset — Save the dataset to a JSON file
router.post('/save-dataset', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { savePath, datasetName, customTag, tagPosition, allInstrumental, genreRatio } = req.body;

    const resolvedPath = (savePath ?? `./datasets/${datasetName ?? 'my_lora_dataset'}.json`).trim();

    // Use REST API to avoid @gradio/client Radio serialization issues
    const apiUrl = config.acestep.apiUrl;
    const body: Record<string, unknown> = {
      save_path: resolvedPath,
      dataset_name: datasetName ?? 'my_lora_dataset',
    };
    if (customTag !== undefined) body.custom_tag = customTag;
    if (tagPosition !== undefined) body.tag_position = tagPosition;
    if (allInstrumental !== undefined) body.all_instrumental = allInstrumental;
    if (genreRatio !== undefined) body.genre_ratio = genreRatio;

    const apiRes = await fetch(`${apiUrl}/v1/dataset/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!apiRes.ok) {
      const err = await apiRes.json().catch(() => ({})) as any;
      throw new Error(err?.detail || err?.error || `Save failed: ${apiRes.status}`);
    }

    const data = await apiRes.json() as any;
    res.json({
      status: data.status ?? 'Saved',
      path: data.save_path ?? resolvedPath,
    });
  } catch (error) {
    console.error('[Training] Save dataset error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save dataset' });
  }
});

// POST /api/training/load-tensors — Load preprocessed tensors for training
router.post('/load-tensors', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tensorDir } = req.body;

    const client = await getGradioClient();
    const result = await client.predict('/load_training_dataset', [
      tensorDir ?? './datasets/preprocessed_tensors',
    ]);
    const data = result.data as unknown[];

    res.json({ status: data[0] });
  } catch (error) {
    console.error('[Training] Load tensors error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load training dataset' });
  }
});

// POST /api/training/start — Start LoRA training
router.post('/start', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      tensorDir, rank, alpha, dropout, learningRate,
      epochs, batchSize, gradientAccumulation, saveEvery,
      shift, seed, outputDir, resumeCheckpoint,
    } = req.body;

    const client = await getGradioClient();
    const result = await client.predict('/training_wrapper', [
      tensorDir ?? './datasets/preprocessed_tensors',
      rank ?? 64,
      alpha ?? 128,
      dropout ?? 0.1,
      learningRate ?? 0.0003,
      epochs ?? 1000,
      batchSize ?? 1,
      gradientAccumulation ?? 1,
      saveEvery ?? 200,
      shift ?? 3.0,
      seed ?? 42,
      outputDir ?? './lora_output',
      resumeCheckpoint ?? null,
    ]);
    const data = result.data as unknown[];

    // Returns: [trainingProgress, trainingLog, lineplotData]
    res.json({
      progress: data[0],
      log: data[1],
      metrics: data[2],
    });
  } catch (error) {
    console.error('[Training] Start training error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to start training' });
  }
});

// POST /api/training/stop — Stop current training
router.post('/stop', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const client = await getGradioClient();
    const result = await client.predict('/stop_training', []);
    const data = result.data as unknown[];

    res.json({ status: data[0] });
  } catch (error) {
    console.error('[Training] Stop training error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to stop training' });
  }
});

// POST /api/training/export — Export trained LoRA weights
router.post('/export', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { exportPath, loraOutputDir } = req.body;

    const client = await getGradioClient();
    const result = await client.predict('/export_lora', [
      exportPath ?? './lora_output/final_lora',
      loraOutputDir ?? './lora_output',
    ]);
    const data = result.data as unknown[];

    res.json({ status: data[0] });
  } catch (error) {
    console.error('[Training] Export LoRA error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to export LoRA' });
  }
});

// POST /api/training/import-dataset — Import train/test split
router.post('/import-dataset', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { datasetType } = req.body;

    const client = await getGradioClient();
    const result = await client.predict('/import_dataset', [
      datasetType ?? 'train',
    ]);
    const data = result.data as unknown[];

    res.json({ status: data[0] });
  } catch (error) {
    console.error('[Training] Import dataset error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to import dataset' });
  }
});

export default router;
