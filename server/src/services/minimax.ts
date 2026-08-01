export const MINIMAX_PROVIDER_NAME = 'MiniMax';

export const MINIMAX_MUSIC_ENDPOINTS = {
  global_en: 'https://api.minimax.io/v1/music_generation',
  cn_zh: 'https://api.minimaxi.com/v1/music_generation',
} as const;

export const MINIMAX_MUSIC_MODELS = [
  'music-3.0',
  'music-2.6',
  'music-3.0-free',
  'music-2.6-free',
] as const;

export const MINIMAX_MUSIC_OUTPUT_FORMATS = ['url', 'hex'] as const;
export const MINIMAX_MUSIC_AUDIO_FORMATS = ['mp3', 'wav', 'pcm'] as const;
export const MINIMAX_MUSIC_SAMPLE_RATES = [16000, 24000, 32000, 44100] as const;
export const MINIMAX_MUSIC_BITRATES = [32000, 64000, 128000, 256000] as const;

export type MiniMaxMusicRegion = keyof typeof MINIMAX_MUSIC_ENDPOINTS;
export type MiniMaxMusicModel = typeof MINIMAX_MUSIC_MODELS[number];
export type MiniMaxMusicOutputFormat = typeof MINIMAX_MUSIC_OUTPUT_FORMATS[number];
export type MiniMaxMusicAudioFormat = typeof MINIMAX_MUSIC_AUDIO_FORMATS[number];
export type MiniMaxMusicSampleRate = typeof MINIMAX_MUSIC_SAMPLE_RATES[number];
export type MiniMaxMusicBitrate = typeof MINIMAX_MUSIC_BITRATES[number];

export interface MiniMaxMusicClientConfig {
  apiKey: string;
  region: MiniMaxMusicRegion;
  model: string;
  stream: boolean;
  outputFormat: MiniMaxMusicOutputFormat;
  audioFormat: MiniMaxMusicAudioFormat;
}

export interface MiniMaxMusicGenerationParams {
  customMode: boolean;
  songDescription?: string;
  lyrics?: string;
  style?: string;
  instrumental: boolean;
  ditModel?: string;
  musicModel?: string;
  musicRegion?: MiniMaxMusicRegion;
  stream?: boolean;
  outputFormat?: MiniMaxMusicOutputFormat;
  musicAudioFormat?: MiniMaxMusicAudioFormat;
  musicSampleRate?: MiniMaxMusicSampleRate;
  musicBitrate?: MiniMaxMusicBitrate;
  lyricsOptimizer?: boolean;
  aigcWatermark?: boolean;
  taskType?: string;
}

export interface MiniMaxMusicRequest {
  model: MiniMaxMusicModel;
  prompt?: string;
  lyrics?: string;
  stream: boolean;
  output_format: MiniMaxMusicOutputFormat;
  audio_setting: {
    format: MiniMaxMusicAudioFormat;
    sample_rate?: MiniMaxMusicSampleRate;
    bitrate?: MiniMaxMusicBitrate;
  };
  lyrics_optimizer: boolean;
  is_instrumental: boolean;
  aigc_watermark?: boolean;
}

interface MiniMaxMusicApiResponse {
  data?: {
    status?: number;
    audio?: string;
  };
  extra_info?: {
    music_duration?: number;
  };
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
}

export interface MiniMaxMusicResult {
  provider: typeof MINIMAX_PROVIDER_NAME;
  endpoint: string;
  region: MiniMaxMusicRegion;
  model: MiniMaxMusicModel;
  status: 2;
  audio: string;
  outputFormat: MiniMaxMusicOutputFormat;
  audioFormat: MiniMaxMusicAudioFormat;
  duration?: number;
  rawResponse: unknown;
}

function includesValue(values: readonly string[], value: string): boolean {
  return values.includes(value);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('MiniMax returned an invalid JSON response');
  }
}

