import React, { useState } from 'react';
import { X, User as UserIcon, Palette, Info, Edit3, ExternalLink, Github } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { EditProfileModal } from './EditProfileModal';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
    onNavigateToProfile?: (username: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, theme, onToggleTheme, onNavigateToProfile }) => {
    const { user } = useAuth();
    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);

    // LM Settings State
    const [lmBackend, setLmBackend] = useState<'gemini' | 'koboldcpp' | 'local'>(() => {
        return (localStorage.getItem('ace-lm-backend') as any) || 'local';
    });
    const [geminiApiKey, setGeminiApiKey] = useState(() => {
        return localStorage.getItem('ace-gemini-api-key') || '';
    });
    const [koboldApiUrl, setKoboldApiUrl] = useState(() => {
        return localStorage.getItem('ace-kobold-api-url') || 'http://localhost:5001/api/v1/generate';
    });
    const [lyricsPrompt, setLyricsPrompt] = useState(() => {
        return localStorage.getItem('ace-lyrics-prompt') || 'Generate professional song lyrics based on the topic: "{{topic}}". \nStyle requested: {{style}}. \nFormat with [Verse], [Chorus] headers. \nReturn only the lyrics.';
    });
    const [stylePrompt, setStylePrompt] = useState(() => {
        return localStorage.getItem('ace-style-prompt') || 'Based on the user topic: "{{topic}}", suggest a detailed music style description (genre, mood, instruments). \nKeep it concise (1-2 sentences).';
    });
    const [titlePrompt, setTitlePrompt] = useState(() => {
        return localStorage.getItem('ace-title-prompt') || 'Based on the lyrics or topic: "{{topic}}", suggest a catchy song title. \nReturn only the title.';
    });

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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-white/5">
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Settings</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-full transition-colors"
                    >
                        <X size={20} className="text-zinc-500" />
                    </button>
                </div>

                <div className="p-6 space-y-8">
                    {/* User Profile Section */}
                    <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-6">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg overflow-hidden">
                                {user.avatar_url ? (
                                    <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                                ) : (
                                    user.username[0].toUpperCase()
                                )}
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">@{user.username}</h3>
                                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                                    Member since {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
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
                                    Edit Profile
                                </button>
                                <button
                                    onClick={() => {
                                        onClose();
                                        onNavigateToProfile?.(user.username);
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg text-sm font-medium hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
                                >
                                    <ExternalLink size={16} />
                                    View Profile
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Account Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-zinc-900 dark:text-white">
                            <UserIcon size={20} />
                            <h3 className="font-semibold">Account</h3>
                        </div>
                        <div className="pl-7 space-y-3">
                            <div>
                                <label className="text-sm text-zinc-500 dark:text-zinc-400">Username</label>
                                <p className="text-zinc-900 dark:text-white font-medium">@{user.username}</p>
                            </div>
                        </div>
                    </div>

                    {/* Theme Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-zinc-900 dark:text-white">
                            <Palette size={20} />
                            <h3 className="font-semibold">Appearance</h3>
                        </div>
                        <div className="pl-7 space-y-3">
                            <div className="flex gap-3">
                                <button
                                    onClick={theme === 'dark' ? onToggleTheme : undefined}
                                    className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-colors ${theme === 'light'
                                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                            : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600'
                                        }`}
                                >
                                    Light
                                </button>
                                <button
                                    onClick={theme === 'light' ? onToggleTheme : undefined}
                                    className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-colors ${theme === 'dark'
                                            ? 'border-indigo-500 bg-indigo-950 text-indigo-300'
                                            : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600'
                                        }`}
                                >
                                    Dark
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* LM Settings Section */}
                    <div className="space-y-6 pt-4 border-t border-zinc-200 dark:border-white/5">
                        <div className="flex items-center gap-2 text-zinc-900 dark:text-white">
                            <Edit3 size={20} />
                            <h3 className="font-semibold">AI Text Generation (LM)</h3>
                        </div>
                        
                        <div className="pl-7 space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Backend</label>
                                <div className="flex flex-wrap gap-2">
                                    {['gemini', 'koboldcpp', 'local'].map((b) => (
                                        <button
                                            key={b}
                                            onClick={() => {
                                                setLmBackend(b as any);
                                                localStorage.setItem('ace-lm-backend', b);
                                            }}
                                            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                                                lmBackend === b
                                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                                    : 'bg-transparent text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                                            }`}
                                        >
                                            {b === 'gemini' ? 'Google Gemini' : b === 'koboldcpp' ? 'Koboldcpp' : 'Local (ACE-Step)'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {lmBackend === 'gemini' && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Gemini API Key</label>
                                    <input
                                        type="password"
                                        value={geminiApiKey}
                                        onChange={(e) => {
                                            setGeminiApiKey(e.target.value);
                                            localStorage.setItem('ace-gemini-api-key', e.target.value);
                                        }}
                                        placeholder="Enter your Google Gemini API Key"
                                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <p className="text-[11px] text-zinc-500">Used for lyric and style generation.</p>
                                </div>
                            )}

                            {lmBackend === 'koboldcpp' && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
                                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Koboldcpp API URL</label>
                                    <input
                                        type="text"
                                        value={koboldApiUrl}
                                        onChange={(e) => {
                                            setKoboldApiUrl(e.target.value);
                                            localStorage.setItem('ace-kobold-api-url', e.target.value);
                                        }}
                                        placeholder="http://localhost:5001/api/v1/generate"
                                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <p className="text-[11px] text-zinc-500">The base URL for your Koboldcpp instance.</p>
                                </div>
                            )}

                            <div className="space-y-3 pt-2">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Lyrics Generation Prompt</label>
                                    <textarea
                                        value={lyricsPrompt}
                                        onChange={(e) => {
                                            setLyricsPrompt(e.target.value);
                                            localStorage.setItem('ace-lyrics-prompt', e.target.value);
                                        }}
                                        className="w-full h-24 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-2 text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                    />
                                    <p className="text-[10px] text-zinc-500">Use {"{{topic}}"} and {"{{style}}"} as placeholders.</p>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Style Generation Prompt</label>
                                    <textarea
                                        value={stylePrompt}
                                        onChange={(e) => {
                                            setStylePrompt(e.target.value);
                                            localStorage.setItem('ace-style-prompt', e.target.value);
                                        }}
                                        className="w-full h-24 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-2 text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                    />
                                    <p className="text-[10px] text-zinc-500">Use {"{{topic}}"} as placeholder.</p>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Title Generation Prompt</label>
                                    <textarea
                                        value={titlePrompt}
                                        onChange={(e) => {
                                            setTitlePrompt(e.target.value);
                                            localStorage.setItem('ace-title-prompt', e.target.value);
                                        }}
                                        className="w-full h-24 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-2 text-xs font-mono text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                    />
                                    <p className="text-[10px] text-zinc-500">Use {"{{topic}}"} as placeholder.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* About Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-zinc-900 dark:text-white">
                            <Info size={20} />
                            <h3 className="font-semibold">About</h3>
                        </div>
                        <div className="pl-7 space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
                            <p>Version 1.0.0</p>
                            <p>ACE-Step UI - Local AI Music Generator</p>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">
                                Powered by ACE-Step 1.5. Open source and free to use.
                            </p>
                            <div className="pt-3 border-t border-zinc-200 dark:border-zinc-700/50 mt-4">
                                <p className="text-zinc-900 dark:text-white font-medium mb-3">Created by Ambsd</p>
                                <div className="flex flex-wrap gap-2">
                                    <a
                                        href="https://x.com/AmbsdOP"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                                    >
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                        </svg>
                                        Follow @AmbsdOP
                                    </a>
                                    <a
                                        href="https://github.com/fspecii/ace-step-ui"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 dark:bg-zinc-700 text-white rounded-lg text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
                                    >
                                        <Github size={16} />
                                        GitHub Repo
                                    </a>
                                </div>
                                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-3">
                                    Report issues or request features on GitHub
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-zinc-200 dark:border-white/5 p-6 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-zinc-900 dark:bg-white text-white dark:text-black font-semibold rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
                    >
                        Done
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
