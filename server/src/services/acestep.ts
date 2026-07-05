import { writeFile, mkdir, copyFile, rm, readFile } from 'fs/promises';
import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { handle_file } from '@gradio/client';

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
import { getGradioClient, resetGradioClient, isGradioAvailable } from './gradio-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AUDIO_DIR = path.join(__dirname, '../../public/audio');

const ACESTEP_API = config.acestep.apiUrl;

// Resolve ACE-Step path (from env or default relative path)
export function resolveAceStepPath(): string {
  const envPath = process.env.ACESTEP_PATH;
  if (envPath) {
    return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
  }
  
 // Sibling directories search order (checks all common names including case variations)
  const candidateSiblings = [
    'ACEStep1.5',
    'ACEStep-1.5',
    'ACE1.5',
    'ACE-Step-1.5',
    'ace-step-1.5',
    'ace1.5'
  ];
  for (const sibling of candidateSiblings) {
    const siblingPath = path.resolve(__dirname, `../../../${sibling}`);
    if (existsSync(siblingPath)) {
      return siblingPath;
    }
  }
  // Default: sibling directory (server/src/services -> ../../../ACE-Step-1.5 = app/ACE-Step-1.5)
  return path.resolve(__dirname, '../../../ACE-Step-1.5');
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

  // Check common venv directory names (Pinokio uses 'env', others use '.venv' or 'venv')
  const venvDirs = ['env', '.venv', 'venv'];
  for (const venvDir of venvDirs) {
    const venvPython = isWindows
      ? path.join(baseDir, venvDir, 'Scripts', pythonExe)
      : path.join(baseDir, venvDir, 'bin', 'python');
    if (existsSync(venvPython)) {
      return venvPython;
    }
  }

  // Fallback to first option (will produce a clear error if not found)
  if (isWindows) {
    return path.join(baseDir, 'env', 'Scripts', pythonExe);
  }
  return path.join(baseDir, 'env', 'bin', 'python');
}

let ACESTEP_DIR = resolveAceStepPath();
const SCRIPTS_DIR = path.join(__dirname, '../../scripts');
const PYTHON_SCRIPT = path.join(SCRIPTS_DIR, 'simple_generate.py');

// ---------------------------------------------------------------------------
// Gradio generation: map params to the 51 positional args for /generation_wrapper
// ---------------------------------------------------------------------------

/**
 * Resolve an audio URL (e.g. /audio/file.mp3) to an absolute local file path.
 */
function resolveAudioPath(audioUrl: string): string {
  if (audioUrl.startsWith('/audio/')) {
    return path.join(AUDIO_DIR, audioUrl.replace('/audio/', ''));
  }
  if (audioUrl.startsWith('http')) {
    try {
      const parsed = new URL(audioUrl);
      if (parsed.pathname.startsWith('/audio/')) {
        return path.join(AUDIO_DIR, parsed.pathname.replace('/audio/', ''));
      }
    } catch { /* fall through */ }
  }
  return audioUrl;
}

/**
 * Prepare a local audio file for Gradio upload.
 * Returns a handle_file() wrapper or null if no file.
 */
async function prepareAudioFile(audioUrl: string | undefined): Promise<unknown> {
  if (!audioUrl) return null;

  const filePath = resolveAudioPath(audioUrl);

  try {
    const buffer = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.flac': 'audio/flac', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
      '.opus': 'audio/opus', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4',
    };
    const mimeType = mimeMap[ext] || 'audio/mpeg';
    const blob = new Blob([buffer], { type: mimeType });
    return handle_file(blob);
  } catch (error) {
    console.warn(`[Gradio] Failed to read audio file ${filePath}:`, error);
    // Fall back to URL-based reference if file can't be read locally
    if (audioUrl.startsWith('http')) {
      return handle_file(audioUrl);
    }
    return null;
  }
}

/**
 * Build the 50 positional arguments for the Gradio /generation_wrapper endpoint.
 */
