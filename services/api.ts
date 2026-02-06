// Use relative URLs so Vite proxy handles them (enables LAN access)
const API_BASE = '';

// Resolve audio URL based on storage type
export function getAudioUrl(audioUrl: string | undefined | null, songId?: string): string | undefined {
  if (!audioUrl) return undefined;

  // Local storage: already relative, works with proxy
  if (audioUrl.startsWith('/audio/')) {
    return audioUrl;
  }

  // Already a full URL
  return audioUrl;
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    const errorMessage = error.error || error.message || 'Request failed';
    // Include status code in error for proper handling
    throw new Error(`${response.status}: ${errorMessage}`);
  }

  return response.json();
}

// Auth API (simplified - username only)
export interface User {
  id: string;
  username: string;
  isAdmin?: boolean;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
  createdAt?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export const authApi = {
  // Auto-login: Get existing user from database (for local single-user app)
  auto: (): Promise<AuthResponse> =>
    api('/api/auth/auto'),

  setup: (username: string): Promise<AuthResponse> =>
    api('/api/auth/setup', { method: 'POST', body: { username } }),

  me: (token: string): Promise<{ user: User }> =>
    api('/api/auth/me', { token }),

  logout: (): Promise<{ success: boolean }> =>
    api('/api/auth/logout', { method: 'POST' }),

  refresh: (token: string): Promise<AuthResponse> =>
    api('/api/auth/refresh', { method: 'POST', token }),

  updateUsername: (username: string, token: string): Promise<AuthResponse> =>
    api('/api/auth/username', { method: 'PATCH', body: { username }, token }),
};

// Songs API
export interface Song {
  id: string;
  title: string;
  lyrics: string;
  style: string;
  caption?: string;
  cover_url?: string;
  audio_url?: string;
  audioUrl?: string;
  duration?: number;
  bpm?: number;
  key_scale?: string;
  time_signature?: string;
  tags: string[];
  is_public: boolean;
  like_count?: number;
  view_count?: number;
  user_id?: string;
  created_at: string;
  creator?: string;
  ditModel?: string;
  generation_params?: any;
}

// Transform songs to have proper audio URLs
function transformSongs(songs: Song[]): Song[] {
  return songs.map(song => {
    const rawUrl = song.audio_url || song.audioUrl;
    const resolvedUrl = getAudioUrl(rawUrl, song.id);
    return {
      ...song,
      audio_url: resolvedUrl,
      audioUrl: resolvedUrl,
    };
  });
}

export const songsApi = {
  getMySongs: async (token: string): Promise<{ songs: Song[] }> => {
    const result = await api('/api/songs', { token }) as { songs: Song[] };
    return { songs: transformSongs(result.songs) };
  },

  getPublicSongs: async (limit = 20, offset = 0): Promise<{ songs: Song[] }> => {
    const result = await api(`/api/songs/public?limit=${limit}&offset=${offset}`) as { songs: Song[] };
    return { songs: transformSongs(result.songs) };
  },

  getFeaturedSongs: async (): Promise<{ songs: Song[] }> => {
    const result = await api('/api/songs/public/featured') as { songs: Song[] };
    return { songs: transformSongs(result.songs) };
  },

  getSong: async (id: string, token?: string | null): Promise<{ song: Song }> => {
    const result = await api(`/api/songs/${id}`, { token: token || undefined }) as { song: Song };
    const rawUrl = result.song.audio_url || result.song.audioUrl;
    const resolvedUrl = getAudioUrl(rawUrl, result.song.id);
    return { song: { ...result.song, audio_url: resolvedUrl, audioUrl: resolvedUrl } };
  },

  getFullSong: async (id: string, token?: string | null): Promise<{ song: Song, comments: any[] }> => {
    const result = await api(`/api/songs/${id}/full`, { token: token || undefined }) as { song: Song, comments: any[] };
    const rawUrl = result.song.audio_url || result.song.audioUrl;
    const resolvedUrl = getAudioUrl(rawUrl, result.song.id);
    return { ...result, song: { ...result.song, audio_url: resolvedUrl, audioUrl: resolvedUrl } };
  },

  createSong: (song: Partial<Song>, token: string): Promise<{ song: Song }> =>
    api('/api/songs', { method: 'POST', body: song, token }),

  updateSong: async (id: string, updates: Partial<Song>, token: string): Promise<{ song: any }> => {
    const result = await api(`/api/songs/${id}`, { method: 'PATCH', body: updates, token }) as { song: any };
    const s = result.song;
    const rawUrl = s.audio_url || s.audioUrl;
    const resolvedUrl = getAudioUrl(rawUrl, s.id);
    
    return {
      song: {
        id: s.id,
        title: s.title,
        lyrics: s.lyrics,
        style: s.style,
        caption: s.caption,
        cover_url: s.cover_url,
        coverUrl: s.cover_url || s.coverUrl || `https://picsum.photos/seed/${s.id}/400/400`,
        duration: s.duration && s.duration > 0 ? `${Math.floor(s.duration / 60)}:${String(Math.floor(s.duration % 60)).padStart(2, '0')}` : '0:00',
        createdAt: new Date(s.created_at || s.createdAt),
        created_at: s.created_at,
        tags: s.tags || [],
        audioUrl: resolvedUrl,
        audio_url: resolvedUrl,
        isPublic: s.is_public ?? s.isPublic,
        is_public: s.is_public ?? s.isPublic,
        likeCount: s.like_count || s.likeCount || 0,
        like_count: s.like_count || s.likeCount || 0,
        viewCount: s.view_count || s.viewCount || 0,
        view_count: s.view_count || s.viewCount || 0,
        userId: s.user_id || s.userId,
        user_id: s.user_id || s.userId,
        creator: s.creator,
        creator_avatar: s.creator_avatar,
        ditModel: s.dit_model || s.ditModel,
        isGenerating: s.isGenerating,
        queuePosition: s.queuePosition,
        bpm: s.bpm,
        key_scale: s.key_scale,
        time_signature: s.time_signature,
      }
    };
  },

  deleteSong: (id: string, token: string): Promise<{ success: boolean }> =>
    api(`/api/songs/${id}`, { method: 'DELETE', token }),

  toggleLike: (id: string, token: string): Promise<{ liked: boolean }> =>
    api(`/api/songs/${id}/like`, { method: 'POST', token }),

  getLikedSongs: async (token: string): Promise<{ songs: Song[] }> => {
    const result = await api('/api/songs/liked/list', { token }) as { songs: Song[] };
    return { songs: transformSongs(result.songs) };
  },

  togglePrivacy: (id: string, token: string): Promise<{ isPublic: boolean }> =>
    api(`/api/songs/${id}/privacy`, { method: 'PATCH', token }),

  trackPlay: (id: string, token?: string | null): Promise<{ viewCount: number }> =>
    api(`/api/songs/${id}/play`, { method: 'POST', token: token || undefined }),

  getComments: (id: string, token?: string | null): Promise<{ comments: Comment[] }> =>
    api(`/api/songs/${id}/comments`, { token: token || undefined }),

  addComment: (id: string, content: string, token: string): Promise<{ comment: Comment }> =>
    api(`/api/songs/${id}/comments`, { method: 'POST', body: { content }, token }),

  deleteComment: (commentId: string, token: string): Promise<{ success: boolean }> =>
    api(`/api/songs/comments/${commentId}`, { method: 'DELETE', token }),
};

interface Comment {
  id: string;
  song_id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
}

// Generation API
export interface GenerationParams {
  // Mode
  customMode: boolean;
  songDescription?: string;

