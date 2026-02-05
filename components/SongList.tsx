import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Song } from '../types';
import { Play, MoreHorizontal, Heart, ThumbsDown, ListPlus, Pause, Search, Filter, Check, Globe, Lock, Loader2, ThumbsUp, Share2, Video, Info, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { SongDropdownMenu } from './SongDropdownMenu';
import { ShareModal } from './ShareModal';
import { AlbumCover } from './AlbumCover';
import { songsApi } from '../services/api';

interface SongListProps {
    songs: Song[];
    currentSong: Song | null;
    selectedSong: Song | null;
    likedSongIds: Set<string>;
    isPlaying: boolean;
    onPlay: (song: Song) => void;
    onSelect: (song: Song) => void;
    onToggleLike: (songId: string) => void;
    onAddToPlaylist: (song: Song) => void;
    onOpenVideo?: (song: Song) => void;
    onShowDetails?: (song: Song) => void;
    onNavigateToProfile?: (username: string) => void;
    onReusePrompt?: (song: Song) => void;
    onDelete?: (song: Song) => void;
    onSongUpdate?: (updatedSong: Song) => void;
}

// ... existing code ...



// Define Filter Types
type FilterType = 'liked' | 'public' | 'private' | 'generating';

// Map model ID to short display name
const getModelDisplayName = (modelId?: string): string => {
    if (!modelId) return 'v1.5';
    
    const mapping: Record<string, string> = {
        'acestep-v15-base': '1.5B',
        'acestep-v15-sft': '1.5S',
        'acestep-v15-turbo-shift1': '1.5TS1',
        'acestep-v15-turbo-shift3': '1.5TS3',
        'acestep-v15-turbo-continuous': '1.5TC',
        'acestep-v15-turbo': '1.5T',
    };
    return mapping[modelId] || 'v1.5';
};

export const SongList: React.FC<SongListProps> = ({
    songs,
    currentSong,
    selectedSong,
    likedSongIds,
    isPlaying,
    onPlay,
    onSelect,
    onToggleLike,
    onAddToPlaylist,
    onOpenVideo,
    onShowDetails,
    onNavigateToProfile,
    onReusePrompt,
    onDelete,
    onSongUpdate
}) => {
    const { user } = useAuth();
    const { t } = useI18n();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilters, setActiveFilters] = useState<Set<FilterType>>(new Set());
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);

    const FILTERS: { id: FilterType; label: string; icon: React.ReactNode }[] = [
        { id: 'liked', label: t('liked'), icon: <ThumbsUp size={16} /> },
        { id: 'public', label: t('public'), icon: <Globe size={16} /> },
        { id: 'private', label: t('private'), icon: <Lock size={16} /> },
        { id: 'generating', label: t('generatingStatus'), icon: <Loader2 size={16} /> }
    ];

    // Close filter dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setIsFilterOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleFilter = (filterId: FilterType) => {
        setActiveFilters(prev => {
            const newFilters = new Set(prev);
            if (newFilters.has(filterId)) {
                newFilters.delete(filterId);
            } else {
                newFilters.add(filterId);
            }
            return newFilters;
        });
    };

    const filteredSongs = useMemo(() => {
        return songs.filter(song => {
            // 1. Search Logic
            const matchesSearch =
                song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                song.style.toLowerCase().includes(searchQuery.toLowerCase()) ||
                song.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

            if (!matchesSearch) return false;

            // 2. Filter Logic
            if (activeFilters.size === 0) return true;

            if (activeFilters.has('liked') && !likedSongIds.has(song.id)) return false;
            if (activeFilters.has('public') && !song.isPublic) return false;
            if (activeFilters.has('private') && song.isPublic) return false;
            if (activeFilters.has('generating') && !song.isGenerating) return false;

            return true;
        });
    }, [songs, searchQuery, activeFilters, likedSongIds]);

    return (
        <div className="flex-1 bg-white dark:bg-black h-full overflow-y-auto custom-scrollbar p-6 pb-32 transition-colors duration-300">
            <div className="max-w-5xl mx-auto w-full"> {/* Container constraint */}

                {/* Header */}
                <div className="flex flex-col gap-6 mb-8">
                    <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                        <span className="hover:text-black dark:hover:text-white cursor-pointer transition-colors">Workspaces</span>
                        <span className="text-zinc-400 dark:text-zinc-600">›</span>
                        <span className="text-zinc-900 dark:text-white font-medium">My Workspace</span>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative group flex-1">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={t('searchYourSongs')}
                                className="w-full bg-zinc-100 dark:bg-[#121214] border border-zinc-200 dark:border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-zinc-400 dark:focus:border-white/20 placeholder-zinc-500 dark:placeholder-zinc-600 transition-colors"
                            />
                            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3 group-focus-within:text-black dark:group-focus-within:text-white transition-colors" />
                        </div>

                        <div className="relative" ref={filterRef}>
                            <button
                                onClick={() => setIsFilterOpen(!isFilterOpen)}
                                className={`
                        border text-xs font-bold px-4 py-2.5 rounded-lg flex items-center gap-2 transition-all select-none
                        ${isFilterOpen || activeFilters.size > 0
                                        ? 'bg-zinc-900 dark:bg-white text-white dark:text-black border-transparent'
                                        : 'bg-zinc-100 dark:bg-[#121214] hover:bg-zinc-200 dark:hover:bg-white/5 border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-white'
                                    }
                    `}
                            >
                                <Filter size={14} fill={activeFilters.size > 0 ? "currentColor" : "none"} />
                                <span>{t('filters')} {activeFilters.size > 0 && `(${activeFilters.size})`}</span>
                            </button>

                            {/* Filter Dropdown */}
                            {isFilterOpen && (
                                <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                                    <div className="px-3 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                        {t('refineBy')}
                                    </div>
                                    {FILTERS.map(filter => (
                                        <button
                                            key={filter.id}
                                            onClick={() => toggleFilter(filter.id)}
                                            className="w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors group"
                                        >
                                            <div className="flex items-center gap-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-black dark:group-hover:text-white">
                                                <span className="text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
                                                    {filter.icon}
                                                </span>
                                                {filter.label}
                                            </div>
                                            <div className={`
                                     w-4 h-4 rounded border flex items-center justify-center transition-all
                                     ${activeFilters.has(filter.id)
                                                    ? 'bg-pink-600 border-pink-600'
                                                    : 'border-zinc-300 dark:border-zinc-600 group-hover:border-zinc-400 dark:group-hover:border-zinc-500'
                                                }
                                 `}>
                                                {activeFilters.has(filter.id) && <Check size={10} className="text-white" strokeWidth={4} />}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* List */}
                <div className="space-y-2"> {/* Reduced vertical spacing */}
                    {filteredSongs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-zinc-500 space-y-4 border border-dashed border-zinc-200 dark:border-white/5 rounded-2xl bg-zinc-50 dark:bg-white/[0.02]">
                            <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-white/5 flex items-center justify-center">
                                <Filter size={32} />
                            </div>
                            <p className="font-medium">{t('noSongsMatchFilters')}</p>
                            <button
                                onClick={() => { setActiveFilters(new Set()); setSearchQuery(''); }}
                                className="text-pink-600 dark:text-pink-500 text-sm font-bold hover:underline"
                            >
                                {t('clearFilters')}
                            </button>
                        </div>
                    ) : (
                        filteredSongs.map((song) => (
                            <SongItem
                                key={song.id}
                                song={song}
                                isCurrent={currentSong?.id === song.id}
                                isSelected={selectedSong?.id === song.id}
                                isLiked={likedSongIds.has(song.id)}
                                isPlaying={isPlaying}
                                isOwner={user?.id === song.userId}
                                onPlay={() => onPlay(song)}
                                onSelect={() => onSelect(song)}
                                onToggleLike={() => onToggleLike(song.id)}
                                onAddToPlaylist={() => onAddToPlaylist(song)}
                                onOpenVideo={() => onOpenVideo && onOpenVideo(song)}
                                onShowDetails={() => onShowDetails && onShowDetails(song)}
                                onNavigateToProfile={onNavigateToProfile}
                                onReusePrompt={() => onReusePrompt?.(song)}
                                onDelete={() => onDelete?.(song)}
                                onSongUpdate={onSongUpdate}
                            />
                        ))
                    )}
                </div>
            </div> {/* End container */}
        </div>
    );
};

interface SongItemProps {
    song: Song;
    isCurrent: boolean;
    isSelected: boolean;
    isLiked: boolean;
    isPlaying: boolean;
    isOwner: boolean;
    onPlay: () => void;
    onSelect: () => void;
    onToggleLike: () => void;
    onAddToPlaylist: () => void;
    onOpenVideo?: () => void;
    onShowDetails?: () => void;
    onNavigateToProfile?: (username: string) => void;
    onReusePrompt?: () => void;
    onDelete?: () => void;
    onSongUpdate?: (updatedSong: Song) => void;
}

const SongItem: React.FC<SongItemProps> = ({
    song,
    isCurrent,
    isSelected,
    isLiked,
    isPlaying,
    isOwner,
    onPlay,
    onSelect,
    onToggleLike,
    onAddToPlaylist,
    onOpenVideo,
    onShowDetails,
    onNavigateToProfile,
    onReusePrompt,
    onDelete,
    onSongUpdate
}) => {
    const { token } = useAuth();
    const [showDropdown, setShowDropdown] = useState(false);
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editedTitle, setEditedTitle] = useState(song.title);
    const titleInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditingTitle && titleInputRef.current) {
            titleInputRef.current.focus();
            titleInputRef.current.select();
        }
    }, [isEditingTitle]);

    const handleSaveTitle = async () => {
        if (!token || !isOwner || !editedTitle.trim() || editedTitle === song.title) {
            setIsEditingTitle(false);
            setEditedTitle(song.title);
            return;
        }

        try {
            const response = await songsApi.updateSong(song.id, { title: editedTitle.trim() }, token);
            setIsEditingTitle(false);
            // 更新父组件的歌曲列表
            if (onSongUpdate && response.song) {
                onSongUpdate(response.song);
            }
        } catch (error) {
            console.error('Failed to update title:', error);
            setEditedTitle(song.title);
            setIsEditingTitle(false);
        }
    };

    const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSaveTitle();
        } else if (e.key === 'Escape') {
            setEditedTitle(song.title);
            setIsEditingTitle(false);
        }
    };

    return (
        <>
        <div
            onClick={onSelect}
            className={`group flex items-center gap-4 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-[#18181b] transition-all cursor-pointer border ${isSelected ? 'bg-zinc-100 dark:bg-[#18181b] border-zinc-200 dark:border-white/10' : 'border-transparent bg-transparent'}`}
        >

            {/* Cover Art - Reduced size */}
            <div className="relative w-16 h-16 flex-shrink-0 rounded-md bg-zinc-200 dark:bg-zinc-800 overflow-hidden shadow-sm group/image">
                {/* Use gradient fallback if no coverUrl or image fails to load */}
                {(!song.coverUrl || imageError) ? (
                    <AlbumCover seed={song.id || song.title} size="full" className={`w-full h-full ${song.isGenerating ? 'opacity-20 blur-sm' : 'opacity-100'}`} />
                ) : (
                    <img
                        src={song.coverUrl}
                        alt={song.title}
                        className={`w-full h-full object-cover transition-opacity ${song.isGenerating ? 'opacity-20 blur-sm' : 'opacity-100'}`}
                        onError={() => setImageError(true)}
                    />
                )}

                {song.isGenerating ? (
                    <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-1">
                        {song.queuePosition ? (
                            /* Queue indicator */
                            <>
                                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                                    <Clock size={16} className="text-amber-400" />
                                </div>
                                <span className="text-[10px] font-medium text-amber-400">Queue #{song.queuePosition}</span>
                            </>
                        ) : (
                            /* Generating - Music Waveform Animation */
                            <div className="flex items-end gap-1 h-6">
                                <div className="w-1 bg-pink-500 rounded-full music-bar-anim" style={{ animationDelay: '0.0s' }}></div>
                                <div className="w-1 bg-pink-500 rounded-full music-bar-anim" style={{ animationDelay: '0.2s' }}></div>
                                <div className="w-1 bg-pink-500 rounded-full music-bar-anim" style={{ animationDelay: '0.4s' }}></div>
                                <div className="w-1 bg-pink-500 rounded-full music-bar-anim" style={{ animationDelay: '0.1s' }}></div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div
                        className={`absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-[1px] cursor-pointer transition-opacity duration-200 ${isCurrent ? 'opacity-100' : 'opacity-0 group-hover/image:opacity-100'}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onPlay();
                        }}
                    >
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-lg transform transition-transform hover:scale-105">
                            {isCurrent && isPlaying ? (
                                <Pause fill="black" className="text-black w-5 h-5" />
                            ) : (
                                <Play fill="black" className="text-black ml-1 w-5 h-5" />
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        {isEditingTitle && isOwner ? (
                            <input
                                ref={titleInputRef}
                                type="text"
                                value={editedTitle}
                                onChange={(e) => setEditedTitle(e.target.value)}
                                onBlur={handleSaveTitle}
                                onKeyDown={handleTitleKeyDown}
                                onClick={(e) => e.stopPropagation()}
                                className="font-bold text-lg bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded border border-pink-500 focus:outline-none text-zinc-900 dark:text-white min-w-0 flex-1"
                            />
                        ) : (
                            <h3
                                className={`font-bold text-lg truncate ${isCurrent ? 'text-pink-600 dark:text-pink-500' : 'text-zinc-900 dark:text-white'} ${isOwner && !song.isGenerating ? 'cursor-pointer hover:underline' : ''}`}
                                onClick={(e) => {
                                    if (isOwner && !song.isGenerating) {
                                        e.stopPropagation();
                                        setIsEditingTitle(true);
                                    }
                                }}
                            >
                                {song.title || (song.isGenerating ? (song.queuePosition ? "Queued..." : "Creating...") : "Untitled")}
                            </h3>
                        )}
                        <span className="inline-flex items-center justify-center text-[9px] font-bold text-white bg-gradient-to-r from-pink-500 to-purple-500 px-1.5 py-0.5 rounded-sm shadow-sm" title={`DiT model: ${song.ditModel || 'undefined'}`}>
                            {getModelDisplayName(song.ditModel)}
                        </span>
                        {song.isPublic === false && (
                            <Lock size={12} className="text-zinc-400 dark:text-zinc-500" />
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <div
                            className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (song.creator && onNavigateToProfile) {
                                    onNavigateToProfile(song.creator);
                                }
                            }}
                        >
                            <div className="w-4 h-4 rounded-full bg-purple-500 text-[8px] flex items-center justify-center font-bold text-white">
                                {(song.creator?.[0] || 'U').toUpperCase()}
                            </div>
                            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors hover:underline">
                                {song.creator || 'Unknown'}
                            </span>
                        </div>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-500 line-clamp-2 pt-1 font-medium max-w-2xl">
                        {song.style}
                    </p>
                </div>

                {/* Actions Row - Hidden while generating */}
                {!song.isGenerating && (
                    <div className="flex items-center gap-1 pt-2">
                        <button
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-white/5 transition-colors ${isLiked ? 'text-pink-600 dark:text-pink-500 bg-pink-100 dark:bg-pink-500/10' : 'text-zinc-400 hover:text-black dark:hover:text-white'}`}
                            onClick={(e) => { e.stopPropagation(); onToggleLike(); }}
                        >
                            <ThumbsUp size={16} fill={isLiked ? "currentColor" : "none"} />
                            {(song.likeCount || 0) > 0 && (
                                <span className="text-xs font-bold">{song.likeCount}</span>
                            )}
                        </button>

                        <button
                            className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-white/5 text-zinc-400 hover:text-black dark:hover:text-white transition-colors"
                            onClick={(e) => { e.stopPropagation(); }}
                        >
                            <ThumbsDown size={16} />
                        </button>

                        <button
                            className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-white/5 text-zinc-400 hover:text-black dark:hover:text-white transition-colors"
                            onClick={(e) => { e.stopPropagation(); setShareModalOpen(true); }}
                            title="Share"
                        >
                            <Share2 size={16} />
                        </button>

                        <button
                            className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-white/5 text-zinc-400 hover:text-black dark:hover:text-white transition-colors"
                            onClick={(e) => { e.stopPropagation(); if (onOpenVideo) onOpenVideo(); }}
                            title="Create Video"
                        >
                            <Video size={16} />
                        </button>

                        <button
                            className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-white/5 text-zinc-400 hover:text-black dark:hover:text-white transition-colors ml-auto"
                            onClick={(e) => { e.stopPropagation(); onAddToPlaylist(); }}
                            title="Add to Playlist"
                        >
                            <ListPlus size={16} />
                        </button>

                        {/* Info Button - Visible only on small/medium screens where sidebar is hidden */}
                        <button
                            className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-white/5 text-zinc-400 hover:text-black dark:hover:text-white transition-colors xl:hidden"
                            onClick={(e) => { e.stopPropagation(); if (onShowDetails) onShowDetails(); }}
                            title="Song Details"
                        >
                            <Info size={16} />
                        </button>

                        <div className="relative">
                            <button
                                className="p-2 rounded-full hover:bg-zinc-200 dark:hover:bg-white/5 text-zinc-400 hover:text-black dark:hover:text-white transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowDropdown(!showDropdown);
                                }}
                            >
                                <MoreHorizontal size={16} />
                            </button>
                            <SongDropdownMenu
                                song={song}
                                isOpen={showDropdown}
                                onClose={() => setShowDropdown(false)}
                                isOwner={isOwner}
                                onCreateVideo={() => onOpenVideo?.(song)}
                                onReusePrompt={() => onReusePrompt?.(song)}
                                onAddToPlaylist={() => onAddToPlaylist?.(song)}
                                onDelete={() => onDelete?.(song)}
                                onShare={() => setShareModalOpen(true)}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Timestamp */}
            <div className="text-xs font-mono text-zinc-500 dark:text-zinc-600 self-start pt-1">
                {song.isGenerating ? (
                    <span className={song.queuePosition ? 'text-amber-500' : 'text-pink-500'}>
                        {song.queuePosition ? `#${song.queuePosition}` : 'Creating...'}
                    </span>
                ) : song.duration}
            </div>
        </div>

        <ShareModal
            isOpen={shareModalOpen}
            onClose={() => setShareModalOpen(false)}
            song={song}
        />
        </>
    );
};