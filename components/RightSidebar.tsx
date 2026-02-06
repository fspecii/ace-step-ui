import React, { useState, useEffect } from 'react';
import { Song } from '../types';
import { Heart, Share2, Play, Pause, MoreHorizontal, X, Copy, Wand2, MoreVertical, Download, Repeat, Video, Music, Link as LinkIcon, Sparkles, Globe, Lock, Trash2, Edit3, Layers } from 'lucide-react';
import { songsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { SongDropdownMenu } from './SongDropdownMenu';
import { ShareModal } from './ShareModal';
import { AlbumCover } from './AlbumCover';

interface RightSidebarProps {
    song: Song | null;
    onClose?: () => void;
    onOpenVideo?: () => void;
    onReuse?: (song: Song) => void;
    onSongUpdate?: (song: Song) => void;
    onNavigateToProfile?: (username: string) => void;
    onNavigateToSong?: (songId: string) => void;
    isLiked?: boolean;
    onToggleLike?: (songId: string) => void;
    onDelete?: (song: Song) => void;
    onAddToPlaylist?: (song: Song) => void;
    onPlay?: (song: Song) => void;
    isPlaying?: boolean;
    currentSong?: Song | null;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({ song, onClose, onOpenVideo, onReuse, onSongUpdate, onNavigateToProfile, onNavigateToSong, isLiked, onToggleLike, onDelete, onAddToPlaylist, onPlay, isPlaying, currentSong }) => {
    const { token, user } = useAuth();
    const { t } = useI18n();
    const [showMenu, setShowMenu] = useState(false);
    const [isOwner, setIsOwner] = useState(false);
    const [tagsExpanded, setTagsExpanded] = useState(false);
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [copiedStyle, setCopiedStyle] = useState(false);
    const [copiedLyrics, setCopiedLyrics] = useState(false);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState('');
    const [titleError, setTitleError] = useState<string | null>(null);
    const [isSavingTitle, setIsSavingTitle] = useState(false);

    useEffect(() => {
        if (song) {
            setIsOwner(user?.id === song.userId);
        }
    }, [song, user]);

    useEffect(() => {
        if (song) {
            setTitleDraft(song.title || '');
            setIsEditingTitle(false);
            setTitleError(null);
            setIsSavingTitle(false);
        }
    }, [song?.id]);

    const startTitleEdit = () => {
        if (!song || !isOwner) return;
        setTitleDraft(song.title || '');
        setTitleError(null);
        setIsEditingTitle(true);
    };

    const cancelTitleEdit = () => {
        if (!song) return;
        setTitleDraft(song.title || '');
        setTitleError(null);
        setIsEditingTitle(false);
    };

    const saveTitleEdit = async () => {
        if (!song) return;
        if (!token) {
            setTitleError('Please sign in to rename.');
            return;
        }
        const trimmed = titleDraft.trim();
        if (!trimmed) {
            setTitleError('Title cannot be empty.');
            return;
        }
        if (trimmed === song.title) {
            setIsEditingTitle(false);
            return;
        }
        setIsSavingTitle(true);
        setTitleError(null);
        try {
            await songsApi.updateSong(song.id, { title: trimmed }, token);
            onSongUpdate?.({ ...song, title: trimmed });
            setIsEditingTitle(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Rename failed';
            setTitleError(message);
        } finally {
            setIsSavingTitle(false);
        }
    };

    const getSourceLabel = (url?: string) => {
        if (!url) return 'None';
        try {
            const parsed = new URL(url, window.location.origin);
            const name = decodeURIComponent(parsed.pathname.split('/').pop() || url);
            return name.replace(/\.[^/.]+$/, '') || name;
        } catch {
            const parts = url.split('/');
            const name = decodeURIComponent(parts[parts.length - 1] || url);
            return name.replace(/\.[^/.]+$/, '') || name;
        }
    };

    const openSource = (url?: string) => {
        if (!url) return;
        const resolved = url.startsWith('http') ? url : `${window.location.origin}${url}`;
        window.open(resolved, '_blank');
    };

    if (!song) return (
        <div className="w-full h-full bg-zinc-50 dark:bg-suno-panel border-l border-zinc-200 dark:border-white/5 flex items-center justify-center text-zinc-400 dark:text-zinc-500 text-sm transition-colors duration-300">
            <div className="flex flex-col items-center gap-2">
                <Music size={40} className="text-zinc-300 dark:text-zinc-700" />
                <p>{t('selectSongToView')}</p>
            </div>
        </div>
    );

    return (
        <div className="w-full h-full bg-zinc-50 dark:bg-suno-panel flex flex-col border-l border-zinc-200 dark:border-white/5 relative transition-colors duration-300">

            {/* Header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-200 dark:border-white/5 flex-shrink-0 bg-zinc-50/50 dark:bg-suno-panel/50 backdrop-blur-md z-10">
                <span className="font-semibold text-sm text-zinc-900 dark:text-white">{t('songDetails')}</span>
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-full text-zinc-500 dark:text-zinc-400 transition-colors"
                >
                    <X size={18} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="p-5 pb-24 lg:pb-32 space-y-6">

                    {/* Cover Art */}
                    <div
                        className="group relative aspect-square w-full rounded-xl overflow-hidden shadow-2xl bg-zinc-200 dark:bg-zinc-800 ring-1 ring-black/5 dark:ring-white/10 cursor-pointer"
                        onClick={() => onPlay?.(song)}
                    >
                        {song.coverUrl ? (
                            <img src={song.coverUrl} alt={song.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        ) : null}
                        {!song.coverUrl && <AlbumCover seed={song.id || song.title} size="full" className="w-full h-full" />}

                        {/* Overlay Gradient */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60"></div>

                        {/* Play Button Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onPlay?.(song);
                                }}
                                className="w-16 h-16 rounded-full bg-white/95 dark:bg-white text-black flex items-center justify-center shadow-2xl hover:scale-110 transition-transform"
                            >
                                {isPlaying && currentSong?.id === song.id ? (
                                    <Pause size={28} fill="currentColor" />
                                ) : (
                                    <Play size={28} fill="currentColor" className="ml-1" />
                                )}
                            </button>
                        </div>

                        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-white">
                                <Play size={16} fill="currentColor" />
                                <span className="text-xs font-bold font-mono">{song.viewCount || 0}</span>
                            </div>
                            <span className="text-[10px] font-bold text-black bg-white/90 px-1.5 py-0.5 rounded backdrop-blur-sm">
                                {song.duration}
                            </span>
                        </div>
                    </div>

                    {/* Title & Artist Block */}
                    <div className="space-y-3">
                        <div className="flex justify-between items-start gap-2">
                            <div className="flex items-center gap-2 flex-1">
                                {!isEditingTitle ? (
                                    <h2
                                        onClick={() => onNavigateToSong?.(song.id)}
                                        className="text-2xl font-bold text-zinc-900 dark:text-white leading-tight tracking-tight cursor-pointer hover:underline"
                                    >
                                        {song.title}
                                    </h2>
                                ) : (
                                    <div className="w-full">
                                        <input
                                            value={titleDraft}
                                            onChange={(e) => setTitleDraft(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    void saveTitleEdit();
                                                }
                                                if (e.key === 'Escape') {
                                                    e.preventDefault();
                                                    cancelTitleEdit();
                                                }
                                            }}
                                            className="w-full text-xl font-bold text-zinc-900 dark:text-white bg-white dark:bg-black/30 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-500/40"
                                            maxLength={120}
                                            autoFocus
                                        />
                                        <div className="flex items-center gap-2 mt-2">
                                            <button
                                                onClick={() => void saveTitleEdit()}
                                                disabled={isSavingTitle}
                                                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-pink-600 text-white hover:bg-pink-700 disabled:opacity-60"
                                            >
                                                {isSavingTitle ? t('saving') : t('save')}
                                            </button>
                                            <button
                                                onClick={cancelTitleEdit}
                                                disabled={isSavingTitle}
                                                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-zinc-200 text-zinc-700 hover:bg-zinc-300 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/20 disabled:opacity-60"
                                            >
                                                {t('cancel')}
                                            </button>
                                            {titleError && (
                                                <span className="text-xs text-red-500">{titleError}</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="relative">
                                {isOwner && !isEditingTitle && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            startTitleEdit();
                                        }}
                                        className="text-zinc-400 hover:text-black dark:hover:text-white p-1 mr-1"
                                        title="Rename song"
                                    >
                                        <Edit3 size={18} />
                                    </button>
                                )}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowMenu(!showMenu);
                                    }}
                                    className="text-zinc-400 hover:text-black dark:hover:text-white p-1"
                                >
                                    <MoreVertical size={20} />
                                </button>
                                <SongDropdownMenu
                                    song={song}
                                    isOpen={showMenu}
                                    onClose={() => setShowMenu(false)}
                                    isOwner={isOwner}
                                    onCreateVideo={onOpenVideo}
                                    onReusePrompt={() => onReuse?.(song)}
                                    onDelete={() => onDelete?.(song)}
                                    onAddToPlaylist={() => onAddToPlaylist?.(song)}
                                    onShare={() => setShareModalOpen(true)}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-sm ring-2 ring-white dark:ring-black">
                                {song.creator ? song.creator[0].toUpperCase() : 'A'}
                            </div>
                            <div className="flex flex-col">
                                <span
                                    onClick={() => song.creator && onNavigateToProfile?.(song.creator)}
                                    className="text-sm font-semibold text-zinc-900 dark:text-white hover:underline cursor-pointer"
                                >
                                    {song.creator || t('anonymous')}
                                </span>
                                <p className="text-xs text-zinc-500">{t('created')} {new Date(song.createdAt).toLocaleDateString()}</p>
                            </div>
                        </div>
                    </div>

                    {/* Main Actions */}
                    <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-200/80 dark:bg-black/40 backdrop-blur-sm rounded-2xl border border-zinc-300/50 dark:border-white/5">
                        <button
                            onClick={onOpenVideo}
                            title={t('createVideo')}
                            className="p-3 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-300/50 dark:hover:bg-white/10 rounded-xl transition-all duration-200"
                        >
                            <Video size={18} strokeWidth={1.5} />
                        </button>
                        <button
                            onClick={() => {
                                if (!song?.audioUrl) return;
                                const audioUrl = song.audioUrl.startsWith('http') ? song.audioUrl : `${window.location.origin}${song.audioUrl}`;
                                window.open(`/editor?audioUrl=${encodeURIComponent(audioUrl)}`, '_blank');
                            }}
                            title={t('openInEditor')}
                            className="p-3 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-300/50 dark:hover:bg-white/10 rounded-xl transition-all duration-200"
                        >
                            <Edit3 size={18} strokeWidth={1.5} />
                        </button>
                        <button
                            onClick={() => onReuse && onReuse(song)}
                            title={t('reusePrompt')}
                            className="p-3 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-300/50 dark:hover:bg-white/10 rounded-xl transition-all duration-200"
                        >
                            <Repeat size={18} strokeWidth={1.5} />
                        </button>
                        <button
                            onClick={() => {
                                if (!song?.audioUrl) return;
                                const baseUrl = window.location.port === '3000'
                                    ? `${window.location.protocol}//${window.location.hostname}:3001`
                                    : window.location.origin;
                                const audioUrl = song.audioUrl.startsWith('http') ? song.audioUrl : `${baseUrl}${song.audioUrl}`;
                                window.open(`${baseUrl}/demucs-web/?audioUrl=${encodeURIComponent(audioUrl)}`, '_blank');
                            }}
                            title={t('extractStems')}
                            className="p-3 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-300/50 dark:hover:bg-white/10 rounded-xl transition-all duration-200"
                        >
                            <Layers size={18} strokeWidth={1.5} />
                        </button>
                    </div>

                    {/* Icon Actions Row */}
                    <div className="flex items-center justify-between px-2 py-2">
                        <div className="flex items-center gap-6">
                            <ActionButton
                                icon={<Heart size={22} fill={isLiked ? 'currentColor' : 'none'} />}
                                label={String(song.likeCount || 0)}
                                active={isLiked}
                                onClick={() => onToggleLike?.(song.id)}
                            />
                            <ActionButton icon={<Share2 size={22} />} onClick={() => setShareModalOpen(true)} />
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                                title={t('downloadAudio')}
                                onClick={async () => {
                                    if (!song.audioUrl) return;
                                    try {
                                        const response = await fetch(song.audioUrl);
                                        const blob = await response.blob();
                                        const url = URL.createObjectURL(blob);
                                        const link = document.createElement('a');
                                        link.href = url;
                                        link.download = `${song.title || 'song'}.mp3`;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                        URL.revokeObjectURL(url);
                                    } catch (error) {
                                        console.error('Download failed:', error);
                                    }
                                }}
                            >
                                <Download size={20} />
                            </button>
                        </div>
                    </div>

                    {(song.generationParams?.referenceAudioUrl || song.generationParams?.sourceAudioUrl) && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                                <LinkIcon size={14} />
                                Sources
                            </div>
                            <div className="space-y-2">
                                {song.generationParams?.referenceAudioUrl && (
                                    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/40 px-3 py-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Music size={14} className="text-zinc-400" />
                                            <div className="min-w-0">
                                                <div className="text-xs text-zinc-500">Reference</div>
                                                <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                                                    {song.generationParams?.referenceAudioTitle || getSourceLabel(song.generationParams?.referenceAudioUrl)}
                                                </div>
                                            </div>
                                        </div>
                                            <button
                                                className="text-xs px-2 py-1 rounded-full border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
                                                onClick={() => {
                                                    if (!song.generationParams?.referenceAudioUrl || !onPlay) return;
                                                    const previewSong = {
                                                        id: `ref_${song.id}`,
                                                        title: song.generationParams?.referenceAudioTitle || getSourceLabel(song.generationParams?.referenceAudioUrl),
                                                        lyrics: '',
                                                        style: 'Reference',
                                                        coverUrl: song.coverUrl,
                                                        duration: '0:00',
                                                        createdAt: new Date(),
                                                        tags: [],
                                                        audioUrl: song.generationParams?.referenceAudioUrl,
                                                        isPublic: false,
                                                        userId: song.userId,
                                                        creator: song.creator,
                                                    };
                                                    onPlay(previewSong);
                                                }}
                                            >
                                                Play
                                            </button>
                                    </div>
                                )}
                                {song.generationParams?.sourceAudioUrl && (
                                    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-900/40 px-3 py-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Layers size={14} className="text-zinc-400" />
                                            <div className="min-w-0">
                                                <div className="text-xs text-zinc-500">Cover</div>
                                                <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                                                    {song.generationParams?.sourceAudioTitle || getSourceLabel(song.generationParams?.sourceAudioUrl)}
                                                </div>
                                            </div>
                                        </div>
                                            <button
                                                className="text-xs px-2 py-1 rounded-full border border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
                                                onClick={() => {
                                                    if (!song.generationParams?.sourceAudioUrl || !onPlay) return;
                                                    const previewSong = {
                                                        id: `cover_${song.id}`,
                                                        title: song.generationParams?.sourceAudioTitle || getSourceLabel(song.generationParams?.sourceAudioUrl),
                                                        lyrics: '',
                                                        style: 'Cover',
                                                        coverUrl: song.coverUrl,
                                                        duration: '0:00',
                                                        createdAt: new Date(),
                                                        tags: [],
                                                        audioUrl: song.generationParams?.sourceAudioUrl,
                                                        isPublic: false,
                                                        userId: song.userId,
                                                        creator: song.creator,
                                                    };
                                                    onPlay(previewSong);
                                                }}
                                            >
                                                Play
                                            </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="h-px bg-zinc-200 dark:bg-white/5 w-full"></div>

                    {/* Tags / Style */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wide">{t('songDetails')}</h2>
                            <button
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                        const allTags = Array.isArray(song.tags) && song.tags.length > 0
                                            ? song.tags.join(', ')
                                            : (song.style ?? '');
                                        if (!allTags) return;
                                        await navigator.clipboard.writeText(allTags);
                                        setCopiedStyle(true);
                                        setTimeout(() => setCopiedStyle(false), 2000);
                                    } catch (error) {
                                        console.error('Failed to copy style tags:', error);
                                    }
                                }}
                                className={`relative z-10 flex items-center gap-1 text-[10px] font-medium transition-colors cursor-pointer ${copiedStyle ? 'text-green-500' : 'text-zinc-500 hover:text-black dark:hover:text-white'}`}
                                title={t('copyAllTags')}
                            >
                                <Copy size={12} /> {copiedStyle ? t('copied') : t('copy')}
                            </button>
                        </div>
                        <div
                            onClick={() => setTagsExpanded(!tagsExpanded)}
                            className={`flex flex-wrap gap-1.5 cursor-pointer relative ${!tagsExpanded ? 'max-h-[22px] overflow-hidden' : ''}`}
                        >
                            {Array.isArray(song.tags) && song.tags.length > 0 ? (
                                song.tags.map(tag => (
                                    <span key={tag} className="px-2 py-0.5 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/10 rounded text-[11px] font-medium text-zinc-600 dark:text-zinc-300 transition-colors">
                                        {tag}
                                    </span>
                                ))
                            ) : (
                                song.style.split(',').map((tag, idx) => (
                                    <span key={idx} className="px-2 py-0.5 bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/10 rounded text-[11px] font-medium text-zinc-600 dark:text-zinc-300 transition-colors">
                                        {tag.trim()}
                                    </span>
                                ))
                            )}
                            {!tagsExpanded && (
                                <span className="absolute right-0 top-0 px-2 py-0.5 bg-zinc-200 dark:bg-zinc-700 rounded text-[11px] font-medium text-zinc-600 dark:text-zinc-300 pointer-events-none">
                                    +{t('more')}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Lyrics Section */}
                    <div className="bg-white dark:bg-black/20 rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden">
                        <div className="px-4 py-3 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between bg-zinc-50 dark:bg-white/5">
                            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center justify-between">{t('lyricsSection')}</h3>
                            <button
                                onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                        if (song.lyrics) {
                                            await navigator.clipboard.writeText(song.lyrics);
                                            setCopiedLyrics(true);
                                            setTimeout(() => setCopiedLyrics(false), 2000);
                                        }
                                    } catch (error) {
                                        console.error('Failed to copy lyrics:', error);
                                    }
                                }}
                                className={`flex items-center gap-1 text-[10px] font-medium transition-colors cursor-pointer ${copiedLyrics ? 'text-green-500' : 'text-zinc-500 hover:text-black dark:hover:text-white'}`}
                            >
                                <Copy size={12} /> {copiedLyrics ? t('copied') : t('copy')}
                            </button>
                        </div>
                        <div className="p-4 max-h-[300px] overflow-y-auto custom-scrollbar">
                            <div className="text-sm text-zinc-700 dark:text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed opacity-90">
                                {song.lyrics || <div className="text-zinc-400 dark:text-zinc-600 italic text-center py-8">Instrumental<br /><span className="text-xs not-italic">No lyrics generated</span></div>}
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {song && (
                <ShareModal
                    isOpen={shareModalOpen}
                    onClose={() => setShareModalOpen(false)}
                    song={song}
                />
            )}
        </div>
    );
};

const ActionButton: React.FC<{ icon: React.ReactNode; label?: string; active?: boolean; onClick?: () => void }> = ({ icon, label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-1.5 ${active ? 'text-pink-600 dark:text-pink-500' : 'text-zinc-400'} hover:text-black dark:hover:text-white transition-colors`}
    >
        {icon}
        {label && <span className="text-xs font-semibold">{label}</span>}
    </button>
);