function parseStreamPayloads(text: string): unknown[] {
  const payloads: unknown[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^data:\s*/, '').trim();
    if (!line || line === '[DONE]') continue;

    try {
      payloads.push(JSON.parse(line));
    } catch {
      // Some gateways return one regular JSON document even when stream=true.
    }
  }

  return payloads.length > 0 ? payloads : [parseJson(text)];
}

function validateHttpsUrl(value: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error();
  } catch {
    throw new Error('MiniMax returned an invalid audio URL');
  }
}

export function buildMiniMaxMusicRequest(
  params: MiniMaxMusicGenerationParams,
  clientConfig: MiniMaxMusicClientConfig,
): {
  endpoint: string;
  region: MiniMaxMusicRegion;
  model: MiniMaxMusicModel;
  outputFormat: MiniMaxMusicOutputFormat;
  audioFormat: MiniMaxMusicAudioFormat;
  request: MiniMaxMusicRequest;
} {
  if (params.taskType && params.taskType !== 'text2music') {
    throw new Error('MiniMax music generation only supports text-based generation');
  }

  const region = params.musicRegion ?? clientConfig.region;
  const endpoint = MINIMAX_MUSIC_ENDPOINTS[region];
  if (!endpoint) {
    throw new Error(`Unsupported MiniMax region: ${region}`);
  }

  const requestedModel = params.musicModel ?? params.ditModel ?? clientConfig.model;
  if (!includesValue(MINIMAX_MUSIC_MODELS, requestedModel)) {
    throw new Error(`Unsupported MiniMax music model: ${requestedModel}`);
  }
  const model = requestedModel as MiniMaxMusicModel;

  const stream = params.stream ?? clientConfig.stream;
  const outputFormat = params.outputFormat ?? (stream ? 'hex' : clientConfig.outputFormat);
  if (!includesValue(MINIMAX_MUSIC_OUTPUT_FORMATS, outputFormat)) {
    throw new Error(`Unsupported MiniMax output format: ${outputFormat}`);
  }
  if (stream && outputFormat !== 'hex') {
    throw new Error('MiniMax streaming music generation requires hex output');
  }

  const audioFormat = params.musicAudioFormat ?? clientConfig.audioFormat;
  if (!includesValue(MINIMAX_MUSIC_AUDIO_FORMATS, audioFormat)) {
    throw new Error(`Unsupported MiniMax audio format: ${audioFormat}`);
  }
  if (params.musicSampleRate !== undefined && !MINIMAX_MUSIC_SAMPLE_RATES.includes(params.musicSampleRate)) {
    throw new Error(`Unsupported MiniMax sample rate: ${params.musicSampleRate}`);
  }
  if (params.musicBitrate !== undefined && !MINIMAX_MUSIC_BITRATES.includes(params.musicBitrate)) {
    throw new Error(`Unsupported MiniMax bitrate: ${params.musicBitrate}`);
  }

  const prompt = (params.customMode ? (params.style || '') : (params.songDescription || params.style || '')).trim();
  const lyrics = params.instrumental ? '' : (params.lyrics || '').trim();
  const lyricsOptimizer = params.lyricsOptimizer ?? (!params.instrumental && lyrics.length === 0);

  if (!prompt && !lyrics) {
    throw new Error('MiniMax music generation requires a prompt or lyrics');
  }
  if (params.instrumental && !prompt) {
    throw new Error('MiniMax instrumental generation requires a prompt');
  }
  if (!params.instrumental && !lyrics && !lyricsOptimizer) {
    throw new Error('MiniMax vocal generation requires lyrics or lyrics optimization');
  }

  const request: MiniMaxMusicRequest = {
    model,
    stream,
    output_format: outputFormat,
    audio_setting: { format: audioFormat },
    lyrics_optimizer: lyricsOptimizer,
    is_instrumental: params.instrumental,
  };

  if (params.musicSampleRate !== undefined) {
    request.audio_setting.sample_rate = params.musicSampleRate;
  }
  if (params.musicBitrate !== undefined) {
    request.audio_setting.bitrate = params.musicBitrate;
  }

  if (prompt) request.prompt = prompt;
  if (lyrics) request.lyrics = lyrics;
  if (region === 'cn_zh' && params.aigcWatermark !== undefined) {
    request.aigc_watermark = params.aigcWatermark;
  }

  return { endpoint, region, model, outputFormat, audioFormat, request };
}

