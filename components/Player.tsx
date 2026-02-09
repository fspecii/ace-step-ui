import React, { useRef, useState, useEffect } from 'react';
import { Song } from '../types';
import { Play, Pause, SkipBack, SkipForward, Repeat, Shuffle, Download, Heart, MoreVertical, Volume2, VolumeX, Maximize2, Repeat1, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useResponsive } from '../context/ResponsiveContext';
import { SongDropdownMenu } from './SongDropdownMenu';
import { ShareModal } from './ShareModal';
import { AlbumCover } from './AlbumCover';
import { useTranslation } from 'react-i18next';

interface PlayerProps {
    currentSong: Song | null;
    isPlaying: boolean;
    onTogglePlay: () => void;
    currentTime: number;
    duration: number;
    onSeek: (time: number) => void;
    onNext: () => void;
    onPrevious: () => void;
    volume: number;
    onVolumeChange: (val: number) => void;
    isShuffle: boolean;
    onToggleShuffle: () => void;
    repeatMode: 'none' | 'all' | 'one';
    onToggleRepeat: () => void;
    isLiked: boolean;
    onToggleLike: () => void;
    onNavigateToSong?: (songId: string) => void;
    onOpenVideo?: () => void;
    onReusePrompt?: () => void;
    onAddToPlaylist?: () => void;
    onDelete?: () => void;
}