async function buildGradioArgs(params: GenerationParams): Promise<unknown[]> {
  const caption = params.style || 'pop music';
  const prompt = params.customMode ? caption : (params.songDescription || caption);
  const lyrics = params.instrumental ? '' : (params.lyrics || '');
  
  // Enable thinking
  const isThinking = params.thinking ?? false;
  const isEnhance = params.enhance ?? false;

  // Data pre-cleaning and type safety validation
  let cleanTopK = 0;
  if (params.lmTopK && (params.lmTopK as any) !== 'Auto') {
      cleanTopK = Number(params.lmTopK);
  }

  const cleanBpm = params.bpm && params.bpm > 0 ? Number(params.bpm) : 0;
  const cleanSteps = params.inferenceSteps ? Number(params.inferenceSteps) : 8;
  const cleanGuidance = params.guidanceScale ? Number(params.guidanceScale) : 7.0;
  const cleanDuration = params.duration && params.duration > 0 ? Number(params.duration) : -1;
  const cleanBatchSize = Math.min(Math.max(params.batchSize ?? 1, 1), 16);
  const cleanTemperature = params.lmTemperature ? Number(params.lmTemperature) : 0.85;
  const cleanLmCfg = params.lmCfgScale ? Number(params.lmCfgScale) : 2.0;
  const cleanTopP = params.lmTopP ? Number(params.lmTopP) : 0.9;
  const cleanScoreScale = params.scoreScale ? Number(params.scoreScale) : 0.5;
  const cleanChunkSize = params.lmBatchChunkSize ? Number(params.lmBatchChunkSize) : 8;

  // Prepare audio files
  const referenceAudio = await prepareAudioFile(params.referenceAudioUrl);
  const sourceAudio = await prepareAudioFile(params.sourceAudioUrl);

  const needsSource = params.taskType === 'cover' || params.taskType === 'audio2audio' || params.taskType === 'repaint';
  if (needsSource && params.sourceAudioUrl && sourceAudio === null) {
    throw new Error(`Source audio file could not be loaded...`);
  }

  const useCot = isEnhance || isThinking;

  // Complete raw positional arguments array aligned exactly with the 78 inputs of generation_wrapper in generation_run_wiring.py
  const rawArgs = [
    prompt,                                                       // 0: Music Caption
    lyrics,                                                       // 1: Lyrics
    cleanBpm,                                                     // 2: BPM
    params.keyScale || '',                                        // 3: KeyScale
    params.timeSignature || '',                                   // 4: Time Signature
    params.vocalLanguage || 'en',                                 // 5: Vocal Language
    cleanSteps,                                                   // 6: DiT Inference Steps
    cleanGuidance,                                                // 7: DiT Guidance Scale
    params.randomSeed !== false,                                  // 8: Random Seed
    Number(params.seed ?? -1),                                    // 9: Seed
    referenceAudio,                                               // 10: Reference Audio
    cleanDuration,                                                // 11: Audio Duration
    cleanBatchSize,                                               // 12: Batch Size
    sourceAudio,                                                  // 13: Source Audio
    params.audioCodes || '',                                      // 14: LM Codes Hints
    params.repaintingStart ?? 0.0,                                // 15: Repainting Start
    params.repaintingEnd ?? -1,                                   // 16: Repainting End
    params.instruction || 'Fill the audio semantic mask...',       // 17: Instruction
    params.audioCoverStrength ?? 1.0,                             // 18: Audio Cover Strength
    0.0,                                                          // 19: Cover Noise Strength
    (params.taskType === 'audio2audio' ? 'cover' : params.taskType) || 'text2music', // 20: Task Type
    false,                                                        // 21: no_fsq
    params.useAdg ?? false,                                       // 22: use_adg
    params.cfgIntervalStart ?? 0.0,                               // 23: cfg_interval_start
    params.cfgIntervalEnd ?? 1.0,                                 // 24: cfg_interval_end
    params.shift ?? 3.0,                                          // 25: shift
    params.inferMethod || 'ode',                                  // 26: infer_method
    'euler',                                                      // 27: sampler_mode
    0.0,                                                          // 28: velocity_norm_threshold
    0.0,                                                          // 29: velocity_ema_factor
    params.dcwEnabled ?? true,                                    // 30: dcw_enabled
    params.dcwMode || 'double',                                   // 31: dcw_mode
    params.dcwScaler !== undefined ? params.dcwScaler : (isThinking ? 0.02 : 0.05), // 32: dcw_scaler
    params.dcwHighScaler !== undefined ? params.dcwHighScaler : (isThinking ? 0.06 : 0.02), // 33: dcw_high_scaler
    params.dcwWavelet || 'haar',                                  // 34: dcw_wavelet
    params.customTimesteps || '',                                 // 35: custom_timesteps
    params.audioFormat || 'mp3',                                  // 36: audio_format
    '128k',                                                       // 37: mp3_bitrate
    48000,                                                        // 38: mp3_sample_rate
    cleanTemperature,                                             // 39: lm_temperature
    isThinking,                                                   // 40: think_checkbox
    cleanLmCfg,                                                   // 41: lm_cfg_scale
    cleanTopK,                                                    // 42: lm_top_k
    cleanTopP,                                                    // 43: lm_top_p
    params.lmNegativePrompt || 'NO USER INPUT',                   // 44: lm_negative_prompt
    useCot ? (params.useCotMetas ?? true) : false,                // 45: use_cot_metas
    useCot ? (params.useCotCaption ?? true) : false,              // 46: use_cot_caption
    useCot ? (params.useCotLanguage ?? true) : false,             // 47: use_cot_language
    params.isFormatCaption ?? false,                              // 48: is_format_caption_state
    params.constrainedDecodingDebug ?? false,                     // 49: constrained_decoding_debug
    params.allowLmBatch ?? true,                                  // 50: allow_lm_batch
    params.getScores ?? false,                                    // 51: auto_score
    params.getLrc ?? false,                                       // 52: auto_lrc
    cleanScoreScale,                                              // 53: score_scale
    cleanChunkSize,                                               // 54: lm_batch_chunk_size
    params.trackName || null,                                     // 55: track_name
    params.completeTrackClasses || [],                            // 56: complete_track_classes
    true,                                                         // 57: enable_normalization
    -1.0,                                                         // 58: normalization_db
    0.0,                                                          // 59: fade_in_duration
    0.0,                                                          // 60: fade_out_duration
    0.0,                                                          // 61: latent_shift
    1.0,                                                          // 62: latent_rescale
    'balanced',                                                   // 63: repaint_mode
    0.5,                                                          // 64: repaint_strength
    0.0,                                                          // 65: retake_variance
    '',                                                           // 66: retake_seed
    false,                                                        // 67: flow_edit_morph
    '',                                                           // 68: flow_edit_source_caption
    '',                                                           // 69: flow_edit_source_lyrics
    0.0,                                                          // 70: flow_edit_n_min
    1.0,                                                          // 71: flow_edit_n_max
    1,                                                            // 72: flow_edit_n_avg
    params.autogen ?? false,                                      // 73: autogen_checkbox
    0,                                                            // 74: current_batch_index
    1,                                                            // 75: total_batches
    null,                                                         // 76: batch_queue
    null,                                                         // 77: generation_params_state
  ];

  // Type coercion and normalization map to ensure exact types for Gradio
  return rawArgs.map((val, idx) => {
    const isStringOrObjSlot = [
      0, 1, 3, 4, 5, 10, 13, 14, 17, 20, 26, 27, 31, 34, 35, 36, 37, 44, 55, 56, 63, 66, 68, 69, 76, 77
    ].includes(idx);
    
    if (!isStringOrObjSlot) {
      if (typeof val === 'string' && (val.toLowerCase() === 'true' || val.toLowerCase() === 'false')) {
        return val.toLowerCase() === 'true';
      }
      
      if (typeof val === 'string' || val === undefined || val === null) {
        const parsed = Number(val || 0);
        return isNaN(parsed) ? 0 : parsed;
      }
    }
    return val;
  });
}

