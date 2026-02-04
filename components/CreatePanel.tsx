import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sparkles, ChevronDown, Settings2, Trash2, Music2, Sliders, Dices, Hash, RefreshCw, Plus, Upload, Play, Pause } from 'lucide-react';
import { GenerationParams, Song } from '../types';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { generateApi } from '../services/api';
import { MAIN_STYLES, SUB_STYLES } from '../data/genres';

interface ReferenceTrack {
  id: string;
  filename: string;
  storage_key: string;
  duration: number | null;
  file_size_bytes: number | null;
  tags: string[] | null;
  created_at: string;
  audio_url: string;
}

interface CreatePanelProps {
  onGenerate: (params: GenerationParams) => void;
  isGenerating: boolean;
  initialData?: { song: Song, timestamp: number } | null;
}

const KEY_SIGNATURES = [
  '',
  'C major', 'C minor',
  'C# major', 'C# minor',
  'Db major', 'Db minor',
  'D major', 'D minor',
  'D# major', 'D# minor',
  'Eb major', 'Eb minor',
  'E major', 'E minor',
  'F major', 'F minor',
  'F# major', 'F# minor',
  'Gb major', 'Gb minor',
  'G major', 'G minor',
  'G# major', 'G# minor',
  'Ab major', 'Ab minor',
  'A major', 'A minor',
  'A# major', 'A# minor',
  'Bb major', 'Bb minor',
  'B major', 'B minor'
];

const TIME_SIGNATURES = ['', '2/4', '3/4', '4/4', '6/8'];

const VOCAL_LANGUAGE_VALUES = [
  { value: 'unknown', key: 'autoInstrumental' as const },
  { value: 'en', key: 'english' as const },
  { value: 'ja', key: 'japanese' as const },
  { value: 'zh', key: 'chinese' as const },
  { value: 'es', key: 'spanish' as const },
  { value: 'de', key: 'german' as const },
  { value: 'fr', key: 'french' as const },
  { value: 'pt', key: 'portuguese' as const },
  { value: 'ru', key: 'russian' as const },
  { value: 'it', key: 'italian' as const },
  { value: 'nl', key: 'dutch' as const },
  { value: 'pl', key: 'polish' as const },
  { value: 'tr', key: 'turkish' as const },
  { value: 'vi', key: 'vietnamese' as const },
  { value: 'cs', key: 'czech' as const },
  { value: 'fa', key: 'persian' as const },
  { value: 'id', key: 'indonesian' as const },
  { value: 'ko', key: 'korean' as const },
  { value: 'uk', key: 'ukrainian' as const },
  { value: 'hu', key: 'hungarian' as const },
  { value: 'ar', key: 'arabic' as const },
  { value: 'sv', key: 'swedish' as const },
  { value: 'ro', key: 'romanian' as const },
  { value: 'el', key: 'greek' as const },
];