  // Custom Mode
  prompt?: string;
  lyrics: string;
  style: string;
  title: string;

  // Model Selection
  ditModel?: string;

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
  loraLoaded?: boolean;
}

export interface GenerationJob {
  jobId: string;
  status: 'pending' | 'queued' | 'running' | 'succeeded' | 'failed';
  queuePosition?: number;
  etaSeconds?: number;
  progress?: number;
  stage?: string;
  result?: {
    audioUrls: string[];
    bpm?: number;
    duration?: number;
    keyScale?: string;
    timeSignature?: string;
  };
  error?: string;
}

export const generateApi = {
  startGeneration: (params: GenerationParams, token: string): Promise<GenerationJob> =>
    api('/api/generate', { method: 'POST', body: params, token }),

  getStatus: (jobId: string, token: string): Promise<GenerationJob> =>
    api(`/api/generate/status/${jobId}`, { token }),

  getHistory: (token: string): Promise<{ jobs: GenerationJob[] }> =>
    api('/api/generate/history', { token }),

  uploadAudio: async (file: File, token: string): Promise<{ url: string; key: string }> => {
    const formData = new FormData();
    formData.append('audio', file);
    const response = await fetch(`${API_BASE}/api/generate/upload-audio`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.details || error.error || 'Upload failed');
    }
    return response.json();
  },

