import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Song } from '../types';
import { X, Play, Pause, Download, Wand2, Image as ImageIcon, Music, Video, Loader2, Palette, Layers, Zap, Type, Monitor, Aperture, Activity, Circle, Grid, Box, BarChart2, Waves, Disc, Upload, Plus, Trash2, Settings2, MousePointer2, Search, ExternalLink, Sun, Film, Minus } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { useResponsive } from '../context/ResponsiveContext';
import { useTranslation } from 'react-i18next';

interface VideoGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  song: Song | null;
}

type PresetType = 
  | 'NCS Circle' | 'Linear Bars' | 'Dual Mirror' | 'Center Wave' 
  | 'Orbital' | 'Digital Rain' | 'Hexagon' | 'Shockwave' 
  | 'Oscilloscope' | 'Minimal';

interface VisualizerConfig {
  preset: PresetType;
  primaryColor: string;
  secondaryColor: string;
  bgDim: number;
  particleCount: number;
}

interface EffectConfig {
  shake: boolean;
  glitch: boolean;
  vhs: boolean;
  cctv: boolean;
  scanlines: boolean;
  chromatic: boolean;
  bloom: boolean;
  filmGrain: boolean;
  pixelate: boolean;
  strobe: boolean;
  vignette: boolean;
  hueShift: boolean;
  letterbox: boolean;
}

interface EffectIntensities {
  shake: number;
  glitch: number;
  vhs: number;
  cctv: number;
  scanlines: number;
  chromatic: number;
  bloom: number;
  filmGrain: number;
  pixelate: number;
  strobe: number;
  vignette: number;
  hueShift: number;
  letterbox: number;
}

interface TextLayer {
  id: string;
  text: string;
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
  size: number;
  color: string;
  font: string;
}

interface PexelsPhoto {
  id: number;
  src: { large: string; original: string };
  photographer: string;
}

interface PexelsVideo {
  id: number;
  image: string;
  video_files: { link: string; quality: string; width: number }[];
  user: { name: string };
}

function ColumnsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18"/>
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  );
}

