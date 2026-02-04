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

  updateSong: (id: string, updates: Partial<Song>, token: string): Promise<{ song: Song }> =>
    api(`/api/songs/${id}`, { method: 'PATCH', body: updates, token }),

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

export interface GenerationJob {
  jobId: string;
  status: 'pending' | 'queued' | 'running' | 'succeeded' | 'failed';
  queuePosition?: number;
  etaSeconds?: number;
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
  }, token: string): Promise<{
    success: boolean;
    caption?: string;
    lyrics?: string;
    bpm?: number;
    duration?: number;
    key_scale?: string;
    language?: string;
    time_signature?: string;
    status_message?: string;
    error?: string;
  }> => api('/api/generate/format', { method: 'POST', body: params, token }),
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