  formatInput: (params: {
    caption: string;
    lyrics?: string;
    bpm?: number;
    duration?: number;
    keyScale?: string;
    timeSignature?: string;
    temperature?: number;
    topK?: number;
    topP?: number;
    lmModel?: string;
    lmBackend?: string;
  }, token: string): Promise<{
    caption?: string;
    lyrics?: string;
    bpm?: number;
    duration?: number;
    key_scale?: string;
    vocal_language?: string;
    time_signature?: string;
    status_message?: string;
    error?: string;
  }> => api('/api/generate/format', { method: 'POST', body: params, token }),

  // LoRA Inference
  loadLora: (params: {
    lora_path: string;
  }, token: string): Promise<{
    message: string;
    lora_path: string;
  }> => api('/api/lora/load', { method: 'POST', body: params, token }),

  unloadLora: (token: string): Promise<{
    message: string;
  }> => api('/api/lora/unload', { method: 'POST', token }),

  setLoraScale: (params: {
    scale: number;
  }, token: string): Promise<{
    message: string;
    scale: number;
  }> => api('/api/lora/scale', { method: 'POST', body: params, token }),
};

// Users API
export interface UserProfile extends User {
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
  created_at: string;
}

export const usersApi = {
  getProfile: (username: string, token?: string | null): Promise<{ user: UserProfile }> =>
    api(`/api/users/${username}`, { token: token || undefined }),

  getPublicSongs: (username: string): Promise<{ songs: Song[] }> =>
    api(`/api/users/${username}/songs`),

  getPublicPlaylists: (username: string): Promise<{ playlists: any[] }> =>
    api(`/api/users/${username}/playlists`),

  getFeaturedCreators: (): Promise<{ creators: Array<UserProfile & { follower_count?: number }> }> =>
    api('/api/users/public/featured'),

  updateProfile: (updates: Partial<User>, token: string): Promise<{ user: User }> =>
    api('/api/users/me', { method: 'PATCH', body: updates, token }),

  uploadAvatar: async (file: File, token: string): Promise<{ user: UserProfile; url: string }> => {
    const formData = new FormData();
    formData.append('avatar', file);
    const response = await fetch(`${API_BASE}/api/users/me/avatar`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.details || error.error || 'Upload failed');
    }
    return response.json();
  },

  uploadBanner: async (file: File, token: string): Promise<{ user: UserProfile; url: string }> => {
    const formData = new FormData();
    formData.append('banner', file);
    const response = await fetch(`${API_BASE}/api/users/me/banner`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || 'Upload failed');
    }
    return response.json();
  },

  toggleFollow: (username: string, token: string): Promise<{ following: boolean, followerCount: number }> =>
    api(`/api/users/${username}/follow`, { method: 'POST', token }),

  getFollowers: (username: string): Promise<{ followers: User[] }> =>
    api(`/api/users/${username}/followers`),

  getFollowing: (username: string): Promise<{ following: User[] }> =>
    api(`/api/users/${username}/following`),

  getStats: (username: string, token?: string | null): Promise<{ followerCount: number, followingCount: number, isFollowing: boolean }> =>
    api(`/api/users/${username}/stats`, { token: token || undefined }),
};

// Playlists API
export interface Playlist {
  id: string;
  name: string;
  description?: string;
  cover_url?: string;
  is_public?: boolean;
  user_id?: string;
  created_at?: string;
  song_count?: number;
}

