import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Play, Pause, Heart, ChevronRight, ChevronLeft, Copy, Check, X, Loader2 } from 'lucide-react';
import { Song, Playlist } from '../types';
import { songsApi, usersApi, playlistsApi, searchApi, UserProfile, getAudioUrl } from '../services/api';
import { useI18n } from '../context/I18nContext';
import { GENRE_KEYS } from '../data/genres';

interface SearchPageProps {
  onPlaySong?: (song: Song, list?: Song[]) => void;
  currentSong?: Song | null;
  isPlaying?: boolean;
  onNavigateToProfile?: (username: string) => void;
  onNavigateToSong?: (songId: string) => void;
  onNavigateToPlaylist?: (playlistId: string) => void;
}


const MAX_RESULTS = 20;

interface ExtendedSong extends Song {
  creator_avatar?: string | null;
}

export const SearchPage: React.FC<SearchPageProps> = ({
  onPlaySong,
  currentSong,
  isPlaying,
  onNavigateToProfile,
  onNavigateToSong,
  onNavigateToPlaylist,
}) => {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [featuredSongs, setFeaturedSongs] = useState<ExtendedSong[]>([]);
  const [featuredCreators, setFeaturedCreators] = useState<Array<UserProfile & { song_count?: number }>>([]);
  const [featuredPlaylists, setFeaturedPlaylists] = useState<Array<Playlist & { creator?: string; creator_avatar?: string; song_count?: number }>>([]);
  const [searchResults, setSearchResults] = useState<{
    songs: ExtendedSong[];
    creators: Array<UserProfile & { song_count?: number }>;
    playlists: Array<Playlist & { creator?: string; creator_avatar?: string; song_count?: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  const songsScrollRef = useRef<HTMLDivElement>(null);
  const creatorsScrollRef = useRef<HTMLDivElement>(null);
  const playlistsScrollRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadFeaturedContent();
  }, []);

  const transformSong = (s: any): ExtendedSong => ({
    ...s,
    id: s.id,
    title: s.title,
    lyrics: s.lyrics || '',
    style: s.style || s.caption || '',
    coverUrl: s.cover_url || s.coverUrl || `https://picsum.photos/seed/${s.id}/400/400`,
    duration: s.duration ? (typeof s.duration === 'string' ? s.duration : `${Math.floor(s.duration / 60)}:${String(Math.floor(s.duration % 60)).padStart(2, '0')}`) : '0:00',
    createdAt: new Date(s.created_at || s.createdAt),
    tags: s.tags || [],
    audioUrl: getAudioUrl(s.audio_url || s.audioUrl, s.id),
    isPublic: s.is_public ?? s.isPublic,
    likeCount: s.like_count || s.likeCount || 0,
    viewCount: s.view_count || s.viewCount || 0,
    creator: s.creator,
    creator_avatar: s.creator_avatar || s.creatorAvatar || null,
  });

  // Shuffle array randomly
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const loadFeaturedContent = async () => {
    setLoading(true);
    try {
      const [songsRes, creatorsRes, playlistsRes] = await Promise.allSettled([
        songsApi.getFeaturedSongs(),
        usersApi.getFeaturedCreators().catch(() => ({ creators: [] })),
        playlistsApi.getFeaturedPlaylists().catch(() => ({ playlists: [] })),
      ]);

      if (songsRes.status === 'fulfilled') {
        const songs = songsRes.value.songs.map(transformSong);
        setFeaturedSongs(shuffleArray(songs).slice(0, MAX_RESULTS));
      }

      if (creatorsRes.status === 'fulfilled' && creatorsRes.value.creators?.length > 0) {
        setFeaturedCreators(creatorsRes.value.creators.slice(0, MAX_RESULTS));
      } else if (songsRes.status === 'fulfilled' && songsRes.value.songs?.length > 0) {
        const uniqueCreators = new Map<string, UserProfile & { song_count?: number }>();
        songsRes.value.songs.forEach((song: any) => {
          if (song.creator && !uniqueCreators.has(song.creator)) {
            uniqueCreators.set(song.creator, {
              id: song.user_id || song.userId || song.creator,
              username: song.creator,
              email: '',
              created_at: song.created_at || song.createdAt,
              avatar_url: song.creator_avatar || song.creatorAvatar || null,
            });
          }
        });
        setFeaturedCreators(Array.from(uniqueCreators.values()).slice(0, MAX_RESULTS));
      }

      if (playlistsRes.status === 'fulfilled') {
        setFeaturedPlaylists((playlistsRes.value.playlists || []).slice(0, MAX_RESULTS));
      }
    } catch (error) {
      console.error('Failed to load featured content:', error);
    } finally {
      setLoading(false);
    }
  };

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }

    setSearching(true);
    try {
      const results = await searchApi.search(query);
      setSearchResults({
        songs: (results.songs || []).slice(0, MAX_RESULTS).map(transformSong),
        creators: (results.creators || []).slice(0, MAX_RESULTS),
        playlists: (results.playlists || []).slice(0, MAX_RESULTS),
      });
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults({ songs: [], creators: [], playlists: [] });
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!value.trim()) {
      setSearchResults(null);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };

  const handleGenreClick = (genre: string) => {
    setSearchQuery(genre);
    performSearch(genre);
  };

  const handleCopyTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  };

  const formatNumber = (count: number | undefined): string => {
    if (!count) return '0';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };


  const scroll = (ref: React.RefObject<HTMLDivElement | null>, direction: 'left' | 'right') => {
    if (ref.current) {
      const scrollAmount = 400;
      ref.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  const displaySongs = searchResults?.songs || featuredSongs;
  const displayCreators = searchResults?.creators || featuredCreators;
  const displayPlaylists = searchResults?.playlists || featuredPlaylists;
  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-[#0a0a0a] h-full overflow-y-auto custom-scrollbar">
      <div className="max-w-[1400px] mx-auto px-6 py-6 pb-24 lg:pb-32">
        {/* Search Input */}
        <div className="mb-8">
          <div className="relative max-w-3xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
            <input
              type="text"
              placeholder={t('searchSongsPlaceholder')}
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full h-11 pl-12 pr-12 bg-white dark:bg-zinc-900/80 border border-zinc-200 dark:border-white/10 rounded-full text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 transition-all"
            />
            {searching ? (
              <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 text-pink-500 animate-spin" size={18} />
            ) : searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setSearchResults(null); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Songs Section */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
              {isSearching ? `${t('songsMatching')} "${searchQuery}"` : t('featuredSongs')}
              {isSearching && displaySongs.length > 0 && (
                <span className="ml-2 text-sm font-normal text-zinc-500">({displaySongs.length})</span>
              )}
            </h2>
            {!isSearching && displaySongs.length > 4 && (
              <button
                onClick={() => scroll(songsScrollRef, 'right')}
                className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="bg-zinc-200 dark:bg-zinc-800 rounded-lg h-[72px]" />
                </div>
              ))}
            </div>
          ) : displaySongs.length > 0 ? (
            <div
              ref={songsScrollRef}
              className={isSearching
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
                : "grid grid-cols-2 lg:grid-cols-4 gap-3 auto-rows-max"
              }
            >
              {displaySongs.slice(0, isSearching ? MAX_RESULTS : 8).map((song) => (
                <FeaturedSongCard
                  key={song.id}
                  song={song}
                  isPlaying={currentSong?.id === song.id && isPlaying}
                  onPlay={() => onPlaySong?.(song, displaySongs)}
                  onNavigateToProfile={onNavigateToProfile}
                  onCopyTag={handleCopyTag}
                  copiedTag={copiedTag}
                  formatNumber={formatNumber}
                />
              ))}
            </div>
          ) : isSearching ? (
            <div className="text-center py-8 text-zinc-500 text-sm">
              {t('noSongsFound')} "{searchQuery}"
            </div>
          ) : null}
        </section>

        {/* Creators Section */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
              {isSearching ? `${t('creatorsMatching')} "${searchQuery}"` : t('featuredCreators')}
              {isSearching && displayCreators.length > 0 && (
                <span className="ml-2 text-sm font-normal text-zinc-500">({displayCreators.length})</span>
              )}
            </h2>
            {!isSearching && displayCreators.length > 6 && (
              <div className="flex gap-1">
                <button
                  onClick={() => scroll(creatorsScrollRef, 'left')}
                  className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => scroll(creatorsScrollRef, 'right')}
                  className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            )}
          </div>
          {loading ? (
            <div className="flex gap-5 overflow-x-auto pb-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[110px] animate-pulse">
                  <div className="w-[90px] h-[90px] mx-auto rounded-full bg-zinc-200 dark:bg-zinc-800 mb-2" />
                  <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded mx-2" />
                </div>
              ))}
            </div>
          ) : displayCreators.length > 0 ? (
            <div
              ref={creatorsScrollRef}
              className={isSearching
                ? "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4"
                : "flex gap-5 overflow-x-auto pb-2 scrollbar-hide"
              }
              style={isSearching ? {} : { scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {displayCreators.map((creator) => (
                <CreatorCard
                  key={creator.id}
                  creator={creator}
                  onNavigateToProfile={onNavigateToProfile}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-zinc-500 text-sm">
              {isSearching ? `${t('noCreatorsFound')} "${searchQuery}"` : t('noCreatorsYet')}
            </div>
          )}
        </section>

        {/* Playlists Section */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
              {isSearching ? `${t('playlistsMatching')} "${searchQuery}"` : t('featuredPlaylists')}
              {isSearching && displayPlaylists.length > 0 && (
                <span className="ml-2 text-sm font-normal text-zinc-500">({displayPlaylists.length})</span>
              )}
            </h2>
            {!isSearching && displayPlaylists.length > 5 && (
              <div className="flex gap-1">
                <button
                  onClick={() => scroll(playlistsScrollRef, 'left')}
                  className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => scroll(playlistsScrollRef, 'right')}
                  className="p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            )}
          </div>
          {loading ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[140px] animate-pulse">
                  <div className="aspect-square rounded-lg bg-zinc-200 dark:bg-zinc-800 mb-2" />
                  <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded mb-1" />
                  <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : displayPlaylists.length > 0 ? (
            <div
              ref={playlistsScrollRef}
              className={isSearching
                ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
                : "flex gap-4 overflow-x-auto pb-2 scrollbar-hide"
              }
              style={isSearching ? {} : { scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {displayPlaylists.map((playlist) => (
                <PlaylistCard
                  key={playlist.id}
                  playlist={playlist}
                  onNavigateToPlaylist={onNavigateToPlaylist}
                  onNavigateToProfile={onNavigateToProfile}
                  t={t}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-zinc-500 text-sm">
              {isSearching ? `${t('noPlaylistsFound')} "${searchQuery}"` : t('noPlaylistsYet')}
            </div>
          )}
        </section>

        {/* Genres */}
        <section className="mb-10">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">{t('genres')}</h2>
          <div className="flex flex-wrap gap-2">
            {GENRE_KEYS.map((genreKey) => {
              const genreLabel = t(genreKey);
              return (
                <button
                  key={genreKey}
                  onClick={() => handleGenreClick(genreLabel)}
                  className={`px-3 py-1.5 border rounded-full text-sm transition-all duration-200 group flex items-center gap-1.5 ${
                    searchQuery === genreLabel
                      ? 'bg-pink-500 border-pink-500 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800/60 border-zinc-200 dark:border-white/5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700/60 hover:border-pink-500/30 hover:text-pink-600 dark:hover:text-pink-400'
                  }`}
                >
                  {genreLabel}
                  <Copy
                    size={12}
                    className={`opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${searchQuery === genreLabel ? 'text-white/70' : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleCopyTag(genreLabel); }}
                  />
                  {copiedTag === genreLabel && <Check size={12} className="text-green-500" />}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

interface FeaturedSongCardProps {
  song: ExtendedSong;
  isPlaying?: boolean;
  onPlay: () => void;
  onNavigateToProfile?: (username: string) => void;
  onCopyTag: (tag: string) => void;
  copiedTag: string | null;
  formatNumber: (n: number | undefined) => string;
}

const FeaturedSongCard: React.FC<FeaturedSongCardProps> = ({
  song,
  isPlaying,
  onPlay,
  onNavigateToProfile,
  onCopyTag,
  copiedTag,
  formatNumber,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const tags = song.style?.split(',').map(t => t.trim()).filter(Boolean).slice(0, 2) || [];

  return (
    <div
      className="flex items-center gap-3 p-2 bg-white dark:bg-zinc-900/40 rounded-xl border border-zinc-100 dark:border-white/5 hover:border-pink-500/30 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-all cursor-pointer group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" onClick={onPlay}>
        <img
          src={song.coverUrl}
          alt={song.title}
          className="w-full h-full object-cover"
        />
        <div className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity ${isHovered || isPlaying ? 'opacity-100' : 'opacity-0'}`}>
          {isPlaying ? (
            <Pause size={16} className="text-white" fill="white" />
          ) : (
            <Play size={16} className="text-white ml-0.5" fill="white" />
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="font-semibold text-zinc-900 dark:text-white text-sm truncate max-w-[140px]">{song.title}</span>
          {song.isPublic !== false && (
            <span className="flex-shrink-0 text-[8px] font-bold text-white bg-gradient-to-r from-pink-500 to-purple-500 px-1 py-0.5 rounded">
              v5
            </span>
          )}
        </div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mb-1">
          {tags.map((tag, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onCopyTag(tag); }}
              className="hover:text-pink-500 dark:hover:text-pink-400 transition-colors"
            >
              {tag}{i < tags.length - 1 ? ', ' : ''}
              {copiedTag === tag && <Check size={10} className="inline ml-0.5 text-green-500" />}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-400">
          {song.creator && (
            <button
              onClick={(e) => { e.stopPropagation(); onNavigateToProfile?.(song.creator!); }}
              className="flex items-center gap-1 hover:text-pink-500 transition-colors max-w-[80px]"
            >
              {song.creator_avatar ? (
                <img
                  src={song.creator_avatar}
                  alt={song.creator}
                  className="w-3.5 h-3.5 rounded-full object-cover"
                />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-[7px] text-white font-bold flex-shrink-0">
                  {song.creator.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="truncate">{song.creator}</span>
            </button>
          )}
          <span className="flex items-center gap-0.5 flex-shrink-0">
            <Play size={9} /> {formatNumber(song.viewCount)}
          </span>
          <span className="flex items-center gap-0.5 flex-shrink-0">
            <Heart size={9} /> {formatNumber(song.likeCount)}
          </span>
        </div>
      </div>
    </div>
  );
};

interface CreatorCardProps {
  creator: UserProfile & { song_count?: number };
  onNavigateToProfile?: (username: string) => void;
}

const CreatorCard: React.FC<CreatorCardProps> = ({
  creator,
  onNavigateToProfile,
}) => {
  return (
    <div
      className="flex-shrink-0 w-[110px] text-center cursor-pointer group"
      onClick={() => onNavigateToProfile?.(creator.username)}
    >
      <div className="w-[90px] h-[90px] mx-auto rounded-full overflow-hidden mb-2 ring-2 ring-transparent group-hover:ring-pink-500 transition-all shadow-lg">
        <img
          src={creator.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${creator.username}`}
          alt={creator.username}
          className="w-full h-full object-cover"
        />
      </div>
      <div className="font-semibold text-zinc-900 dark:text-white text-sm truncate group-hover:text-pink-500 transition-colors px-1">
        {creator.username}
      </div>
      <div className="text-[11px] text-zinc-500 truncate px-1">@{creator.username.toLowerCase().replace(/\s/g, '')}</div>
    </div>
  );
};

interface PlaylistCardProps {
  playlist: Playlist & { creator?: string; creator_avatar?: string; song_count?: number };
  onNavigateToPlaylist?: (playlistId: string) => void;
  onNavigateToProfile?: (username: string) => void;
  t: (key: string) => string;
}

const PlaylistCard: React.FC<PlaylistCardProps> = ({
  playlist,
  onNavigateToPlaylist,
  onNavigateToProfile,
  t,
}) => {
  return (
    <div
      className="flex-shrink-0 w-[140px] cursor-pointer group"
      onClick={() => onNavigateToPlaylist?.(playlist.id)}
    >
      <div className="aspect-square rounded-lg overflow-hidden mb-2 shadow-md relative bg-zinc-200 dark:bg-zinc-800">
        <img
          src={playlist.cover_url || `https://picsum.photos/seed/${playlist.id}/400/400`}
          alt={playlist.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="font-semibold text-zinc-900 dark:text-white text-sm truncate group-hover:text-pink-500 transition-colors">
        {playlist.name}
      </div>
      <div className="text-[11px] text-zinc-500 mb-1">{playlist.song_count || 0} {t('songs')}</div>
      {playlist.creator && (
        <div
          className="flex items-center gap-1.5 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onNavigateToProfile?.(playlist.creator!);
          }}
        >
          <div className="w-4 h-4 rounded-full overflow-hidden flex-shrink-0 bg-zinc-300 dark:bg-zinc-700">
            <img
              src={playlist.creator_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${playlist.creator}`}
              alt={playlist.creator}
              className="w-full h-full object-cover"
            />
          </div>
          <span className="text-[11px] text-zinc-500 hover:text-pink-500 transition-colors truncate">
            {playlist.creator}
          </span>
        </div>
      )}
    </div>
  );
};