/**
 * Download a Gradio audio result file to local storage.
 * Gradio returns file objects with { url, path, orig_name, ... }.
 * We copy from the server-local path (same machine) or download via URL.
 */
async function downloadGradioAudioFile(
  fileObj: { url?: string; path?: string; orig_name?: string },
  destPath: string,
): Promise<void> {
  await mkdir(path.dirname(destPath), { recursive: true });

  // Prefer direct filesystem copy (both servers on same machine)
  if (fileObj.path && existsSync(fileObj.path)) {
    await copyFile(fileObj.path, destPath);
    return;
  }

  // Fall back to HTTP download via Gradio URL (use temp file for atomicity)
  if (fileObj.url) {
    const response = await fetch(fileObj.url);
    if (!response.ok) {
      throw new Error(`Failed to download Gradio audio: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new Error('Downloaded audio file is empty');
    }
    const tmpPath = destPath + '.tmp';
    await writeFile(tmpPath, buffer);
    const { rename } = await import('fs/promises');
    await rename(tmpPath, destPath);
    return;
  }

  throw new Error('Gradio file object has neither path nor url');
}

// ---------------------------------------------------------------------------
// Generation types & interfaces (unchanged public API)
// ---------------------------------------------------------------------------

export interface GenerationParams {
  // Mode
  customMode: boolean;

  // Simple Mode
  songDescription?: string;

  // Custom Mode
  lyrics: string;
  style: string;
  title: string;

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
  enhance?: boolean;
  audioFormat?: 'mp3' | 'flac';
  inferMethod?: 'ode' | 'sde';
  shift?: number;

  // LM Parameters
  lmTemperature?: number;
  lmCfgScale?: number;
  lmTopK?: number;
  lmTopP?: number;
  lmNegativePrompt?: string;
  lmBackend?: 'pt' | 'vllm';
  lmModel?: string;

  // Expert Parameters
  referenceAudioUrl?: string;
  sourceAudioUrl?: string;
  referenceAudioTitle?: string;
  sourceAudioTitle?: string;
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
  dcwEnabled?: boolean;
  dcwMode?: string;
  dcwScaler?: number;
  dcwHighScaler?: number;
  dcwWavelet?: string;
  // Model selection
  ditModel?: string;
  vaeModel?: string;
}

interface GenerationResult {
  audioUrls: string[];
  duration: number;
  bpm?: number;
  keyScale?: string;
  timeSignature?: string;
  scores?: string[];
  status: string;
}

interface JobStatus {
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  queuePosition?: number;
  etaSeconds?: number;
  progress?: number;
  stage?: string;
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
  progress?: number;
  stage?: string;
}

const activeJobs = new Map<string, ActiveJob>();

// Periodic cleanup of old jobs (every 10 minutes, remove jobs older than 1 hour)
setInterval(() => cleanupOldJobs(3600000), 600000);

// Job queue for sequential processing (GPU can only handle one job at a time)
const jobQueue: string[] = [];
let isProcessingQueue = false;

// Health check - verify Gradio app is reachable
export async function checkSpaceHealth(): Promise<boolean> {
  return isGradioAvailable();
}

// ---------------------------------------------------------------------------
// Model switching — call /v1/init to change the active DiT model
// ---------------------------------------------------------------------------

async function getActiveModel(): Promise<string | null> {
  try {
    const res = await fetch(`${ACESTEP_API}/v1/models`);
    if (!res.ok) return null;
    const data = await res.json() as any;
    const models = data?.data?.models || data?.models || [];
    return models[0]?.name || null;
  } catch {
    return null;
  }
}

async function switchModelIfNeeded(ditModel: string): Promise<void> {
  const activeModel = await getActiveModel();
  if (activeModel === ditModel) return; // already loaded, no-op

  console.log(`[Model] Switching from '${activeModel ?? 'unknown'}' to '${ditModel}'`);
  const res = await fetch(`${ACESTEP_API}/v1/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: ditModel, init_llm: false }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    if (res.status === 404) {
      console.warn(`[Model] Model switch API (/v1/init) not supported by older ACE-Step backend (404). Proceeding to generation with default/preloaded model.`);
      return;
    }
  }
  console.log(`[Model] Switched to '${ditModel}'`);
}

// Discover endpoints (for compatibility)
export async function discoverEndpoints(): Promise<unknown> {
  return { provider: 'acestep-gradio', endpoint: ACESTEP_API };
}

// Reset client — forces Gradio reconnection on next request
export function resetClient(): void {
  resetGradioClient();
}

// ---------------------------------------------------------------------------
// Job queue
// ---------------------------------------------------------------------------

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
  // Re-evaluate ACESTEP_DIR in case process.env.ACESTEP_PATH was updated at runtime
  ACESTEP_DIR = resolveAceStepPath();

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

// ---------------------------------------------------------------------------
// processGeneration — Gradio primary, Python spawn fallback
// ---------------------------------------------------------------------------

async function processGeneration(
  jobId: string,
  params: GenerationParams,
  job: ActiveJob,
): Promise<void> {
  job.status = 'running';
  job.stage = 'Starting generation...';

  // Guard: cover/audio2audio requires a source or audio codes
  if ((params.taskType === 'cover' || params.taskType === 'audio2audio') && !params.sourceAudioUrl && !params.audioCodes) {
    job.status = 'failed';
    job.error = `task_type='${params.taskType}' requires a source audio or audio codes`;
    return;
  }

  // Try Gradio first
  const gradioUp = await isGradioAvailable();
  if (gradioUp) {
    try {
      await processGenerationViaGradio(jobId, params, job);
      return;
    } catch (error) {
      console.error(`Job ${jobId}: Gradio generation failed, trying Python spawn fallback`, error);
      // Fall through to Python spawn
    }
  }

  // Fallback: Python spawn
  await processGenerationViaPython(jobId, params, job);
}

/**
 * Dynamically align Gradio raw arguments array to match the exact input length
 * expected by the remote Gradio /generation_wrapper API endpoint.
 * This guarantees complete forward and backward compatibility across versions.
 */
function alignGradioArgs(args: unknown[], client: any): unknown[] {
  try {
    const dependency = client.config?.dependencies?.find((d: any) => d.api_name === 'generation_wrapper');
    if (dependency && Array.isArray(dependency.inputs)) {
      const expectedLength = dependency.inputs.length;
      console.log(`[ACE-Step] [Gradio] Dynamic alignment: remote expects ${expectedLength} inputs, local payload has ${args.length} inputs`);
      if (args.length > expectedLength) {
        return args.slice(0, expectedLength);
      } else if (args.length < expectedLength) {
        const padded = [...args];
        while (padded.length < expectedLength) {
          padded.push(null);
        }
        return padded;
      }
    }
  } catch (err) {
    console.warn('[ACE-Step] [Gradio] Failed to dynamically align Gradio arguments:', err);
  }
  return args;
}

async function processGenerationViaGradio(
  jobId: string,
  params: GenerationParams,
  job: ActiveJob,
): Promise<void> {
  // Switch DiT model if a specific one was requested
  if (params.ditModel) {
    job.stage = `Loading model ${params.ditModel}...`;
    await switchModelIfNeeded(params.ditModel);
  }

  const client = await getGradioClient();
  const args = await buildGradioArgs(params);
  const alignedArgs = alignGradioArgs(args, client);

  const caption = params.style || 'pop music';
  const prompt = params.customMode ? caption : (params.songDescription || caption);

  console.log(`Job ${jobId}: Using Gradio /generation_wrapper`, {
    prompt: prompt.slice(0, 50),
    duration: params.duration,
    batchSize: params.batchSize,
  });

  job.stage = 'Generating music via Gradio...';

  // predict() blocks until generation is complete
  // const result = await client.predict('/generation_wrapper', args);
  const result = await client.predict('/generation_wrapper', alignedArgs);
  const data = result.data as unknown[];

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Gradio returned unexpected data format: ${typeof data}`);
  }

  // Extract audio files from the result
  const allFiles = data[8]; // list of file objects
  const genDetails = data[9] as string | undefined;
  const genStatus = data[10] as string | undefined;
  const scoreOutputs = extractGradioScoreOutputs(data);

  // Collect audio file objects — prefer the "All Generated Files" list
  let audioFileObjects: Array<{ url?: string; path?: string; orig_name?: string }> = [];

  if (Array.isArray(allFiles) && allFiles.length > 0) {
    audioFileObjects = allFiles.filter(
      (f: any) => f && (f.path || f.url) && isAudioFile(f.orig_name || f.path || '')
    );
  }

  // Fallback: check individual sample outputs (indices 0-7)
  if (audioFileObjects.length === 0) {
    for (let i = 0; i < 8; i++) {
      const fileObj = data[i] as any;
      if (fileObj && (fileObj.path || fileObj.url)) {
        audioFileObjects.push(fileObj);
      }
    }
  }

  if (audioFileObjects.length === 0) {
    throw new Error(`Gradio generation returned no audio files. Status: ${genStatus || 'unknown'}. Details: ${genDetails || 'none'}`);
  }

  // Download audio files to local storage
  const audioUrls: string[] = [];
  let actualDuration = 0;
  const audioFormat = params.audioFormat ?? 'mp3';

  for (const fileObj of audioFileObjects) {
    const origName = fileObj.orig_name || fileObj.path || '';
    const ext = origName.includes('.flac') ? '.flac' : `.${audioFormat}`;
    const filename = `${jobId}_${audioUrls.length}${ext}`;
    const destPath = path.join(AUDIO_DIR, filename);
    const sampleIndex = audioUrls.length;

    await downloadGradioAudioFile(fileObj, destPath);

    const lrcDestPath = path.join(AUDIO_DIR, `${jobId}_${sampleIndex}.lrc`);
    const directLrcText = extractTextValue(data[36 + sampleIndex]).trim();
    if (directLrcText && !directLrcText.startsWith('❌') && !directLrcText.startsWith('⚠️')) {
      await writeFile(lrcDestPath, directLrcText, 'utf-8');
      console.log(`Job ${jobId}: Saved Gradio LRC display text to ${lrcDestPath}`);
    } else if (Array.isArray(allFiles)) {
      // Fallback: try to find and download matching LRC or VTT file from allFiles.
      const baseAudioName = origName.replace(/\.[^/.]+$/, '');
      const matchingLrcObj = allFiles.find((f: any) => {
        if (!f || (!f.path && !f.url)) return false;
        const name = (f.orig_name || f.path || '').toLowerCase();
        return (name.endsWith('.lrc') || name.endsWith('.vtt')) && name.includes(baseAudioName.toLowerCase());
      }) || (audioUrls.length === 0 ? allFiles.find((f: any) => {
        if (!f || (!f.path && !f.url)) return false;
        const name = (f.orig_name || f.path || '').toLowerCase();
        return name.endsWith('.lrc') || name.endsWith('.vtt');
      }) : null);
      if (matchingLrcObj) {
        try {
          await downloadGradioAudioFile(matchingLrcObj, lrcDestPath);
          console.log(`Job ${jobId}: Downloaded matching LRC/VTT file to ${lrcDestPath}`);
        } catch (err) {
          console.warn(`Job ${jobId}: Failed to download matching LRC/VTT file`, err);
        }
      }
    }
    


    if (audioUrls.length === 0) {
      actualDuration = getAudioDuration(destPath);
    }

    audioUrls.push(`/audio/${filename}`);
  }

  // Parse metadata from generation details if available
  const metas = parseGenerationDetails(genDetails);

  const finalDuration = actualDuration > 0
    ? actualDuration
    : (metas.duration || params.duration || 0);

  job.status = 'succeeded';
  job.result = {
    audioUrls,
    duration: finalDuration,
    bpm: metas.bpm || params.bpm,
    keyScale: metas.keyScale || params.keyScale,
    timeSignature: metas.timeSignature || params.timeSignature,
    scores: scoreOutputs,
    status: 'succeeded',
  };
  job.rawResponse = { genDetails, genStatus, scores: scoreOutputs };
  console.log(`Job ${jobId}: Completed via Gradio with ${audioUrls.length} audio files`);
}

function isAudioFile(name: string): boolean {
  return /\.(mp3|flac|wav|ogg|m4a)$/i.test(name);
}

function extractTextValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.value === 'string') return record.value;
  }
  return '';
}

function extractGradioScoreOutputs(data: unknown[]): string[] {
  const scores: string[] = [];
  for (let i = 0; i < 8; i++) {
    const text = extractTextValue(data[12 + i]).trim();
    scores.push(text && text !== 'Done!' ? text : '');
  }
  return scores;
}

function parseGenerationDetails(details: string | undefined): {
  bpm?: number;
  duration?: number;
  keyScale?: string;
  timeSignature?: string;
} {
  if (!details) return {};
  try {
    const bpmMatch = details.match(/BPM:\s*(\d+)/i);
    const durationMatch = details.match(/Duration:\s*([\d.]+)/i);
    const keyMatch = details.match(/Key:\s*([A-G][#b]?\s*(?:major|minor))/i);
    const timeMatch = details.match(/Time Signature:\s*(\d+\/\d+)/i);
    return {
      bpm: bpmMatch ? parseInt(bpmMatch[1]) : undefined,
      duration: durationMatch ? parseFloat(durationMatch[1]) : undefined,
      keyScale: keyMatch ? keyMatch[1] : undefined,
      timeSignature: timeMatch ? timeMatch[1] : undefined,
    };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Python spawn fallback (kept from original for offline/fallback use)
// ---------------------------------------------------------------------------

async function processGenerationViaPython(
  jobId: string,
  params: GenerationParams,
  job: ActiveJob,
): Promise<void> {
  const caption = params.style || 'pop music';
  const prompt = params.customMode ? caption : (params.songDescription || caption);
  const lyrics = params.instrumental ? '' : (params.lyrics || '');

  console.log(`Job ${jobId}: Using Python spawn (Gradio not available)`, {
    prompt: prompt.slice(0, 50),
    lyricsPreview: lyrics.slice(0, 50),
    duration: params.duration,
    batchSize: params.batchSize,
  });

  try {
    const jobOutputDir = path.join(ACESTEP_DIR, 'output', jobId);
    await mkdir(jobOutputDir, { recursive: true });

    const durationToSend = params.duration && params.duration > 0 ? params.duration : -1;
    const args = [
      '--prompt', prompt,
      '--duration', String(durationToSend),
      '--batch-size', String(params.batchSize ?? 1),
      '--infer-steps', String(params.inferenceSteps ?? 8),
      '--guidance-scale', String(params.guidanceScale ?? 10.0),
      '--audio-format', params.audioFormat ?? 'mp3',
      '--output-dir', jobOutputDir,
      '--json',
    ];

    if (lyrics) args.push('--lyrics', lyrics);
    if (params.instrumental) args.push('--instrumental');
    if (params.bpm && params.bpm > 0) args.push('--bpm', String(params.bpm));
    if (params.keyScale) args.push('--key-scale', params.keyScale);
    if (params.timeSignature) args.push('--time-signature', params.timeSignature);
    if (params.vocalLanguage) args.push('--vocal-language', params.vocalLanguage);
    if (params.seed !== undefined && params.seed >= 0 && !params.randomSeed) args.push('--seed', String(params.seed));
    
    if (params.shift !== undefined) args.push('--shift', String(params.shift));
    const resolvedTaskType = params.taskType === 'audio2audio' ? 'cover' : params.taskType;
    if (resolvedTaskType && resolvedTaskType !== 'text2music') args.push('--task-type', resolvedTaskType);

    if (params.referenceAudioUrl) {
      args.push('--reference-audio', resolveAudioPath(params.referenceAudioUrl));
    }
    if (params.sourceAudioUrl) {
      args.push('--src-audio', resolveAudioPath(params.sourceAudioUrl));
    }
    if (params.audioCodes) args.push('--audio-codes', params.audioCodes);
    if (params.repaintingStart !== undefined && params.repaintingStart > 0) args.push('--repainting-start', String(params.repaintingStart));
    if (params.repaintingEnd !== undefined && params.repaintingEnd > 0) args.push('--repainting-end', String(params.repaintingEnd));
    if (params.taskType === 'cover' || params.taskType === 'repaint' || params.sourceAudioUrl) {
      args.push('--audio-cover-strength', String(params.audioCoverStrength ?? 1.0));
    } else if (params.audioCoverStrength !== undefined && params.audioCoverStrength !== 1.0) {
      args.push('--audio-cover-strength', String(params.audioCoverStrength));
    }
    if (params.instruction) args.push('--instruction', params.instruction);
    if (params.thinking) args.push('--thinking');
    if (params.getLrc) args.push('--get-lrc');
    if (params.getScores) args.push('--get-scores', '--score-scale', String(params.scoreScale ?? 0.5));
    if (params.lmTemperature !== undefined) args.push('--lm-temperature', String(params.lmTemperature));
    if (params.lmCfgScale !== undefined) args.push('--lm-cfg-scale', String(params.lmCfgScale));
    
    if (params.lmTopK as any === 'Auto' || !params.lmTopK) {
        params.lmTopK = 0;
    } else {
        params.lmTopK = Number(params.lmTopK);
    }
    if (params.lmTopK && params.lmTopK > 0) args.push('--lm-top-k', String(params.lmTopK));
    if (params.lmTopP !== undefined) args.push('--lm-top-p', String(params.lmTopP));
    if (params.lmNegativePrompt) args.push('--lm-negative-prompt', params.lmNegativePrompt);
    if (params.lmModel) args.push('--lm-model', params.lmModel);
    if (params.lmBackend) args.push('--lm-backend', params.lmBackend);
    if (params.ditModel) args.push('--dit-model', params.ditModel);

    const useCot = (params.enhance ?? false) || (params.thinking ?? false);
    if (!useCot) {
      args.push('--no-cot-metas');
      args.push('--no-cot-caption');
      args.push('--no-cot-language');
    } else {
      if (params.useCotMetas === false) args.push('--no-cot-metas');
      if (params.useCotCaption === false) args.push('--no-cot-caption');
      if (params.useCotLanguage === false) args.push('--no-cot-language');
    }
    if (params.useAdg) args.push('--use-adg');
    if (params.cfgIntervalStart !== undefined && params.cfgIntervalStart > 0) args.push('--cfg-interval-start', String(params.cfgIntervalStart));
    if (params.cfgIntervalEnd !== undefined && params.cfgIntervalEnd < 1.0) args.push('--cfg-interval-end', String(params.cfgIntervalEnd));
    if (params.dcwEnabled === false) args.push('--no-dcw');
    if (params.dcwMode) args.push('--dcw-mode', params.dcwMode);
    if (params.dcwScaler !== undefined) args.push('--dcw-scaler', String(params.dcwScaler));
    if (params.dcwHighScaler !== undefined) args.push('--dcw-high-scaler', String(params.dcwHighScaler));
    if (params.dcwWavelet) args.push('--dcw-wavelet', params.dcwWavelet);
    if (params.vaeModel) args.push('--vae-checkpoint', params.vaeModel);
    const result = await runPythonGeneration(args);

    if (!result.success) {
      throw new Error(result.error || 'Generation failed');
    }

    if (!result.audio_paths || result.audio_paths.length === 0) {
      throw new Error('No audio files generated');
    }

    const audioUrls: string[] = [];
    let actualDuration = 0;
    for (const srcPath of result.audio_paths) {
      const ext = srcPath.includes('.flac') ? '.flac' : '.mp3';
      const filename = `${jobId}_${audioUrls.length}${ext}`;
      const destPath = path.join(AUDIO_DIR, filename);

      await mkdir(AUDIO_DIR, { recursive: true });
      await copyFile(srcPath, destPath);

      // Copy matching LRC or VTT file if exists next to the source audio path
      let srcLrcPath = srcPath.replace(/\.[^/.]+$/, '.lrc');
      if (!existsSync(srcLrcPath)) {
        const srcVttPath = srcPath.replace(/\.[^/.]+$/, '.vtt');
        if (existsSync(srcVttPath)) {
          srcLrcPath = srcVttPath;
        }
      }
      if (existsSync(srcLrcPath)) {
        const lrcDestPath = path.join(AUDIO_DIR, `${jobId}_${audioUrls.length}.lrc`);
        try {
          await copyFile(srcLrcPath, lrcDestPath);
           console.log(`Job ${jobId}: Copied matching LRC/VTT file from ${srcLrcPath} to ${lrcDestPath}`);
        } catch (err) {
           console.warn(`Job ${jobId}: Failed to copy matching LRC/VTT file`, err);
        }
      }

      if (audioUrls.length === 0) {
        actualDuration = getAudioDuration(destPath);
      }

      audioUrls.push(`/audio/${filename}`);
    }

    try {
      await rm(jobOutputDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn(`Job ${jobId}: Failed to cleanup output dir`, cleanupError);
    }

    const finalDuration = actualDuration > 0 ? actualDuration : (params.duration && params.duration > 0 ? params.duration : 0);

    job.status = 'succeeded';
    job.result = {
      audioUrls,
      duration: finalDuration,
      bpm: params.bpm,
      keyScale: params.keyScale,
      timeSignature: params.timeSignature,
      scores: result.scores,
      status: 'succeeded',
    };
    job.rawResponse = result;
    console.log(`Job ${jobId}: Completed via Python in ${result.elapsed_seconds?.toFixed(1)}s with ${audioUrls.length} audio files`);

  } catch (error) {
    console.error(`Job ${jobId}: Generation failed`, error);
    job.status = 'failed';
    job.error = error instanceof Error ? error.message : 'Generation failed';

    try {
      const jobOutputDir = path.join(ACESTEP_DIR, 'output', jobId);
      await rm(jobOutputDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
  }
}

interface PythonResult {
  success: boolean;
  audio_paths?: string[];
  scores?: string[];
  elapsed_seconds?: number;
  error?: string;
}

function runPythonGeneration(scriptArgs: string[], timeoutMs = 600000): Promise<PythonResult> {
  return new Promise((resolve) => {
    const pythonPath = resolvePythonPath(ACESTEP_DIR);
    const args = [PYTHON_SCRIPT, ...scriptArgs];

    console.log(`[ACE-Step] [Spawn] Spawning Python command: "${pythonPath}" ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);

    const proc = spawn(pythonPath, args, {
      cwd: ACESTEP_DIR,
      env: {
        ...process.env,
        ACESTEP_PATH: ACESTEP_DIR,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
        LANG: 'C.UTF-8',
        LC_ALL: 'C.UTF-8'
      },
    });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      setTimeout(() => { if (!proc.killed) proc.kill('SIGKILL'); }, 5000);
      resolve({ success: false, error: `Generation timed out after ${timeoutMs / 1000}s` });
    }, timeoutMs);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.log(`[ACE-Step] ${line}`);
        }
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({ success: false, error: stderr || `Process exited with code ${code}` });
        return;
      }

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
      clearTimeout(timer);
      resolve({ success: false, error: err.message });
    });
  });
}