export const playlistsApi = {
  create: (name: string, description: string, isPublic: boolean, token: string): Promise<{ playlist: Playlist }> =>
    api('/api/playlists', { method: 'POST', body: { name, description, isPublic }, token }),

  getMyPlaylists: (token: string): Promise<{ playlists: Playlist[] }> =>
    api('/api/playlists', { token }),

  getPlaylist: (id: string, token?: string | null): Promise<{ playlist: Playlist, songs: any[] }> =>
    api(`/api/playlists/${id}`, { token: token || undefined }),

  getFeaturedPlaylists: (): Promise<{ playlists: Array<Playlist & { creator?: string; creator_avatar?: string }> }> =>
    api('/api/playlists/public/featured'),

  addSong: (playlistId: string, songId: string, token: string): Promise<{ success: boolean }> =>
    api(`/api/playlists/${playlistId}/songs`, { method: 'POST', body: { songId }, token }),

  removeSong: (playlistId: string, songId: string, token: string): Promise<{ success: boolean }> =>
    api(`/api/playlists/${playlistId}/songs/${songId}`, { method: 'DELETE', token }),

  update: (id: string, updates: Partial<Playlist>, token: string): Promise<{ playlist: Playlist }> =>
    api(`/api/playlists/${id}`, { method: 'PATCH', body: updates, token }),

  delete: (id: string, token: string): Promise<{ success: boolean }> =>
    api(`/api/playlists/${id}`, { method: 'DELETE', token }),
};

// Search API
export interface SearchResult {
  songs: Song[];
  creators: Array<UserProfile & { follower_count?: number }>;
  playlists: Array<Playlist & { creator?: string; creator_avatar?: string }>;
}

export const searchApi = {
  search: async (query: string, type?: 'songs' | 'creators' | 'playlists' | 'all'): Promise<SearchResult> => {
    const params = new URLSearchParams({ q: query });
    if (type && type !== 'all') params.append('type', type);
    const result = await api(`/api/search?${params}`) as SearchResult;
    return {
      ...result,
      songs: transformSongs(result.songs || []),
    };
  },
};

// Contact Form API
export interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
  category: 'general' | 'support' | 'business' | 'press' | 'legal';
}

export const contactApi = {
  submit: (data: ContactFormData): Promise<{ success: boolean; message: string; id: string }> =>
    api('/api/contact', { method: 'POST', body: data }),
};

// Training API
export interface DatasetSample {
  index: number;
  filename: string;
  audio_path: string;
  duration?: number;
  caption?: string;
  genre?: string;
  prompt_override?: string | null;
  lyrics?: string;
  bpm?: number;
  keyscale?: string;
  timesignature?: string;
  language?: string;
  is_instrumental?: boolean;
  labeled?: boolean;
}

export interface DatasetMetadata {
  name: string;
  custom_tag?: string;
  tag_position?: 'prepend' | 'append' | 'replace';
  all_instrumental?: boolean;
}

export interface TrainingStatus {
  is_training: boolean;
  should_stop: boolean;
  current_step?: number;
  current_loss?: number;
  current_epoch?: number;
  status?: string;
  config?: {
    lora_rank: number;
    lora_alpha: number;
    learning_rate: number;
    epochs: number;
  };
  tensor_dir?: string;
  loss_history?: Array<{ step: number; loss: number }>;
  tensorboard_url?: string;
  tensorboard_logdir?: string;
  training_log?: string;
  start_time?: number;
  steps_per_second?: number;
  estimated_time_remaining?: number;
  error?: string;
}

