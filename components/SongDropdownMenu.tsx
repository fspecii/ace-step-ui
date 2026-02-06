import React, { useEffect, useRef } from 'react';
import { Song } from '../types';
import { useI18n } from '../context/I18nContext';
import {
    Video,
    Edit3,
    Layers,
    Repeat,
    ListPlus,
    Download,
    Trash2,
    Share2
} from 'lucide-react';

interface SongDropdownMenuProps {
    song: Song;
    isOpen: boolean;
    onClose: () => void;
    isOwner?: boolean;
    position?: 'left' | 'right';
    direction?: 'up' | 'down';
    onCreateVideo?: () => void;
    onEditAudio?: () => void;
    onExtractStems?: () => void;
    onReusePrompt?: () => void;
    onAddToPlaylist?: () => void;
    onDownload?: () => void;
    onShare?: () => void;
    onDelete?: () => void;
    onUseAsReference?: () => void;
    onCoverSong?: () => void;
}

interface MenuItemProps {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    danger?: boolean;
    disabled?: boolean;
}

const MenuItem: React.FC<MenuItemProps> = ({ icon, label, onClick, danger, disabled }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full px-3 py-2 text-left text-sm flex items-center gap-3 transition-colors
            ${danger
                ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                : 'text-zinc-300 hover:bg-white/5 hover:text-white'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
    >
        <span className="w-4 h-4 flex items-center justify-center opacity-70">{icon}</span>
        <span>{label}</span>
    </button>
);

const MenuDivider: React.FC = () => (
    <div className="h-px bg-white/10 my-1 mx-2" />
);

export const SongDropdownMenu: React.FC<SongDropdownMenuProps> = ({
    song,
    isOpen,
    onClose,
    isOwner = false,
    position = 'right',
    direction = 'down',
    onCreateVideo,
    onEditAudio,
    onExtractStems,
    onReusePrompt,
    onAddToPlaylist,
    onDownload,
    onShare,
    onDelete,
    onUseAsReference,
    onCoverSong
}) => {
    const { t } = useI18n();
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleAction = (action?: () => void) => {
        if (action) {
            action();
        }
        onClose();
    };

    const handleEditAudio = () => {
        if (!song.audioUrl) return;
        const audioUrl = song.audioUrl.startsWith('http')
            ? song.audioUrl
            : `${window.location.origin}${song.audioUrl}`;
        window.open(`/editor?audioUrl=${encodeURIComponent(audioUrl)}`, '_blank');
        onClose();
    };

    const handleExtractStems = () => {
        if (!song.audioUrl) return;
        const baseUrl = window.location.port === '3000'
            ? `${window.location.protocol}//${window.location.hostname}:3001`
            : window.location.origin;
        const audioUrl = song.audioUrl.startsWith('http')
            ? song.audioUrl
            : `${baseUrl}${song.audioUrl}`;
        window.open(`${baseUrl}/demucs-web/?audioUrl=${encodeURIComponent(audioUrl)}`, '_blank');
        onClose();
    };

    const handleDownload = async () => {
        if (!song.audioUrl) return;
        try {
            // Fetch as blob to handle cross-origin
            const response = await fetch(song.audioUrl);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `${song.title || 'song'}.mp3`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up blob URL
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download failed:', error);
        }
        onClose();
    };

    const positionClasses = position === 'left' ? 'left-0' : 'right-0';
    const directionClasses = direction === 'up'
        ? 'bottom-full mb-2'
        : 'top-full mt-2';
    const animationClasses = direction === 'up'
        ? 'animate-in fade-in slide-in-from-bottom-2'
        : 'animate-in fade-in slide-in-from-top-2';

    return (
        <div
            ref={menuRef}
            className={`absolute ${positionClasses} ${directionClasses} w-52
                bg-zinc-900 rounded-xl shadow-2xl border border-white/10 py-1.5 z-50
                ${animationClasses} duration-150`}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Creative Actions */}
            <MenuItem
                icon={<Video size={14} />}
                label={t('createVideo')}
                onClick={() => handleAction(onCreateVideo)}
            />
            {isOwner && (
                <MenuItem
                    icon={<Edit3 size={14} />}
                    label={t('editAudio')}
                    onClick={onEditAudio ? () => handleAction(onEditAudio) : handleEditAudio}
                />
            )}
            <MenuItem
                icon={<Layers size={14} />}
                label={t('extractStems')}
                onClick={onExtractStems ? () => handleAction(onExtractStems) : handleExtractStems}
            />
            {onReusePrompt && (
                <MenuItem
                    icon={<Repeat size={14} />}
                    label={t('reusePrompt')}
                    onClick={() => handleAction(onReusePrompt)}
                />
            )}
            {onUseAsReference && (
                <MenuItem
                    icon={<Layers size={14} />}
                    label={t('useAsReference')}
                    onClick={() => handleAction(onUseAsReference)}
                    disabled={!song.audioUrl}
                />
            )}
            {onCoverSong && (
                <MenuItem
                    icon={<Layers size={14} />}
                    label={t('coverSong')}
                    onClick={() => handleAction(onCoverSong)}
                    disabled={!song.audioUrl}
                />
            )}

            <MenuDivider />

            {/* Library Actions */}
            <MenuItem
                icon={<ListPlus size={14} />}
                label={t('addToPlaylist')}
                onClick={() => handleAction(onAddToPlaylist)}
            />
            <MenuItem
                icon={<Download size={14} />}
                label={t('download')}
                onClick={onDownload ? () => handleAction(onDownload) : handleDownload}
            />
            <MenuItem
                icon={<Share2 size={14} />}
                label={t('share')}
                onClick={() => handleAction(onShare)}
            />

            {/* Owner-only Actions */}
            {isOwner && (
                <>
                    <MenuDivider />
                    <MenuItem
                        icon={<Trash2 size={14} />}
                        label={t('deleteSong')}
                        onClick={() => handleAction(onDelete)}
                        danger
                    />
                </>
            )}
        </div>
    );
};
