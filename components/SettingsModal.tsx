import React, { useState, useRef, useEffect } from 'react';
import { X, User as UserIcon, Palette, Info, Edit3, ExternalLink, Globe, ChevronDown, Github } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { EditProfileModal } from './EditProfileModal';

const localeMap: Record<string, string> = {
    pt: 'pt-BR',
    en: 'en-US',
    zh: 'zh-CN',
    ja: 'ja-JP',
    ko: 'ko-KR',
};

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
    onNavigateToProfile?: (username: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, theme, onToggleTheme, onNavigateToProfile }) => {
    const { user } = useAuth();
    const { t, language, setLanguage } = useI18n();
    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
    const [showLangInfo, setShowLangInfo] = useState(false);
    const langInfoRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showLangInfo) return;
        const handleClick = (e: MouseEvent) => {
            if (langInfoRef.current && !langInfoRef.current.contains(e.target as Node)) {
                setShowLangInfo(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showLangInfo]);

    if (!isOpen || !user) {
        if (isEditProfileOpen && user) {
            return (
                <EditProfileModal
                    isOpen={isEditProfileOpen}
                    onClose={() => setIsEditProfileOpen(false)}
                    onSaved={() => setIsEditProfileOpen(false)}
                />
            );
        }
        return null;
    }

    return (
        <div
            className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-white/5">
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">
                        {t('settings')}
                    </h2>

                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-full transition-colors"
                    >
                        <X size={20} className="text-zinc-500" />
                    </button>
                </div>

                <div className="p-6 space-y-8">
                    {/* User */}
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-6">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg overflow-hidden">
                                {user.avatar_url ? (
                                    <img
                                        src={user.avatar_url}
                                        alt={user.username}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    user.username[0].toUpperCase()
                                )}
                            </div>

                            <div className="flex-1">
                                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                                    @{user.username}
                                </h3>

                                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                                    {t('memberSince')}{' '}
                                    {new Date(user.createdAt).toLocaleDateString(
                                        localeMap[language] || 'en-US',
                                        {
                                            month: 'long',
                                            year: 'numeric'
                                        }
                                    )}
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        onClose();
                                        setIsEditProfileOpen(true);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                                >
                                    <Edit3 size={16} />
                                    {t('editProfile')}
                                </button>

                                <button
                                    onClick={() => {
                                        onClose();
                                        onNavigateToProfile?.(user.username);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg text-sm font-medium hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
                                >
                                    <ExternalLink size={16} />
                                    {t('viewProfile')}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Language */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-zinc-900 dark:text-white">
                            <Globe size={20} />
                            <h3 className="font-semibold">{t('language')}</h3>
                        </div>

                        <div className="pl-7">
                            <div className="relative">
                                <select
                                    value={language}
                                    onChange={(e) =>
                                        setLanguage(
                                            e.target.value as 'en' | 'zh' | 'ja' | 'ko' | 'pt'
                                        )
                                    }
                                    className="w-full appearance-none py-3 px-4 pr-10 rounded-lg border-2 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium hover:border-zinc-400 dark:hover:border-zinc-600 focus:outline-none focus:border-indigo-500 cursor-pointer"
                                >
                                    <option value="pt">Português (Brasil)</option>
                                    <option value="en">{t('english')}</option>
                                    <option value="zh">{t('chinese')}</option>
                                    <option value="ja">{t('japaneseLanguage')}</option>
                                    <option value="ko">{t('koreanLanguage')}</option>
                                </select>

                                <ChevronDown
                                    size={20}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Theme */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-zinc-900 dark:text-white">
                            <Palette size={20} />
                            <h3 className="font-semibold">{t('appearance')}</h3>
                        </div>

                        <div className="pl-7 flex gap-3">
                            <button
                                onClick={theme === 'dark' ? onToggleTheme : undefined}
                                className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-colors ${theme === 'light'
                                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                    : 'border-zinc-300 dark:border-zinc-700'
                                    }`}
                            >
                                {t('light')}
                            </button>

                            <button
                                onClick={theme === 'light' ? onToggleTheme : undefined}
                                className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-colors ${theme === 'dark'
                                    ? 'border-indigo-500 bg-indigo-950 text-indigo-300'
                                    : 'border-zinc-300 dark:border-zinc-700'
                                    }`}
                            >
                                {t('dark')}
                            </button>
                        </div>
                    </div>

                    {/* About */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-zinc-900 dark:text-white">
                            <Info size={20} />
                            <h3 className="font-semibold">{t('about')}</h3>
                        </div>

                        <div className="pl-7 text-sm text-zinc-600 dark:text-zinc-400 space-y-2">
                            <p>{t('version')} 2.0.0</p>
                            <p>ACE-Step UI - {t('localAIMusicGenerator')}</p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500">
                                {t('poweredBy')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-zinc-200 dark:border-white/5 p-6 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-zinc-900 dark:bg-white text-white dark:text-black font-semibold rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                    >
                        {t('done')}
                    </button>
                </div>
            </div>

            <EditProfileModal
                isOpen={isEditProfileOpen}
                onClose={() => setIsEditProfileOpen(false)}
                onSaved={() => setIsEditProfileOpen(false)}
            />
        </div>
    );
};
