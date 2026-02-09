import React, { useState, useEffect, useRef } from 'react';
import { Song, Playlist } from '../types';
import { usersApi, getAudioUrl, UserProfile as UserProfileType, songsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Play, Pause, Heart, Eye, Users, Music as MusicIcon, ChevronRight, Share2, MoreHorizontal, Edit3, X, Camera, Image as ImageIcon, Upload, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface UserProfileProps {
    username: string;
    onBack: () => void;
    onPlaySong: (song: Song, list?: Song[]) => void;
    onNavigateToProfile: (username: string) => void;
    onNavigateToPlaylist?: (playlistId: string) => void;
    currentSong?: Song | null;
    isPlaying?: boolean;
    likedSongIds?: Set<string>;
    onToggleLike?: (songId: string) => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({ username, onBack, onPlaySong, onNavigateToProfile, onNavigateToPlaylist, currentSong, isPlaying, likedSongIds = new Set(), onToggleLike }) => {
    const { user: currentUser, token } = useAuth();
    const { t } = useTranslation();
    const [profileUser, setProfileUser] = useState<UserProfileType | null>(null);
    const [publicSongs, setPublicSongs] = useState<Song[]>([]);
    const [publicPlaylists, setPublicPlaylists] = useState<Playlist[]>([]);
    const [songsTab, setSongsTab] = useState<'recent' | 'top'>('recent');
    const [loading, setLoading] = useState(true);

    // Edit State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editBio, setEditBio] = useState('');
    const [editAvatarUrl, setEditAvatarUrl] = useState('');
    const [editBannerUrl, setEditBannerUrl] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [bannerPreview, setBannerPreview] = useState<string | null>(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [uploadingBanner, setUploadingBanner] = useState(false);
    const [avatarFailed, setAvatarFailed] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadUserProfile();
    }, [username]);

    const loadUserProfile = async () => {
        setLoading(true);
        try {
            const [profileRes, songsRes, playlistsRes] = await Promise.all([
                usersApi.getProfile(username, token),
                usersApi.getPublicSongs(username),
                usersApi.getPublicPlaylists(username)
            ]);

            setProfileUser(profileRes.user);
            setEditBio(profileRes.user.bio || '');
            setEditAvatarUrl(profileRes.user.avatar_url || '');
            setEditBannerUrl(profileRes.user.banner_url || '');

            const transformedSongs: Song[] = songsRes.songs.map(s => ({
                id: s.id,
                title: s.title,
                lyrics: s.lyrics,
                style: s.style,
                coverUrl: `https://picsum.photos/seed/${s.id}/400/400`,
                duration: s.duration ? `${Math.floor(s.duration / 60)}:${String(Math.floor(s.duration % 60)).padStart(2, '0')}` : '0:00',
                createdAt: new Date(s.created_at),
                tags: s.tags || [],
                audioUrl: getAudioUrl(s.audio_url, s.id),
                isPublic: true,
                likeCount: s.like_count || 0,
                viewCount: s.view_count || 0,
                creator: s.creator,
            }));
            setPublicSongs(transformedSongs);
            setPublicPlaylists(playlistsRes.playlists || []);
        } catch (error) {
            console.error('Failed to load user profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAvatarFile(file);
            const reader = new FileReader();
            reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setBannerFile(file);
            const reader = new FileReader();
            reader.onload = (ev) => setBannerPreview(ev.target?.result as string);
            reader.readAsDataURL(file);
        }
    };

    const handleSaveProfile = async () => {
        if (!token) return;
        setIsSaving(true);
        try {
            // Upload avatar if changed
            if (avatarFile) {
                setUploadingAvatar(true);
                const avatarRes = await usersApi.uploadAvatar(avatarFile, token);
                setEditAvatarUrl(avatarRes.url);
                setUploadingAvatar(false);
            }

            // Upload banner if changed
            if (bannerFile) {
                setUploadingBanner(true);
                const bannerRes = await usersApi.uploadBanner(bannerFile, token);
                setEditBannerUrl(bannerRes.url);
                setUploadingBanner(false);
            }

            // Update bio (and any URL-based avatar/banner if not using file upload)
            const updates: Record<string, string> = { bio: editBio };
            if (!avatarFile && editAvatarUrl !== profileUser.avatar_url) {
                updates.avatarUrl = editAvatarUrl;
            }
            if (!bannerFile && editBannerUrl !== profileUser.banner_url) {
                updates.bannerUrl = editBannerUrl;
            }

            if (Object.keys(updates).length > 0) {
                await usersApi.updateProfile(updates, token);
            }

            setIsEditModalOpen(false);
            setAvatarFile(null);
            setBannerFile(null);
            setAvatarPreview(null);
            setBannerPreview(null);

            // Reload to get fresh data
            loadUserProfile();
        } catch (error) {
            console.error('Failed to update profile:', error);
            alert('Failed to update profile');
        } finally {
            setIsSaving(false);
            setUploadingAvatar(false);
            setUploadingBanner(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full bg-zinc-50 dark:bg-black">
                <div className="text-zinc-500 dark:text-zinc-400 gap-2 flex items-center">
                    <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"></div>
                    {t('user.loading')}
                </div>
            </div>
        );
    }

    if (!profileUser) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 bg-zinc-50 dark:bg-black">
                <div className="text-zinc-500 dark:text-zinc-400">{t('user.notFound')}</div>
                <button onClick={onBack} className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-lg text-zinc-900 dark:text-white">
                    {t('user.goBack')}
                </button>
            </div>
        );
    }

    const totalLikes = publicSongs.reduce((sum, song) => sum + (song.likeCount || 0), 0);
    const totalPlays = publicSongs.reduce((sum, song) => sum + (song.viewCount || 0), 0);
    const isOwner = currentUser?.id === profileUser.id;

    // Generate random gradient for banner fallback
    const gradients = [
        'from-purple-600 via-pink-600 to-red-600',
        'from-blue-600 via-purple-600 to-pink-600',
        'from-green-600 via-teal-600 to-blue-600',
        'from-orange-600 via-red-600 to-pink-600',
        'from-indigo-600 via-purple-600 to-pink-600',
    ];
    const bannerGradient = gradients[username.length % gradients.length];
    const primaryBadge = profileUser.badges?.[0];
    const badgeRing = primaryBadge?.color === 'yellow'
        ? 'ring-yellow-400/80 shadow-yellow-500/30'
        : primaryBadge?.color === 'purple'
        ? 'ring-purple-400/80 shadow-purple-500/30'
        : primaryBadge?.color === 'blue'
        ? 'ring-blue-400/80 shadow-blue-500/30'
        : primaryBadge?.color === 'teal'
        ? 'ring-teal-400/80 shadow-teal-500/30'
        : primaryBadge?.color === 'green'
        ? 'ring-green-400/80 shadow-green-500/30'
        : primaryBadge?.color === 'orange'
        ? 'ring-orange-400/80 shadow-orange-500/30'
        : primaryBadge?.color === 'pink'
        ? 'ring-pink-400/80 shadow-pink-500/30'
        : 'ring-zinc-500/50 shadow-zinc-500/20';
    const paidPulse = profileUser.accountTier && profileUser.accountTier !== 'free'
        ? 'group-hover/avatar:animate-[wiggle_0.6s_ease-in-out] group-hover/avatar:rotate-1'
        : '';
    const paidNameStyle = primaryBadge?.color === 'yellow'
        ? 'bg-gradient-to-r from-yellow-300 via-amber-300 to-orange-400 text-transparent bg-clip-text drop-shadow-[0_2px_12px_rgba(251,191,36,0.45)]'
        : primaryBadge?.color === 'purple'
        ? 'bg-gradient-to-r from-fuchsia-400 via-purple-500 to-indigo-400 text-transparent bg-clip-text drop-shadow-[0_2px_12px_rgba(168,85,247,0.45)]'
        : primaryBadge?.color === 'blue'
        ? 'bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-400 text-transparent bg-clip-text drop-shadow-[0_2px_12px_rgba(59,130,246,0.45)]'
        : primaryBadge?.color === 'teal'
        ? 'bg-gradient-to-r from-teal-300 via-emerald-400 to-cyan-400 text-transparent bg-clip-text drop-shadow-[0_2px_12px_rgba(45,212,191,0.45)]'
        : primaryBadge?.color === 'orange'
        ? 'bg-gradient-to-r from-orange-300 via-amber-400 to-yellow-300 text-transparent bg-clip-text drop-shadow-[0_2px_12px_rgba(251,146,60,0.4)]'
        : primaryBadge?.color === 'pink'
        ? 'bg-gradient-to-r from-pink-400 via-rose-500 to-fuchsia-500 text-transparent bg-clip-text drop-shadow-[0_2px_12px_rgba(244,114,182,0.45)]'
        : '';

    // Banner Style
    const bannerStyle = profileUser.banner_url
        ? { backgroundImage: `url(${profileUser.banner_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : {};
    const bannerClass = profileUser.banner_url
        ? `h-48 md:h-64 relative overflow-hidden bg-zinc-200 dark:bg-zinc-900`
        : `h-48 md:h-64 bg-gradient-to-r ${bannerGradient} relative overflow-hidden`;

    const featuredSongs = publicSongs.slice(0, 6);
    const displaySongs = songsTab === 'recent' ? publicSongs : [...publicSongs].sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));

    return (
        <div className="w-full h-full flex flex-col bg-zinc-50 dark:bg-black overflow-y-auto relative">
            {/* Hero Banner */}
            <div className="relative group/banner">
                {/* Background Banner */}
                <div className={bannerClass} style={bannerStyle}>
                    {!profileUser.banner_url && (
                        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLW9wYWNpdHk9IjAuMSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30"></div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-50 dark:from-black via-zinc-50/20 dark:via-black/20 to-transparent"></div>
                </div>

                {/* Back Button */}
                <button
                    onClick={onBack}
                    className="absolute top-4 left-4 flex items-center gap-2 text-white/80 hover:text-white bg-black/30 hover:bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm transition-all z-20"
                >
                    <ArrowLeft size={20} />
                    <span>{t('common.back')}</span>
                </button>

                {/* Edit Banner Button (Owner Only) - Visual Cue */}
                {isOwner && (
                    <button
                        onClick={() => setIsEditModalOpen(true)}
                        className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover/banner:opacity-100 transition-opacity"
                        title="Edit Banner" // Accessibility
                    >
                        <ImageIcon size={20} />
                    </button>
                )}

                {/* Profile Info */}
                <div className="max-w-7xl mx-auto px-4 md:px-8 -mt-16 md:-mt-20 relative z-10 w-full">
                    <div className="flex flex-col md:flex-row items-start md:items-end gap-4 md:gap-6">
                        {/* Avatar */}
                        <div className="group/avatar relative">
                            <div className={`w-24 h-24 md:w-40 md:h-40 rounded-full border-4 border-zinc-50 dark:border-black bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shadow-2xl ring-4 ${badgeRing} transition-transform ${paidPulse}`}>
                                {profileUser.avatar_url && !avatarFailed ? (
                                    <img
                                        src={profileUser.avatar_url}
                                        alt={profileUser.username}
                                        className="w-full h-full object-cover"
                                        referrerPolicy="no-referrer"
                                        onError={() => setAvatarFailed(true)}
                                    />
                                ) : (
                                    <div className={`w-full h-full bg-gradient-to-br ${bannerGradient} flex items-center justify-center text-4xl md:text-6xl font-bold text-white`}>
                                        {profileUser.username[0].toUpperCase()}
                                    </div>
                                )}
                            </div>
                            {isOwner && (
                                <button
                                    onClick={() => setIsEditModalOpen(true)}
                                    className="absolute bottom-1 right-1 md:bottom-2 md:right-2 p-1.5 md:p-2 bg-zinc-200 dark:bg-zinc-800 rounded-full text-zinc-700 dark:text-white hover:bg-zinc-300 dark:hover:bg-zinc-700 border border-zinc-50 dark:border-black shadow-lg"
                                >
                                    <Edit3 size={14} className="md:w-4 md:h-4" />
                                </button>
                            )}
                        </div>

                        {/* User Info */}
                        <div className="flex-1 pb-2 w-full">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <h1 className={`text-2xl md:text-5xl font-bold mb-1 ${paidNameStyle || 'text-zinc-900 dark:text-white'}`}>
                                        {profileUser.username}
                                    </h1>
                                    {profileUser.badges && profileUser.badges.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {profileUser.badges.map((badge) => {
                                                const style =
                                                    badge.color === 'yellow'
                                                        ? 'from-yellow-300 via-amber-300 to-orange-400 text-amber-950 shadow-[0_0_20px_rgba(251,191,36,0.45)]'
                                                        : badge.color === 'purple'
                                                        ? 'from-fuchsia-400 via-purple-500 to-indigo-500 text-white shadow-[0_0_20px_rgba(168,85,247,0.45)]'
                                                        : badge.color === 'blue'
                                                        ? 'from-sky-400 via-blue-500 to-indigo-500 text-white shadow-[0_0_18px_rgba(59,130,246,0.45)]'
                                                        : badge.color === 'teal'
                                                        ? 'from-teal-300 via-emerald-400 to-cyan-400 text-emerald-950 shadow-[0_0_18px_rgba(45,212,191,0.45)]'
                                                        : badge.color === 'orange'
                                                        ? 'from-orange-300 via-amber-400 to-yellow-300 text-amber-950 shadow-[0_0_16px_rgba(251,146,60,0.4)]'
                                                        : badge.color === 'pink'
                                                        ? 'from-pink-400 via-rose-500 to-fuchsia-500 text-white shadow-[0_0_18px_rgba(244,114,182,0.45)]'
                                                        : badge.color === 'green'
                                                        ? 'from-emerald-300 via-green-400 to-lime-300 text-emerald-950 shadow-[0_0_16px_rgba(34,197,94,0.4)]'
                                                        : 'from-zinc-200 via-zinc-300 to-zinc-200 text-zinc-700 dark:from-zinc-700 dark:via-zinc-600 dark:to-zinc-700 dark:text-zinc-100';

                                                const icon =
                                                    badge.id === 'supporter'
                                                        ? '🏅'
                                                        : badge.id === 'patron'
                                                        ? '🏆'
                                                        : badge.id === 'legendary'
                                                        ? '👑'
                                                        : badge.id === 'diamond'
                                                        ? '💎'
                                                        : badge.id === 'crown'
                                                        ? '👑'
                                                        : badge.id === 'champion'
                                                        ? '🥇'
                                                        : badge.id === 'music'
                                                        ? '🎵'
                                                        : badge.id === 'coffee'
                                                        ? '☕'
                                                        : '⭐';

                                                return (
                                                    <span
                                                        key={badge.id}
                                                        title={badge.description}
                                                        className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border border-white/40 dark:border-white/10 bg-gradient-to-r ${style} transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.03] hover:brightness-110`}
                                                    >
                                                        <span className="text-sm drop-shadow">{icon}</span>
                                                        {badge.label}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {profileUser.supporter_since && profileUser.accountTier && profileUser.accountTier !== 'free' && (
                                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                                            Supporting since {new Date(profileUser.supporter_since).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                        </p>
                                    )}

                                    {/* Bio */}
                                    {profileUser.bio && (
                                        <p className="text-zinc-700 dark:text-zinc-200 max-w-2xl mb-4 text-sm md:text-base leading-relaxed whitespace-pre-line">
                                            {profileUser.bio}
                                        </p>
                                    )}

                                    <p className="text-zinc-500 text-xs md:text-sm mb-4">
                                        Joined {new Date(profileUser.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                    </p>
                                </div>

                                {/* Edit Profile Button (Mobile/Desktop) */}
                                {isOwner && (
                                    <button
                                        onClick={() => setIsEditModalOpen(true)}
                                        className="px-4 md:px-6 py-2 bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-full font-bold transition-colors text-sm flex items-center gap-2"
                                    >
                                        <Edit3 size={16} />
                                        {t('user.editProfile')}
                                    </button>
                                )}
                            </div>

                            {/* Stats */}
                            <div className="flex items-center gap-4 md:gap-6 text-sm pt-2 border-t border-zinc-200 dark:border-white/10 mt-2 flex-wrap">
                                <div className="flex items-center gap-1.5 md:gap-2">
                                    <MusicIcon size={16} className="text-zinc-500 dark:text-zinc-400" />
                                    <span className="font-semibold text-zinc-900 dark:text-white">{publicSongs.length}</span>
                                    <span className="text-zinc-500 dark:text-zinc-400">{t('user.songs')}</span>
                                </div>
                                <div className="flex items-center gap-1.5 md:gap-2">
                                    <Heart size={16} className="text-zinc-500 dark:text-zinc-400" />
                                    <span className="font-semibold text-zinc-900 dark:text-white">{totalLikes}</span>
                                    <span className="text-zinc-500 dark:text-zinc-400">{t('user.likes')}</span>
                                </div>
                                <div className="flex items-center gap-1.5 md:gap-2">
                                    <Eye size={16} className="text-zinc-500 dark:text-zinc-400" />
                                    <span className="font-semibold text-zinc-900 dark:text-white">{totalPlays}</span>
                                    <span className="text-zinc-500 dark:text-zinc-400">{t('user.plays')}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-6 md:py-8 space-y-8 md:space-y-12">
                {/* Featured Songs */}
                {featuredSongs.length > 0 && (
                    <section>
                        <h2 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white mb-4 md:mb-6">{t('user.featured')}</h2>
                        <div className="flex gap-3 md:gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 scrollbar-track-transparent -mx-4 px-4 md:mx-0 md:px-0">
                            {featuredSongs.map((song) => {
                                const isCurrentSong = currentSong?.id === song.id;
                                const isCurrentlyPlaying = isCurrentSong && isPlaying;
                                const isLiked = likedSongIds.has(song.id);
                                return (
                                    <div
                                        key={song.id}
                                        className="group relative flex-shrink-0 w-36 md:w-48"
                                    >
                                        <div
                                            onClick={() => onPlaySong(song, featuredSongs)}
                                            className="aspect-square rounded-lg overflow-hidden mb-2 md:mb-3 relative bg-zinc-200 dark:bg-zinc-800 cursor-pointer"
                                        >
                                            <img src={song.coverUrl} alt={song.title} className={`w-full h-full object-cover transition-transform duration-500 ${isCurrentlyPlaying ? 'scale-105' : 'group-hover:scale-105'}`} />
                                            <div className={`absolute inset-0 bg-black/40 transition-opacity flex items-center justify-center ${isCurrentSong ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white flex items-center justify-center shadow-lg">
                                                    {isCurrentlyPlaying ? (
                                                        <Pause size={20} className="text-black fill-black md:w-6 md:h-6" />
                                                    ) : (
                                                        <Play size={20} className="text-black fill-black ml-1 md:w-6 md:h-6" />
                                                    )}
                                                </div>
                                            </div>
                                            {isCurrentlyPlaying && (
                                                <div className="absolute bottom-2 left-2 flex items-center gap-1">
                                                    <span className="w-1 h-3 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                                                    <span className="w-1 h-4 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                                                    <span className="w-1 h-2 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                                                    <span className="w-1 h-5 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '450ms' }} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <h3 className={`font-semibold truncate mb-1 text-sm md:text-base ${isCurrentSong ? 'text-pink-500' : 'text-zinc-900 dark:text-white'}`}>{song.title}</h3>
                                                <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 truncate mb-2">{song.style}</p>
                                            </div>
                                            {onToggleLike && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onToggleLike(song.id); }}
                                                    className={`p-1.5 rounded-full transition-colors ${isLiked ? 'text-pink-500' : 'text-zinc-400 hover:text-pink-500'}`}
                                                >
                                                    <Heart size={16} className={isLiked ? 'fill-current' : ''} />
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-zinc-500">
                                            <span className="flex items-center gap-1">
                                                <Heart size={12} className={isLiked ? 'fill-pink-500 text-pink-500' : ''} /> {song.likeCount || 0}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Eye size={12} /> {song.viewCount || 0}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* Songs Section */}
                <section>
                    <div className="flex items-center justify-between mb-4 md:mb-6">
                        <h2 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white">{t('user.songs')}</h2>
                        <div className="flex items-center gap-4">
                            <div className="flex bg-zinc-200 dark:bg-zinc-900 rounded-full p-1">
                                <button
                                    onClick={() => setSongsTab('recent')}
                                    className={`px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-medium transition-colors ${songsTab === 'recent' ? 'bg-white dark:bg-white text-zinc-900 dark:text-black shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                                        }`}
                                >
                                    {t('user.recent')}
                                </button>
                                <button
                                    onClick={() => setSongsTab('top')}
                                    className={`px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-medium transition-colors ${songsTab === 'top' ? 'bg-white dark:bg-white text-zinc-900 dark:text-black shadow-sm' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                                        }`}
                                >
                                    {t('user.top')}
                                </button>
                            </div>
                        </div>
                    </div>

                    {displaySongs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                            <MusicIcon size={64} className="mb-4 opacity-50" />
                            <p>{t('user.noSongs')}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
                            {displaySongs.map((song) => {
                                const isCurrentSong = currentSong?.id === song.id;
                                const isCurrentlyPlaying = isCurrentSong && isPlaying;
                                const isLiked = likedSongIds.has(song.id);
                                return (
                                    <div
                                        key={song.id}
                                        className={`group flex items-center gap-3 md:gap-4 p-2 md:p-3 rounded-lg cursor-pointer transition-colors ${isCurrentSong ? 'bg-pink-50 dark:bg-pink-500/10' : 'hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
                                    >
                                        <div
                                            onClick={() => onPlaySong(song, displaySongs)}
                                            className="relative w-14 h-14 md:w-16 md:h-16 flex-shrink-0 rounded-md overflow-hidden bg-zinc-200 dark:bg-zinc-800"
                                        >
                                            <img src={song.coverUrl} alt={song.title} className="w-full h-full object-cover" />
                                            <div className={`absolute inset-0 bg-black/40 transition-opacity flex items-center justify-center ${isCurrentSong ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                {isCurrentlyPlaying ? (
                                                    <Pause size={18} className="text-white fill-white md:w-5 md:h-5" />
                                                ) : (
                                                    <Play size={18} className="text-white fill-white md:w-5 md:h-5" />
                                                )}
                                            </div>
                                            {isCurrentlyPlaying && (
                                                <div className="absolute bottom-1 left-1 flex items-center gap-0.5">
                                                    <span className="w-0.5 h-2 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                                                    <span className="w-0.5 h-3 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                                                    <span className="w-0.5 h-1.5 bg-pink-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0" onClick={() => onPlaySong(song, displaySongs)}>
                                            <h3 className={`font-semibold truncate text-sm md:text-base ${isCurrentSong ? 'text-pink-500' : 'text-zinc-900 dark:text-white'}`}>{song.title}</h3>
                                            <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 truncate">{song.style}</p>
                                            <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                                                <span className="flex items-center gap-1"><Heart size={10} className={isLiked ? 'fill-pink-500 text-pink-500' : ''} /> {song.likeCount || 0}</span>
                                                <span className="flex items-center gap-1"><Play size={10} /> {song.viewCount || 0}</span>
                                                <span>{song.duration}</span>
                                            </div>
                                        </div>
                                        {onToggleLike && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onToggleLike(song.id); }}
                                                className={`p-2 rounded-full transition-colors flex-shrink-0 ${isLiked ? 'text-pink-500' : 'text-zinc-400 hover:text-pink-500'}`}
                                            >
                                                <Heart size={18} className={isLiked ? 'fill-current' : ''} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* Playlists Section */}
                {publicPlaylists.length > 0 && (
                    <section>
                        <div className="flex items-center justify-between mb-4 md:mb-6">
                            <h2 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white">{t('user.playlists')}</h2>
                            <button className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors text-sm">
                                {t('user.seeMore')} <ChevronRight size={18} />
                            </button>
                        </div>
                        <div className="flex gap-3 md:gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-700 scrollbar-track-transparent -mx-4 px-4 md:mx-0 md:px-0">
                            {publicPlaylists.map((playlist: any) => (
                                <div
                                    key={playlist.id}
                                    onClick={() => onNavigateToPlaylist?.(playlist.id)}
                                    className="group relative flex-shrink-0 w-36 md:w-48 cursor-pointer"
                                >
                                    <div className="aspect-square rounded-lg bg-gradient-to-br from-indigo-600 to-purple-700 mb-2 md:mb-3 flex items-center justify-center relative overflow-hidden">
                                        <MusicIcon size={48} className="text-white/30 md:w-16 md:h-16" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-white flex items-center justify-center">
                                                <Play size={20} className="text-black fill-black ml-1 md:w-6 md:h-6" />
                                            </div>
                                        </div>
                                    </div>
                                    <h3 className="font-semibold text-zinc-900 dark:text-white truncate mb-1 text-sm md:text-base">{playlist.name}</h3>
                                    <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400">{playlist.song_count} songs</p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>

            {/* Edit Profile Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <div className="px-4 md:px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between sticky top-0 bg-white dark:bg-zinc-900 z-10">
                            <h2 className="text-lg md:text-xl font-bold text-zinc-900 dark:text-white">{t('user.editProfile')}</h2>
                            <button onClick={() => setIsEditModalOpen(false)} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-4 md:p-6 space-y-6">
                            {/* Avatar Upload */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('user.avatar')}</label>
                                <div className="flex gap-4 items-center">
                                    <div className="w-20 h-20 rounded-full bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-300 dark:border-zinc-700 border-dashed overflow-hidden flex-shrink-0 relative">
                                        {(avatarPreview || editAvatarUrl) ? (
                                            <img
                                                src={avatarPreview || editAvatarUrl}
                                                className="w-full h-full object-cover"
                                                onError={(e) => (e.currentTarget.style.display = 'none')}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-zinc-400 dark:text-zinc-500">
                                                <Camera size={24} />
                                            </div>
                                        )}
                                        {uploadingAvatar && (
                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                                <Loader2 size={20} className="animate-spin text-white" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <input
                                            ref={avatarInputRef}
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp,image/gif"
                                            onChange={handleAvatarChange}
                                            className="hidden"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => avatarInputRef.current?.click()}
                                            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
                                        >
                                            <Upload size={16} />
                                            {t('user.uploadAvatar')}
                                        </button>
                                        <p className="text-xs text-zinc-500">JPG, PNG, WebP, GIF • Max 5MB</p>
                                    </div>
                                </div>
                            </div>

                            {/* Banner Upload */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('user.banner')}</label>
                                <div
                                    onClick={() => bannerInputRef.current?.click()}
                                    className="relative w-full h-32 rounded-lg bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-300 dark:border-zinc-700 border-dashed overflow-hidden cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                                >
                                    {(bannerPreview || editBannerUrl) ? (
                                        <img
                                            src={bannerPreview || editBannerUrl}
                                            className="w-full h-full object-cover"
                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500 gap-2">
                                            <ImageIcon size={32} />
                                            <span className="text-sm">{t('user.uploadBanner')}</span>
                                        </div>
                                    )}
                                    {uploadingBanner && (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                            <Loader2 size={24} className="animate-spin text-white" />
                                        </div>
                                    )}
                                </div>
                                <input
                                    ref={bannerInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    onChange={handleBannerChange}
                                    className="hidden"
                                />
                                <p className="text-xs text-zinc-500">Recommended: 1500x500px • JPG, PNG, WebP, GIF • Max 5MB</p>
                            </div>

                            {/* Bio Input */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('user.bio')}</label>
                                <textarea
                                    value={editBio}
                                    onChange={(e) => setEditBio(e.target.value)}
                                    placeholder={t('user.bioPlaceholder')}
                                    rows={4}
                                    className="w-full bg-zinc-50 dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-pink-500 dark:focus:border-indigo-500 transition-colors resize-none"
                                />
                            </div>
                        </div>

                        <div className="px-4 md:px-6 py-4 bg-zinc-50 dark:bg-black/20 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3 sticky bottom-0">
                            <button
                                onClick={() => {
                                    setIsEditModalOpen(false);
                                    setAvatarFile(null);
                                    setBannerFile(null);
                                    setAvatarPreview(null);
                                    setBannerPreview(null);
                                }}
                                className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
                                disabled={isSaving}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleSaveProfile}
                                disabled={isSaving || uploadingAvatar || uploadingBanner}
                                className="px-6 py-2 bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-full text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isSaving && <Loader2 size={16} className="animate-spin" />}
                                {uploadingAvatar ? t('user.uploadingAvatar') : uploadingBanner ? t('user.uploadingBanner') : isSaving ? t('common.saving') : t('actions.saveChanges')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};