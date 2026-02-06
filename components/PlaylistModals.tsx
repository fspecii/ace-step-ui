import React, { useState } from 'react';
import { X, Plus, Music } from 'lucide-react';
import { Playlist } from '../types';
import { useI18n } from '../context/I18nContext';

interface CreatePlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
}

export const CreatePlaylistModal: React.FC<CreatePlaylistModalProps> = ({ isOpen, onClose, onCreate }) => {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(name, description);
      setName('');
      setDescription('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{t('createPlaylist')}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase mb-1">{t('playlistName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-black/50 border border-zinc-200 dark:border-white/10 rounded-lg p-3 text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 placeholder-zinc-400 dark:placeholder-zinc-600"
              placeholder={t('playlistNamePlaceholder')}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase mb-1">{t('playlistDescription')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-black/50 border border-zinc-200 dark:border-white/10 rounded-lg p-3 text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 resize-none h-24 placeholder-zinc-400 dark:placeholder-zinc-600"
              placeholder={t('descriptionPlaceholder')}
            />
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 rounded-lg text-sm font-bold bg-zinc-900 dark:bg-white text-white dark:text-black hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 shadow-lg"
            >
              {t('createButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface AddToPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlists: Playlist[];
  onSelect: (playlistId: string) => void;
  onCreateNew?: () => void;
}

export const AddToPlaylistModal: React.FC<AddToPlaylistModalProps> = ({ isOpen, onClose, playlists, onSelect, onCreateNew }) => {
  const { t } = useI18n();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl w-full max-w-sm p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{t('addToPlaylist')}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Create New Button - Always visible at top */}
        <button
          onClick={onCreateNew}
          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors group mb-3 border border-dashed border-zinc-300 dark:border-white/20 hover:border-zinc-400 dark:hover:border-white/40"
        >
          <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800/50 rounded flex items-center justify-center text-zinc-600 dark:text-white/70 group-hover:text-zinc-900 dark:group-hover:text-white">
            <Plus size={20} />
          </div>
          <div className="text-left">
            <div className="font-semibold text-zinc-700 dark:text-white/90 group-hover:text-zinc-900 dark:group-hover:text-white">{t('createNewPlaylist')}</div>
          </div>
        </button>

        <div className="h-px bg-zinc-100 dark:bg-white/10 my-2"></div>

        <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
          {playlists.length === 0 ? (
            <div className="text-center py-6 text-zinc-500 text-sm italic">
              {t('noExistingPlaylists')}
            </div>
          ) : (
            playlists.map(playlist => (
              <button
                key={playlist.id}
                onClick={() => {
                  onSelect(playlist.id);
                  onClose();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors group"
              >
                <div className="w-10 h-10 bg-zinc-200 dark:bg-zinc-800 rounded flex items-center justify-center text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white flex-shrink-0 overflow-hidden">
                  {playlist.coverUrl ? (
                    <img src={playlist.coverUrl} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <Music size={18} />
                  )}
                </div>
                <div className="text-left overflow-hidden">
                  <div className="font-medium text-zinc-900 dark:text-white truncate">{playlist.name}</div>
                  <div className="text-xs text-zinc-500">{playlist.song_count || playlist.songIds?.length || 0} {t('songs')}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};