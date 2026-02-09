import React, { useState, useEffect } from 'react';
import { Song } from '../types';
import { songsApi, getAudioUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Play, Pause, Heart, Share2, MoreHorizontal, ThumbsDown, Music as MusicIcon, Edit3, Eye } from 'lucide-react';
import { ShareModal } from './ShareModal';
import { useTranslation } from 'react-i18next';

interface SongProfileProps {
    songId: string;
    onBack: () => void;
    onPlay: (song: Song, list?: Song[]) => void;
    onNavigateToProfile: (username: string) => void;
    currentSong?: Song | null;
    isPlaying?: boolean;
    likedSongIds?: Set<string>;
    onToggleLike?: (songId: string) => void;
}

const updateMetaTags = (song: Song) => {
    const baseUrl = window.location.origin;
    const songUrl = `${baseUrl}/song/${song.id}`;
    const title = `${song.title} by ${song.creator || 'Unknown Artist'} | ACE-Step UI`;
    const description = `Listen to "${song.title}" - ${song.style}. ${song.viewCount || 0} plays, ${song.likeCount || 0} likes. Create your own AI music with ACE-Step UI.`;

    document.title = title;

    const updateOrCreateMeta = (selector: string, attribute: string, value: string) => {
        let element = document.querySelector(selector) as HTMLMetaElement;
        if (!element) {
            element = document.createElement('meta');
            const [attr, attrValue] = selector.replace(/[\[\]'"]/g, '').split('=');
            if (attr === 'property') element.setAttribute('property', attrValue);
            else if (attr === 'name') element.setAttribute('name', attrValue);
            document.head.appendChild(element);
        }
        element.setAttribute(attribute, value);
    };

    updateOrCreateMeta('meta[name="description"]', 'content', description);
    updateOrCreateMeta('meta[name="title"]', 'content', title);

    updateOrCreateMeta('meta[property="og:type"]', 'content', 'music.song');
    updateOrCreateMeta('meta[property="og:url"]', 'content', songUrl);
    updateOrCreateMeta('meta[property="og:title"]', 'content', title);
    updateOrCreateMeta('meta[property="og:description"]', 'content', description);
    updateOrCreateMeta('meta[property="og:image"]', 'content', song.coverUrl);
    updateOrCreateMeta('meta[property="og:image:width"]', 'content', '400');
    updateOrCreateMeta('meta[property="og:image:height"]', 'content', '400');
    updateOrCreateMeta('meta[property="og:audio"]', 'content', song.audioUrl || '');
    updateOrCreateMeta('meta[property="og:audio:type"]', 'content', 'audio/mpeg');

    updateOrCreateMeta('meta[name="twitter:card"]', 'content', 'summary_large_image');
    updateOrCreateMeta('meta[name="twitter:url"]', 'content', songUrl);
    updateOrCreateMeta('meta[name="twitter:title"]', 'content', title);
    updateOrCreateMeta('meta[name="twitter:description"]', 'content', description);
    updateOrCreateMeta('meta[name="twitter:image"]', 'content', song.coverUrl);

    updateOrCreateMeta('meta[property="music:duration"]', 'content', String(song.duration || 0));
    updateOrCreateMeta('meta[property="music:musician"]', 'content', song.creator || 'Unknown Artist');
};

const resetMetaTags = () => {
    document.title = 'ACE-Step UI - Local AI Music Generator';
    const defaultDescription = 'Create original music with AI locally. Generate songs in any style with custom lyrics and professional quality using ACE-Step.';
    const defaultImage = '/og-image.png';

    const updateMeta = (selector: string, content: string) => {
        const element = document.querySelector(selector) as HTMLMetaElement;
        if (element) element.setAttribute('content', content);
    };

    updateMeta('meta[name="description"]', defaultDescription);
    updateMeta('meta[property="og:title"]', 'ACE-Step UI - Local AI Music Generator');
    updateMeta('meta[property="og:description"]', defaultDescription);
    updateMeta('meta[property="og:image"]', defaultImage);
    updateMeta('meta[property="og:type"]', 'website');
    updateMeta('meta[name="twitter:title"]', 'ACE-Step UI - Local AI Music Generator');
    updateMeta('meta[name="twitter:description"]', defaultDescription);
    updateMeta('meta[name="twitter:image"]', defaultImage);
};

export const SongProfile: React.FC<SongProfileProps> = ({ songId, onBack, onPlay, onNavigateToProfile, currentSong, isPlaying, likedSongIds = new Set(), onToggleLike }) => {
    const { user, token } = useAuth();
    const { t } = useTranslation();
    const [song, setSong] = useState<Song | null>(null);
    const [loading, setLoading] = useState(true);
    const [shareModalOpen, setShareModalOpen] = useState(false);

    const isCurrentSong = song && currentSong?.id === song.id;
    const isCurrentlyPlaying = isCurrentSong && isPlaying;
    const isLiked = song ? likedSongIds.has(song.id) : false;

    useEffect(() => {
        loadSongData();
        return () => resetMetaTags();
    }, [songId]);

    useEffect(() => {
        if (song) {
            updateMetaTags(song);
        }
    }, [song]);

    const loadSongData = async () => {
        setLoading(true);
        try {
            const response = await songsApi.getFullSong(songId, token);

            const transformedSong: Song = {
                id: response.song.id,
                title: response.song.title,
                lyrics: response.song.lyrics,
                style: response.song.style,
                coverUrl: `https://picsum.photos/seed/${response.song.id}/400/400`,
                duration: response.song.duration
                    ? `${Math.floor(response.song.duration / 60)}:${String(Math.floor(response.song.duration % 60)).padStart(2, '0')}`
                    : '0:00',
                createdAt: new Date(response.song.created_at),
                tags: response.song.tags || [],
                audioUrl: getAudioUrl(response.song.audio_url, response.song.id),
                isPublic: response.song.is_public,
                likeCount: response.song.like_count || 0,
                viewCount: response.song.view_count || 0,
                userId: response.song.user_id,
                creator: response.song.creator,
                creator_avatar: response.song.creator_avatar,
            };

            setSong(transformedSong);
        } catch (error) {
            console.error('Failed to load song:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full bg-zinc-50 dark:bg-black">
                <div className="text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                    {t('song.loading')}
                </div>
            </div>
        );
    }

    if (!song) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 bg-zinc-50 dark:bg-black">
                <div className="text-zinc-500 dark:text-zinc-400">{t('song.notFound')}</div>
                <button onClick={onBack} className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-lg text-zinc-900 dark:text-white transition-colors">
                    {t('common.goBack')}
                </button>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col bg-zinc-50 dark:bg-black overflow-hidden">
            {/* Header */}
            <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 md:px-6 py-4 flex-shrink-0">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white mb-4 transition-colors"
                >
                    <ArrowLeft size={20} />
                    <span>{t('common.back')}</span>
                </button>

                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="flex-1">
                        <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white mb-2">{song.title}</h1>
                        <div className="flex items-center gap-3 mb-3">
                            <div
                                onClick={() => song.creator && onNavigateToProfile(song.creator)}
                                className="flex items-center gap-2 cursor-pointer hover:underline"
                            >
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white overflow-hidden">
                                    {song.creator_avatar ? (
                                        <img src={song.creator_avatar} alt={song.creator || 'Creator'} className="w-full h-full object-cover" />
                                    ) : (
                                        song.creator ? song.creator[0].toUpperCase() : 'A'
                                    )}
                                </div>
                                <span className="text-zinc-900 dark:text-white font-semibold">{song.creator || t('common.anonymous')}</span>
                            </div>
                        </div>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-2 mb-2">
                            {song.style.split(',').slice(0, 4).map((tag, i) => (
                                <span key={i} className="px-2 py-1 bg-zinc-200 dark:bg-zinc-800 rounded text-xs text-zinc-600 dark:text-zinc-300">
                                    {tag.trim()}
                                </span>
                            ))}
                        </div>

                        <div className="text-xs text-zinc-500">
                            {new Date(song.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at {new Date(song.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            {!song.isPublic && song.userId === user?.id && (
                                <span className="ml-2 px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 rounded text-xs text-zinc-600 dark:text-zinc-400">Private</span>
                            )}
                        </div>
                    </div>

                    {/* Related Songs Tab - Hidden on mobile */}
                    <div className="hidden md:flex items-center gap-2">
                        <button className="px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-full text-sm font-semibold">
                            {t('song.similar')}
                        </button>
                        <button
                            onClick={() => song.creator && onNavigateToProfile(song.creator)}
                            className="px-4 py-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-sm font-semibold transition-colors"
                        >
                            {t('song.by', { artist: song.creator || 'Artist' })}
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 md:py-6">

                    {/* Left Column: Song Details */}
                    <div className="space-y-4 md:space-y-6">
                        {/* Cover Art */}
                        <div className="relative aspect-square max-w-xs md:max-w-sm mx-auto lg:mx-0 rounded-xl overflow-hidden shadow-2xl">
                            <img src={song.coverUrl} alt={song.title} className={`w-full h-full object-cover transition-transform duration-500 ${isCurrentlyPlaying ? 'scale-105' : ''}`} />
                            <button
                                onClick={() => onPlay(song)}
                                className={`absolute inset-0 transition-colors flex items-center justify-center group ${isCurrentSong ? 'bg-black/50' : 'bg-black/40 hover:bg-black/50'}`}
                            >
                                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white group-hover:scale-110 transition-transform flex items-center justify-center shadow-xl">
                                    {isCurrentlyPlaying ? (
                                        <Pause size={28} className="text-black fill-black md:w-8 md:h-8" />
                                    ) : (
                                        <Play size={28} className="text-black fill-black ml-1 md:w-8 md:h-8" />
                                    )}
                                </div>
                            </button>
                            {isCurrentlyPlaying && (
                                <div className="absolute bottom-4 left-4 flex items-center gap-1">
                                    <span className="w-1.5 h-4 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                                    <span className="w-1.5 h-6 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                                    <span className="w-1.5 h-3 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                                    <span className="w-1.5 h-7 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '450ms' }} />
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-center lg:justify-start gap-2 md:gap-3 flex-wrap">
                            <div className="flex items-center gap-2 bg-zinc-200 dark:bg-zinc-900 px-3 py-2 rounded-full text-sm">
                                <Eye size={16} className="text-zinc-600 dark:text-white" />
                                <span className="text-zinc-900 dark:text-white font-semibold">{song.viewCount || 0}</span>
                            </div>
                            <button
                                onClick={() => onToggleLike?.(song.id)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm transition-colors ${isLiked ? 'bg-pink-500 text-white' : 'bg-zinc-200 dark:bg-zinc-900 hover:bg-zinc-300 dark:hover:bg-zinc-800 text-zinc-900 dark:text-white'}`}
                            >
                                <Heart size={16} className={isLiked ? 'fill-current' : ''} />
                                <span className="font-semibold">{song.likeCount || 0}</span>
                            </button>
                            {user?.id === song.userId && (
                                <button
                                    onClick={() => {
                                        if (!song.audioUrl) return;
                                        const audioUrl = song.audioUrl.startsWith('http') ? song.audioUrl : `${window.location.origin}${song.audioUrl}`;
                                        window.open(`/editor?audioUrl=${encodeURIComponent(audioUrl)}`, '_blank');
                                    }}
                                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 px-3 py-2 rounded-full text-sm font-semibold transition-colors text-white"
                                >
                                    <Edit3 size={16} />
                                    <span className="hidden md:inline">{t('actions.edit')}</span>
                                </button>
                            )}
                            <button
                                onClick={() => setShareModalOpen(true)}
                                className="p-2 bg-zinc-200 dark:bg-zinc-900 hover:bg-zinc-300 dark:hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <Share2 size={16} className="text-zinc-700 dark:text-white" />
                            </button>
                            <button className="p-2 bg-zinc-200 dark:bg-zinc-900 hover:bg-zinc-300 dark:hover:bg-zinc-800 rounded-full transition-colors">
                                <MoreHorizontal size={16} className="text-zinc-700 dark:text-white" />
                            </button>
                        </div>

                        {/* Lyrics */}
                        {song.lyrics && (
                            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">{t('rightSidebar.lyrics')}</h3>
                                <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed max-h-72 md:max-h-96 overflow-y-auto">
                                    {song.lyrics}
                                </div>
                            </div>
                        )}
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