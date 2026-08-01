import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateMusicWithMiniMax,
  MINIMAX_MUSIC_AUDIO_FORMATS,
  MINIMAX_MUSIC_MODELS,
  MINIMAX_MUSIC_OUTPUT_FORMATS,
  type MiniMaxMusicClientConfig,
} from '../src/services/minimax.js';

const defaultConfig: MiniMaxMusicClientConfig = {
  apiKey: 'test-key',
  region: 'global_en',
  model: 'music-3.0',
  stream: false,
  outputFormat: 'url',
  audioFormat: 'mp3',
};

test('exposes the configured generation models and formats', () => {
  assert.deepEqual([...MINIMAX_MUSIC_MODELS], [
    'music-3.0',
    'music-2.6',
    'music-3.0-free',
    'music-2.6-free',
  ]);
  assert.deepEqual([...MINIMAX_MUSIC_OUTPUT_FORMATS], ['url', 'hex']);
  assert.deepEqual([...MINIMAX_MUSIC_AUDIO_FORMATS], ['mp3', 'wav', 'pcm']);
});

test('maps a global music request and parses URL output', async () => {
  let requestedUrl = '';
  let requestBody: Record<string, unknown> = {};
  let authorization = '';

  const fetchImpl: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    authorization = new Headers(init?.headers).get('Authorization') || '';
    return new Response(JSON.stringify({
      data: {
        status: 2,
        audio: 'https://cdn.example.com/generated.mp3',
      },
      extra_info: { music_duration: 12345 },
      base_resp: { status_code: 0, status_msg: 'success' },
    }), { status: 200 });
  };

  const result = await generateMusicWithMiniMax({
    customMode: true,
    style: 'cinematic synth music',
    lyrics: '[Verse]\nA quiet signal',
    instrumental: false,
    musicModel: 'music-3.0',
    outputFormat: 'url',
    musicAudioFormat: 'mp3',
    musicSampleRate: 44100,
    musicBitrate: 256000,
  }, defaultConfig, fetchImpl);

  assert.equal(requestedUrl, 'https://api.minimax.io/v1/music_generation');
  assert.equal(authorization, 'Bearer test-key');
  assert.deepEqual(requestBody, {
    model: 'music-3.0',
    prompt: 'cinematic synth music',
    lyrics: '[Verse]\nA quiet signal',
    stream: false,
    output_format: 'url',
    audio_setting: { format: 'mp3', sample_rate: 44100, bitrate: 256000 },
    lyrics_optimizer: false,
    is_instrumental: false,
  });
  assert.equal(result.audio, 'https://cdn.example.com/generated.mp3');
  assert.equal(result.duration, 12.345);
});

test('maps the China endpoint and combines streamed hexadecimal audio', async () => {
  let requestBody: Record<string, unknown> = {};

  const fetchImpl: typeof fetch = async (input, init) => {
    assert.equal(String(input), 'https://api.minimaxi.com/v1/music_generation');
    requestBody = JSON.parse(String(init?.body));
    return new Response([
      'data: {"data":{"status":1,"audio":"0011"},"base_resp":{"status_code":0}}',
      '',
      'data: {"data":{"status":2,"audio":"aabb"},"base_resp":{"status_code":0}}',
      '',
    ].join('\n'), { status: 200 });
  };

  const result = await generateMusicWithMiniMax({
    customMode: false,
    songDescription: 'instrumental piano',
    instrumental: true,
    musicModel: 'music-2.6',
    musicRegion: 'cn_zh',
    stream: true,
    outputFormat: 'hex',
    musicAudioFormat: 'wav',
    aigcWatermark: true,
  }, defaultConfig, fetchImpl);

  assert.deepEqual(requestBody, {
    model: 'music-2.6',
    prompt: 'instrumental piano',
    stream: true,
    output_format: 'hex',
    audio_setting: { format: 'wav' },
    lyrics_optimizer: false,
    is_instrumental: true,
    aigc_watermark: true,
  });
  assert.equal(result.audio, '0011aabb');
  assert.equal(result.audioFormat, 'wav');
});

test('requires hexadecimal output for streaming requests', async () => {
  await assert.rejects(
    generateMusicWithMiniMax({
      customMode: false,
      songDescription: 'ambient instrumental',
      instrumental: true,
      stream: true,
      outputFormat: 'url',
    }, defaultConfig),
    /requires hex output/,
  );
});

test('accepts lyrics-only custom generation without a prompt', async () => {
  let requestBody: Record<string, unknown> = {};

  const fetchImpl: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      data: {
        status: 2,
        audio: 'https://cdn.example.com/lyrics-only.mp3',
      },
      base_resp: { status_code: 0 },
    }), { status: 200 });
  };

  await generateMusicWithMiniMax({
    customMode: true,
    lyrics: '[Verse]\nWords without a style prompt',
    instrumental: false,
  }, defaultConfig, fetchImpl);

  assert.equal(requestBody.prompt, undefined);
  assert.equal(requestBody.lyrics, '[Verse]\nWords without a style prompt');
});