export function parseMiniMaxMusicResponse(
  payloads: unknown[],
  outputFormat: MiniMaxMusicOutputFormat,
): { status: 2; audio: string; duration?: number; rawResponse: unknown } {
  let audio = '';
  let status: number | undefined;
  let duration: number | undefined;
  let lastPayload: MiniMaxMusicApiResponse | undefined;
  let sawSuccessCode = false;

  for (const value of payloads) {
    if (!value || typeof value !== 'object') {
      throw new Error('MiniMax returned an invalid music response');
    }

    const payload = value as MiniMaxMusicApiResponse;
    const statusCode = payload.base_resp?.status_code;
    if (statusCode !== undefined) {
      if (statusCode !== 0) {
        const message = payload.base_resp?.status_msg || 'Music generation failed';
        throw new Error(`MiniMax music generation failed (${statusCode}): ${message}`);
      }
      sawSuccessCode = true;
    }

    if (typeof payload.data?.status === 'number') {
      status = payload.data.status;
    }
    if (typeof payload.data?.audio === 'string' && payload.data.audio.length > 0) {
      audio = outputFormat === 'hex' ? audio + payload.data.audio : payload.data.audio;
    }
    if (typeof payload.extra_info?.music_duration === 'number') {
      duration = payload.extra_info.music_duration / 1000;
    }
    lastPayload = payload;
  }

  if (!sawSuccessCode) {
    throw new Error('MiniMax response did not include a success code');
  }
  if (status !== 2) {
    throw new Error(`MiniMax music generation did not complete (status ${status ?? 'unknown'})`);
  }
  if (!audio) {
    throw new Error('MiniMax music generation returned no audio');
  }

  if (outputFormat === 'hex') {
    if (audio.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(audio)) {
      throw new Error('MiniMax returned invalid hexadecimal audio');
    }
  } else {
    validateHttpsUrl(audio);
  }

  return {
    status: 2,
    audio,
    duration,
    rawResponse: {
      data: {
        status,
        ...(outputFormat === 'url' ? { audio } : {}),
      },
      extra_info: lastPayload?.extra_info,
      base_resp: lastPayload?.base_resp,
    },
  };
}

export async function generateMusicWithMiniMax(
  params: MiniMaxMusicGenerationParams,
  clientConfig: MiniMaxMusicClientConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<MiniMaxMusicResult> {
  if (!clientConfig.apiKey.trim()) {
    throw new Error('MINIMAX_API_KEY is required for MiniMax music generation');
  }

  const built = buildMiniMaxMusicRequest(params, clientConfig);
  const response = await fetchImpl(built.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${clientConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(built.request),
  });
  const responseText = await response.text();

  if (!response.ok) {
    let detail = response.statusText || 'Request failed';
    try {
      const payload = JSON.parse(responseText) as MiniMaxMusicApiResponse;
      detail = payload.base_resp?.status_msg || detail;
    } catch {
      // Keep the HTTP status text when the body is not JSON.
    }
    throw new Error(`MiniMax music request failed (${response.status}): ${detail}`);
  }

  const payloads = built.request.stream
    ? parseStreamPayloads(responseText)
    : [parseJson(responseText)];
  const parsed = parseMiniMaxMusicResponse(payloads, built.outputFormat);

  return {
    provider: MINIMAX_PROVIDER_NAME,
    endpoint: built.endpoint,
    region: built.region,
    model: built.model,
    outputFormat: built.outputFormat,
    audioFormat: built.audioFormat,
    ...parsed,
  };
}
