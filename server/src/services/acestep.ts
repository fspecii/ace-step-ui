import { writeFile, mkdir, copyFile, rm, stat, access } from 'fs/promises';
import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

// Get audio duration using ffprobe
function getAudioDuration(filePath: string): number {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    const duration = parseFloat(result.trim());
    return isNaN(duration) ? 0 : Math.round(duration);
  } catch (error) {
    console.warn('Failed to get audio duration:', error);
    return 0;
  }
}
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUDIO_DIR = path.join(__dirname, '../../public/audio');

const ACESTEP_API = config.acestep.apiUrl;

// Resolve ACE-Step path (from env or default relative path)
function resolveAceStepPath(): string {
  const envPath = process.env.ACESTEP_PATH;
  if (envPath) {
    return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
  }
  // Default: sibling directory
  return path.resolve(__dirname, '../../../../ACE-Step-1.5');
}

// Resolve Python path cross-platform (supports venv and portable installations)
export function resolvePythonPath(baseDir: string): string {
  // Allow explicit override via env var
  if (process.env.PYTHON_PATH) {
    return process.env.PYTHON_PATH;
  }

  const isWindows = process.platform === 'win32';
  const pythonExe = isWindows ? 'python.exe' : 'python';

  // Check for portable installation first (python_embeded)
  const portablePath = path.join(baseDir, 'python_embeded', pythonExe);
  if (existsSync(portablePath)) {
    return portablePath;
  }

  // Standard venv path (different structure on Windows vs Unix)
  if (isWindows) {
    return path.join(baseDir, '.venv', 'Scripts', pythonExe);
  }
  return path.join(baseDir, '.venv', 'bin', 'python');
}

const ACESTEP_DIR = resolveAceStepPath();
const SCRIPTS_DIR = path.join(__dirname, '../../scripts');
const PYTHON_SCRIPT = path.join(SCRIPTS_DIR, 'simple_generate.py');

export interface GenerationParams {
  // Mode
  customMode: boolean;

  // Simple Mode
  songDescription?: string;

  // Custom Mode
  lyrics: string;
  style: string;
  title: string;

  // Model Selection
  model?: string;

  // Common
  instrumental: boolean;
  vocalLanguage?: string;

  // Music Parameters
  duration?: number;
  bpm?: number;
  keyScale?: string;
  timeSignature?: string;

  // Generation Settings
  inferenceSteps?: number;
  guidanceScale?: number;
  batchSize?: number;
  randomSeed?: boolean;
  seed?: number;
  thinking?: boolean;
  audioFormat?: 'mp3' | 'flac';
  inferMethod?: 'ode' | 'sde';
  shift?: number;

  // LM Parameters
  lmTemperature?: number;
  lmCfgScale?: number;
  lmTopK?: number;
  lmTopP?: number;
  lmNegativePrompt?: string;

  // Expert Parameters
  referenceAudioUrl?: string;
  sourceAudioUrl?: string;
  audioCodes?: string;
  repaintingStart?: number;
  repaintingEnd?: number;
  instruction?: string;
  audioCoverStrength?: number;
  taskType?: string;
  useAdg?: boolean;
  cfgIntervalStart?: number;
  cfgIntervalEnd?: number;
  customTimesteps?: string;
  useCotMetas?: boolean;
  useCotCaption?: boolean;
  useCotLanguage?: boolean;
  autogen?: boolean;
  constrainedDecodingDebug?: boolean;
  allowLmBatch?: boolean;
  getScores?: boolean;
  getLrc?: boolean;
  scoreScale?: number;
  lmBatchChunkSize?: number;
  trackName?: string;
  completeTrackClasses?: string[];
  isFormatCaption?: boolean;
}

interface GenerationResult {
  audioUrls: string[];
  duration: number;
  bpm?: number;
  keyScale?: string;
  timeSignature?: string;
  status: string;
}

interface JobStatus {
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  queuePosition?: number;
  etaSeconds?: number;
  result?: GenerationResult;
  error?: string;
}

interface ActiveJob {
  params: GenerationParams;
  startTime: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  taskId?: string;
  result?: GenerationResult;
  error?: string;
  processPromise?: Promise<void>;
  rawResponse?: unknown;
  queuePosition?: number;
}

const activeJobs = new Map<string, ActiveJob>();

// Job queue for sequential processing (GPU can only handle one job at a time)
const jobQueue: string[] = [];
let isProcessingQueue = false;

// Health check - verify Python script exists
export async function checkSpaceHealth(): Promise<boolean> {
  try {
    const { access } = await import('fs/promises');
    await access(PYTHON_SCRIPT);
    return true;
  } catch {
    return false;
  }
}

// Discover endpoints (for compatibility)
export async function discoverEndpoints(): Promise<unknown> {
  return { provider: 'acestep-local', endpoint: ACESTEP_API };
}