export const Player: React.FC<PlayerProps> = ({
    currentSong,
    isPlaying,
    onTogglePlay,
    currentTime,
    duration,
    onSeek,
    onNext,
    onPrevious,
    volume,
    onVolumeChange,
    isShuffle,
    onToggleShuffle,
    repeatMode,
    onToggleRepeat,
    isLiked,
    onToggleLike,
    onNavigateToSong,
    onOpenVideo,
    onReusePrompt,
    onAddToPlaylist,
    onDelete
}) => {
    const { user } = useAuth();
    const { isMobile } = useResponsive();
    const { t } = useTranslation();
    const progressBarRef = useRef<HTMLDivElement>(null);
    const fullscreenProgressRef = useRef<HTMLDivElement>(null);
    const [isHoveringVolume, setIsHoveringVolume] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [shareModalOpen, setShareModalOpen] = useState(false);

    // Close fullscreen on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFullscreen) {
                setIsFullscreen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isFullscreen]);

    // Show minimal player when no song is playing
    if (!currentSong) {
        return (
            <div className="h-20 lg:h-24 bg-white dark:bg-black/95 backdrop-blur border-t border-zinc-200 dark:border-white/10 flex items-center justify-center z-50 transition-colors duration-300 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] dark:shadow-none">
                <div className="flex items-center gap-3 text-zinc-400 dark:text-zinc-600">
                    <div className="w-10 h-10 lg:w-12 lg:h-12 rounded bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center">
                        <Play size={20} className="text-zinc-400 dark:text-zinc-600" />
                    </div>
                    <span className="text-sm font-medium">{t('player.selectSong')}</span>
                </div>
            </div>
        );
    }

    const formatTime = (time: number) => {
        if (isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const handleSeekInteraction = (e: React.MouseEvent<HTMLDivElement>, ref: React.RefObject<HTMLDivElement>) => {
        if (!ref.current || !duration) return;
        const rect = ref.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        const percentage = Math.max(0, Math.min(1, x / width));
        onSeek(percentage * duration);
    };

    const progressPercent = duration ? (currentTime / duration) * 100 : 0;

    const handleDownload = async () => {
        if (!currentSong?.audioUrl) return;
        try {
            const response = await fetch(currentSong.audioUrl);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${currentSong.title || 'song'}.mp3`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download failed:', error);
        }
    };

    if (isMobile) {
        if (isFullscreen) {
            return (
                <div className="fixed inset-0 z-50 bg-gradient-to-b from-zinc-100 to-zinc-50 dark:from-zinc-900 dark:to-black flex flex-col safe-area-inset-top safe-area-inset-bottom transition-colors duration-300">
                    {/* Header with close button */}
                    <div className="flex items-center justify-between px-4 py-3">
                        <button
                            onClick={() => setIsFullscreen(false)}
                            className="p-2 text-zinc-600 dark:text-white/70 tap-highlight-none"
                        >
                            <ChevronDown size={28} />
                        </button>
                        <span className="text-xs text-zinc-500 dark:text-white/50 uppercase tracking-wider">{t('player.nowPlaying')}</span>
                        <div className="w-11" />
                    </div>

                    {/* Album Art */}
                    <div className="flex-1 flex items-center justify-center px-8 py-4">
                        <div className="w-full max-w-[280px] aspect-square rounded-lg overflow-hidden shadow-2xl">
                            {currentSong.coverUrl ? (
                                <img
                                    src={currentSong.coverUrl}
                                    className="w-full h-full object-cover"
                                    alt="cover"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
                                />
                            ) : null}
                            <AlbumCover seed={currentSong.id || currentSong.title} size="full" className={`w-full h-full ${currentSong.coverUrl ? 'hidden' : ''}`} />
                        </div>
                    </div>

                    {/* Song Info */}
                    <div className="px-6 mb-4">
                        <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0 mr-4">
                                <h2
                                    onClick={() => {
                                        setIsFullscreen(false);
                                        onNavigateToSong?.(currentSong.id);
                                    }}
                                    className="text-xl font-bold text-zinc-900 dark:text-white truncate"
                                >
                                    {currentSong.title}
                                </h2>
                                <p className="text-sm text-zinc-500 dark:text-white/60 truncate mt-1">
                                    {currentSong.creator || t('common.unknownArtist')}
                                </p>
                            </div>
                            <button
                                onClick={onToggleLike}
                                className={`p-2 tap-highlight-none ${isLiked ? 'text-pink-600 dark:text-pink-500' : 'text-zinc-400 dark:text-white/50'}`}
                            >
                                <Heart size={24} fill={isLiked ? "currentColor" : "none"} />
                            </button>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="px-6 mb-2">
                        <div
                            ref={fullscreenProgressRef}
                            className="w-full h-1.5 bg-zinc-300 dark:bg-white/20 rounded-full cursor-pointer relative"
                            onClick={(e) => handleSeekInteraction(e, fullscreenProgressRef)}
                        >
                            <div
                                className="h-full bg-zinc-900 dark:bg-white rounded-full relative"
                                style={{ width: `${progressPercent}%` }}
                            >
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-zinc-900 dark:bg-white rounded-full shadow-lg -mr-2" />
                            </div>
                        </div>
                        <div className="flex justify-between mt-2 text-xs text-zinc-500 dark:text-white/50 font-mono">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration || 0)}</span>
                        </div>
                    </div>

                    {/* Main Controls */}
                    <div className="flex items-center justify-center gap-8 py-4">
                        <button
                            onClick={onToggleShuffle}
                            className={`p-2 tap-highlight-none ${isShuffle ? 'text-pink-600 dark:text-pink-500' : 'text-zinc-400 dark:text-white/50'}`}
                        >
                            <Shuffle size={22} />
                        </button>
                        <button
                            onClick={onPrevious}
                            className="p-2 text-zinc-800 dark:text-white tap-highlight-none"
                        >
                            <SkipBack size={32} fill="currentColor" />
                        </button>
                        <button
                            onClick={onTogglePlay}
                            className="w-16 h-16 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black flex items-center justify-center shadow-lg tap-highlight-none"
                        >
                            {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
                        </button>
                        <button
                            onClick={onNext}
                            className="p-2 text-zinc-800 dark:text-white tap-highlight-none"
                        >
                            <SkipForward size={32} fill="currentColor" />
                        </button>
                        <button
                            onClick={onToggleRepeat}
                            className={`p-2 tap-highlight-none relative ${repeatMode !== 'none' ? 'text-pink-600 dark:text-pink-500' : 'text-zinc-400 dark:text-white/50'}`}
                        >
                            {repeatMode === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}
                        </button>
                    </div>

                    {/* Volume Control */}
                    <div className="flex items-center gap-3 px-6 py-4">
                        <button
                            onClick={() => onVolumeChange(volume === 0 ? 0.8 : 0)}
                            className="text-zinc-400 dark:text-white/50 tap-highlight-none"
                        >
                            {volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                        </button>
                        <div className="flex-1 h-1 bg-zinc-300 dark:bg-white/20 rounded-full relative">
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={volume}
                                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div
                                className="h-full bg-zinc-700 dark:bg-white/70 rounded-full"
                                style={{ width: `${volume * 100}%` }}
                            />
                        </div>
                    </div>

                    {/* Extra Actions */}
                    <div className="flex items-center justify-center gap-6 px-6 pb-6 text-zinc-400 dark:text-white/50">
                        {onOpenVideo && (
                            <button onClick={onOpenVideo} className="p-3 tap-highlight-none">
                                <Maximize2 size={20} />
                            </button>
                        )}
                        <button
                            onClick={handleDownload}
                            className="p-3 tap-highlight-none"
                            title={t('actions.downloadAudio')}
                        >
                            <Download size={20} />
                        </button>
                        <button
                            onClick={() => setShowDropdown(!showDropdown)}
                            className="p-3 tap-highlight-none relative"
                        >
                            <MoreVertical size={20} />
                        </button>
                    </div>

                    {showDropdown && (
                        <div className="absolute bottom-24 left-1/2 -translate-x-1/2">
                            <SongDropdownMenu
                                song={currentSong}
                                isOpen={showDropdown}
                                onClose={() => setShowDropdown(false)}
                                isOwner={user?.id === currentSong.userId}
                                position="center"
                                direction="up"
                                onCreateVideo={onOpenVideo}
                                onReusePrompt={onReusePrompt}
                                onAddToPlaylist={onAddToPlaylist}
                                                                onDelete={onDelete}
                                onShare={() => setShareModalOpen(true)}
                            />
                        </div>
                    )}
                </div>
            );
        }

        // Desktop fullscreen mode
        if (isFullscreen) {
            return (
                <div
                    className="fixed inset-0 z-50 bg-gradient-to-b from-zinc-100 to-zinc-50 dark:from-zinc-900 dark:to-black flex flex-col transition-colors duration-300"
                    onClick={() => setIsFullscreen(false)}
                >
                    {/* Header with close button */}
                    <div className="flex items-center justify-between px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => setIsFullscreen(false)}
                            className="p-2 text-zinc-600 dark:text-white/70 hover:bg-zinc-200 dark:hover:bg-white/10 rounded-full transition-colors"
                        >
                            <ChevronDown size={28} />
                        </button>
                        <span className="text-sm text-zinc-500 dark:text-white/50 uppercase tracking-wider font-medium">{t('player.nowPlaying')}</span>
                        <div className="w-11" />
                    </div>

                    {/* Main content area */}
                    <div className="flex-1 flex items-center justify-center px-8 py-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16 max-w-5xl w-full">
                            {/* Album Art */}
                            <div className="w-full max-w-[320px] lg:max-w-[400px] aspect-square rounded-lg overflow-hidden shadow-2xl flex-shrink-0">
                                {currentSong.coverUrl ? (
                                    <img
                                        src={currentSong.coverUrl}
                                        className="w-full h-full object-cover"
                                        alt="cover"
                                        onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
                                    />
                                ) : null}
                                <AlbumCover seed={currentSong.id || currentSong.title} size="full" className={`w-full h-full ${currentSong.coverUrl ? 'hidden' : ''}`} />
                            </div>

                            {/* Right side: Song info and controls */}
                            <div className="flex flex-col items-center lg:items-start gap-6 flex-1 min-w-0 max-w-lg">
                                {/* Song Info */}
                                <div className="text-center lg:text-left w-full">
                                    <h2
                                        onClick={() => {
                                            setIsFullscreen(false);
                                            onNavigateToSong?.(currentSong.id);
                                        }}
                                        className="text-2xl lg:text-3xl font-bold text-zinc-900 dark:text-white truncate cursor-pointer hover:underline"
                                    >
                                        {currentSong.title}
                                    </h2>
                                    <p className="text-base lg:text-lg text-zinc-500 dark:text-white/60 truncate mt-2">
                                        {currentSong.creator || t('common.unknownArtist')}
                                    </p>
                                </div>

                                {/* Progress Bar */}
                                <div className="w-full">
                                    <div
                                        ref={fullscreenProgressRef}
                                        className="w-full h-2 bg-zinc-300 dark:bg-white/20 rounded-full cursor-pointer relative group"
                                        onClick={(e) => handleSeekInteraction(e, fullscreenProgressRef)}
                                    >
                                        <div
                                            className="h-full bg-zinc-900 dark:bg-white rounded-full relative group-hover:bg-pink-600 dark:group-hover:bg-pink-500 transition-colors"
                                            style={{ width: `${progressPercent}%` }}
                                        >
                                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-zinc-900 dark:bg-white group-hover:bg-pink-600 dark:group-hover:bg-pink-500 rounded-full shadow-lg -mr-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </div>
                                    <div className="flex justify-between mt-2 text-sm text-zinc-500 dark:text-white/50 font-mono">
                                        <span>{formatTime(currentTime)}</span>
                                        <span>{formatTime(duration || 0)}</span>
                                    </div>
                                </div>

                                {/* Main Controls */}
                                <div className="flex items-center justify-center gap-8 py-2 w-full">
                                    <button
                                        onClick={onToggleShuffle}
                                        className={`p-2 transition-colors ${isShuffle ? 'text-pink-600 dark:text-pink-500' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}
                                    >
                                        <Shuffle size={22} />
                                    </button>
                                    <button
                                        onClick={onPrevious}
                                        className="p-2 text-zinc-800 dark:text-white hover:scale-110 transition-transform"
                                    >
                                        <SkipBack size={36} fill="currentColor" />
                                    </button>
                                    <button
                                        onClick={onTogglePlay}
                                        className="w-18 h-18 p-5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
                                    >
                                        {isPlaying ? <Pause size={36} fill="currentColor" /> : <Play size={36} fill="currentColor" className="ml-1" />}
                                    </button>
                                    <button
                                        onClick={onNext}
                                        className="p-2 text-zinc-800 dark:text-white hover:scale-110 transition-transform"
                                    >
                                        <SkipForward size={36} fill="currentColor" />
                                    </button>
                                    <button
                                        onClick={onToggleRepeat}
                                        className={`p-2 transition-colors relative ${repeatMode !== 'none' ? 'text-pink-600 dark:text-pink-500' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}
                                    >
                                        {repeatMode === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}
                                        {repeatMode !== 'none' && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-current rounded-full"></div>}
                                    </button>
                                </div>

                                {/* Volume Control */}
                                <div className="flex items-center gap-4 w-full max-w-xs">
                                    <button
                                        onClick={() => onVolumeChange(volume === 0 ? 0.8 : 0)}
                                        className="text-zinc-500 dark:text-white/50 hover:text-zinc-900 dark:hover:text-white transition-colors"
                                    >
                                        {volume === 0 ? <VolumeX size={22} /> : <Volume2 size={22} />}
                                    </button>
                                    <div className="flex-1 h-1.5 bg-zinc-300 dark:bg-white/20 rounded-full relative">
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.01"
                                            value={volume}
                                            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        />
                                        <div
                                            className="h-full bg-zinc-700 dark:bg-white/70 rounded-full"
                                            style={{ width: `${volume * 100}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Extra Actions */}
                                <div className="flex items-center justify-center gap-4 text-zinc-400 dark:text-white/50">
                                    <button
                                        onClick={onToggleLike}
                                        className={`p-3 rounded-full hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors ${isLiked ? 'text-pink-600 dark:text-pink-500' : ''}`}
                                    >
                                        <Heart size={22} fill={isLiked ? "currentColor" : "none"} />
                                    </button>
                                    {onOpenVideo && (
                                        <button
                                            onClick={onOpenVideo}
                                            className="p-3 rounded-full hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
                                        >
                                            <Maximize2 size={20} />
                                        </button>
                                    )}
                                    <button
                                        onClick={handleDownload}
                                        className="p-3 rounded-full hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
                                        title={t('actions.downloadAudio')}
                                    >
                                        <Download size={20} />
                                    </button>
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowDropdown(!showDropdown)}
                                            className="p-3 rounded-full hover:bg-zinc-200 dark:hover:bg-white/10 transition-colors"
                                        >
                                            <MoreVertical size={20} />
                                        </button>
                                        {showDropdown && (
                                            <SongDropdownMenu
                                                song={currentSong}
                                                isOpen={showDropdown}
                                                onClose={() => setShowDropdown(false)}
                                                isOwner={user?.id === currentSong.userId}
                                                position="center"
                                                direction="up"
                                                onCreateVideo={onOpenVideo}
                                                onReusePrompt={onReusePrompt}
                                                onAddToPlaylist={onAddToPlaylist}
                                                onDelete={onDelete}
                                                onShare={() => setShareModalOpen(true)}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <ShareModal
                        isOpen={shareModalOpen}
                        onClose={() => setShareModalOpen(false)}
                        song={currentSong}
                    />
                </div>
            );
        }

        return (
            <div className="h-20 lg:h-24 bg-white dark:bg-black/95 backdrop-blur border-t border-zinc-200 dark:border-white/10 flex flex-col z-50 transition-colors duration-300 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] dark:shadow-none">

                {/* Progress Bar */}
                <div
                    ref={progressBarRef}
                    className="w-full h-1 lg:h-1.5 bg-zinc-200 dark:bg-zinc-800 cursor-pointer group relative"
                    onClick={(e) => handleSeekInteraction(e, progressBarRef)}
                >
                    <div
                        className="h-full bg-zinc-900 dark:bg-white relative group-hover:bg-pink-600 dark:group-hover:bg-pink-500 transition-colors"
                        style={{ width: `${progressPercent}%` }}
                    >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-zinc-900 dark:bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg scale-150"></div>
                    </div>
                    {/* Hit area for easier clicking */}
                    <div className="absolute top-1/2 -translate-y-1/2 w-full h-4 -z-10"></div>
                </div>

                <div className="flex-1 flex items-center justify-between px-2 sm:px-4 lg:px-6 gap-2 sm:gap-4">

                    {/* Song Info */}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 max-w-[30%] lg:max-w-[33%]">
                        <div className="w-10 h-10 lg:w-12 lg:h-12 rounded bg-zinc-200 dark:bg-zinc-800 overflow-hidden shadow-sm flex-shrink-0">
                            {currentSong.coverUrl ? (
                                <img src={currentSong.coverUrl} className="w-full h-full object-cover" alt="cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            ) : null}
                            {!currentSong.coverUrl && <AlbumCover seed={currentSong.id || currentSong.title} size="full" className="w-full h-full" />}
                        </div>
                        <div className="overflow-hidden min-w-0">
                            <h4
                                onClick={() => onNavigateToSong?.(currentSong.id)}
                                className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white truncate cursor-pointer hover:underline"
                            >
                                {currentSong.title}
                            </h4>
                            <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 truncate hover:underline cursor-pointer">{currentSong.creator || t('common.unknownArtist')}</p>
                        </div>
                        <button
                            onClick={onToggleLike}
                            className={`ml-1 sm:ml-2 transition-colors flex-shrink-0 hidden sm:block ${isLiked ? 'text-pink-600 dark:text-pink-500' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}
                        >
                            <Heart size={18} fill={isLiked ? "currentColor" : "none"} />
                        </button>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-col items-center justify-center flex-shrink-0">
                        <div className="flex items-center gap-2 sm:gap-4 lg:gap-6">
                            <button
                                onClick={onToggleShuffle}
                                className={`transition-colors hidden sm:block ${isShuffle ? 'text-pink-600 dark:text-pink-500' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'}`}
                            >
                                <Shuffle size={16} />
                            </button>
                            <button
                                onClick={onPrevious}
                                className="text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white transition-colors"
                            >
                                <SkipBack size={18} className="sm:w-[22px] sm:h-[22px]" fill="currentColor" />
                            </button>
                            <button
                                onClick={onTogglePlay}
                                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-black flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
                            >
                                {isPlaying ? <Pause size={18} className="sm:w-5 sm:h-5" fill="currentColor" /> : <Play size={18} className="sm:w-5 sm:h-5 ml-0.5" fill="currentColor" />}
                            </button>
                            <button
                                onClick={onNext}
                                className="text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white transition-colors"
                            >
                                <SkipForward size={18} className="sm:w-[22px] sm:h-[22px]" fill="currentColor" />
                            </button>
                            <button
                                onClick={onToggleRepeat}
                                className={`transition-colors hidden sm:block ${repeatMode !== 'none' ? 'text-pink-600 dark:text-pink-500' : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'} relative`}
                            >
                                {repeatMode === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
                                {repeatMode !== 'none' && <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-current rounded-full"></div>}
                            </button>
                        </div>
                    </div>

                    {/* Volume & Extras */}
                    <div className="flex items-center justify-end gap-1 sm:gap-2 lg:gap-3 min-w-0 flex-1 max-w-[30%] lg:max-w-[33%] text-zinc-500 dark:text-zinc-400">
                        <span className="text-[10px] sm:text-xs font-mono text-right text-zinc-600 dark:text-zinc-400 hidden md:block">
                            {formatTime(currentTime)} / {formatTime(duration || 0)}
                        </span>

                        <div
                            className="items-center gap-2 relative group hidden md:flex"
                            onMouseEnter={() => setIsHoveringVolume(true)}
                            onMouseLeave={() => setIsHoveringVolume(false)}
                        >
                            <button
                                onClick={() => onVolumeChange(volume === 0 ? 0.8 : 0)}
                                className="p-1.5 lg:p-2 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-full transition-colors"
                            >
                                {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                            </button>

                            {/* Volume Slider */}
                            <div className={`h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full cursor-pointer overflow-hidden transition-all duration-200 ${isHoveringVolume ? 'opacity-100 w-16 lg:w-24 mx-1 lg:mx-2' : 'opacity-0 w-0 mx-0 pointer-events-none'}`}>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    value={volume}
                                    onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                                    className="w-full h-full opacity-0 cursor-pointer absolute z-10"
                                />
                                <div
                                    className="h-full bg-zinc-900 dark:bg-white rounded-full"
                                    style={{ width: `${volume * 100}%` }}
                                ></div>
                            </div>
                        </div>

                        <button
                            onClick={handleDownload}
                            className="p-1.5 lg:p-2 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-full transition-colors hidden lg:block"
                            title={t('actions.downloadAudio')}
                        >
                            <Download size={18} />
                        </button>
                        <button
                            onClick={() => setIsFullscreen(true)}
                            className="p-1.5 lg:p-2 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-full transition-colors"
                        >
                            <Maximize2 size={16} />
                        </button>
                        <div className="relative hidden sm:block">
                            <button
                                onClick={() => setShowDropdown(!showDropdown)}
                                className="p-1.5 lg:p-2 hover:bg-zinc-100 dark:hover:bg-white/10 rounded-full transition-colors"
                            >
                                <MoreVertical size={18} />
                            </button>
                            <SongDropdownMenu
                                song={currentSong}
                                isOpen={showDropdown}
                                onClose={() => setShowDropdown(false)}
                                isOwner={user?.id === currentSong.userId}
                                position="right"
                                direction="up"
                                onCreateVideo={onOpenVideo}
                                onReusePrompt={onReusePrompt}
                                onAddToPlaylist={onAddToPlaylist}
                                onDelete={onDelete}
                                onShare={() => setShareModalOpen(true)}
                            />
                        </div>
                    </div>
                </div>

                <ShareModal
                    isOpen={shareModalOpen}
                    onClose={() => setShareModalOpen(false)}
                    song={currentSong}
                />
            </div>
        );
    };
};