export const trainingApi = {
  // Dataset Builder
  scanDirectory: (params: {
    audio_dir: string;
    dataset_name?: string;
    custom_tag?: string;
    tag_position?: 'prepend' | 'append' | 'replace';
    all_instrumental?: boolean;
  }, token: string): Promise<{
    message: string;
    num_samples: number;
    samples: any[];
  }> => api('/api/training/dataset/scan', { method: 'POST', body: params, token }),

  loadDataset: (params: {
    dataset_path: string;
  }, token: string): Promise<{
    message: string;
    dataset_name: string;
    num_samples: number;
    labeled_count: number;
    samples: any[];
  }> => api('/api/training/dataset/load', { method: 'POST', body: params, token }),

  autoLabel: (params: {
    skip_metas?: boolean;
    format_lyrics?: boolean;
    transcribe_lyrics?: boolean;
    only_unlabeled?: boolean;
  }, token: string): Promise<{
    message: string;
    labeled_count: number;
    samples: any[];
  }> => api('/api/training/dataset/auto-label', { method: 'POST', body: params, token }),

  autoLabelAsync: (params: {
    skip_metas?: boolean;
    format_lyrics?: boolean;
    transcribe_lyrics?: boolean;
    only_unlabeled?: boolean;
  }, token: string): Promise<{
    task_id: string;
    message: string;
    total: number;
  }> => api('/api/training/dataset/auto-label-async', { method: 'POST', body: params, token }),

  getAutoLabelStatus: (taskId: string, token: string): Promise<{
    task_id: string;
    status: 'running' | 'completed' | 'failed';
    progress: string;
    current: number;
    total: number;
    result?: {
      message: string;
      labeled_count: number;
      samples: any[];
    };
    error?: string;
  }> => api(`/api/training/dataset/auto-label-status/${taskId}`, { method: 'GET', token }),

  saveDataset: (params: {
    save_path: string;
    dataset_name?: string;
    custom_tag?: string;
    tag_position?: 'prepend' | 'append' | 'replace';
    all_instrumental?: boolean;
    genre_ratio?: number;
  }, token: string): Promise<{
    message: string;
    save_path: string;
  }> => api('/api/training/dataset/save', { method: 'POST', body: params, token }),

  preprocessDataset: (params: {
    output_dir: string;
  }, token: string): Promise<{
    message: string;
    output_dir: string;
    num_tensors: number;
  }> => api('/api/training/dataset/preprocess', { method: 'POST', body: params, token }),

  preprocessDatasetAsync: (params: {
    output_dir: string;
  }, token: string): Promise<{
    task_id: string;
    message: string;
    total: number;
  }> => api('/api/training/dataset/preprocess-async', { method: 'POST', body: params, token }),

  getPreprocessStatus: (taskId: string, token: string): Promise<{
    task_id: string;
    status: 'running' | 'completed' | 'failed';
    progress: string;
    current: number;
    total: number;
    result?: {
      message: string;
      output_dir: string;
      num_tensors: number;
    };
    error?: string;
  }> => api(`/api/training/dataset/preprocess-status/${taskId}`, { method: 'GET', token }),

  getSamples: (token: string): Promise<{
    dataset_name: string;
    num_samples: number;
    labeled_count: number;
    samples: DatasetSample[];
  }> => api('/api/training/dataset/samples', { token }),

  getSample: (index: number, token: string): Promise<DatasetSample> =>
    api(`/api/training/dataset/sample/${index}`, { token }),

  updateSample: (index: number, params: {
    caption?: string;
    genre?: string;
    prompt_override?: string | null;
    lyrics?: string;
    bpm?: number | null;
    keyscale?: string;
    timesignature?: string;
    language?: string;
    duration?: number;
    is_instrumental?: boolean;
  }, token: string): Promise<{
    message: string;
    sample: DatasetSample;
  }> => api(`/api/training/dataset/sample/${index}`, { method: 'PUT', body: params, token }),

  // Training
  loadTensorInfo: (params: {
    tensor_dir: string;
  }, token: string): Promise<{
    dataset_name: string;
    num_samples: number;
    tensor_dir: string;
    message: string;
  }> => api('/api/training/load_tensor_info', { method: 'POST', body: params, token }),

  startTraining: (params: {
    tensor_dir: string;
    lora_rank?: number;
    lora_alpha?: number;
    lora_dropout?: number;
    learning_rate?: number;
    train_epochs?: number;
    train_batch_size?: number;
    gradient_accumulation?: number;
    save_every_n_epochs?: number;
    training_shift?: number;
    training_seed?: number;
    lora_output_dir?: string;
    use_fp8?: boolean;
  }, token: string): Promise<{
    message: string;
    tensor_dir: string;
    output_dir: string;
    config: any;
    fp8_enabled?: boolean;
  }> => api('/api/training/start', { method: 'POST', body: params, token }),

  stopTraining: (token: string): Promise<{
    message: string;
  }> => api('/api/training/stop', { method: 'POST', token }),

  getTrainingStatus: (token: string): Promise<TrainingStatus> =>
    api('/api/training/status', { token }),

  exportLora: (params: {
    export_path: string;
    lora_output_dir: string;
  }, token: string): Promise<{
    message: string;
    export_path: string;
    source: string;
  }> => api('/api/training/export', { method: 'POST', body: params, token }),
};