// Reset client (no-op for REST API)
export function resetClient(): void {
  // No client to reset for REST API
}

// Process the job queue sequentially
async function processQueue(): Promise<void> {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (jobQueue.length > 0) {
    const jobId = jobQueue[0];
    const job = activeJobs.get(jobId);

    if (job && job.status === 'queued') {
      try {
        await processGeneration(jobId, job.params, job);
      } catch (error) {
        console.error(`Queue processing error for ${jobId}:`, error);
      }
    }

    // Remove from queue after processing (whether success or failure)
    jobQueue.shift();

    // Update queue positions for remaining jobs
    jobQueue.forEach((id, index) => {
      const queuedJob = activeJobs.get(id);
      if (queuedJob) {
        queuedJob.queuePosition = index + 1;
      }
    });
  }

  isProcessingQueue = false;
}

// Submit generation job to queue
export async function generateMusicViaAPI(params: GenerationParams): Promise<{ jobId: string }> {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const job: ActiveJob = {
    params,
    startTime: Date.now(),
    status: 'queued',
    queuePosition: jobQueue.length + 1,
  };

  activeJobs.set(jobId, job);
  jobQueue.push(jobId);

  console.log(`Job ${jobId}: Queued at position ${job.queuePosition}`);

  // Start processing the queue (will be a no-op if already processing)
  processQueue().catch(err => console.error('Queue processing error:', err));

  return { jobId };
}

