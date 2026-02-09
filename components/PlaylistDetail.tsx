import React, { useState, useEffect } from 'react';
import { Song, Playlist, playlistsApi, songsApi, getAudioUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Play, MoreHorizontal, Clock, Calendar, Shuffle, Trash2, Mic2, Music } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PlaylistDetailProps {
    playlistId: string;
    onBack: () => void;
    onPlaySong: (song: Song, list?: Song[]) => void;
    onSelect: (song: Song) => void;
    onNavigateToProfile: (username: string) => void;
}

export const PlaylistDetail: React.FC<PlaylistDetailProps> = ({ playlistId, onBack, onPlaySong, onSelect, onNavigateToProfile }) => {
    const { user: currentUser, token } = useAuth();
    const { t } = useTranslation();
    const [playlist, setPlaylist] = useState<Playlist & { creator_avatar?: string } | null>(null);
    const [songs, setSongs] = useState<Song[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadPlaylist();
    }, [playlistId]);

    const loadPlaylist = async () => {
        setLoading(true);
        try {
            const res = await playlistsApi.getPlaylist(playlistId, token);
            // res.playlist comes from DB row, which now includes creator_avatar
            setPlaylist(res.playlist as any);

            const mappedSongs: Song[] = res.songs.map((s: any) => ({
                id: s.id,
                title: s.title,
                lyrics: s.lyrics,
                style: s.style,
                coverUrl: s.cover_url || s.coverUrl || `https://picsum.photos/seed/${s.id}/400/400`,
                audioUrl: getAudioUrl(s.audio_url || s.audioUrl, s.id),
                duration: s.duration,
                bpm: s.bpm,
                tags: s.tags || [],
                isPublic: s.is_public || false,
                likeCount: s.like_count || 0,
                viewCount: s.view_count || 0,
                creator: s.creator,
                created_at: s.created_at,
                addedAt: s.added_at
            }));

            setSongs(mappedSongs);
        } catch (error) {
            console.error('Failed to load playlist:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveSong = async (songId: string) => {
        if (!token || !playlist) return;
        try {
            await playlistsApi.removeSong(playlist.id, songId, token);
            setSongs(prev => prev.filter(s => s.id !== songId));
        } catch (error) {
            console.error('Failed to remove song:', error);
        }
    };

    const handleDeletePlaylist = async () => {
        if (!token || !playlist) return;
        if (!confirm(t('playlist.deleteConfirm'))) return;
        try {
            await playlistsApi.delete(playlist.id, token);
            onBack();
        } catch (error) {
            console.error('Failed to delete playlist:', error);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center h-full bg-black">
            <div className="text-zinc-400 gap-2 flex items-center">
                <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"></div>
                {t('playlist.loading')}
            </div>
        </div>
    );

    if (!playlist) return (
        <div className="flex flex-col items-center justify-center h-full gap-4 bg-black">
            <div className="text-zinc-400">{t('playlist.notFound')}</div>
            <button onClick={onBack} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white">
                {t('common.goBack')}
            </button>
        </div>
    );

    const isOwner = currentUser?.id === playlist.user_id;

    // Gradient based on ID/Name
    const gradients = [
        'from-purple-900 to-black',
        'from-blue-900 to-black',
        'from-indigo-900 to-black',
        'from-rose-900 to-black',
    ];
    const bgGradient = gradients[playlist.name.length % gradients.length];

    return (
        <div className={`w-full h-full flex flex-col bg-gradient-to-b ${bgGradient} overflow-hidden`}>
            {/* Header */}
            <div className="flex-shrink-0 p-4 md:p-8 pt-12 md:pt-8 flex flex-col md:flex-row gap-4 md:gap-8 items-center md:items-end bg-black/20 backdrop-blur-lg border-b border-white/10">
                {/* Cover */}
                <div className="w-32 h-32 md:w-52 md:h-52 shadow-2xl rounded-lg bg-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0 group relative">
                    {playlist.cover_url ? (
                        <img src={playlist.cover_url} alt={playlist.name} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center">
                            <Music size={40} className="text-white/20 md:hidden" />
                            <Music size={64} className="text-white/20 hidden md:block" />
                            <span className="text-4xl md:text-6xl font-bold text-white/10">{playlist.name[0].toUpperCase()}</span>
                        </div>
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 space-y-2 md:space-y-4 text-center md:text-left">
                    <span className="text-xs font-bold tracking-wider uppercase text-white/80">{t('common.playlist')}</span>
                    <h1 className="text-2xl md:text-5xl lg:text-7xl font-bold text-white tracking-tight leading-none drop-shadow-lg">
                        {playlist.name}
                    </h1>
                    {playlist.description && (
                        <p className="text-zinc-300 text-sm max-w-2xl hidden md:block">{playlist.description}</p>
                    )}

                    <div className="flex items-center justify-center md:justify-start gap-2 text-sm text-white font-medium flex-wrap">
                        {playlist.creator && (
                            <div
                                className="flex items-center gap-2 cursor-pointer hover:underline"
                                onClick={() => onNavigateToProfile(playlist.creator!)}
                            >
                                {playlist.creator_avatar ? (
                                    <img src={playlist.creator_avatar} alt={playlist.creator} className="w-5 h-5 md:w-6 md:h-6 rounded-full object-cover" />
                                ) : (
                                    <div className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-gradient-to-r from-green-400 to-blue-500"></div>
                                )}
                                <span>{playlist.creator}</span>
                            </div>
                        )}
                        <span className="w-1 h-1 rounded-full bg-white/50"></span>
                        <span>{t('playlist.songs', { count: songs.length })}</span>
                        <span className="w-1 h-1 rounded-full bg-white/50 hidden md:block"></span>
                        <span className="text-zinc-400 hidden md:block">
                            {songs.reduce((acc, s) => acc + (s.duration ? (typeof s.duration === 'string' ? 0 : s.duration) : 0), 0) > 0
                                ? Math.floor(songs.reduce((acc, s) => acc + (s.duration as number || 0), 0) / 60) + " min"
                                : ""}
                        </span>
                    </div>
                </div>
            </div>

            {/* Actions Bar */}
            <div className="px-4 md:px-8 py-3 md:py-4 bg-black/20 flex items-center gap-3 md:gap-4">
                <button
                    onClick={() => songs.length > 0 && onPlaySong(songs[0], songs)}
                    className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-green-500 hover:scale-105 transition-transform flex items-center justify-center text-black shadow-lg"
                >
                    <Play size={24} fill="currentColor" className="ml-1" />
                </button>

                {isOwner && (
                    <button
                        onClick={handleDeletePlaylist}
                        className="text-zinc-400 hover:text-red-500 transition-colors p-2"
                        title="Delete Playlist"
                    >
                        <Trash2 size={20} />
                    </button>
                )}

                <div className="flex-1"></div>

                <div className="text-zinc-400 text-xs md:text-sm">
                    {playlist.is_public ? t('playlist.public') : t('playlist.private')}
                </div>
            </div>

            {/* Song List */}
            <div className="flex-1 overflow-y-auto bg-black/40">
                <div className="px-2 md:px-8 py-2 md:py-4">
                    {/* Desktop Header */}
                    <div className="hidden md:grid grid-cols-[16px_4fr_3fr_2fr_minmax(120px,1fr)] gap-4 px-4 py-2 border-b border-white/10 text-sm font-medium text-zinc-400 mb-2 sticky top-0 bg-[#121212] z-10">
                        <span>#</span>
                        <span>{t('playlist.table.title')}</span>
                        <span>{t('playlist.table.artist')}</span>
                        <span>{t('playlist.table.dateAdded')}</span>
                        <span className="text-right"><Clock size={16} className="inline" /></span>
                    </div>

                    <div className="space-y-1">
                        {songs.map((song, index) => (
                            <div
                                key={song.id}
                                className="group flex md:grid md:grid-cols-[16px_4fr_3fr_2fr_minmax(120px,1fr)] gap-3 md:gap-4 px-2 md:px-4 py-3 rounded-md hover:bg-white/10 items-center transition-colors text-sm text-zinc-400 hover:text-white cursor-pointer"
                                onClick={() => {
                                    onSelect(song);
                                    onPlaySong(song, songs);
                                }}
                            >
                                {/* Index - hidden on mobile */}
                                <span className="hidden md:block group-hover:text-white">{index + 1}</span>

                                {/* Cover + Title */}
                                <div className="flex items-center gap-3 overflow-hidden flex-1 md:flex-none">
                                    <div className="w-12 h-12 md:w-10 md:h-10 rounded bg-zinc-800 flex-shrink-0 overflow-hidden relative group/img">
                                        <img src={song.coverUrl} alt="" className="w-full h-full object-cover" />
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onPlaySong(song, songs);
                                            }}
                                            className="absolute inset-0 bg-black/50 flex md:hidden group-hover/img:flex items-center justify-center text-white"
                                        >
                                            <Play size={16} fill="white" />
                                        </button>
                                    </div>
                                    <div className="flex flex-col truncate min-w-0">
                                        <span className="font-medium text-white truncate">{song.title}</span>
                                        <span className="text-xs text-zinc-500 group-hover:text-zinc-400 truncate">
                                            {song.creator || t('common.unknown')} <span className="md:hidden">• {song.duration ? `${Math.floor(song.duration / 60)}:${String(Math.floor(song.duration % 60)).padStart(2, '0')}` : '0:00'}</span>
                                        </span>
                                    </div>
                                </div>

                                {/* Artist - hidden on mobile */}
                                <span className="hidden md:block hover:underline cursor-pointer truncate" onClick={(e) => {
                                    e.stopPropagation();
                                    song.creator && onNavigateToProfile(song.creator);
                                }}>
                                    {song.creator || t('common.unknown')}
                                </span>

                                {/* Date Added - hidden on mobile */}
                                <span className="hidden md:block">
                                    {song.addedAt ? new Date(song.addedAt).toLocaleDateString() : t('playlist.table.justNow')}
                                </span>

                                {/* Duration + Actions */}
                                <div className="hidden md:flex items-center justify-end gap-4">
                                    <span className="font-mono text-xs">
                                        {song.duration ? `${Math.floor(song.duration / 60)}:${String(Math.floor(song.duration % 60)).padStart(2, '0')}` : '0:00'}
                                    </span>
                                    {isOwner && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveSong(song.id);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-white transition-opacity"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>

                                {/* Mobile delete button */}
                                {isOwner && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveSong(song.id);
                                        }}
                                        className="md:hidden text-zinc-500 hover:text-white p-2"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Back button absolute */}
            <button
                onClick={onBack}
                className="absolute top-6 left-6 z-50 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
            >
                <ArrowLeft size={18} />
            </button>
        </div>
    );
};