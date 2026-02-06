import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { X, Link, Check } from 'lucide-react';
import { Song } from '../types';
import { useI18n } from '../context/I18nContext';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  song: Song;
}

const XIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const RedditIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
  </svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const TelegramIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const EmailIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, song }) => {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const shareUrl = `${window.location.origin}/song/${song.id}`;

  // Platform-specific share text for better engagement
  const defaultShareText = `🎵 "${song.title}" ${song.style ? `(${song.style})` : ''} - Made with ACE-Step UI`;
  const twitterText = `🔥 Just created "${song.title}" with ACE-Step UI - local AI music generation! ${song.style ? `#${song.style.replace(/\s+/g, '')}` : ''} #AIMusic #ACEStep`;
  const redditTitle = `[AI Music] ${song.title} - ${song.style || 'Original'} | Created with ACE-Step UI`;
  const whatsAppText = `🎧 Listen to this AI-generated song!\n\n"${song.title}" by ${song.creator || 'Unknown Artist'}\n${song.style ? `Genre: ${song.style}` : ''}\n\nMade with ACE-Step UI - free and open source!`;
  const telegramText = `🎵 "${song.title}" by ${song.creator || 'Unknown Artist'}\n${song.style ? `🎸 ${song.style}` : ''}\n\n🤖 Made with ACE-Step UI`;
  const linkedInText = `Check out this AI-generated music: "${song.title}" - Created locally with ACE-Step. #AIMusic #MusicTech #OpenSource`;

  const handleShareX = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank', 'width=550,height=420');
  };

  const handleShareReddit = () => {
    const url = `https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(redditTitle)}`;
    window.open(url, '_blank', 'width=800,height=600');
  };

  const handleShareFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(defaultShareText)}`;
    window.open(url, '_blank', 'width=550,height=420');
  };

  const handleShareWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(`${whatsAppText}\n\n${shareUrl}`)}`;
    window.open(url, '_blank');
  };

  const handleShareTelegram = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(telegramText)}`;
    window.open(url, '_blank');
  };

  const handleShareLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank', 'width=550,height=420');
  };

  const handleShareEmail = () => {
    const subject = encodeURIComponent(`🎵 ${t('emailSubject')}: ${song.title}`);
    const bodyText = t('emailBody')
      .replace('{title}', song.title)
      .replace('{creator}', song.creator || t('unknown'))
      .replace('{style}', song.style ? `${t('genres')}: ${song.style}` : '')
      .replace('{url}', shareUrl);
    const body = encodeURIComponent(bodyText);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 dark:bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl w-full max-w-sm p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{t('shareSong')}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-6 p-3 bg-zinc-50 dark:bg-black/30 rounded-lg">
          <img
            src={song.coverUrl}
            alt={song.title}
            className="w-12 h-12 rounded object-cover"
          />
          <div className="overflow-hidden">
            <div className="font-medium text-zinc-900 dark:text-white truncate">{song.title}</div>
            <div className="text-sm text-zinc-500 truncate">{song.style}</div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <button
            onClick={handleShareX}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-black text-white hover:bg-zinc-800 transition-colors"
            title={t('shareOnX')}
          >
            <XIcon />
            <span className="text-xs font-medium">X</span>
          </button>

          <button
            onClick={handleShareFacebook}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-[#1877F2] text-white hover:bg-[#166FE5] transition-colors"
            title={t('shareOnFacebook')}
          >
            <FacebookIcon />
            <span className="text-xs font-medium">Facebook</span>
          </button>

          <button
            onClick={handleShareWhatsApp}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-[#25D366] text-white hover:bg-[#22C55E] transition-colors"
            title={t('shareOnWhatsApp')}
          >
            <WhatsAppIcon />
            <span className="text-xs font-medium">WhatsApp</span>
          </button>

          <button
            onClick={handleShareTelegram}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-[#0088CC] text-white hover:bg-[#0077B5] transition-colors"
            title={t('shareOnTelegram')}
          >
            <TelegramIcon />
            <span className="text-xs font-medium">Telegram</span>
          </button>

          <button
            onClick={handleShareReddit}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-[#FF4500] text-white hover:bg-[#FF5722] transition-colors"
            title={t('shareOnReddit')}
          >
            <RedditIcon />
            <span className="text-xs font-medium">Reddit</span>
          </button>

          <button
            onClick={handleShareLinkedIn}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-[#0A66C2] text-white hover:bg-[#004182] transition-colors"
            title={t('shareOnLinkedIn')}
          >
            <LinkedInIcon />
            <span className="text-xs font-medium">LinkedIn</span>
          </button>

          <button
            onClick={handleShareEmail}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-zinc-600 dark:bg-zinc-700 text-white hover:bg-zinc-700 dark:hover:bg-zinc-600 transition-colors"
            title={t('shareViaEmail')}
          >
            <EmailIcon />
            <span className="text-xs font-medium">Email</span>
          </button>

          <button
            onClick={handleCopyLink}
            className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
            title={t('copyLink')}
          >
            {copied ? <Check size={20} className="text-green-500" /> : <Link size={20} />}
            <span className="text-xs font-medium">{copied ? t('copied') : t('copy')}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