async function processGeneration(
  jobId: string,
  params: GenerationParams,
  job: ActiveJob
): Promise<void> {
  job.status = 'running';

  // Build prompt for generation
  const caption = params.style || 'pop music';
  const prompt = params.customMode ? caption : (params.songDescription || caption);
  const lyrics = params.instrumental ? '' : (params.lyrics || '');

  console.log(`Job ${jobId}: Starting generation via Python script`, {
    prompt: prompt.slice(0, 50),
    lyricsPreview: lyrics.slice(0, 50),
    duration: params.duration,
    batchSize: params.batchSize,
  });

  try {
    // Create unique output directory for this job to avoid conflicts with concurrent jobs
    const jobOutputDir = path.join(ACESTEP_DIR, 'output', jobId);
    await mkdir(jobOutputDir, { recursive: true });

    // Build command arguments for the Python script
    const args = [
      '--prompt', prompt,
      '--duration', String(params.duration ?? 60),
      '--batch-size', String(params.batchSize ?? 1),
      '--infer-steps', String(params.inferenceSteps ?? 8),
      '--guidance-scale', String(params.guidanceScale ?? 10.0),
      '--audio-format', params.audioFormat ?? 'mp3',
      '--output-dir', jobOutputDir,
      '--json',
    ];

    // Model selection
    if (params.model) {
      args.push('--model', params.model);
    }

    // Basic parameters
    if (lyrics) {
      args.push('--lyrics', lyrics);
    }
    if (params.instrumental) {
      args.push('--instrumental');
    }
    if (params.bpm && params.bpm > 0) {
      args.push('--bpm', String(params.bpm));
    }
    if (params.keyScale) {
      args.push('--key-scale', params.keyScale);
    }
    if (params.timeSignature) {
      args.push('--time-signature', params.timeSignature);
    }
    if (params.vocalLanguage) {
      args.push('--vocal-language', params.vocalLanguage);
    }
    if (params.seed !== undefined && params.seed >= 0 && !params.randomSeed) {
      args.push('--seed', String(params.seed));
    }
    if (params.shift !== undefined) {
      args.push('--shift', String(params.shift));
    }

    // Task type parameters
    if (params.taskType && params.taskType !== 'text2music') {
      args.push('--task-type', params.taskType);
    }
    if (params.referenceAudioUrl) {
      // Convert URL path to filesystem path
      let refAudioPath = params.referenceAudioUrl;
      if (refAudioPath.startsWith('/audio/')) {
        refAudioPath = path.join(AUDIO_DIR, refAudioPath.replace('/audio/', ''));
      }
      args.push('--reference-audio', refAudioPath);
    }
    if (params.sourceAudioUrl) {
      // Convert URL path to filesystem path
      let srcAudioPath = params.sourceAudioUrl;
      if (srcAudioPath.startsWith('/audio/')) {
        srcAudioPath = path.join(AUDIO_DIR, srcAudioPath.replace('/audio/', ''));
      }
      args.push('--src-audio', srcAudioPath);
    }
    if (params.audioCodes) {
      args.push('--audio-codes', params.audioCodes);
    }
    if (params.repaintingStart !== undefined && params.repaintingStart > 0) {
      args.push('--repainting-start', String(params.repaintingStart));
    }
    if (params.repaintingEnd !== undefined && params.repaintingEnd > 0) {
      args.push('--repainting-end', String(params.repaintingEnd));
    }
    if (params.audioCoverStrength !== undefined && params.audioCoverStrength !== 1.0) {
      args.push('--audio-cover-strength', String(params.audioCoverStrength));
    }
    if (params.instruction) {
      args.push('--instruction', params.instruction);
    }

    // LM/CoT parameters
    if (params.thinking) {
      args.push('--thinking');
    }
    if (params.lmTemperature !== undefined) {
      args.push('--lm-temperature', String(params.lmTemperature));
    }
    if (params.lmCfgScale !== undefined) {
      args.push('--lm-cfg-scale', String(params.lmCfgScale));
    }
    if (params.lmTopK !== undefined && params.lmTopK > 0) {
      args.push('--lm-top-k', String(params.lmTopK));
    }
    if (params.lmTopP !== undefined) {
      args.push('--lm-top-p', String(params.lmTopP));
    }
    if (params.lmNegativePrompt) {
      args.push('--lm-negative-prompt', params.lmNegativePrompt);
    }

    // CoT parameters (pass when disabled, since they default to true)
    if (params.useCotMetas === false) {
      args.push('--no-cot-metas');
    }
    if (params.useCotCaption === false) {
      args.push('--no-cot-caption');
    }
    if (params.useCotLanguage === false) {
      args.push('--no-cot-language');
    }

    // Advanced parameters
    if (params.useAdg) {
      args.push('--use-adg');
    }
    if (params.cfgIntervalStart !== undefined && params.cfgIntervalStart > 0) {
      args.push('--cfg-interval-start', String(params.cfgIntervalStart));
    }
    if (params.cfgIntervalEnd !== undefined && params.cfgIntervalEnd < 1.0) {
      args.push('--cfg-interval-end', String(params.cfgIntervalEnd));
    }

    // Run the Python script
    const result = await runPythonGeneration(args);

    if (!result.success) {
      throw new Error(result.error || 'Generation failed');
    }

    if (!result.audio_paths || result.audio_paths.length === 0) {
      throw new Error('No audio files generated');
    }

    // Copy audio files to public directory and build URLs
    const audioUrls: string[] = [];
    let actualDuration = 0;
    for (const srcPath of result.audio_paths) {
      const ext = srcPath.includes('.flac') ? '.flac' : '.mp3';
      const filename = `${jobId}_${audioUrls.length}${ext}`;
      const destPath = path.join(AUDIO_DIR, filename);

      await mkdir(AUDIO_DIR, { recursive: true });
      await copyFile(srcPath, destPath);

      // Get actual audio duration from first file
      if (audioUrls.length === 0) {
        actualDuration = getAudioDuration(destPath);
      }

      audioUrls.push(`/audio/${filename}`);
    }

    // Clean up job-specific output directory
    try {
      await rm(jobOutputDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn(`Job ${jobId}: Failed to cleanup output dir`, cleanupError);
    }

    // Use actual duration, or fall back to params if > 0, otherwise default to 60
    const finalDuration = actualDuration > 0 ? actualDuration : (params.duration && params.duration > 0 ? params.duration : 60);

    job.status = 'succeeded';
    job.result = {
      audioUrls,
      duration: finalDuration,
      bpm: params.bpm,
      keyScale: params.keyScale,
      timeSignature: params.timeSignature,
      status: 'succeeded',
    };
    job.rawResponse = result;
    console.log(`Job ${jobId}: Completed in ${result.elapsed_seconds?.toFixed(1)}s with ${audioUrls.length} audio files`);

  } catch (error) {
    console.error(`Job ${jobId}: Generation failed`, error);
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'Generation failed';

    // Try to clean up job output directory on failure too
    try {
      const jobOutputDir = path.join(ACESTEP_DIR, 'output', jobId);
      await rm(jobOutputDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
  }
}

interface PythonResult {
  success: boolean;
  audio_paths?: string[];
  elapsed_seconds?: number;
  error?: string;
}

function runPythonGeneration(scriptArgs: string[]): Promise<PythonResult> {
  return new Promise((resolve) => {
    const pythonPath = resolvePythonPath(ACESTEP_DIR);
    const args = [PYTHON_SCRIPT, ...scriptArgs];

    const proc = spawn(pythonPath, args, {
      cwd: ACESTEP_DIR,
      env: {
        ...process.env,
        CUDA_VISIBLE_DEVICES: '0',
        ACESTEP_PATH: ACESTEP_DIR,
      },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      // Log progress to console
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.log(`[ACE-Step] ${line}`);
        }
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        resolve({ success: false, error: stderr || `Process exited with code ${code}` });
        return;
      }

      // Find the JSON output (last line that starts with {)
      const lines = stdout.split('\n').filter(l => l.trim());
      const jsonLine = lines.find(l => l.startsWith('{'));

      if (!jsonLine) {
        resolve({ success: false, error: 'No JSON output from generation script' });
        return;
      }

      try {
        const result = JSON.parse(jsonLine);
        resolve(result);
      } catch {
        resolve({ success: false, error: 'Invalid JSON from generation script' });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

function extractAudioFiles(result: unknown): string[] {
  const urls: string[] = [];

  function processItem(item: unknown): void {
    if (!item) return;

    if (typeof item === 'string') {
      if (item.includes('.mp3') || item.includes('.wav') || item.includes('.flac')) {
        urls.push(item);
      }
      return;
    }

    if (Array.isArray(item)) {
      for (const subItem of item) {
        processItem(subItem);
      }
      return;
    }

    if (typeof item === 'object') {
      const obj = item as Record<string, unknown>;

      // Check common audio path fields
      if (obj.audio_path && typeof obj.audio_path === 'string') {
        urls.push(obj.audio_path);
      }
      if (obj.path && typeof obj.path === 'string') {
        urls.push(obj.path);
      }
      if (obj.url && typeof obj.url === 'string') {
        urls.push(obj.url);
      }
      if (obj.file && typeof obj.file === 'string') {
        urls.push(obj.file);
      }

      // Recursively check arrays and objects
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
          processItem(val);
        }
      }
    }
  }

  processItem(result);
  return [...new Set(urls)];
}

// Get job status
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const job = activeJobs.get(jobId);

  if (!job) {
    return {
      status: 'failed',
      error: 'Job not found',
    };
  }

  if (job.status === 'succeeded' && job.result) {
    return {
      status: 'succeeded',
      result: job.result,
    };
  }

  if (job.status === 'failed') {
    return {
      status: 'failed',
      error: job.error || 'Generation failed',
    };
  }

  const elapsed = Math.floor((Date.now() - job.startTime) / 1000);

  // Include queue position if queued
  if (job.status === 'queued') {
    return {
      status: job.status,
      queuePosition: job.queuePosition,
      etaSeconds: (job.queuePosition || 1) * 180, // ~3 min per job estimate
    };
  }

  return {
    status: job.status,
    etaSeconds: Math.max(0, 180 - elapsed), // 3 min estimate
  };
}

// Get raw response for debugging
export function getJobRawResponse(jobId: string): unknown | null {
  const job = activeJobs.get(jobId);
  return job?.rawResponse || null;
}

// Get audio stream from local file or remote URL
export async function getAudioStream(audioPath: string): Promise<Response> {
  // If it's already a full URL, fetch directly
  if (audioPath.startsWith('http')) {
    return fetch(audioPath);
  }

  // If it's a local /audio/ path, read from filesystem
  if (audioPath.startsWith('/audio/')) {
    const localPath = path.join(AUDIO_DIR, audioPath.replace('/audio/', ''));
    try {
      const { readFile } = await import('fs/promises');
      const buffer = await readFile(localPath);
      const ext = localPath.endsWith('.flac') ? 'flac' : 'mpeg';
      return new Response(buffer, {
        status: 200,
        headers: { 'Content-Type': `audio/${ext}` }
      });
    } catch (err) {
      console.error('Failed to read local audio file:', localPath, err);
      return new Response(null, { status: 404 });
    }
  }

  // Otherwise, use the ACE-Step audio endpoint
  const url = `${ACESTEP_API}/v1/audio?path=${encodeURIComponent(audioPath)}`;
  console.log('Fetching audio from:', url);
  return fetch(url);
}

// Download audio to local storage
export async function downloadAudio(remoteUrl: string, songId: string): Promise<string> {
  await mkdir(AUDIO_DIR, { recursive: true });

  const response = await getAudioStream(remoteUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const ext = remoteUrl.includes('.flac') ? '.flac' : '.mp3';
  const filename = `${songId}${ext}`;
  const filepath = path.join(AUDIO_DIR, filename);

  await writeFile(filepath, Buffer.from(buffer));
  console.log(`Downloaded audio to ${filepath}`);

  return `/audio/${filename}`;
}

// Download audio to buffer
export async function downloadAudioToBuffer(remoteUrl: string): Promise<{ buffer: Buffer; size: number }> {
  const response = await getAudioStream(remoteUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, size: buffer.length };
}

// Cleanup job from memory
export function cleanupJob(jobId: string): void {
  activeJobs.delete(jobId);
}

// Cleanup old jobs
export function cleanupOldJobs(maxAgeMs: number = 3600000): void {
  const now = Date.now();
  for (const [jobId, job] of activeJobs) {
    if (now - job.startTime > maxAgeMs) {
      activeJobs.delete(jobId);
    }
  }
}