// ---------------------------------------------------------------------------
// Job status 
// ---------------------------------------------------------------------------

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

  if (job.status === 'queued') {
    return {
      status: job.status,
      queuePosition: job.queuePosition,
      etaSeconds: (job.queuePosition || 1) * 180,
    };
  }

  return {
    status: job.status,
    etaSeconds: Math.max(0, 180 - elapsed),
    progress: job.progress,
    stage: job.stage,
  };
}

export function getJobRawResponse(jobId: string): unknown | null {
  const job = activeJobs.get(jobId);
  return job?.rawResponse || null;
}

// ---------------------------------------------------------------------------
// Audio helpers
// ---------------------------------------------------------------------------

export async function getAudioStream(audioPath: string): Promise<Response> {
  if (audioPath.startsWith('http')) {
    return fetch(audioPath);
  }

  if (audioPath.startsWith('/audio/')) {
    const localPath = path.join(AUDIO_DIR, audioPath.replace('/audio/', ''));
    try {
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

  if (audioPath.startsWith('/')) {
    try {
      const buffer = await readFile(audioPath);
      const ext = audioPath.endsWith('.flac') ? 'flac' : audioPath.endsWith('.wav') ? 'wav' : 'mpeg';
      return new Response(buffer, {
        status: 200,
        headers: { 'Content-Type': `audio/${ext}` }
      });
    } catch {
      // Fall through
    }
  }

  const url = `${ACESTEP_API}/v1/audio?path=${encodeURIComponent(audioPath)}`;
  console.log('Fetching audio from:', url);
  return fetch(url);
}

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

export async function downloadAudioToBuffer(remoteUrl: string): Promise<{ buffer: Buffer; size: number }> {
  const response = await getAudioStream(remoteUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, size: buffer.length };
}

export function cleanupJob(jobId: string): void {
  activeJobs.delete(jobId);
}

export function cleanupOldJobs(maxAgeMs: number = 3600000): void {
  const now = Date.now();
  for (const [jobId, job] of activeJobs) {
    if (now - job.startTime > maxAgeMs) {
      activeJobs.delete(jobId);
    }
  }
}
