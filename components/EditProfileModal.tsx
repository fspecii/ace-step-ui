import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, Image as ImageIcon, Upload, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usersApi, UserProfile } from '../services/api';
import { useI18n } from '../context/I18nContext';

interface EditProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved?: () => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({ isOpen, onClose, onSaved }) => {
    const { t } = useI18n();
    const { user, token, refreshUser, updateUsername } = useAuth();
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<UserProfile | null>(null);

    const [editUsername, setEditUsername] = useState('');
    const [editBio, setEditBio] = useState('');
    const [editAvatarUrl, setEditAvatarUrl] = useState('');
    const [editBannerUrl, setEditBannerUrl] = useState('');
    const [usernameError, setUsernameError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [bannerPreview, setBannerPreview] = useState<string | null>(null);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [uploadingBanner, setUploadingBanner] = useState(false);
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && user && token) {
            loadProfile();
        }
    }, [isOpen, user, token]);

    const loadProfile = async () => {
        if (!user || !token) return;
        setLoading(true);
        try {
            const res = await usersApi.getProfile(user.username, token);
            setProfile(res.user);
            setEditUsername(res.user.username || '');
            setEditBio(res.user.bio || '');
            setEditAvatarUrl(res.user.avatar_url || '');
            setEditBannerUrl(res.user.banner_url || '');
            setUsernameError('');
        } catch (error) {
            console.error('Failed to load profile:', error);
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
        if (!token || !profile) return;
        setIsSaving(true);
        setUsernameError('');

        try {
            // Update username if changed
            if (editUsername && editUsername !== profile.username) {
                const sanitized = editUsername.trim().replace(/[^a-zA-Z0-9_-]/g, '');
                if (sanitized.length < 2) {
                    setUsernameError(t('usernameMinLengthError'));
                    setIsSaving(false);
                    return;
                }
                try {
                    await updateUsername(sanitized);
                } catch (err: unknown) {
                    const error = err as Error & { message?: string };
                    if (error.message?.includes('taken')) {
                        setUsernameError(t('usernameTakenError'));
                    } else {
                        setUsernameError(t('usernameUpdateFailedError'));
                    }
                    setIsSaving(false);
                    return;
                }
            }

            if (avatarFile) {
                setUploadingAvatar(true);
                const avatarRes = await usersApi.uploadAvatar(avatarFile, token);
                setEditAvatarUrl(avatarRes.url);
                setUploadingAvatar(false);
            }

            if (bannerFile) {
                setUploadingBanner(true);
                const bannerRes = await usersApi.uploadBanner(bannerFile, token);
                setEditBannerUrl(bannerRes.url);
                setUploadingBanner(false);
            }

            const updates: Record<string, string> = { bio: editBio };
            if (!avatarFile && editAvatarUrl !== profile.avatar_url) {
                updates.avatarUrl = editAvatarUrl;
            }
            if (!bannerFile && editBannerUrl !== profile.banner_url) {
                updates.bannerUrl = editBannerUrl;
            }

            if (Object.keys(updates).length > 0) {
                await usersApi.updateProfile(updates, token);
            }

            await refreshUser();
            handleClose();
            onSaved?.();
        } catch (error) {
            console.error('Failed to update profile:', error);
            alert('Failed to update profile');
        } finally {
            setIsSaving(false);
            setUploadingAvatar(false);
            setUploadingBanner(false);
        }
    };

    const handleClose = () => {
        setAvatarFile(null);
        setBannerFile(null);
        setAvatarPreview(null);
        setBannerPreview(null);
        setUsernameError('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{t('editProfile')}</h2>
                    <button onClick={handleClose} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {loading ? (
                    <div className="p-12 flex items-center justify-center">
                        <Loader2 size={32} className="animate-spin text-zinc-400 dark:text-zinc-400" />
                    </div>
                ) : (
                    <>
                        <div className="p-6 space-y-6">
                            {/* Username Input */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('usernameLabel')}</label>
                                <div className="flex items-center gap-2">
                                    <span className="text-zinc-500 dark:text-zinc-500">@</span>
                                    <input
                                        type="text"
                                        value={editUsername}
                                        onChange={(e) => {
                                            setEditUsername(e.target.value);
                                            setUsernameError('');
                                        }}
                                        placeholder={t('usernamePlaceholder')}
                                        maxLength={50}
                                        className="flex-1 bg-zinc-50 dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
                                    />
                                </div>
                                {usernameError && (
                                    <p className="text-sm text-red-500">{usernameError}</p>
                                )}
                                <p className="text-xs text-zinc-500 dark:text-zinc-500">{t('usernameRequirements')}</p>
                            </div>

                            {/* Avatar Upload */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('avatarImage')}</label>
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
                                            {t('uploadAvatar')}
                                        </button>
                                        <p className="text-xs text-zinc-500 dark:text-zinc-500">{t('avatarFormats')}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Banner Upload */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('bannerImage')}</label>
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
                                            <span className="text-sm">{t('clickToUploadBanner')}</span>
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
                                <p className="text-xs text-zinc-500 dark:text-zinc-500">{t('bannerFormats')}</p>
                            </div>

                            {/* Bio Input */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('bio')}</label>
                                <textarea
                                    value={editBio}
                                    onChange={(e) => setEditBio(e.target.value)}
                                    placeholder={t('bioPlaceholder')}
                                    rows={4}
                                    className="w-full bg-zinc-50 dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded-lg px-3 py-2 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                                />
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-zinc-50 dark:bg-black/20 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors"
                                disabled={isSaving}
                            >
                                {t('cancel')}
                            </button>
                            <button
                                onClick={handleSaveProfile}
                                disabled={isSaving || uploadingAvatar || uploadingBanner}
                                className="px-6 py-2 bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-200 rounded-full text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isSaving && <Loader2 size={16} className="animate-spin" />}
                                {uploadingAvatar ? t('uploadingAvatar') : uploadingBanner ? t('uploadingBanner') : isSaving ? t('saving') : t('saveChanges')}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