export const VideoGeneratorModal: React.FC<VideoGeneratorModalProps> = ({ isOpen, onClose, song }) => {
  const { isMobile } = useResponsive();
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  const PRESETS: { id: PresetType; label: string; icon: React.ReactNode }[] = [
    { id: 'NCS Circle', label: 'Classic NCS', icon: <Circle size={16} /> },
    { id: 'Linear Bars', label: 'Spectrum', icon: <BarChart2 size={16} /> },
    { id: 'Dual Mirror', label: 'Mirror', icon: <ColumnsIcon /> },
    { id: 'Center Wave', label: 'Shockwave', icon: <Waves size={16} /> },
    { id: 'Orbital', label: 'Orbital', icon: <Disc size={16} /> },
    { id: 'Hexagon', label: 'Hex Core', icon: <Box size={16} /> },
    { id: 'Oscilloscope', label: 'Analog', icon: <Activity size={16} /> },
    { id: 'Digital Rain', label: 'Matrix', icon: <Grid size={16} /> },
    { id: 'Shockwave', label: 'Pulse', icon: <Aperture size={16} /> },
    { id: 'Minimal', label: 'Clean', icon: <Type size={16} /> },
  ];

  // FFmpeg Refs
  const ffmpegRef = useRef<FFmpeg | null>(null);

  // Tabs: 'presets' | 'style' | 'text' | 'effects'
  const [activeTab, setActiveTab] = useState('presets');

  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [backgroundType, setBackgroundType] = useState<'random' | 'custom' | 'video'>('random');
  const [backgroundSeed, setBackgroundSeed] = useState(Date.now());
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);

  // Custom Album Art
  const [customAlbumArt, setCustomAlbumArt] = useState<string | null>(null);
  const albumArtInputRef = useRef<HTMLInputElement>(null);
  const customAlbumArtImageRef = useRef<HTMLImageElement | null>(null);

  // Pexels Browser State
  const [showPexelsBrowser, setShowPexelsBrowser] = useState(false);
  const [pexelsTarget, setPexelsTarget] = useState<'background' | 'albumArt'>('background');
  const [pexelsTab, setPexelsTab] = useState<'photos' | 'videos'>('photos');
  const [pexelsQuery, setPexelsQuery] = useState('abstract');
  const [pexelsPhotos, setPexelsPhotos] = useState<PexelsPhoto[]>([]);
  const [pexelsVideos, setPexelsVideos] = useState<PexelsVideo[]>([]);
  const [pexelsLoading, setPexelsLoading] = useState(false);
  const [pexelsApiKey, setPexelsApiKey] = useState<string>(() => localStorage.getItem('pexels_api_key') || '');
  const [showPexelsApiKeyInput, setShowPexelsApiKeyInput] = useState(false);
  const [pexelsError, setPexelsError] = useState<string | null>(null);
  
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState<'idle' | 'capturing' | 'encoding'>('idle');
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const [ffmpegLoading, setFfmpegLoading] = useState(false);

  // Config State
  const [config, setConfig] = useState<VisualizerConfig>({
    preset: 'NCS Circle',
    primaryColor: '#ec4899', // Pink-500
    secondaryColor: '#3b82f6', // Blue-500
    bgDim: 0.6,
    particleCount: 50
  });

  const [effects, setEffects] = useState<EffectConfig>({
    shake: true,
    glitch: false,
    vhs: false,
    cctv: false,
    scanlines: false,
    chromatic: false,
    bloom: false,
    filmGrain: false,
    pixelate: false,
    strobe: false,
    vignette: false,
    hueShift: false,
    letterbox: false
  });

  const [intensities, setIntensities] = useState<EffectIntensities>({
    shake: 0.05,
    glitch: 0.3,
    vhs: 0.5,
    cctv: 0.8,
    scanlines: 0.4,
    chromatic: 0.5,
    bloom: 0.5,
    filmGrain: 0.3,
    pixelate: 0.3,
    strobe: 0.5,
    vignette: 0.5,
    hueShift: 0.5,
    letterbox: 0.5
  });

  // Text Layers State
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);

  // Init default text on load
  useEffect(() => {
    if (song) {
        setTextLayers([
            { id: '1', text: song.title, x: 50, y: 85, size: 52, color: '#ffffff', font: 'Inter' },
            { id: '2', text: song.style.toUpperCase(), x: 50, y: 92, size: 24, color: '#3b82f6', font: 'Inter' }
        ]);
    }
  }, [song]);

  // Use refs for render loop to access latest state without re-binding
  const configRef = useRef(config);
  const effectsRef = useRef(effects);
  const intensitiesRef = useRef(intensities);
  const textLayersRef = useRef(textLayers);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { effectsRef.current = effects; }, [effects]);
  useEffect(() => { intensitiesRef.current = intensities; }, [intensities]);
  useEffect(() => { textLayersRef.current = textLayers; }, [textLayers]);

  // Load FFmpeg
  const loadFFmpeg = useCallback(async () => {
    if (ffmpegRef.current || ffmpegLoading) return;

    setFfmpegLoading(true);
    try {
      const ffmpeg = new FFmpeg();

      ffmpeg.on('progress', ({ progress }) => {
        if (exportStage === 'encoding') {
          setExportProgress(Math.round(progress * 100));
        }
      });

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      ffmpegRef.current = ffmpeg;
      setFfmpegLoaded(true);
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      alert('Failed to load video encoder. Please refresh and try again.');
    } finally {
      setFfmpegLoading(false);
    }
  }, [ffmpegLoading, exportStage]);

  // Load Background Image
  useEffect(() => {
    if (backgroundType === 'video') {
      bgImageRef.current = null;
      return;
    }

    const img = new Image();
    img.crossOrigin = "Anonymous";
    if (backgroundType === 'custom' && customImage) {
      img.src = customImage;
    } else {
      img.src = `https://picsum.photos/seed/${backgroundSeed}/1920/1080?blur=4`;
    }
    img.onload = () => {
      bgImageRef.current = img;
    };
  }, [backgroundSeed, backgroundType, customImage]);

  // Load Background Video
  useEffect(() => {
    if (backgroundType !== 'video' || !videoUrl) {
      if (bgVideoRef.current) {
        bgVideoRef.current.pause();
        bgVideoRef.current = null;
      }
      return;
    }

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    video.onloadeddata = () => {
      bgVideoRef.current = video;
      video.play().catch(console.error);
    };

    video.onerror = () => {
      console.error('Failed to load video:', videoUrl);
      bgVideoRef.current = null;
    };

    return () => {
      video.pause();
      video.src = '';
    };
  }, [backgroundType, videoUrl]);

  // Load Custom Album Art
  useEffect(() => {
    if (!customAlbumArt) {
      customAlbumArtImageRef.current = null;
      return;
    }

    // Clear ref immediately so we don't show stale image
    customAlbumArtImageRef.current = null;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    // Use proxy for external URLs to avoid CORS issues
    const isExternal = customAlbumArt.startsWith('http');
    img.src = isExternal ? `/api/proxy/image?url=${encodeURIComponent(customAlbumArt)}` : customAlbumArt;

    img.onload = () => {
      customAlbumArtImageRef.current = img;
    };
    img.onerror = () => {
      console.error('Failed to load custom album art:', customAlbumArt);
      customAlbumArtImageRef.current = null;
    };
  }, [customAlbumArt]);

  // Initialize Audio & Canvas
  useEffect(() => {
    if (!isOpen || !song) return;

    // Reset basics
    setIsPlaying(false);
    setIsExporting(false);
    setExportProgress(0);
    setExportStage('idle');

    // Audio Setup
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.src = song.audioUrl || '';
    audioRef.current = audio;

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    audioContextRef.current = audioCtx;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    const source = audioCtx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);

    audio.onended = () => {
      setIsPlaying(false);
    };

    // Start Loop
    cancelAnimationFrame(animationRef.current);
    renderLoop();

    return () => {
      audio.pause();
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
      cancelAnimationFrame(animationRef.current);
    };
  }, [isOpen, song]); 

  const togglePlay = async () => {
    if (!audioRef.current || !audioContextRef.current) return;
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const startRecording = async () => {
    if (!canvasRef.current || !song) return;

    // Load FFmpeg if not loaded
    if (!ffmpegRef.current) {
      await loadFFmpeg();
      if (!ffmpegRef.current) return;
    }

    setIsExporting(true);
    setExportStage('capturing');
    setExportProgress(0);

    try {
      await renderOffline();
    } catch (error) {
      console.error('Rendering failed:', error);
      alert('Video rendering failed. Please try again.');
      setIsExporting(false);
      setExportStage('idle');
    }
  };

  const analyzeAudioOffline = async (audioBuffer: AudioBuffer, fps: number): Promise<Uint8Array[]> => {
    const duration = audioBuffer.duration;
    const totalFrames = Math.ceil(duration * fps);
    const samplesPerFrame = Math.floor(audioBuffer.sampleRate / fps);
    const fftSize = 2048;
    const frequencyBinCount = fftSize / 2;

    // Get raw audio data from first channel
    const channelData = audioBuffer.getChannelData(0);
    const frequencyDataFrames: Uint8Array[] = [];

    // Simple FFT approximation using amplitude analysis
    // For each frame, compute frequency-like data from audio samples
    for (let frame = 0; frame < totalFrames; frame++) {
      const startSample = frame * samplesPerFrame;
      const endSample = Math.min(startSample + fftSize, channelData.length);

      const frameData = new Uint8Array(frequencyBinCount);

      // Compute amplitude spectrum approximation
      for (let bin = 0; bin < frequencyBinCount; bin++) {
        let sum = 0;
        const binSize = Math.max(1, Math.floor((endSample - startSample) / frequencyBinCount));
        const binStart = startSample + bin * binSize;
        const binEnd = Math.min(binStart + binSize, endSample);

        for (let i = binStart; i < binEnd && i < channelData.length; i++) {
          sum += Math.abs(channelData[i]);
        }

        const avg = binSize > 0 ? sum / binSize : 0;
        // Scale to 0-255 range with some amplification
        frameData[bin] = Math.min(255, Math.floor(avg * 512));
      }

      frequencyDataFrames.push(frameData);
    }

    return frequencyDataFrames;
  };

  const loadImageAsDataUrl = async (url: string): Promise<string | null> => {
    try {
      // Use proxy for external URLs to avoid CORS issues
      const isExternal = url.startsWith('http') && !url.includes(window.location.host);
      const fetchUrl = isExternal ? `/api/proxy/image?url=${encodeURIComponent(url)}` : url;

      const response = await fetch(fetchUrl);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const renderOffline = async () => {
    if (!song || !ffmpegRef.current) return;

    // Create a separate clean canvas to avoid tainted canvas issues
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ffmpeg = ffmpegRef.current;
    const fps = 30;
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    setExportProgress(1);

    // Pre-load images via proxy to avoid CORS/tainted canvas issues
    let bgImage: HTMLImageElement | null = null;
    let bgVideo: HTMLVideoElement | null = null;
    let albumImage: HTMLImageElement | null = null;

    // Load background video or image
    if (backgroundType === 'video' && videoUrl) {
      bgVideo = document.createElement('video');
      bgVideo.crossOrigin = 'anonymous';
      bgVideo.src = videoUrl;
      bgVideo.muted = true;
      bgVideo.playsInline = true;
      await new Promise<void>((resolve) => {
        bgVideo!.onloadeddata = () => resolve();
        bgVideo!.onerror = () => {
          console.warn('Failed to load background video, falling back to image');
          bgVideo = null;
          resolve();
        };
        bgVideo!.load();
      });
    } else if (bgImageRef.current?.src) {
      const bgDataUrl = await loadImageAsDataUrl(bgImageRef.current.src);
      if (bgDataUrl) {
        bgImage = new Image();
        bgImage.src = bgDataUrl;
        await new Promise<void>((resolve) => {
          bgImage!.onload = () => resolve();
          bgImage!.onerror = () => resolve();
        });
      }
    }

    // Load album art (use custom if set, otherwise song cover)
    const albumArtSource = customAlbumArt || song.coverUrl;
    if (albumArtSource) {
      // Custom album art might already be a data URL
      const albumDataUrl = albumArtSource.startsWith('data:')
        ? albumArtSource
        : await loadImageAsDataUrl(albumArtSource);
      if (albumDataUrl) {
        albumImage = new Image();
        albumImage.src = albumDataUrl;
        await new Promise<void>((resolve) => {
          albumImage!.onload = () => resolve();
          albumImage!.onerror = () => resolve();
        });
      }
    }

    // Fetch and decode audio
    setExportProgress(2);
    const audioUrl = song.audioUrl || '';
    const audioResponse = await fetch(audioUrl);
    const audioArrayBuffer = await audioResponse.arrayBuffer();

    // Keep a copy for FFmpeg
    const audioDataCopy = audioArrayBuffer.slice(0);

    setExportProgress(5);

    // Decode audio for analysis
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(audioArrayBuffer);
    const duration = audioBuffer.duration;
    const totalFrames = Math.ceil(duration * fps);

    setExportProgress(10);

    // Analyze audio to get frequency data for each frame
    const frequencyDataFrames = await analyzeAudioOffline(audioBuffer, fps);

    setExportProgress(15);

    // Render all frames
    const currentConfig = configRef.current;
    const currentEffects = effectsRef.current;
    const currentIntensities = intensitiesRef.current;
    const currentTexts = textLayersRef.current;

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      const time = frameIndex / fps;
      const dataArray = frequencyDataFrames[frameIndex] || new Uint8Array(1024);

      // Create time domain data (simple sine wave approximation based on bass)
      const timeDomain = new Uint8Array(1024);
      let bassSum = 0;
      for (let i = 0; i < 20; i++) bassSum += dataArray[i];
      const bassLevel = bassSum / 20 / 255;
      for (let i = 0; i < timeDomain.length; i++) {
        timeDomain[i] = 128 + Math.sin(i * 0.1 + time * 10) * 64 * bassLevel;
      }

      // Calculate bass and pulse
      let bass = 0;
      for (let i = 0; i < 20; i++) bass += dataArray[i];
      bass = bass / 20;
      const normBass = bass / 255;
      const pulse = 1 + normBass * 0.15;

      // Clear canvas
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      // Draw background (video or image)
      let bgSource: HTMLImageElement | HTMLVideoElement | null = bgImage;

      if (bgVideo) {
        // Seek video to current frame time (loop if video is shorter)
        const videoTime = time % (bgVideo.duration || 1);
        bgVideo.currentTime = videoTime;
        // Wait for seek to complete
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            bgVideo!.removeEventListener('seeked', onSeeked);
            resolve();
          };
          bgVideo!.addEventListener('seeked', onSeeked);
          // Fallback timeout in case seeked never fires
          setTimeout(resolve, 50);
        });
        bgSource = bgVideo;
      }

      if (bgSource) {
        ctx.save();
        ctx.globalAlpha = 1 - currentConfig.bgDim;

        if (currentEffects.shake && normBass > (0.6 - (currentIntensities.shake * 0.3))) {
          const magnitude = currentIntensities.shake * 50;
          const shakeX = (Math.random() - 0.5) * magnitude * normBass;
          const shakeY = (Math.random() - 0.5) * magnitude * normBass;
          ctx.translate(shakeX, shakeY);
        }

        const zoom = 1 + (Math.sin(time * 0.5) * 0.05);
        ctx.translate(centerX, centerY);
        ctx.scale(zoom, zoom);
        ctx.drawImage(bgSource, -width/2, -height/2, width, height);
        ctx.restore();
      }

      // Draw preset
      ctx.save();
      if (currentEffects.shake && normBass > 0.6) {
        const magnitude = currentIntensities.shake * 30;
        const shakeX = (Math.random() - 0.5) * magnitude * normBass;
        const shakeY = (Math.random() - 0.5) * magnitude * normBass;
        ctx.translate(shakeX, shakeY);
      }

      switch(currentConfig.preset) {
        case 'NCS Circle':
          drawNCSCircle(ctx, centerX, centerY, dataArray, pulse, time, currentConfig.primaryColor, currentConfig.secondaryColor);
          break;
        case 'Linear Bars':
          drawLinearBars(ctx, width, height, dataArray, currentConfig.primaryColor, currentConfig.secondaryColor);
          break;
        case 'Dual Mirror':
          drawDualMirror(ctx, width, height, dataArray, currentConfig.primaryColor);
          break;
        case 'Center Wave':
          drawCenterWave(ctx, centerX, centerY, dataArray, time, currentConfig.primaryColor);
          break;
        case 'Orbital':
          drawOrbital(ctx, centerX, centerY, dataArray, time, currentConfig.primaryColor, currentConfig.secondaryColor);
          break;
        case 'Hexagon':
          drawHexagon(ctx, centerX, centerY, dataArray, pulse, time, currentConfig.primaryColor);
          break;
        case 'Oscilloscope':
          drawOscilloscope(ctx, width, height, timeDomain, currentConfig.primaryColor);
          break;
        case 'Digital Rain':
          drawDigitalRain(ctx, width, height, dataArray, time, currentConfig.primaryColor);
          break;
        case 'Shockwave':
          drawShockwave(ctx, centerX, centerY, bass, time, currentConfig.primaryColor);
          break;
      }

      drawParticles(ctx, width, height, time, bass, currentConfig.particleCount, currentConfig.primaryColor);

      if (['NCS Circle', 'Hexagon', 'Orbital', 'Shockwave'].includes(currentConfig.preset) && albumImage) {
        // Draw album art inline with pre-loaded image
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(pulse, pulse);
        ctx.shadowBlur = 40;
        ctx.shadowColor = currentConfig.primaryColor;
        ctx.beginPath();
        ctx.arc(0, 0, 150, 0, Math.PI * 2);
        ctx.closePath();
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'white';
        ctx.stroke();
        ctx.clip();
        ctx.drawImage(albumImage, -150, -150, 300, 300);
        ctx.restore();
      }

      // Pixelate effect (applied before text so text stays sharp)
      if (currentEffects.pixelate) {
        const pixelSize = Math.max(4, Math.floor(16 * currentIntensities.pixelate));
        ctx.imageSmoothingEnabled = false;
        const tempCanvas2 = document.createElement('canvas');
        const smallW = Math.floor(width / pixelSize);
        const smallH = Math.floor(height / pixelSize);
        tempCanvas2.width = smallW;
        tempCanvas2.height = smallH;
        const tempCtx2 = tempCanvas2.getContext('2d')!;
        tempCtx2.drawImage(canvas, 0, 0, smallW, smallH);
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(tempCanvas2, 0, 0, smallW, smallH, 0, 0, width, height);
        ctx.imageSmoothingEnabled = true;
      }

      // Draw text layers
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'black';
      ctx.textAlign = 'center';

      currentTexts.forEach(layer => {
        ctx.fillStyle = layer.color;
        const dynamicSize = layer.id === '1' && currentConfig.preset === 'Minimal' ? layer.size * pulse : layer.size;
        ctx.font = `bold ${dynamicSize}px ${layer.font}, sans-serif`;
        const xPos = (layer.x / 100) * width;
        const yPos = (layer.y / 100) * height;
        ctx.fillText(layer.text, xPos, yPos);
      });

      ctx.restore();

      // Apply post-processing effects
      if (currentEffects.scanlines || currentEffects.cctv) {
        ctx.fillStyle = `rgba(0,0,0,${currentIntensities.scanlines * 0.8})`;
        for (let i = 0; i < height; i += 4) {
          ctx.fillRect(0, i, width, 2);
        }
      }

      if (currentEffects.vhs || currentEffects.chromatic || (currentEffects.glitch && Math.random() > (1 - currentIntensities.glitch))) {
        const intensity = currentEffects.vhs ? currentIntensities.vhs : currentIntensities.chromatic;
        const offset = (10 * intensity) * normBass;
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(255,0,0,${0.2 * intensity})`;
        ctx.fillRect(-offset, 0, width, height);
        ctx.fillStyle = `rgba(0,0,255,${0.2 * intensity})`;
        ctx.fillRect(offset, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';
      }

      if (currentEffects.glitch && Math.random() > (1 - currentIntensities.glitch)) {
        ctx.fillStyle = Math.random() > 0.5 ? currentConfig.primaryColor : '#fff';
        ctx.fillRect(Math.random() * width, Math.random() * height, Math.random() * 200, 4);
      }

      if (currentEffects.cctv) {
        const intensity = currentIntensities.cctv;
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = `rgba(0, 50, 0, ${0.4 * intensity})`;
        ctx.fillRect(0, 0, width, height);

        const grad = ctx.createRadialGradient(centerX, centerY, height * 0.4, centerX, centerY, height * 0.9);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, 'black');
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';
      }

      // Bloom / Glow effect
      if (currentEffects.bloom) {
        const intensity = currentIntensities.bloom;
        ctx.globalCompositeOperation = 'screen';
        ctx.filter = `blur(${15 * intensity}px)`;
        ctx.globalAlpha = 0.4 * intensity;
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }

      // Film Grain
      if (currentEffects.filmGrain) {
        const intensity = currentIntensities.filmGrain;
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const grainAmount = intensity * 50;
        for (let i = 0; i < data.length; i += 16) {
          const noise = (Math.random() - 0.5) * grainAmount;
          data[i] += noise;
          data[i + 1] += noise;
          data[i + 2] += noise;
        }
        ctx.putImageData(imageData, 0, 0);
      }

      // Strobe effect
      if (currentEffects.strobe && normBass > (0.7 - currentIntensities.strobe * 0.3)) {
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(255, 255, 255, ${currentIntensities.strobe * normBass * 0.8})`;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';
      }

      // Vignette effect
      if (currentEffects.vignette) {
        const intensity = currentIntensities.vignette;
        const grad = ctx.createRadialGradient(centerX, centerY, height * 0.3, centerX, centerY, height * 0.8);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, `rgba(0, 0, 0, ${0.8 * intensity})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      }

      // Hue Shift effect
      if (currentEffects.hueShift) {
        const hueRotation = currentIntensities.hueShift * 360 * (1 + normBass * 0.5);
        ctx.filter = `hue-rotate(${hueRotation}deg)`;
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';
      }

      // Letterbox effect
      if (currentEffects.letterbox) {
        const barHeight = height * 0.12 * currentIntensities.letterbox;
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, barHeight);
        ctx.fillRect(0, height - barHeight, width, barHeight);
      }

      // Capture frame
      const frameData = canvas.toDataURL('image/jpeg', 0.85);
      const base64Data = frameData.split(',')[1];
      const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      await ffmpeg.writeFile(`frame${String(frameIndex).padStart(6, '0')}.jpg`, binaryData);

      // Update progress (15-70% for frame rendering)
      if (frameIndex % 10 === 0) {
        setExportProgress(15 + Math.round((frameIndex / totalFrames) * 55));
      }
    }

    setExportStage('encoding');
    setExportProgress(70);

    // Write audio file
    console.log('[Video] Writing audio file...');
    await ffmpeg.writeFile('audio.mp3', new Uint8Array(audioDataCopy));

    setExportProgress(75);

    // Encode video - use ultrafast preset for browser performance
    console.log(`[Video] Encoding ${totalFrames} frames at ${fps}fps...`);
    console.log('[Video] This may take a while in the browser. Please wait...');

    const encodeResult = await ffmpeg.exec([
      '-framerate', String(fps),
      '-i', 'frame%06d.jpg',
      '-i', 'audio.mp3',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',  // Fastest encoding
      '-tune', 'fastdecode',   // Optimize for fast decoding
      '-crf', '28',            // Slightly lower quality but much faster
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',          // Lower bitrate audio
      '-shortest',
      '-movflags', '+faststart',
      'output.mp4'
    ]);
    console.log('[Video] FFmpeg encode result:', encodeResult);

    setExportProgress(95);

    // Read and download output
    console.log('[Video] Reading output file...');
    const outputData = await ffmpeg.readFile('output.mp4');
    console.log('[Video] Output file size:', outputData.length, 'bytes');

    if (outputData.length === 0) {
      throw new Error('FFmpeg produced an empty output file');
    }

    const blob = new Blob([outputData], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    console.log('[Video] Created blob URL:', url, 'Size:', blob.size);

    // More reliable download method
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `${song.title || 'suno-video'}.mp4`;
    document.body.appendChild(a);
    a.click();

    // Delay cleanup to ensure download starts
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);

    console.log('[Video] Download triggered!');

    // Cleanup FFmpeg filesystem
    setExportProgress(98);
    for (let i = 0; i < totalFrames; i++) {
      await ffmpeg.deleteFile(`frame${String(i).padStart(6, '0')}.jpg`).catch(() => {});
    }
    await ffmpeg.deleteFile('audio.mp3').catch(() => {});
    await ffmpeg.deleteFile('output.mp4').catch(() => {});
    await audioCtx.close();

    setExportProgress(100);

    // Small delay before hiding the progress to show completion
    setTimeout(() => {
      setIsExporting(false);
      setExportStage('idle');
    }, 500);
  };

  const stopRecording = () => {
    // For offline rendering, we can't really stop mid-process
    // This is kept for compatibility but offline render runs to completion
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = ev.target?.result as string;
            setCustomImage(result);
            setBackgroundType('custom');
        };
        reader.readAsDataURL(file);
    }
  };

  const handleVideoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setBackgroundType('video');
    }
  };

  const searchPexels = async (query: string, type: 'photos' | 'videos') => {
    setPexelsLoading(true);
    setPexelsError(null);
    try {
      const endpoint = type === 'photos'
        ? `/api/pexels/photos?query=${encodeURIComponent(query)}`
        : `/api/pexels/videos?query=${encodeURIComponent(query)}`;

      const headers: HeadersInit = {};
      if (pexelsApiKey) {
        headers['X-Pexels-Api-Key'] = pexelsApiKey;
      }

      const response = await fetch(endpoint, { headers });
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 400 || response.status === 401) {
          setPexelsError(data.error || 'API key required');
          setShowPexelsApiKeyInput(true);
        } else {
          setPexelsError(data.error || 'Search failed');
        }
        return;
      }

      if (type === 'photos') {
        setPexelsPhotos(data.photos || []);
      } else {
        setPexelsVideos(data.videos || []);
      }
    } catch (error) {
      console.error('Pexels search failed:', error);
      setPexelsError('Search failed. Please try again.');
    } finally {
      setPexelsLoading(false);
    }
  };

  const savePexelsApiKey = (key: string) => {
    setPexelsApiKey(key);
    localStorage.setItem('pexels_api_key', key);
    setShowPexelsApiKeyInput(false);
    setPexelsError(null);
    // Retry search with new key
    if (key) {
      searchPexels(pexelsQuery, pexelsTab);
    }
  };

  const selectPexelsPhoto = (photo: PexelsPhoto) => {
    if (pexelsTarget === 'albumArt') {
      setCustomAlbumArt(photo.src.large);
    } else {
      setCustomImage(photo.src.large);
      setBackgroundType('custom');
    }
    setShowPexelsBrowser(false);
  };

  const selectPexelsVideo = (video: PexelsVideo) => {
    // Get best quality video file (prefer HD)
    const hdFile = video.video_files.find(f => f.quality === 'hd' && f.width >= 1280);
    const sdFile = video.video_files.find(f => f.quality === 'sd');
    const videoFile = hdFile || sdFile || video.video_files[0];
    if (videoFile) {
      setVideoUrl(videoFile.link);
      setBackgroundType('video');
      setShowPexelsBrowser(false);
    }
  };

  const openPexelsBrowser = (target: 'background' | 'albumArt' = 'background', tab: 'photos' | 'videos' = 'photos') => {
    setPexelsTarget(target);
    setPexelsTab(target === 'albumArt' ? 'photos' : tab); // Album art is always photos
    setShowPexelsBrowser(true);
    const searchTab = target === 'albumArt' ? 'photos' : tab;
    if ((searchTab === 'photos' && pexelsPhotos.length === 0) || (searchTab === 'videos' && pexelsVideos.length === 0)) {
      searchPexels(pexelsQuery, searchTab);
    }
  };

  const handleAlbumArtUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setCustomAlbumArt(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // --- RENDER ENGINE ---
  const renderLoop = () => {
    if (!canvasRef.current || !analyserRef.current || !song) {
        animationRef.current = requestAnimationFrame(renderLoop);
        return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Read current state
    const currentConfig = configRef.current;
    const currentEffects = effectsRef.current;
    const currentIntensities = intensitiesRef.current;
    const currentTexts = textLayersRef.current;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const time = Date.now() / 1000;

    // Data
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const timeDomain = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);
    analyserRef.current.getByteTimeDomainData(timeDomain);


    // Bass Calc
    let bass = 0;
    for (let i = 0; i < 20; i++) bass += dataArray[i];
    bass = bass / 20;
    const normBass = bass / 255;
    const pulse = 1 + normBass * 0.15;

    // --- 1. CLEAR & BACKGROUND ---
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    // Draw video or image background
    const bgSource = bgVideoRef.current && bgVideoRef.current.readyState >= 2
        ? bgVideoRef.current
        : bgImageRef.current;

    if (bgSource) {
        ctx.save();
        ctx.globalAlpha = 1 - currentConfig.bgDim;

        // Shake Effect (Camera)
        if (currentEffects.shake && normBass > (0.6 - (currentIntensities.shake * 0.3))) {
             const magnitude = currentIntensities.shake * 50;
             const shakeX = (Math.random() - 0.5) * magnitude * normBass;
             const shakeY = (Math.random() - 0.5) * magnitude * normBass;
             ctx.translate(shakeX, shakeY);
        }

        const zoom = 1 + (Math.sin(time * 0.5) * 0.05);
        ctx.translate(centerX, centerY);
        ctx.scale(zoom, zoom);
        ctx.drawImage(bgSource, -width/2, -height/2, width, height);
        ctx.restore();
    }

    // --- 2. PRESET DRAWING ---
    ctx.save();
    
    // Apply Shake to visual elements
    if (currentEffects.shake && normBass > 0.6) {
         const magnitude = currentIntensities.shake * 30;
         const shakeX = (Math.random() - 0.5) * magnitude * normBass;
         const shakeY = (Math.random() - 0.5) * magnitude * normBass;
         ctx.translate(shakeX, shakeY);
    }

    switch(currentConfig.preset) {
        case 'NCS Circle':
            drawNCSCircle(ctx, centerX, centerY, dataArray, pulse, time, currentConfig.primaryColor, currentConfig.secondaryColor);
            break;
        case 'Linear Bars':
            drawLinearBars(ctx, width, height, dataArray, currentConfig.primaryColor, currentConfig.secondaryColor);
            break;
        case 'Dual Mirror':
            drawDualMirror(ctx, width, height, dataArray, currentConfig.primaryColor);
            break;
        case 'Center Wave':
            drawCenterWave(ctx, centerX, centerY, dataArray, time, currentConfig.primaryColor);
            break;
        case 'Orbital':
            drawOrbital(ctx, centerX, centerY, dataArray, time, currentConfig.primaryColor, currentConfig.secondaryColor);
            break;
        case 'Hexagon':
            drawHexagon(ctx, centerX, centerY, dataArray, pulse, time, currentConfig.primaryColor);
            break;
        case 'Oscilloscope':
            drawOscilloscope(ctx, width, height, timeDomain, currentConfig.primaryColor);
            break;
        case 'Digital Rain':
            drawDigitalRain(ctx, width, height, dataArray, time, currentConfig.primaryColor);
            break;
        case 'Shockwave':
             drawShockwave(ctx, centerX, centerY, bass, time, currentConfig.primaryColor);
             break;
    }
    
    drawParticles(ctx, width, height, time, bass, currentConfig.particleCount, currentConfig.primaryColor);

    if (['NCS Circle', 'Hexagon', 'Orbital', 'Shockwave'].includes(currentConfig.preset)) {
        const rawAlbumArtUrl = customAlbumArt || song.coverUrl;
        // Proxy external URLs to avoid CORS issues in fallback
        const albumArtUrl = rawAlbumArtUrl.startsWith('http')
            ? `/api/proxy/image?url=${encodeURIComponent(rawAlbumArtUrl)}`
            : rawAlbumArtUrl;
        drawAlbumArt(ctx, centerX, centerY, pulse, albumArtUrl, currentConfig.primaryColor, customAlbumArtImageRef.current);
    }

    // Pixelate effect (applied before text so text stays sharp)
    if (currentEffects.pixelate) {
        const pixelSize = Math.max(4, Math.floor(16 * currentIntensities.pixelate));
        ctx.imageSmoothingEnabled = false;
        const tempCanvas = document.createElement('canvas');
        const smallW = Math.floor(width / pixelSize);
        const smallH = Math.floor(height / pixelSize);
        tempCanvas.width = smallW;
        tempCanvas.height = smallH;
        const tempCtx = tempCanvas.getContext('2d')!;
        tempCtx.drawImage(canvas, 0, 0, smallW, smallH);
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(tempCanvas, 0, 0, smallW, smallH, 0, 0, width, height);
        ctx.imageSmoothingEnabled = true;
    }

    // --- 3. CUSTOM TEXT LAYERS ---
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'black';
    ctx.textAlign = 'center';

    currentTexts.forEach(layer => {
        ctx.fillStyle = layer.color;
        // Adjust font size by pulse for title-like layers if needed, here we do static or slight pulse
        const dynamicSize = layer.id === '1' && currentConfig.preset === 'Minimal' ? layer.size * pulse : layer.size;
        ctx.font = `bold ${dynamicSize}px ${layer.font}, sans-serif`;
        
        const xPos = (layer.x / 100) * width;
        const yPos = (layer.y / 100) * height;
        
        ctx.fillText(layer.text, xPos, yPos);
    });

    ctx.restore();

    // --- 4. POST-PROCESSING EFFECTS ---
    
    // Scanlines
    if (currentEffects.scanlines || currentEffects.cctv) {
        ctx.fillStyle = `rgba(0,0,0,${currentIntensities.scanlines * 0.8})`;
        for (let i = 0; i < height; i+=4) {
            ctx.fillRect(0, i, width, 2);
        }
    }

    // VHS Color Shift / Chromatic Aberration
    if (currentEffects.vhs || currentEffects.chromatic || (currentEffects.glitch && Math.random() > (1 - currentIntensities.glitch))) {
        const intensity = currentEffects.vhs ? currentIntensities.vhs : currentIntensities.chromatic;
        const offset = (10 * intensity) * normBass;
        ctx.globalCompositeOperation = 'screen';

        // Red Shift - draw colored rectangle offset left
        ctx.fillStyle = `rgba(255,0,0,${0.2 * intensity})`;
        ctx.fillRect(-offset, 0, width, height);

        // Blue Shift - draw colored rectangle offset right
        ctx.fillStyle = `rgba(0,0,255,${0.2 * intensity})`;
        ctx.fillRect(offset, 0, width, height);

        ctx.globalCompositeOperation = 'source-over';
    }

    // Glitch Slices
    if (currentEffects.glitch && Math.random() > (1 - currentIntensities.glitch)) {
        const sliceHeight = Math.random() * 50;
        const sliceY = Math.random() * height;
        const offset = (Math.random() - 0.5) * 40 * currentIntensities.glitch;
        
        ctx.drawImage(canvas, 0, sliceY, width, sliceHeight, offset, sliceY, width, sliceHeight);
        
        // Random colored block
        ctx.fillStyle = Math.random() > 0.5 ? currentConfig.primaryColor : '#fff';
        ctx.fillRect(Math.random()*width, Math.random()*height, Math.random()*200, 4);
    }

    // CCTV Vignette & Grain
    if (currentEffects.cctv) {
        const intensity = currentIntensities.cctv;
        // Green tint
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = `rgba(0, 50, 0, ${0.4 * intensity})`;
        ctx.fillRect(0, 0, width, height);

        // Vignette
        const grad = ctx.createRadialGradient(centerX, centerY, height * 0.4, centerX, centerY, height * 0.9);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, 'black');
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // Date Stamp
        ctx.globalCompositeOperation = 'source-over';
        ctx.font = 'mono 24px monospace';
        ctx.fillStyle = 'white';
        ctx.shadowColor = 'black';
        ctx.fillText(new Date().toLocaleString().toUpperCase(), 60, 60);
        ctx.fillText("REC ●", width - 120, 60);
    }

    // Bloom / Glow effect
    if (currentEffects.bloom) {
        const intensity = currentIntensities.bloom;
        ctx.globalCompositeOperation = 'screen';
        ctx.filter = `blur(${15 * intensity}px)`;
        ctx.globalAlpha = 0.4 * intensity;
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    // Film Grain
    if (currentEffects.filmGrain) {
        const intensity = currentIntensities.filmGrain;
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const grainAmount = intensity * 50;
        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * grainAmount;
            data[i] += noise;
            data[i + 1] += noise;
            data[i + 2] += noise;
        }
        ctx.putImageData(imageData, 0, 0);
    }

    // Strobe effect
    if (currentEffects.strobe && normBass > (0.7 - currentIntensities.strobe * 0.3)) {
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(255, 255, 255, ${currentIntensities.strobe * normBass * 0.8})`;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';
    }

    // Vignette effect
    if (currentEffects.vignette) {
        const intensity = currentIntensities.vignette;
        const grad = ctx.createRadialGradient(centerX, centerY, height * 0.3, centerX, centerY, height * 0.8);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(1, `rgba(0, 0, 0, ${0.8 * intensity})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }

    // Hue Shift effect
    if (currentEffects.hueShift) {
        const hueRotation = currentIntensities.hueShift * 360 * (1 + normBass * 0.5);
        ctx.filter = `hue-rotate(${hueRotation}deg)`;
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';
    }

    // Letterbox effect
    if (currentEffects.letterbox) {
        const barHeight = height * 0.12 * currentIntensities.letterbox;
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, barHeight);
        ctx.fillRect(0, height - barHeight, width, barHeight);
    }

    animationRef.current = requestAnimationFrame(renderLoop);
  };

  // --- DRAWING FUNCTIONS ---
  // (Reusing existing drawing functions from previous step, ensuring they use updated args)
  const drawNCSCircle = (ctx: CanvasRenderingContext2D, cx: number, cy: number, data: Uint8Array, pulse: number, time: number, c1: string, c2: string) => {
    const radius = 150 + (pulse - 1) * 50;
    const bars = 80;
    const step = (Math.PI * 2) / bars;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(time * 0.15);
    for (let i = 0; i < bars; i++) {
        const val = data[i + 10];
        const normalized = val / 255;
        const h = 8 + Math.pow(normalized, 1.5) * 120;
        ctx.save();
        ctx.rotate(i * step);
        const grad = ctx.createLinearGradient(0, radius, 0, radius + h);
        grad.addColorStop(0, c1);
        grad.addColorStop(1, c2);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(-3, radius + 10, 6, h, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.roundRect(-3, radius + 10 + h + 2, 6, 3, 2);
        ctx.fill();
        ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, radius + 150, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  };

  const drawLinearBars = (ctx: CanvasRenderingContext2D, w: number, h: number, data: Uint8Array, c1: string, c2: string) => {
      const bars = 64;
      const barW = w / bars;
      const gap = 2;
      for(let i=0; i<bars; i++) {
          const val = data[i * 2];
          const normalized = val / 255;
          const barH = 10 + Math.pow(normalized, 1.3) * (h * 0.35);
          const grad = ctx.createLinearGradient(0, h/2, 0, h/2 - barH);
          grad.addColorStop(0, c1);
          grad.addColorStop(1, c2);
          ctx.fillStyle = grad;
          ctx.fillRect(i * barW + gap/2, h/2 - barH, barW - gap, barH);
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillRect(i * barW + gap/2, h/2, barW - gap, barH * 0.3);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(0, h/2, w, 1);
  };

  const drawDualMirror = (ctx: CanvasRenderingContext2D, w: number, h: number, data: Uint8Array, color: string) => {
      const bars = 40;
      const barH = h / bars;
      const cy = h/2;
      for(let i=0; i<bars; i++) {
          const val = data[i*3];
          const normalized = val / 255;
          const len = 20 + Math.pow(normalized, 1.4) * (w * 0.3);
          const alpha = 0.4 + normalized * 0.6;
          ctx.fillStyle = color;
          ctx.globalAlpha = alpha;
          ctx.fillRect(0, cy - (i*barH), len, barH-2);
          ctx.fillRect(0, cy + (i*barH), len, barH-2);
          ctx.fillRect(w - len, cy - (i*barH), len, barH-2);
          ctx.fillRect(w - len, cy + (i*barH), len, barH-2);
      }
      ctx.globalAlpha = 1;
  };

  const drawOrbital = (ctx: CanvasRenderingContext2D, cx: number, cy: number, data: Uint8Array, time: number, c1: string, c2: string) => {
      for(let i=0; i<5; i++) {
          const r = 100 + (i * 55);
          const val = data[i*10];
          const normalized = val / 255;
          const width = 4 + normalized * 6;
          ctx.beginPath();
          ctx.strokeStyle = i % 2 === 0 ? c1 : c2;
          ctx.lineWidth = width;
          ctx.shadowBlur = 20;
          ctx.shadowColor = ctx.strokeStyle;
          const direction = i % 2 === 0 ? 1 : -1;
          const speed = direction * (0.5 + i * 0.1);
          const start = time * speed;
          const arcLength = Math.PI * 1.2 + normalized * Math.PI * 0.3;
          ctx.arc(cx, cy, r, start, start + arcLength);
          ctx.stroke();
      }
      ctx.shadowBlur = 0;
  };

  const drawHexagon = (ctx: CanvasRenderingContext2D, cx: number, cy: number, data: Uint8Array, pulse: number, time: number, color: string) => {
      const sides = 6;
      const r = 180 * pulse;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.4);
      ctx.beginPath();
      ctx.lineWidth = 12;
      ctx.strokeStyle = color;
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 25;
      ctx.shadowColor = color;
      for(let i=0; i<=sides; i++) {
          const angle = i * 2 * Math.PI / sides;
          const x = r * Math.cos(angle);
          const y = r * Math.sin(angle);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
      ctx.shadowBlur = 0;
  };

  const drawOscilloscope = (ctx: CanvasRenderingContext2D, w: number, h: number, data: Uint8Array, color: string) => {
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
      ctx.beginPath();
      const sliceWidth = w / data.length;
      let x = 0;
      for(let i = 0; i < data.length; i++) {
          const normalized = (data[i] - 128) / 128.0;
          const dampened = normalized * 0.6;
          const yPos = (h/2) + (dampened * h/2);
          if(i === 0) ctx.moveTo(x, yPos);
          else ctx.lineTo(x, yPos);
          x += sliceWidth;
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h/2);
      ctx.lineTo(w, h/2);
      ctx.stroke();
  };
  
  const drawCenterWave = (ctx: CanvasRenderingContext2D, cx: number, cy: number, data: Uint8Array, time: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8;
      ctx.shadowColor = color;
      for(let i=0; i<12; i++) {
          ctx.beginPath();
          const baseR = 60 + (i * 35);
          const val = data[i*4];
          const normalized = val / 255;
          const r = baseR + Math.pow(normalized, 1.5) * 25;
          ctx.globalAlpha = 0.8 - (i/15);
          ctx.ellipse(cx, cy, r, r * 0.75, time * 0.5 + i * 0.3, 0, Math.PI * 2);
          ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
  };

  const drawDigitalRain = (ctx: CanvasRenderingContext2D, w: number, h: number, data: Uint8Array, time: number, color: string) => {
      const cols = 50;
      const colW = w / cols;
      ctx.fillStyle = color;
      ctx.font = 'bold 14px monospace';
      ctx.shadowBlur = 8;
      ctx.shadowColor = color;
      for(let i=0; i<cols; i++) {
          const val = data[i*2];
          const normalized = val / 255;
          const len = 8 + Math.floor(Math.pow(normalized, 1.3) * 15);
          const baseSpeed = 40 + (i % 5) * 10;
          const speedOffset = (time * baseSpeed) % h;
          for(let j=0; j<len; j++) {
              const char = String.fromCharCode(0x30A0 + Math.random() * 96);
              const y = (speedOffset + (j * 18)) % h;
              ctx.globalAlpha = (1 - (j/len)) * 0.8;
              ctx.fillText(char, i * colW, y);
          }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
  };

  const drawShockwave = (ctx: CanvasRenderingContext2D, cx: number, cy: number, bass: number, time: number, color: string) => {
      const normBass = bass / 255;
      const maxRadius = 500;
      const rings = 6;

      ctx.shadowColor = color;

      for (let i = 0; i < rings; i++) {
          const phase = (time * 0.8 + (i * 0.4)) % 2;
          const progress = phase / 2;
          const radius = 50 + progress * maxRadius;
          const alpha = (1 - progress) * (0.5 + normBass * 0.5);
          const lineWidth = (1 - progress) * (8 + normBass * 12);

          if (alpha > 0.05) {
              ctx.beginPath();
              ctx.strokeStyle = color;
              ctx.lineWidth = lineWidth;
              ctx.globalAlpha = alpha;
              ctx.shadowBlur = 20 + normBass * 30;
              ctx.arc(cx, cy, radius, 0, Math.PI * 2);
              ctx.stroke();
          }
      }

      const coreSize = 30 + normBass * 40;
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize);
      coreGrad.addColorStop(0, color);
      coreGrad.addColorStop(0.5, color);
      coreGrad.addColorStop(1, 'transparent');
      ctx.globalAlpha = 0.6 + normBass * 0.4;
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, coreSize, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
  };

  const drawParticles = (ctx: CanvasRenderingContext2D, w: number, h: number, time: number, bass: number, count: number, color: string) => {
      const normBass = bass / 255;
      const cx = w / 2;
      const cy = h / 2;

      // Rising particles - float upward with drift
      const risingCount = Math.floor(count * 0.4);
      for (let i = 0; i < risingCount; i++) {
          const seed = i * 127.1;
          const xBase = ((Math.sin(seed) * 10000) % w + w) % w;
          const drift = Math.sin(time * 2 + seed) * 30;
          const x = xBase + drift;
          const speed = 20 + (i % 7) * 15;
          const y = h - ((time * speed + seed * 10) % (h + 100));
          const size = 2 + (i % 4) + normBass * 3;
          const twinkle = 0.5 + Math.sin(time * 8 + seed) * 0.3;

          ctx.beginPath();
          ctx.fillStyle = color;
          ctx.shadowBlur = 15 + normBass * 10;
          ctx.shadowColor = color;
          ctx.globalAlpha = twinkle * (0.4 + normBass * 0.4);
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
      }

      // Burst particles - explode from center on bass
      const burstCount = Math.floor(count * 0.35);
      for (let i = 0; i < burstCount; i++) {
          const angle = (i / burstCount) * Math.PI * 2 + time * 0.3;
          const seed = i * 234.5;
          const burstPhase = (time * 1.5 + seed * 0.01) % 3;
          const burstProgress = burstPhase / 3;
          const maxDist = 300 + normBass * 200;
          const dist = burstProgress * maxDist;
          const x = cx + Math.cos(angle) * dist;
          const y = cy + Math.sin(angle) * dist;
          const size = (1 - burstProgress) * (3 + normBass * 4);
          const alpha = (1 - burstProgress) * (0.6 + normBass * 0.4);

          if (size > 0.5 && alpha > 0.1) {
              ctx.beginPath();
              ctx.fillStyle = color;
              ctx.shadowBlur = 10;
              ctx.shadowColor = color;
              ctx.globalAlpha = alpha;
              ctx.arc(x, y, size, 0, Math.PI * 2);
              ctx.fill();
          }
      }

      // Orbital sparkles - circle around center
      const orbitalCount = Math.floor(count * 0.15);
      for (let i = 0; i < orbitalCount; i++) {
          const orbitRadius = 150 + (i % 4) * 80 + normBass * 50;
          const speed = (i % 2 === 0 ? 1 : -1) * (0.8 + (i % 3) * 0.3);
          const angle = time * speed + (i / orbitalCount) * Math.PI * 2;
          const x = cx + Math.cos(angle) * orbitRadius;
          const y = cy + Math.sin(angle) * orbitRadius;
          const sparkle = 0.5 + Math.sin(time * 12 + i * 5) * 0.5;
          const size = 2 + sparkle * 2 + normBass * 2;

          ctx.beginPath();
          ctx.fillStyle = '#fff';
          ctx.shadowBlur = 20;
          ctx.shadowColor = color;
          ctx.globalAlpha = sparkle * 0.8;
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
      }

      // Floating dust - subtle background particles
      const dustCount = Math.floor(count * 0.1);
      for (let i = 0; i < dustCount; i++) {
          const seed = i * 567.8;
          const x = ((Math.sin(seed) * 10000) % w + w) % w;
          const y = ((Math.cos(seed) * 10000) % h + h) % h;
          const drift = Math.sin(time + seed) * 2;
          const size = 1 + Math.sin(time * 3 + seed) * 0.5;

          ctx.beginPath();
          ctx.fillStyle = '#fff';
          ctx.shadowBlur = 5;
          ctx.shadowColor = '#fff';
          ctx.globalAlpha = 0.2 + normBass * 0.2;
          ctx.arc(x + drift, y, size, 0, Math.PI * 2);
          ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
  };

  const drawAlbumArt = (ctx: CanvasRenderingContext2D, cx: number, cy: number, pulse: number, url: string, borderColor: string, preloadedImage?: HTMLImageElement | null) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);
    ctx.shadowBlur = 40;
    ctx.shadowColor = borderColor;
    ctx.beginPath();
    ctx.arc(0, 0, 150, 0, Math.PI * 2);
    ctx.closePath();
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'white';
    ctx.stroke();
    ctx.clip();

    // Use preloaded image if available, otherwise try to draw from URL
    if (preloadedImage && preloadedImage.complete) {
        ctx.drawImage(preloadedImage, -150, -150, 300, 300);
    } else {
        const img = new Image();
        img.src = url;
        if (img.complete) {
            ctx.drawImage(img, -150, -150, 300, 300);
        } else {
            ctx.fillStyle = '#111';
            ctx.fillRect(-150, -150, 300, 300);
        }
    }
    ctx.restore();
  };

  const addTextLayer = () => {
      const newLayer: TextLayer = {
          id: Date.now().toString(),
          text: 'New Text',
          x: 50,
          y: 50,
          size: 40,
          color: '#ffffff',
          font: 'Inter'
      };
      setTextLayers([...textLayers, newLayer]);
  };

  const updateTextLayer = (id: string, updates: Partial<TextLayer>) => {
      setTextLayers(textLayers.map(l => l.id === id ? { ...l, ...updates } : l));
  };

  const removeTextLayer = (id: string) => {
      setTextLayers(textLayers.filter(l => l.id !== id));
  };

  if (!isOpen || !song) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-0 md:p-4 animate-in fade-in duration-200">

      <div className={`bg-suno-card w-full h-full md:max-w-7xl md:h-[90vh] md:rounded-2xl border-0 md:border border-white/10 overflow-hidden shadow-2xl relative ${isMobile ? 'flex flex-col' : 'flex'}`}>

        {/* Close Button */}
        <button onClick={onClose} className="absolute top-3 right-3 md:top-4 md:right-4 z-50 p-2 bg-black/50 hover:bg-white/20 rounded-full text-white transition-colors">
            <X size={isMobile ? 20 : 24} />
        </button>

        {/* Mobile: Preview at top */}
        {isMobile && (
          <div className="relative bg-black flex-shrink-0">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 z-10 p-3 bg-gradient-to-b from-black/80 to-transparent">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Video className="text-pink-500" size={18} />
                {t('video.title')}
              </h2>
            </div>

            {/* Canvas Preview */}
            <div className="aspect-video w-full">
              <canvas
                ref={canvasRef}
                width={1920}
                height={1080}
                className="w-full h-full object-contain bg-[#0a0a0a]"
              />
            </div>

            {/* Playback Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-center">
              <button
                onClick={togglePlay}
                disabled={isExporting}
                className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-xl tap-highlight-none disabled:opacity-50"
              >
                {isPlaying ? <Pause fill="black" size={22} /> : <Play fill="black" className="ml-1" size={22} />}
              </button>
            </div>
          </div>
        )}

        {/* Sidebar Controls */}
        <div className={`${isMobile ? 'flex-1 overflow-hidden' : 'w-96'} bg-suno-panel ${isMobile ? '' : 'border-r border-white/5'} flex flex-col z-20`}>
            {/* Header - Desktop only */}
            {!isMobile && (
              <div className="p-6 border-b border-white/5">
                  <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                      <Video className="text-pink-500" size={20} />
                      {t('video.title')}
                  </h2>
                  <p className="text-zinc-500 text-xs">{t('video.subtitle')}</p>
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-white/5">
                {[
                    { id: 'presets', label: t('video.presets'), icon: <Grid size={14} /> },
                    { id: 'style', label: t('video.style'), icon: <Palette size={14} /> },
                    { id: 'text', label: t('video.text'), icon: <Type size={14} /> },
                    { id: 'effects', label: t('video.fx'), icon: <Zap size={14} /> }
                ].map(tab => (
                    <button 
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === tab.id ? 'text-white border-b-2 border-pink-500 bg-white/5' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4 md:space-y-6">
                
                {/* PRESETS TAB */}
                {activeTab === 'presets' && (
                    <div className="grid grid-cols-2 gap-3">
                        {PRESETS.map(preset => (
                            <button
                                key={preset.id}
                                onClick={() => setConfig({ ...config, preset: preset.id })}
                                className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${config.preset === preset.id ? 'bg-pink-600/20 border-pink-500 text-white' : 'bg-black/20 border-white/5 text-zinc-400 hover:bg-white/5 hover:border-white/10'}`}
                            >
                                <div className={`p-2 rounded-full ${config.preset === preset.id ? 'bg-pink-500 text-white' : 'bg-black/40 text-zinc-500'}`}>
                                    {preset.icon}
                                </div>
                                <span className="text-xs font-medium">{preset.label}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* STYLE TAB */}
                {activeTab === 'style' && (
                    <div className="space-y-6">
                         {/* Background */}
                         <div className="space-y-3">
                            <label className="text-xs font-bold text-zinc-500 uppercase flex justify-between">
                                {t('video.background')}
                            </label>
                            <div className="bg-black/20 p-3 rounded-lg border border-white/5 space-y-3">
                                {/* Type Selection */}
                                <div className="grid grid-cols-3 gap-2">
                                     <button
                                        onClick={() => { setBackgroundType('random'); setBackgroundSeed(Date.now()); }}
                                        className={`py-2 rounded text-xs font-bold flex items-center justify-center gap-1 ${backgroundType === 'random' ? 'bg-pink-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}
                                     >
                                         <Wand2 size={12}/> {t('video.random')}
                                     </button>
                                     <button
                                        onClick={() => setBackgroundType('custom')}
                                        className={`py-2 rounded text-xs font-bold flex items-center justify-center gap-1 ${backgroundType === 'custom' ? 'bg-pink-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}
                                     >
                                         <ImageIcon size={12}/> {t('video.image')}
                                     </button>
                                     <button
                                        onClick={() => setBackgroundType('video')}
                                        className={`py-2 rounded text-xs font-bold flex items-center justify-center gap-1 ${backgroundType === 'video' ? 'bg-pink-600 text-white' : 'bg-zinc-800 text-zinc-400'}`}
                                     >
                                         <Video size={12}/> {t('video.video')}
                                     </button>
                                </div>

                                {/* Image Options */}
                                {backgroundType === 'custom' && (
                                    <div className="space-y-2">
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="py-2 px-3 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-white flex items-center justify-center gap-1"
                                            >
                                                <Upload size={12}/> {t('video.upload')}
                                            </button>
                                            <button
                                                onClick={() => openPexelsBrowser('background', 'photos')}
                                                className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 rounded text-xs text-white flex items-center justify-center gap-1"
                                            >
                                                <Search size={12}/> {t('video.pexels')}
                                            </button>
                                        </div>
                                        {customImage && (
                                            <div className="relative rounded overflow-hidden h-20">
                                                <img src={customImage} alt="Background" className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Video Options */}
                                {backgroundType === 'video' && (
                                    <div className="space-y-2">
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => videoFileInputRef.current?.click()}
                                                className="py-2 px-3 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-white flex items-center justify-center gap-1"
                                            >
                                                <Upload size={12}/> {t('video.upload')}
                                            </button>
                                            <button
                                                onClick={() => openPexelsBrowser('background', 'videos')}
                                                className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 rounded text-xs text-white flex items-center justify-center gap-1"
                                            >
                                                <Search size={12}/> {t('video.pexels')}
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Or paste video URL..."
                                            value={videoUrl}
                                            onChange={(e) => setVideoUrl(e.target.value)}
                                            className="w-full bg-zinc-800 rounded px-3 py-2 text-xs text-white border border-white/10 placeholder-zinc-500"
                                        />
                                        {videoUrl && (
                                            <p className="text-[10px] text-emerald-400 truncate">✓ Video loaded</p>
                                        )}
                                    </div>
                                )}

                                {/* Hidden File Inputs */}
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                    className="hidden"
                                    accept="image/*"
                                />
                                <input
                                    type="file"
                                    ref={videoFileInputRef}
                                    onChange={handleVideoFileUpload}
                                    className="hidden"
                                    accept="video/*"
                                />

                                <div>
                                    <div className="flex justify-between text-sm text-zinc-300 mb-2">
                                        <span>{t('video.dimming')}</span>
                                        <span>{Math.round(config.bgDim * 100)}%</span>
                                    </div>
                                    <input
                                        type="range" min="0" max="1" step="0.1"
                                        value={config.bgDim}
                                        onChange={(e) => setConfig({...config, bgDim: parseFloat(e.target.value)})}
                                        className="w-full accent-pink-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>
                            </div>
                        </div>

                         {/* Colors */}
                         <div className="space-y-3">
                             <label className="text-xs font-bold text-zinc-500 uppercase">{t('video.colors')}</label>
                             <div className="grid grid-cols-5 gap-2">
                                 {[
                                     { name: 'Neon Pink', primary: '#ec4899', secondary: '#8b5cf6' },
                                     { name: 'Cyber Blue', primary: '#06b6d4', secondary: '#3b82f6' },
                                     { name: 'Sunset', primary: '#f97316', secondary: '#eab308' },
                                     { name: 'Matrix', primary: '#22c55e', secondary: '#10b981' },
                                     { name: 'Fire', primary: '#ef4444', secondary: '#f97316' },
                                     { name: 'Ocean', primary: '#0ea5e9', secondary: '#06b6d4' },
                                     { name: 'Violet', primary: '#a855f7', secondary: '#ec4899' },
                                     { name: 'Gold', primary: '#eab308', secondary: '#f59e0b' },
                                     { name: 'Ice', primary: '#67e8f9', secondary: '#a5f3fc' },
                                     { name: 'Mono', primary: '#ffffff', secondary: '#a1a1aa' },
                                 ].map((preset) => (
                                     <button
                                         key={preset.name}
                                         onClick={() => setConfig({...config, primaryColor: preset.primary, secondaryColor: preset.secondary})}
                                         className={`group relative h-8 rounded-lg overflow-hidden border-2 transition-all ${
                                             config.primaryColor === preset.primary && config.secondaryColor === preset.secondary
                                                 ? 'border-white scale-110 shadow-lg'
                                                 : 'border-transparent hover:border-white/30 hover:scale-105'
                                         }`}
                                         title={preset.name}
                                     >
                                         <div className="absolute inset-0 flex">
                                             <div className="flex-1" style={{ backgroundColor: preset.primary }} />
                                             <div className="flex-1" style={{ backgroundColor: preset.secondary }} />
                                         </div>
                                     </button>
                                 ))}
                             </div>
                         </div>

                         <div className="space-y-3">
                             <label className="text-xs font-bold text-zinc-500 uppercase">{t('video.customColors')}</label>
                             <div className="grid grid-cols-2 gap-4">
                                 <div>
                                     <span className="text-[10px] text-zinc-400 mb-1 block">Primary</span>
                                     <div className="flex items-center gap-2 bg-black/20 p-2 rounded border border-white/5">
                                         <input type="color" value={config.primaryColor} onChange={(e) => setConfig({...config, primaryColor: e.target.value})} className="w-6 h-6 rounded cursor-pointer border-none bg-transparent" />
                                         <span className="text-xs text-zinc-300 font-mono">{config.primaryColor}</span>
                                     </div>
                                 </div>
                                 <div>
                                     <span className="text-[10px] text-zinc-400 mb-1 block">Secondary</span>
                                      <div className="flex items-center gap-2 bg-black/20 p-2 rounded border border-white/5">
                                         <input type="color" value={config.secondaryColor} onChange={(e) => setConfig({...config, secondaryColor: e.target.value})} className="w-6 h-6 rounded cursor-pointer border-none bg-transparent" />
                                         <span className="text-xs text-zinc-300 font-mono">{config.secondaryColor}</span>
                                     </div>
                                 </div>
                             </div>
                         </div>
                         
                         {/* Particles */}
                         <div className="space-y-3">
                            <div className="flex justify-between text-xs font-bold text-zinc-500 uppercase">
                                <span>{t('video.particles')}</span>
                                <span>{config.particleCount}</span>
                            </div>
                            <input
                                type="range" min="0" max="200" step="10"
                                value={config.particleCount}
                                onChange={(e) => setConfig({...config, particleCount: parseInt(e.target.value)})}
                                className="w-full accent-pink-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                        {/* Center Image (Album Art) */}
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-zinc-500 uppercase">{t('video.centerImage')}</label>
                            <div className="bg-black/20 p-3 rounded-lg border border-white/5 space-y-3">
                                <div className="flex items-center gap-3">
                                    {/* Preview */}
                                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0">
                                        <img
                                            src={customAlbumArt || song?.coverUrl || ''}
                                            alt="Center"
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => albumArtInputRef.current?.click()}
                                                className="py-1.5 px-2 bg-zinc-700 hover:bg-zinc-600 rounded text-[10px] text-white flex items-center justify-center gap-1"
                                            >
                                                <Upload size={10}/> {t('video.upload')}
                                            </button>
                                            <button
                                                onClick={() => openPexelsBrowser('albumArt')}
                                                className="py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 rounded text-[10px] text-white flex items-center justify-center gap-1"
                                            >
                                                <Search size={10}/> {t('video.pexels')}
                                            </button>
                                        </div>
                                        {customAlbumArt && (
                                            <button
                                                onClick={() => setCustomAlbumArt(null)}
                                                className="w-full py-1 text-[10px] text-zinc-500 hover:text-red-400"
                                            >
                                                <Trash2 size={10} className="inline mr-1"/> Remove
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <input
                                    type="file"
                                    ref={albumArtInputRef}
                                    onChange={handleAlbumArtUpload}
                                    className="hidden"
                                    accept="image/*"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* TEXT TAB */}
                {activeTab === 'text' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xs font-bold text-zinc-500 uppercase">Text Layers</h3>
                            <button
                                onClick={addTextLayer}
                                className="text-xs bg-pink-600 hover:bg-pink-700 text-white px-2 py-1 rounded flex items-center gap-1"
                            >
                                <Plus size={12}/> Add
                            </button>
                        </div>

                        {textLayers.map((layer, index) => (
                            <div key={layer.id} className="bg-black/20 p-3 rounded-lg border border-white/5 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-zinc-400">Layer {index + 1}</span>
                                    <button
                                        onClick={() => removeTextLayer(layer.id)}
                                        className="text-zinc-500 hover:text-red-400"
                                    >
                                        <Trash2 size={14}/>
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    value={layer.text}
                                    onChange={(e) => updateTextLayer(layer.id, { text: e.target.value })}
                                    className="w-full bg-zinc-800 rounded px-2 py-1.5 text-xs text-white border border-white/10"
                                    placeholder="Enter text..."
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <span className="text-[10px] text-zinc-500 block mb-1">Size</span>
                                        <input
                                            type="number"
                                            value={layer.size}
                                            onChange={(e) => updateTextLayer(layer.id, { size: parseInt(e.target.value) })}
                                            className="w-full bg-zinc-800 rounded px-2 py-1 text-xs text-white border border-white/10"
                                        />
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-zinc-500 block mb-1">Color</span>
                                        <div className="flex items-center gap-2 bg-zinc-800 rounded px-2 py-1 border border-white/10 h-[26px]">
                                            <input
                                                type="color"
                                                value={layer.color}
                                                onChange={(e) => updateTextLayer(layer.id, { color: e.target.value })}
                                                className="w-4 h-4 rounded border-none bg-transparent cursor-pointer"
                                            />
                                            <span className="text-[10px] text-zinc-400 font-mono">{layer.color}</span>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <span className="text-[10px] text-zinc-500 block mb-1">Position (X, Y %)</span>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="range" min="0" max="100"
                                            value={layer.x}
                                            onChange={(e) => updateTextLayer(layer.id, { x: parseInt(e.target.value) })}
                                            className="w-full accent-pink-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                                        />
                                        <input
                                            type="range" min="0" max="100"
                                            value={layer.y}
                                            onChange={(e) => updateTextLayer(layer.id, { y: parseInt(e.target.value) })}
                                            className="w-full accent-pink-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* EFFECTS TAB */}
                {activeTab === 'effects' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            {Object.entries(effects).map(([key, enabled]) => (
                                <div key={key} className={`p-3 rounded-lg border transition-all ${enabled ? 'bg-pink-900/20 border-pink-500/50' : 'bg-black/20 border-white/5'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold capitalize text-zinc-300">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                        <button
                                            onClick={() => setEffects({ ...effects, [key]: !enabled })}
                                            className={`w-8 h-4 rounded-full relative transition-colors ${enabled ? 'bg-pink-500' : 'bg-zinc-700'}`}
                                        >
                                            <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                    {enabled && (
                                        <div className="space-y-1">
                                            <div className="flex justify-between text-[10px] text-zinc-500">
                                                <span>Intensity</span>
                                                <span>{Math.round(intensities[key as keyof EffectIntensities] * 100)}%</span>
                                            </div>
                                            <input
                                                type="range" min="0" max="1" step="0.05"
                                                value={intensities[key as keyof EffectIntensities]}
                                                onChange={(e) => setIntensities({ ...intensities, [key]: parseFloat(e.target.value) })}
                                                className="w-full accent-pink-500 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                                            />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 md:p-6 border-t border-white/5 bg-black/20">
                {!ffmpegLoaded && !ffmpegLoading && (
                    <div className="mb-3 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-200 text-center">
                        Video encoder not loaded.
                        <button onClick={loadFFmpeg} className="ml-2 underline font-bold hover:text-white">Load Now</button>
                    </div>
                )}
                
                {isExporting ? (
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold text-zinc-400">
                            <span>{exportStage === 'capturing' ? 'Rendering Frames...' : 'Encoding Video...'}</span>
                            <span>{exportProgress}%</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-300"
                                style={{ width: `${exportProgress}%` }}
                            />
                        </div>
                        <button 
                            onClick={() => window.location.reload()} // Hard stop
                            className="w-full mt-2 py-2 text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={startRecording}
                        disabled={!ffmpegLoaded}
                        className="w-full py-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white rounded-xl font-bold shadow-lg shadow-pink-900/20 transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {ffmpegLoading ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                        Export Video
                    </button>
                )}
            </div>
        </div>

        {/* Pexels Browser Modal Overlay */}
        {showPexelsBrowser && (
            <div className="absolute inset-0 z-50 bg-zinc-900 flex flex-col animate-in fade-in duration-200">
                <div className="p-4 border-b border-white/10 flex items-center gap-3 bg-zinc-900/95 backdrop-blur z-10">
                    <button onClick={() => setShowPexelsBrowser(false)} className="p-2 hover:bg-white/10 rounded-full text-white">
                        <X size={20} />
                    </button>
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                        <input
                            type="text"
                            value={pexelsQuery}
                            onChange={(e) => setPexelsQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && searchPexels(pexelsQuery, pexelsTab)}
                            placeholder={`Search Pexels ${pexelsTab}...`}
                            className="w-full bg-zinc-800 text-white pl-10 pr-4 py-2 rounded-lg text-sm border border-white/5 focus:border-pink-500 focus:outline-none"
                            autoFocus
                        />
                    </div>
                    {pexelsTarget !== 'albumArt' && (
                        <div className="flex bg-zinc-800 rounded-lg p-1">
                            <button
                                onClick={() => { setPexelsTab('photos'); searchPexels(pexelsQuery, 'photos'); }}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${pexelsTab === 'photos' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                            >
                                Photos
                            </button>
                            <button
                                onClick={() => { setPexelsTab('videos'); searchPexels(pexelsQuery, 'videos'); }}
                                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${pexelsTab === 'videos' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                            >
                                Videos
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {showPexelsApiKeyInput ? (
                        <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center space-y-4">
                            <KeyIcon size={48} className="text-zinc-600" />
                            <h3 className="text-xl font-bold text-white">Pexels API Key Required</h3>
                            <p className="text-zinc-400 text-sm">To search Pexels, you need a free API key. Get one at pexels.com/api</p>
                            <input
                                type="password"
                                placeholder="Paste API Key here"
                                className="w-full bg-zinc-800 border border-white/10 rounded-lg px-4 py-2 text-white"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        savePexelsApiKey((e.target as HTMLInputElement).value);
                                    }
                                }}
                            />
                            <button
                                onClick={() => savePexelsApiKey((document.querySelector('input[type="password"]') as HTMLInputElement)?.value)}
                                className="px-6 py-2 bg-pink-600 text-white rounded-lg font-bold hover:bg-pink-500"
                            >
                                Save Key
                            </button>
                        </div>
                    ) : pexelsError ? (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2">
                            <p>{pexelsError}</p>
                            <button onClick={() => searchPexels(pexelsQuery, pexelsTab)} className="text-pink-500 hover:underline text-sm">Try Again</button>
                            <button onClick={() => setShowPexelsApiKeyInput(true)} className="text-xs text-zinc-600 hover:text-zinc-400">Update API Key</button>
                        </div>
                    ) : pexelsLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="animate-spin text-pink-500" size={32} />
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {pexelsTab === 'photos' ? (
                                pexelsPhotos.map(photo => (
                                    <div
                                        key={photo.id}
                                        onClick={() => selectPexelsPhoto(photo)}
                                        className="aspect-video relative group cursor-pointer rounded-lg overflow-hidden bg-zinc-800"
                                    >
                                        <img src={photo.src.large} alt={photo.photographer} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                            <p className="text-xs text-white truncate">By {photo.photographer}</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                pexelsVideos.map(video => (
                                    <div
                                        key={video.id}
                                        onClick={() => selectPexelsVideo(video)}
                                        className="aspect-video relative group cursor-pointer rounded-lg overflow-hidden bg-zinc-800"
                                    >
                                        <img src={video.image} alt={video.user.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Play size={24} className="text-white fill-white" />
                                        </div>
                                        <div className="absolute bottom-2 right-2 bg-black/60 px-1.5 rounded text-[10px] text-white font-mono">
                                            VIDEO
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
                <div className="p-2 border-t border-white/5 text-center">
                    <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-zinc-500 hover:text-zinc-300">
                        Photos provided by Pexels
                    </a>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

function KeyIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="7.5" cy="15.5" r="5.5" />
            <path d="m21 2-9.6 9.6" />
            <path d="m15.5 7.5 3 3L22 7l-3-3" />
        </svg>
    );
}