export const CreatePanel: React.FC<CreatePanelProps> = ({ onGenerate, isGenerating, initialData }) => {
  const { isAuthenticated, token } = useAuth();
  const { t } = useI18n();

  // Randomly select 6 music tags from MAIN_STYLES
  const [musicTags, setMusicTags] = useState<string[]>(() => {
    const shuffled = [...MAIN_STYLES].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  });

  // Function to refresh music tags
  const refreshMusicTags = useCallback(() => {
    const shuffled = [...MAIN_STYLES].sort(() => Math.random() - 0.5);
    setMusicTags(shuffled.slice(0, 6));
  }, []);

  // Mode
  const [customMode, setCustomMode] = useState(true);

  // Simple Mode
  const [songDescription, setSongDescription] = useState('');

  // Custom Mode
  const [lyrics, setLyrics] = useState('');
  const [style, setStyle] = useState('');
  const [title, setTitle] = useState('');

  // Common
  const [instrumental, setInstrumental] = useState(false);
  const [vocalLanguage, setVocalLanguage] = useState('en');

  // Music Parameters
  const [bpm, setBpm] = useState(0);
  const [keyScale, setKeyScale] = useState('');
  const [timeSignature, setTimeSignature] = useState('');

  // Advanced Settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [duration, setDuration] = useState(-1);
  const [batchSize, setBatchSize] = useState(2);
  const [bulkCount, setBulkCount] = useState(1); // Number of independent generation jobs to queue
  const [guidanceScale, setGuidanceScale] = useState(7.0);
  const [randomSeed, setRandomSeed] = useState(true);
  const [seed, setSeed] = useState(-1);
  const [thinking, setThinking] = useState(true);
  const [audioFormat, setAudioFormat] = useState<'mp3' | 'flac'>('mp3');
  const [inferenceSteps, setInferenceSteps] = useState(8);
  const [inferMethod, setInferMethod] = useState<'ode' | 'sde'>('ode');
  const [shift, setShift] = useState(3.0);

  // LM Parameters (under Expert)
  const [showLmParams, setShowLmParams] = useState(false);
  const [lmTemperature, setLmTemperature] = useState(0.85);
  const [lmCfgScale, setLmCfgScale] = useState(2.0);
  const [lmTopK, setLmTopK] = useState(0);
  const [lmTopP, setLmTopP] = useState(0.9);
  const [lmNegativePrompt, setLmNegativePrompt] = useState('NO USER INPUT');

  // Expert Parameters (now in Advanced section)
  const [referenceAudioUrl, setReferenceAudioUrl] = useState('');
  const [sourceAudioUrl, setSourceAudioUrl] = useState('');
  const [audioCodes, setAudioCodes] = useState('');
  const [repaintingStart, setRepaintingStart] = useState(0);
  const [repaintingEnd, setRepaintingEnd] = useState(-1);
  const [instruction, setInstruction] = useState('Fill the audio semantic mask based on the given conditions:');
  const [audioCoverStrength, setAudioCoverStrength] = useState(1.0);
  const [taskType, setTaskType] = useState('text2music');
  const [useAdg, setUseAdg] = useState(false);
  const [cfgIntervalStart, setCfgIntervalStart] = useState(0.0);
  const [cfgIntervalEnd, setCfgIntervalEnd] = useState(1.0);
  const [customTimesteps, setCustomTimesteps] = useState('');
  const [useCotMetas, setUseCotMetas] = useState(true);
  const [useCotCaption, setUseCotCaption] = useState(true);
  const [useCotLanguage, setUseCotLanguage] = useState(true);
  const [autogen, setAutogen] = useState(false);
  const [constrainedDecodingDebug, setConstrainedDecodingDebug] = useState(false);
  const [allowLmBatch, setAllowLmBatch] = useState(true);
  const [getScores, setGetScores] = useState(false);
  const [getLrc, setGetLrc] = useState(false);
  const [scoreScale, setScoreScale] = useState(0.5);
  const [lmBatchChunkSize, setLmBatchChunkSize] = useState(8);
  const [trackName, setTrackName] = useState('');
  const [completeTrackClasses, setCompleteTrackClasses] = useState('');
  const [isFormatCaption, setIsFormatCaption] = useState(false);

  // Model selection
  const [selectedModel, setSelectedModel] = useState<string>('acestep-v15-sft');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  
  // Available models (fixed list from checkpoints directory)
  const availableModels = useMemo(() => [
    { id: 'acestep-v15-base', name: 'acestep-v15-base' },
    { id: 'acestep-v15-sft', name: 'acestep-v15-sft' },
    { id: 'acestep-v15-turbo', name: 'acestep-v15-turbo' },
    { id: 'acestep-v15-turbo-shift1', name: 'acestep-v15-turbo-shift1' },
    { id: 'acestep-v15-turbo-shift3', name: 'acestep-v15-turbo-shift3' },
    { id: 'acestep-v15-turbo-continuous', name: 'acestep-v15-turbo-continuous' },
  ], []);

  // Map model ID to short display name
  const getModelDisplayName = (modelId: string): string => {
    const mapping: Record<string, string> = {
      'acestep-v15-base': '1.5B',
      'acestep-v15-sft': '1.5S',
      'acestep-v15-turbo-shift1': '1.5TS1',
      'acestep-v15-turbo-shift3': '1.5TS3',
      'acestep-v15-turbo-continuous': '1.5TC',
      'acestep-v15-turbo': '1.5T',
    };
    return mapping[modelId] || modelId;
  };

  // Check if model is a turbo variant
  const isTurboModel = (modelId: string): boolean => {
    return modelId.includes('turbo');
  };

  // Genre selection state (cascading)
  const [selectedMainGenre, setSelectedMainGenre] = useState<string>('');
  const [selectedSubGenre, setSelectedSubGenre] = useState<string>('');

  // Filter sub-genres based on selected main genre
  const filteredSubGenres = useMemo(() => {
    if (!selectedMainGenre) return [];
    const mainLower = selectedMainGenre.toLowerCase().trim();
    return SUB_STYLES.filter(style => 
      style.toLowerCase().includes(mainLower)
    );
  }, [selectedMainGenre]);

  const [isUploadingReference, setIsUploadingReference] = useState(false);
  const [isUploadingSource, setIsUploadingSource] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isFormatting, setIsFormatting] = useState(false);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [audioModalTarget, setAudioModalTarget] = useState<'reference' | 'source'>('reference');
  const [tempAudioUrl, setTempAudioUrl] = useState('');
  const [audioTab, setAudioTab] = useState<'reference' | 'source'>('reference');
  const referenceAudioRef = useRef<HTMLAudioElement>(null);
  const sourceAudioRef = useRef<HTMLAudioElement>(null);
  const [referencePlaying, setReferencePlaying] = useState(false);
  const [sourcePlaying, setSourcePlaying] = useState(false);
  const [referenceTime, setReferenceTime] = useState(0);
  const [sourceTime, setSourceTime] = useState(0);
  const [referenceDuration, setReferenceDuration] = useState(0);
  const [sourceDuration, setSourceDuration] = useState(0);

  // Reference tracks modal state
  const [referenceTracks, setReferenceTracks] = useState<ReferenceTrack[]>([]);
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const modalAudioRef = useRef<HTMLAudioElement>(null);
  const [modalTrackTime, setModalTrackTime] = useState(0);
  const [modalTrackDuration, setModalTrackDuration] = useState(0);

  const getAudioLabel = (url: string) => {
    try {
      const parsed = new URL(url);
      return decodeURIComponent(parsed.pathname.split('/').pop() || parsed.hostname);
    } catch {
      const parts = url.split('/');
      return decodeURIComponent(parts[parts.length - 1] || url);
    }
  };

  // Resize Logic
  const [lyricsHeight, setLyricsHeight] = useState(() => {
    const saved = localStorage.getItem('acestep_lyrics_height');
    return saved ? parseInt(saved, 10) : 144; // Default h-36 is 144px (9rem * 16)
  });
  const [isResizing, setIsResizing] = useState(false);
  const lyricsRef = useRef<HTMLDivElement>(null);


  // Close model menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setShowModelMenu(false);
      }
    };

    if (showModelMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showModelMenu]);

  // Reuse Effect - must be after all state declarations
  useEffect(() => {
    if (initialData) {
      setCustomMode(true);
      setLyrics(initialData.song.lyrics);
      setStyle(initialData.song.style);
      setTitle(initialData.song.title);
      setInstrumental(initialData.song.lyrics.length === 0);
    }
  }, [initialData]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      // Calculate new height based on mouse position relative to the lyrics container top
      // We can't easily get the container top here without a ref to it, 
      // but we can use dy (delta y) from the previous position if we tracked it,
      // OR simpler: just update based on movement if we track the start.
      //
      // Better approach for absolute sizing: 
      // 1. Get the bounding rect of the textarea wrapper on mount/resize start? 
      //    We can just rely on the fact that we are dragging the bottom.
      //    So new height = currentMouseY - topOfElement.

      if (lyricsRef.current) {
        const rect = lyricsRef.current.getBoundingClientRect();
        const newHeight = e.clientY - rect.top;
        // detailed limits: min 96px (h-24), max 600px
        if (newHeight > 96 && newHeight < 600) {
          setLyricsHeight(newHeight);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
      // Save height to localStorage
      localStorage.setItem('acestep_lyrics_height', String(lyricsHeight));
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none'; // Prevent text selection while dragging
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
  }, [isResizing]);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const uploadAudio = async (file: File, target: 'reference' | 'source') => {
    if (!token) {
      setUploadError('Please sign in to upload audio.');
      return;
    }
    setUploadError(null);
    const setUploading = target === 'reference' ? setIsUploadingReference : setIsUploadingSource;
    const setUrl = target === 'reference' ? setReferenceAudioUrl : setSourceAudioUrl;
    setUploading(true);
    try {
      const result = await generateApi.uploadAudio(file, token);
      setUrl(result.url);
      setShowAudioModal(false);
      setTempAudioUrl('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, target: 'reference' | 'source') => {
    const file = e.target.files?.[0];
    if (file) {
      void uploadAudio(file, target);
    }
    e.target.value = '';
  };

  // Format handler - uses LLM to enhance style and auto-fill parameters
  const handleFormat = async () => {
    if (!token || !style.trim()) return;
    setIsFormatting(true);
    try {
      const result = await generateApi.formatInput({
        caption: style,
        lyrics: lyrics,
        bpm: bpm > 0 ? bpm : undefined,
        duration: duration > 0 ? duration : undefined,
        keyScale: keyScale || undefined,
        timeSignature: timeSignature || undefined,
        temperature: lmTemperature,
        topK: lmTopK > 0 ? lmTopK : undefined,
        topP: lmTopP,
      }, token);

      if (result.success) {
        // Update fields with LLM-generated values
        if (result.caption) setStyle(result.caption);
        if (result.lyrics) setLyrics(result.lyrics);
        if (result.bpm && result.bpm > 0) setBpm(result.bpm);
        if (result.duration && result.duration > 0) setDuration(result.duration);
        if (result.key_scale) setKeyScale(result.key_scale);
        if (result.time_signature) setTimeSignature(result.time_signature);
        if (result.language) setVocalLanguage(result.language);
        setIsFormatCaption(true);
      } else {
        console.error('Format failed:', result.error || result.status_message);
        alert(result.error || result.status_message || 'Format failed. Make sure the LLM is initialized.');
      }
    } catch (err) {
      console.error('Format error:', err);
      alert('Format failed. The LLM may not be available.');
    } finally {
      setIsFormatting(false);
    }
  };

  const openAudioModal = (target: 'reference' | 'source') => {
    setAudioModalTarget(target);
    setTempAudioUrl('');
    setShowAudioModal(true);
    void fetchReferenceTracks();
  };

  const fetchReferenceTracks = useCallback(async () => {
    if (!token) return;
    setIsLoadingTracks(true);
    try {
      const response = await fetch('/api/reference-tracks', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setReferenceTracks(data.tracks || []);
      }
    } catch (err) {
      console.error('Failed to fetch reference tracks:', err);
    } finally {
      setIsLoadingTracks(false);
    }
  }, [token]);

  const uploadReferenceTrack = async (file: File) => {
    if (!token) {
      setUploadError('Please sign in to upload audio.');
      return;
    }
    setUploadError(null);
    setIsUploadingReference(true);
    try {
      const formData = new FormData();
      formData.append('audio', file);

      const response = await fetch('/api/reference-tracks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Upload failed');
      }

      const data = await response.json();
      setReferenceTracks(prev => [data.track, ...prev]);

      // Also set as current reference/source
      if (audioModalTarget === 'reference') {
        setReferenceAudioUrl(data.track.audio_url);
      } else {
        setSourceAudioUrl(data.track.audio_url);
      }
      setShowAudioModal(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(message);
    } finally {
      setIsUploadingReference(false);
    }
  };

  const deleteReferenceTrack = async (trackId: string) => {
    if (!token) return;
    try {
      const response = await fetch(`/api/reference-tracks/${trackId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        setReferenceTracks(prev => prev.filter(t => t.id !== trackId));
        if (playingTrackId === trackId) {
          setPlayingTrackId(null);
          if (modalAudioRef.current) {
            modalAudioRef.current.pause();
          }
        }
      }
    } catch (err) {
      console.error('Failed to delete track:', err);
    }
  };

  const useReferenceTrack = (track: ReferenceTrack) => {
    if (audioModalTarget === 'reference') {
      setReferenceAudioUrl(track.audio_url);
    } else {
      setSourceAudioUrl(track.audio_url);
    }
    setShowAudioModal(false);
    setPlayingTrackId(null);
  };

  const toggleModalTrack = (track: ReferenceTrack) => {
    if (playingTrackId === track.id) {
      if (modalAudioRef.current) {
        modalAudioRef.current.pause();
      }
      setPlayingTrackId(null);
    } else {
      setPlayingTrackId(track.id);
      if (modalAudioRef.current) {
        modalAudioRef.current.src = track.audio_url;
        modalAudioRef.current.play().catch(() => undefined);
      }
    }
  };

  const applyAudioUrl = () => {
    if (!tempAudioUrl.trim()) return;
    if (audioModalTarget === 'reference') {
      setReferenceAudioUrl(tempAudioUrl.trim());
      setReferenceTime(0);
      setReferenceDuration(0);
    } else {
      setSourceAudioUrl(tempAudioUrl.trim());
      setSourceTime(0);
      setSourceDuration(0);
    }
    setShowAudioModal(false);
    setTempAudioUrl('');
  };

  const formatTime = (time: number) => {
    if (!Number.isFinite(time) || time <= 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const toggleAudio = (target: 'reference' | 'source') => {
    const audio = target === 'reference' ? referenceAudioRef.current : sourceAudioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, target: 'reference' | 'source') => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void uploadAudio(file, target);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleGenerate = () => {
    // Bulk generation: loop bulkCount times
    for (let i = 0; i < bulkCount; i++) {
      // Seed handling: first job uses user's seed, rest get random seeds
      let jobSeed = -1;
      if (!randomSeed && i === 0) {
        jobSeed = seed;
      } else if (!randomSeed && i > 0) {
        // Subsequent jobs get random seeds for variety
        jobSeed = Math.floor(Math.random() * 4294967295);
      }

      onGenerate({
        customMode,
        songDescription: customMode ? undefined : songDescription,
        prompt: lyrics,
        lyrics,
        style,
        title: bulkCount > 1 ? `${title} (${i + 1})` : title,
        model: selectedModel || undefined,
        instrumental,
        vocalLanguage,
        bpm,
        keyScale,
        timeSignature,
        duration,
        inferenceSteps,
        guidanceScale,
        batchSize,
        randomSeed: randomSeed || i > 0, // Force random for subsequent bulk jobs
        seed: jobSeed,
        thinking,
        audioFormat,
        inferMethod,
        shift,
        lmTemperature,
        lmCfgScale,
        lmTopK,
        lmTopP,
        lmNegativePrompt,
        referenceAudioUrl: referenceAudioUrl.trim() || undefined,
        sourceAudioUrl: sourceAudioUrl.trim() || undefined,
        audioCodes: audioCodes.trim() || undefined,
        repaintingStart,
        repaintingEnd,
        instruction,
        audioCoverStrength,
        taskType,
        useAdg,
        cfgIntervalStart,
        cfgIntervalEnd,
        customTimesteps: customTimesteps.trim() || undefined,
        useCotMetas,
        useCotCaption,
        useCotLanguage,
        autogen,
        constrainedDecodingDebug,
        allowLmBatch,
        getScores,
        getLrc,
        scoreScale,
        lmBatchChunkSize,
        trackName: trackName.trim() || undefined,
        completeTrackClasses: (() => {
          const parsed = completeTrackClasses
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
          return parsed.length ? parsed : undefined;
        })(),
        isFormatCaption,
      });
    }

    // Reset bulk count after generation
    if (bulkCount > 1) {
      setBulkCount(1);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-suno-panel w-full overflow-y-auto custom-scrollbar transition-colors duration-300">
      <div className="p-4 pt-14 md:pt-4 space-y-5">
        <input
          ref={referenceInputRef}
          type="file"
          accept="audio/*"
          onChange={(e) => handleFileSelect(e, 'reference')}
          className="hidden"
        />
        <input
          ref={sourceInputRef}
          type="file"
          accept="audio/*"
          onChange={(e) => handleFileSelect(e, 'source')}
          className="hidden"
        />
        <audio
          ref={referenceAudioRef}
          src={referenceAudioUrl || undefined}
          onPlay={() => setReferencePlaying(true)}
          onPause={() => setReferencePlaying(false)}
          onEnded={() => setReferencePlaying(false)}
          onTimeUpdate={(e) => setReferenceTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setReferenceDuration(e.currentTarget.duration || 0)}
        />
        <audio
          ref={sourceAudioRef}
          src={sourceAudioUrl || undefined}
          onPlay={() => setSourcePlaying(true)}
          onPause={() => setSourcePlaying(false)}
          onEnded={() => setSourcePlaying(false)}
          onTimeUpdate={(e) => setSourceTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setSourceDuration(e.currentTarget.duration || 0)}
        />

        {/* Header - Mode Toggle & Model Selection */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">ACE-Step v1.5</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Toggle */}
            <div className="flex items-center bg-zinc-200 dark:bg-black/40 rounded-lg p-1 border border-zinc-300 dark:border-white/5">
              <button
                onClick={() => setCustomMode(false)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${!customMode ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}
              >
                {t('simple')}
              </button>
              <button
                onClick={() => setCustomMode(true)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${customMode ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}
              >
                {t('custom')}
              </button>
            </div>

            {/* Model Selection */}
            <div className="relative" ref={modelMenuRef}>
              <button
                onClick={() => setShowModelMenu(!showModelMenu)}
                className="bg-zinc-200 dark:bg-black/40 border border-zinc-300 dark:border-white/5 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-900 dark:text-white hover:bg-zinc-300 dark:hover:bg-black/50 transition-colors flex items-center gap-1"
                disabled={availableModels.length === 0}
              >
                {availableModels.length === 0 ? '...' : getModelDisplayName(selectedModel)}
                <ChevronDown size={10} className="text-zinc-600 dark:text-zinc-400" />
              </button>
              
              {/* Floating Model Menu */}
              {showModelMenu && availableModels.length > 0 && (
                <div className="absolute top-full right-0 mt-1 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="max-h-96 overflow-y-auto custom-scrollbar">
                    {availableModels.map(model => (
                      <button
                        key={model.id}
                        onClick={() => {
                          setSelectedModel(model.id);
                          // Auto-adjust parameters for non-turbo models
                          if (!isTurboModel(model.id)) {
                            setInferenceSteps(50);
                            setUseAdg(true);
                          }
                          setShowModelMenu(false);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 ${
                          selectedModel === model.id ? 'bg-zinc-50 dark:bg-zinc-800/50' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                            {getModelDisplayName(model.id)}
                          </span>
                          {selectedModel === model.id && (
                            <div className="w-4 h-4 rounded-full bg-pink-500 flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">{model.id}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SIMPLE MODE */}
        {!customMode && (
          <div className="space-y-5">
            {/* Song Description */}
            <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden">
              <div className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-white/5">
                {t('describeYourSong')}
              </div>
              <textarea
                value={songDescription}
                onChange={(e) => setSongDescription(e.target.value)}
                placeholder={t('songDescriptionPlaceholder')}
                className="w-full h-32 bg-transparent p-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none resize-none"
              />
            </div>

            {/* Vocal Language (Simple) */}
            <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden">
              <div className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-white/5">
                {t('vocalLanguage')}
              </div>
              <select
                value={vocalLanguage}
                onChange={(e) => setVocalLanguage(e.target.value)}
                className="w-full bg-transparent p-3 text-sm text-zinc-900 dark:text-white focus:outline-none cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
              >
                {VOCAL_LANGUAGE_VALUES.map(lang => (
                  <option key={lang.value} value={lang.value}>{t(lang.key)}</option>
                ))}
              </select>
            </div>

            {/* Quick Settings (Simple Mode) */}
            <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-4">
              <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide flex items-center gap-2">
                <Sliders size={14} />
                {t('quickSettings')}
              </h3>

              {/* Duration */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('duration')}</label>
                  <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">
                    {duration === -1 ? t('auto') : `${duration}${t('seconds')}`}
                  </span>
                </div>
                <input
                  type="range"
                  min="-1"
                  max="600"
                  step="5"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
              </div>

              {/* BPM */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">BPM</label>
                  <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">
                    {bpm === 0 ? 'Auto' : bpm}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="300"
                  step="5"
                  value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
              </div>

              {/* Key & Time Signature */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('key')}</label>
                  <select
                    value={keyScale}
                    onChange={(e) => setKeyScale(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                  >
                    <option value="">Auto</option>
                    {KEY_SIGNATURES.filter(k => k).map(key => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('time')}</label>
                  <select
                    value={timeSignature}
                    onChange={(e) => setTimeSignature(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                  >
                    <option value="">Auto</option>
                    {TIME_SIGNATURES.filter(t => t).map(time => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Variations */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('variations')}</label>
                  <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">{batchSize}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="8"
                  step="1"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Number(e.target.value))}
                  className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
                />
                <p className="text-[10px] text-zinc-500">{t('numberOfVariations')}</p>
              </div>
            </div>
          </div>
        )}

        {/* CUSTOM MODE */}
        {customMode && (
          <div className="space-y-5">
            {/* Audio Section */}
            <div
              onDrop={(e) => handleDrop(e, audioTab)}
              onDragOver={handleDragOver}
              className="bg-white dark:bg-[#1a1a1f] rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden"
            >
              {/* Header with Audio label and tabs */}
              <div className="px-3 py-2.5 border-b border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t('audio')}</span>
                  <div className="flex items-center gap-1 bg-zinc-200/50 dark:bg-black/30 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => setAudioTab('reference')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                        audioTab === 'reference'
                          ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                      }`}
                    >
                      {t('reference')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudioTab('source')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                        audioTab === 'source'
                          ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                      }`}
                    >
                      {t('cover')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Audio Content */}
              <div className="p-3 space-y-2">
                {/* Reference Audio Player */}
                {audioTab === 'reference' && referenceAudioUrl && (
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-zinc-50 dark:bg-white/[0.03] border border-zinc-100 dark:border-white/5">
                    <button
                      type="button"
                      onClick={() => toggleAudio('reference')}
                      className="relative flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-pink-500/20 hover:scale-105 transition-transform"
                    >
                      {referencePlaying ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                      ) : (
                        <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      )}
                      <span className="absolute -bottom-1 -right-1 text-[8px] font-bold bg-zinc-900 text-white px-1 py-0.5 rounded">
                        {formatTime(referenceDuration)}
                      </span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate mb-1.5">
                        {getAudioLabel(referenceAudioUrl)}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-400 tabular-nums">{formatTime(referenceTime)}</span>
                        <div
                          className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 cursor-pointer group/seek"
                          onClick={(e) => {
                            if (referenceAudioRef.current && referenceDuration > 0) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const percent = (e.clientX - rect.left) / rect.width;
                              referenceAudioRef.current.currentTime = percent * referenceDuration;
                            }
                          }}
                        >
                          <div
                            className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all relative"
                            style={{ width: referenceDuration ? `${Math.min(100, (referenceTime / referenceDuration) * 100)}%` : '0%' }}
                          >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity" />
                          </div>
                        </div>
                        <span className="text-[10px] text-zinc-400 tabular-nums">{formatTime(referenceDuration)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setReferenceAudioUrl(''); setReferencePlaying(false); setReferenceTime(0); setReferenceDuration(0); }}
                      className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                )}

                {/* Source/Cover Audio Player */}
                {audioTab === 'source' && sourceAudioUrl && (
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-zinc-50 dark:bg-white/[0.03] border border-zinc-100 dark:border-white/5">
                    <button
                      type="button"
                      onClick={() => toggleAudio('source')}
                      className="relative flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 hover:scale-105 transition-transform"
                    >
                      {sourcePlaying ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
                      ) : (
                        <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      )}
                      <span className="absolute -bottom-1 -right-1 text-[8px] font-bold bg-zinc-900 text-white px-1 py-0.5 rounded">
                        {formatTime(sourceDuration)}
                      </span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate mb-1.5">
                        {getAudioLabel(sourceAudioUrl)}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-400 tabular-nums">{formatTime(sourceTime)}</span>
                        <div
                          className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 cursor-pointer group/seek"
                          onClick={(e) => {
                            if (sourceAudioRef.current && sourceDuration > 0) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const percent = (e.clientX - rect.left) / rect.width;
                              sourceAudioRef.current.currentTime = percent * sourceDuration;
                            }
                          }}
                        >
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all relative"
                            style={{ width: sourceDuration ? `${Math.min(100, (sourceTime / sourceDuration) * 100)}%` : '0%' }}
                          >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity" />
                          </div>
                        </div>
                        <span className="text-[10px] text-zinc-400 tabular-nums">{formatTime(sourceDuration)}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSourceAudioUrl(''); setSourcePlaying(false); setSourceTime(0); setSourceDuration(0); }}
                      className="p-1.5 rounded-full hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => openAudioModal(audioTab)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 px-3 py-2 text-xs font-medium transition-colors border border-zinc-200 dark:border-white/5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
                    </svg>
                    {t('fromLibrary')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const input = audioTab === 'reference' ? referenceInputRef.current : sourceInputRef.current;
                      input?.click();
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-700 dark:text-zinc-300 px-3 py-2 text-xs font-medium transition-colors border border-zinc-200 dark:border-white/5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                    </svg>
                    {t('upload')}
                  </button>
                </div>
              </div>
            </div>

            {/* Lyrics Input */}
            <div
              ref={lyricsRef}
              className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden transition-colors group focus-within:border-zinc-400 dark:focus-within:border-white/20 relative flex flex-col"
              style={{ height: 'auto' }}
            >
              <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-50 dark:bg-white/5 border-b border-zinc-100 dark:border-white/5 flex-shrink-0">
                <div>
                  <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t('lyrics')}</span>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{t('leaveLyricsEmpty')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setInstrumental(!instrumental)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors ${
                      instrumental
                        ? 'bg-pink-600 text-white border-pink-500'
                        : 'bg-white dark:bg-suno-card border-zinc-200 dark:border-white/10 text-zinc-600 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10'
                    }`}
                  >
                    {instrumental ? t('instrumental') : t('vocal')}
                  </button>
                  <button
                    className={`p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded transition-colors ${isFormatting ? 'text-pink-500 animate-pulse' : 'text-zinc-500 hover:text-black dark:hover:text-white'}`}
                    title="AI Format - Enhance style & auto-fill parameters"
                    onClick={handleFormat}
                    disabled={isFormatting || !style.trim()}
                  >
                    <Sparkles size={14} />
                  </button>
                  <button
                    className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded text-zinc-500 hover:text-black dark:hover:text-white transition-colors"
                    onClick={() => setLyrics('')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <textarea
                disabled={instrumental}
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder={instrumental ? t('instrumental') + ' mode' : t('lyricsPlaceholder')}
                className={`w-full bg-transparent p-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none resize-none font-mono leading-relaxed ${instrumental ? 'opacity-30 cursor-not-allowed' : ''}`}
                style={{ height: `${lyricsHeight}px` }}
              />
              {/* Resize Handle */}
              <div
                onMouseDown={startResizing}
                className="h-3 w-full cursor-ns-resize flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors absolute bottom-0 left-0 z-10"
              >
                <div className="w-8 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700"></div>
              </div>
            </div>

            {/* Style Input */}
            <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden transition-colors group focus-within:border-zinc-400 dark:focus-within:border-white/20">
              <div className="flex items-center justify-between px-3 py-2.5 bg-zinc-50 dark:bg-white/5 border-b border-zinc-100 dark:border-white/5">
                <div>
                  <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t('styleOfMusic')}</span>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{t('genreMoodInstruments')}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded transition-colors text-zinc-500 hover:text-black dark:hover:text-white"
                    title={t('refreshGenres')}
                    onClick={refreshMusicTags}
                  >
                    <Dices size={14} />
                  </button>
                  <button
                    className={`p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded transition-colors ${isFormatting ? 'text-pink-500 animate-pulse' : 'text-zinc-500 hover:text-black dark:hover:text-white'}`}
                    title="AI Format - Enhance style & auto-fill parameters"
                    onClick={handleFormat}
                    disabled={isFormatting || !style.trim()}
                  >
                    <Sparkles size={14} />
                  </button>
                  <button
                    className="p-1.5 hover:bg-zinc-200 dark:hover:bg-white/10 rounded text-zinc-500 hover:text-black dark:hover:text-white transition-colors"
                    onClick={() => setStyle('')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <textarea
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder={t('stylePlaceholder')}
                className="w-full h-20 bg-transparent p-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none resize-none"
              />
              <div className="px-3 pb-3 space-y-3">
                {/* Cascading Genre Selector */}
                <div className="space-y-2">
                  {/* First Level: Main Genre */}
                  <div className="flex gap-2">
                    <select
                      value={selectedMainGenre}
                      onChange={(e) => {
                        setSelectedMainGenre(e.target.value);
                        setSelectedSubGenre(''); // Reset sub genre when main changes
                        if (e.target.value) {
                          setStyle(prev => prev ? `${prev}, ${e.target.value}` : e.target.value);
                        }
                      }}
                      className="flex-1 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                    >
                      <option value="">{t('mainGenre')}</option>
                      {MAIN_STYLES.map(genre => (
                        <option key={genre} value={genre}>{genre}</option>
                      ))}
                    </select>
                    {selectedMainGenre && (
                      <button
                        onClick={() => {
                          setSelectedMainGenre('');
                          setSelectedSubGenre('');
                        }}
                        className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
                        title={t('cancel')}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  
                  {/* Second Level: Sub Genre (only show when main genre is selected) */}
                  {selectedMainGenre && filteredSubGenres.length > 0 && (
                    <div className="flex gap-2 pl-4 border-l-2 border-zinc-200 dark:border-white/10">
                      <select
                        value={selectedSubGenre}
                        onChange={(e) => {
                          setSelectedSubGenre(e.target.value);
                          if (e.target.value) {
                            setStyle(prev => prev ? `${prev}, ${e.target.value}` : e.target.value);
                          }
                        }}
                        className="flex-1 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                      >
                        <option value="">{t('subGenre')} ({filteredSubGenres.length})</option>
                        {filteredSubGenres.map(genre => (
                          <option key={genre} value={genre}>{genre}</option>
                        ))}
                      </select>
                      {selectedSubGenre && (
                        <button
                          onClick={() => setSelectedSubGenre('')}
                          className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
                          title={t('cancel')}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {/* Quick Tags */}
                <div className="flex flex-wrap gap-2">
                  {musicTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setStyle(prev => prev ? `${prev}, ${tag}` : tag)}
                      className="text-[10px] font-medium bg-zinc-100 dark:bg-white/5 hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white px-2.5 py-1 rounded-full transition-colors border border-zinc-200 dark:border-white/5"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Title Input */}
            <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 overflow-hidden">
              <div className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-white/5 bg-zinc-50 dark:bg-white/5">
                {t('title')}
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('nameSong')}
                className="w-full bg-transparent p-3 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* COMMON SETTINGS */}
        <div className="space-y-4">
          {/* Instrumental Toggle (Simple Mode) */}
          {!customMode && (
            <div className="flex items-center justify-between px-1 py-2">
              <div className="flex items-center gap-2">
                <Music2 size={14} className="text-zinc-500" />
                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('instrumental')}</span>
              </div>
              <button
                onClick={() => setInstrumental(!instrumental)}
                className={`w-11 h-6 rounded-full flex items-center transition-colors duration-200 px-1 border border-zinc-200 dark:border-white/5 ${instrumental ? 'bg-pink-600' : 'bg-zinc-300 dark:bg-black/40'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transform transition-transform duration-200 shadow-sm ${instrumental ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          )}

          {/* Vocal Language (Custom mode) */}
          {customMode && !instrumental && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide px-1">
                  {t('vocalLanguage')}
                </label>
                <select
                  value={vocalLanguage}
                  onChange={(e) => setVocalLanguage(e.target.value)}
                  className="w-full bg-white dark:bg-suno-card border border-zinc-200 dark:border-white/5 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                >
                  {VOCAL_LANGUAGE_VALUES.map(lang => (
                    <option key={lang.value} value={lang.value}>{t(lang.key)}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* MUSIC PARAMETERS */}
        <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-4">
          <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide flex items-center gap-2">
            <Sliders size={14} />
            {t('musicParameters')}
          </h3>

          {/* BPM */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('bpm')}</label>
              <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">
                {bpm === 0 ? t('auto') : bpm}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="300"
              step="5"
              value={bpm}
              onChange={(e) => setBpm(Number(e.target.value))}
              className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
            />
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>{t('auto')}</span>
              <span>300</span>
            </div>
          </div>

          {/* Key & Time Signature */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Key</label>
              <select
                value={keyScale}
                onChange={(e) => setKeyScale(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
              >
                <option value="">Auto</option>
                {KEY_SIGNATURES.filter(k => k).map(key => (
                  <option key={key} value={key}>{key}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Time</label>
              <select
                value={timeSignature}
                onChange={(e) => setTimeSignature(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
              >
                <option value="">Auto</option>
                {TIME_SIGNATURES.filter(t => t).map(time => (
                  <option key={time} value={time}>{time}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ADVANCED SETTINGS */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings2 size={16} className="text-zinc-500" />
            <span>{t('advancedSettings')}</span>
          </div>
          <ChevronDown size={16} className={`text-zinc-500 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        </button>

        {showAdvanced && (
          <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-4">

            {/* Duration */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('duration')}</label>
                <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">
                  {duration === -1 ? t('auto') : `${duration}${t('seconds')}`}
                </span>
              </div>
              <input
                type="range"
                min="-1"
                max="600"
                step="5"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
              <div className="flex justify-between text-[10px] text-zinc-500">
                <span>{t('auto')}</span>
                <span>10 {t('min')}</span>
              </div>
            </div>

            {/* Batch Size */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('batchSize')}</label>
                <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">{batchSize}</span>
              </div>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
              <p className="text-[10px] text-zinc-500">{t('numberOfVariations')}</p>
            </div>

            {/* Bulk Generate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('bulkGenerate')}</label>
                <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">
                  {bulkCount} {t(bulkCount === 1 ? 'job' : 'jobs')}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 5, 10].map((count) => (
                  <button
                    key={count}
                    onClick={() => setBulkCount(count)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                      bulkCount === count
                        ? 'bg-gradient-to-r from-orange-500 to-pink-600 text-white shadow-md'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500">{t('queueMultipleJobs')}</p>
            </div>

            {/* Inference Steps */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('inferenceSteps')}</label>
                <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">{inferenceSteps}</span>
              </div>
              <input
                type="range"
                min="4"
                max="200"
                step="1"
                value={inferenceSteps}
                onChange={(e) => setInferenceSteps(Number(e.target.value))}
                className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
              <p className="text-[10px] text-zinc-500">{t('moreStepsBetterQuality')}</p>
            </div>

            {/* Guidance Scale */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('guidanceScale')}</label>
                <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">{guidanceScale.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="1"
                max="15"
                step="0.5"
                value={guidanceScale}
                onChange={(e) => setGuidanceScale(Number(e.target.value))}
                className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
              <p className="text-[10px] text-zinc-500">{t('howCloselyFollowPrompt')}</p>
            </div>

            {/* Audio Format & Inference Method */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('audioFormat')}</label>
                <select
                  value={audioFormat}
                  onChange={(e) => setAudioFormat(e.target.value as 'mp3' | 'flac')}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                >
                  <option value="mp3">{t('mp3Smaller')}</option>
                  <option value="flac">{t('flacLossless')}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('inferMethod')}</label>
                <select
                  value={inferMethod}
                  onChange={(e) => setInferMethod(e.target.value as 'ode' | 'sde')}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                >
                  <option value="ode">{t('odeDeterministic')}</option>
                  <option value="sde">{t('sdeStochastic')}</option>
                </select>
              </div>
            </div>

            {/* Seed */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Dices size={14} className="text-zinc-500" />
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('seed')}</span>
                </div>
                <button
                  onClick={() => setRandomSeed(!randomSeed)}
                  className={`w-10 h-5 rounded-full flex items-center transition-colors duration-200 px-0.5 border border-zinc-200 dark:border-white/5 ${randomSeed ? 'bg-pink-600' : 'bg-zinc-300 dark:bg-black/40'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transform transition-transform duration-200 shadow-sm ${randomSeed ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Hash size={14} className="text-zinc-500" />
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value))}
                  placeholder={t('enterFixedSeed')}
                  disabled={randomSeed}
                  className={`flex-1 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none ${randomSeed ? 'opacity-40 cursor-not-allowed' : ''}`}
                />
              </div>
              <p className="text-[10px] text-zinc-500">{randomSeed ? t('randomSeedRecommended') : t('fixedSeedReproducible')}</p>
            </div>

            {/* Thinking Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-zinc-100 dark:border-white/5">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('thinkingCot')}</span>
              <button
                onClick={() => setThinking(!thinking)}
                className={`w-10 h-5 rounded-full flex items-center transition-colors duration-200 px-0.5 border border-zinc-200 dark:border-white/5 ${thinking ? 'bg-pink-600' : 'bg-zinc-300 dark:bg-black/40'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transform transition-transform duration-200 shadow-sm ${thinking ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Shift */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('shift')}</label>
                <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">{shift.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                step="0.1"
                value={shift}
                onChange={(e) => setShift(Number(e.target.value))}
                className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
              <p className="text-[10px] text-zinc-500">{t('timestepShiftForBase')}</p>
            </div>

            {/* Divider */}
            <div className="border-t border-zinc-200 dark:border-white/10 pt-4">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-bold mb-3">{t('expertControls')}</p>
            </div>

            {uploadError && (
              <div className="text-[11px] text-rose-500">{uploadError}</div>
            )}

            {/* LM Parameters */}
            <button
              onClick={() => setShowLmParams(!showLmParams)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white/60 dark:bg-black/20 rounded-xl border border-zinc-200/70 dark:border-white/10 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Music2 size={16} className="text-zinc-500" />
                <div className="flex flex-col items-start">
                  <span>{t('lmParameters')}</span>
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-normal">{t('controlLyricGeneration')}</span>
                </div>
              </div>
              <ChevronDown size={16} className={`text-zinc-500 transition-transform ${showLmParams ? 'rotate-180' : ''}`} />
            </button>

            {showLmParams && (
              <div className="bg-white dark:bg-suno-card rounded-xl border border-zinc-200 dark:border-white/5 p-4 space-y-4">
                {/* LM Temperature */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('lmTemperature')}</label>
                    <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">{lmTemperature.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={lmTemperature}
                    onChange={(e) => setLmTemperature(Number(e.target.value))}
                    className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
                  />
                  <p className="text-[10px] text-zinc-500">{t('higherMoreRandom')}</p>
                </div>

                {/* LM CFG Scale */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('lmCfgScale')}</label>
                    <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">{lmCfgScale.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.1"
                    value={lmCfgScale}
                    onChange={(e) => setLmCfgScale(Number(e.target.value))}
                    className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
                  />
                  <p className="text-[10px] text-zinc-500">{t('noCfgScale')}</p>
                </div>

                {/* LM Top-K & Top-P */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('topK')}</label>
                      <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">{lmTopK}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={lmTopK}
                      onChange={(e) => setLmTopK(Number(e.target.value))}
                      className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('topP')}</label>
                      <span className="text-xs font-mono text-zinc-900 dark:text-white bg-zinc-100 dark:bg-black/20 px-2 py-0.5 rounded">{lmTopP.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={lmTopP}
                      onChange={(e) => setLmTopP(Number(e.target.value))}
                      className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-pink-500"
                    />
                  </div>
                </div>

                {/* LM Negative Prompt */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('lmNegativePrompt')}</label>
                  <textarea
                    value={lmNegativePrompt}
                    onChange={(e) => setLmNegativePrompt(e.target.value)}
                    placeholder={t('thingsToAvoid')}
                    className="w-full h-16 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg p-2 text-xs text-zinc-900 dark:text-white focus:outline-none resize-none"
                  />
                  <p className="text-[10px] text-zinc-500">{t('useWhenCfgScaleGreater')}</p>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t('transform')}</h4>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{t('controlSourceAudio')}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('audioCodes')}</label>
              <textarea
                value={audioCodes}
                onChange={(e) => setAudioCodes(e.target.value)}
                placeholder={t('optionalAudioCodes')}
                className="w-full h-16 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg p-2 text-xs text-zinc-900 dark:text-white focus:outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('taskType')}</label>
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-xl px-2 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none focus:border-pink-500 dark:focus:border-pink-500 transition-colors cursor-pointer [&>option]:bg-white [&>option]:dark:bg-zinc-800 [&>option]:text-zinc-900 [&>option]:dark:text-white"
                >
                  <option value="text2music">{t('textToMusic')}</option>
                  <option value="audio2audio">{t('audio2audio')}</option>
                  <option value="cover">{t('coverTask')}</option>
                  <option value="repaint">{t('repaintTask')}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('audioCoverStrength')}</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={audioCoverStrength}
                  onChange={(e) => setAudioCoverStrength(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('repaintingStart')}</label>
                <input
                  type="number"
                  step="0.1"
                  value={repaintingStart}
                  onChange={(e) => setRepaintingStart(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('repaintingEnd')}</label>
                <input
                  type="number"
                  step="0.1"
                  value={repaintingEnd}
                  onChange={(e) => setRepaintingEnd(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('instruction')}</label>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                className="w-full h-16 bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg p-2 text-xs text-zinc-900 dark:text-white focus:outline-none resize-none"
              />
            </div>

            <div className="space-y-1">
              <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{t('guidance')}</h4>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">{t('advancedCfgScheduling')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('cfgIntervalStart')}</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={cfgIntervalStart}
                  onChange={(e) => setCfgIntervalStart(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('cfgIntervalEnd')}</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={cfgIntervalEnd}
                  onChange={(e) => setCfgIntervalEnd(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('customTimesteps')}</label>
              <input
                type="text"
                value={customTimesteps}
                onChange={(e) => setCustomTimesteps(e.target.value)}
                placeholder={t('timestepsPlaceholder')}
                className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('scoreScale')}</label>
                <input
                  type="number"
                  step="0.05"
                  value={scoreScale}
                  onChange={(e) => setScoreScale(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('lmBatchChunkSize')}</label>
                <input
                  type="number"
                  min="1"
                  value={lmBatchChunkSize}
                  onChange={(e) => setLmBatchChunkSize(Number(e.target.value))}
                  className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('trackName')}</label>
              <input
                type="text"
                value={trackName}
                onChange={(e) => setTrackName(e.target.value)}
                placeholder={t('optionalTrackName')}
                className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{t('completeTrackClasses')}</label>
              <input
                type="text"
                value={completeTrackClasses}
                onChange={(e) => setCompleteTrackClasses(e.target.value)}
                placeholder={t('trackClassesPlaceholder')}
                className="w-full bg-zinc-50 dark:bg-black/20 border border-zinc-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <input type="checkbox" checked={useAdg} onChange={() => setUseAdg(!useAdg)} />
                {t('useAdg')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <input type="checkbox" checked={allowLmBatch} onChange={() => setAllowLmBatch(!allowLmBatch)} />
                {t('allowLmBatch')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <input type="checkbox" checked={useCotMetas} onChange={() => setUseCotMetas(!useCotMetas)} />
                {t('useCotMetas')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <input type="checkbox" checked={useCotCaption} onChange={() => setUseCotCaption(!useCotCaption)} />
                {t('useCotCaption')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <input type="checkbox" checked={useCotLanguage} onChange={() => setUseCotLanguage(!useCotLanguage)} />
                {t('useCotLanguage')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <input type="checkbox" checked={autogen} onChange={() => setAutogen(!autogen)} />
                {t('autogen')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <input type="checkbox" checked={constrainedDecodingDebug} onChange={() => setConstrainedDecodingDebug(!constrainedDecodingDebug)} />
                {t('constrainedDecodingDebug')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <input type="checkbox" checked={isFormatCaption} onChange={() => setIsFormatCaption(!isFormatCaption)} />
                {t('formatCaption')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <input type="checkbox" checked={getScores} onChange={() => setGetScores(!getScores)} />
                {t('getScores')}
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <input type="checkbox" checked={getLrc} onChange={() => setGetLrc(!getLrc)} />
                {t('getLrcLyrics')}
              </label>
            </div>
          </div>
        )}
      </div>

      {showAudioModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setShowAudioModal(false); setPlayingTrackId(null); }}
          />
          <div className="relative w-[92%] max-w-lg rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-zinc-900 dark:text-white">
                    {audioModalTarget === 'reference' ? 'Reference' : 'Cover'}
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                    {audioModalTarget === 'reference'
                      ? 'Create songs inspired by a reference track'
                      : 'Transform an existing track into a new version'}
                  </p>
                </div>
                <button
                  onClick={() => { setShowAudioModal(false); setPlayingTrackId(null); }}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              {/* Upload Button */}
              <button
                type="button"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.mp3,.wav,.flac,audio/*';
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) void uploadReferenceTrack(file);
                  };
                  input.click();
                }}
                disabled={isUploadingReference}
                className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-white/20 bg-zinc-50 dark:bg-white/5 px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/10 hover:border-zinc-400 dark:hover:border-white/30 transition-all"
              >
                {isUploadingReference ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Upload audio
                    <span className="text-xs text-zinc-400 ml-1">MP3, WAV, FLAC</span>
                  </>
                )}
              </button>

              {uploadError && (
                <div className="mt-2 text-xs text-rose-500">{uploadError}</div>
              )}
            </div>

            {/* Mine Section */}
            <div className="border-t border-zinc-100 dark:border-white/5">
              <div className="px-5 py-3 flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold">
                  Mine
                </span>
              </div>

              {/* Track List */}
              <div className="max-h-[280px] overflow-y-auto">
                {isLoadingTracks ? (
                  <div className="px-5 py-8 text-center">
                    <RefreshCw size={20} className="animate-spin mx-auto text-zinc-400" />
                    <p className="text-xs text-zinc-400 mt-2">Loading tracks...</p>
                  </div>
                ) : referenceTracks.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <Music2 size={24} className="mx-auto text-zinc-300 dark:text-zinc-600" />
                    <p className="text-sm text-zinc-400 mt-2">No tracks yet</p>
                    <p className="text-xs text-zinc-400 mt-1">Upload audio files to use them as references</p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-white/5">
                    {referenceTracks.map((track) => (
                      <div
                        key={track.id}
                        className="px-5 py-3 flex items-center gap-3 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors group"
                      >
                        {/* Play Button */}
                        <button
                          type="button"
                          onClick={() => toggleModalTrack(track)}
                          className="flex-shrink-0 w-9 h-9 rounded-full bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-white/20 transition-colors"
                        >
                          {playingTrackId === track.id ? (
                            <Pause size={14} fill="currentColor" />
                          ) : (
                            <Play size={14} fill="currentColor" className="ml-0.5" />
                          )}
                        </button>

                        {/* Track Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                              {track.filename.replace(/\.[^/.]+$/, '')}
                            </span>
                            {track.tags && track.tags.length > 0 && (
                              <div className="flex gap-1">
                                {track.tags.slice(0, 2).map((tag, i) => (
                                  <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-200 dark:bg-white/10 text-zinc-600 dark:text-zinc-400">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* Progress bar with seek - show when this track is playing */}
                          {playingTrackId === track.id ? (
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] text-zinc-400 tabular-nums w-8">
                                {formatTime(modalTrackTime)}
                              </span>
                              <div
                                className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 cursor-pointer group/seek"
                                onClick={(e) => {
                                  if (modalAudioRef.current && modalTrackDuration > 0) {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const percent = (e.clientX - rect.left) / rect.width;
                                    modalAudioRef.current.currentTime = percent * modalTrackDuration;
                                  }
                                }}
                              >
                                <div
                                  className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full relative"
                                  style={{ width: modalTrackDuration > 0 ? `${(modalTrackTime / modalTrackDuration) * 100}%` : '0%' }}
                                >
                                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md opacity-0 group-hover/seek:opacity-100 transition-opacity" />
                                </div>
                              </div>
                              <span className="text-[10px] text-zinc-400 tabular-nums w-8 text-right">
                                {formatTime(modalTrackDuration)}
                              </span>
                            </div>
                          ) : (
                            <div className="text-xs text-zinc-400 mt-0.5">
                              {track.duration ? formatTime(track.duration) : '--:--'}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => useReferenceTrack(track)}
                            className="px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
                          >
                            Use
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteReferenceTrack(track.id)}
                            className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-400 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Hidden audio element for modal playback */}
            <audio
              ref={modalAudioRef}
              onTimeUpdate={() => {
                if (modalAudioRef.current) {
                  setModalTrackTime(modalAudioRef.current.currentTime);
                }
              }}
              onLoadedMetadata={() => {
                if (modalAudioRef.current) {
                  setModalTrackDuration(modalAudioRef.current.duration);
                  // Update track duration in database if not set
                  const track = referenceTracks.find(t => t.id === playingTrackId);
                  if (track && !track.duration && token) {
                    fetch(`/api/reference-tracks/${track.id}`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                      },
                      body: JSON.stringify({ duration: Math.round(modalAudioRef.current.duration) })
                    }).then(() => {
                      setReferenceTracks(prev => prev.map(t =>
                        t.id === track.id ? { ...t, duration: Math.round(modalAudioRef.current?.duration || 0) } : t
                      ));
                    }).catch(() => undefined);
                  }
                }
              }}
              onEnded={() => setPlayingTrackId(null)}
            />
          </div>
        </div>
      )}

      {/* Footer Create Button */}
      <div className="p-4 mt-auto sticky bottom-0 bg-zinc-50/95 dark:bg-suno-panel/95 backdrop-blur-sm z-10 border-t border-zinc-200 dark:border-white/5 space-y-3">
        <button
          onClick={handleGenerate}
          className="w-full h-12 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all transform active:scale-[0.98] bg-gradient-to-r from-orange-500 to-pink-600 text-white shadow-lg hover:brightness-110"
          disabled={isGenerating || !isAuthenticated}
        >
          <Sparkles size={18} />
          <span>
            {isGenerating 
              ? t('generating')
              : bulkCount > 1
                ? `${t('createButton')} ${bulkCount} ${t('jobs')} (${bulkCount * batchSize} ${t('variations')})`
                : `${t('createButton')}${batchSize > 1 ? ` (${batchSize} ${t('variations')})` : ''}`
            }
          </span>
        </button>
      </div>
    </div>
  );
};
