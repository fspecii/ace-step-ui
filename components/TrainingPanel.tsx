import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  Database, Play, Square, Download, FolderOpen, Save, Loader2, Music2,
  Edit3, Upload, X, Volume2, FileAudio, ChevronRight, Zap, Search,
  Cpu, Wand2, Settings, RefreshCw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { trainingApi, getTrainingAudioUrl, TrainingSample, DatasetSettings } from '../services/api';

type TrainingTab = 'dataset' | 'train' | 'export';

interface DataframeRow {
  [key: string]: unknown;
}

const LANGUAGES = [
  { value: 'instrumental', label: 'Instrumental' },
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'unknown', label: 'Unknown' },
];

const TIME_SIGS = ['', '2', '3', '4', '6', 'N/A'];

const DEVICES = ['auto', 'cuda', 'mps', 'xpu', 'cpu'];
const BACKENDS = ['pt', 'vllm', 'mlx'];

// Pipeline step definitions
const PIPELINE_STEPS = [
  { key: 'upload', label: 'Upload', icon: Upload },
  { key: 'edit', label: 'Edit', icon: Edit3 },
  { key: 'save', label: 'Save', icon: Save },
  { key: 'preprocess', label: 'Preprocess', icon: Zap },
  { key: 'train', label: 'Train', icon: Play },
  { key: 'export', label: 'Export', icon: Download },
] as const;

type PipelineStepKey = typeof PIPELINE_STEPS[number]['key'];

export const TrainingPanel: React.FC = () => {
  const { token } = useAuth();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<TrainingTab>('dataset');

  // Pipeline completion tracking
  const [completedSteps, setCompletedSteps] = useState<Set<PipelineStepKey>>(new Set());

  // Model / Service config state
  const [showModelConfig, setShowModelConfig] = useState(false);
  const [modelCheckpoints, setModelCheckpoints] = useState<string[]>([]);
  const [modelConfigs, setModelConfigs] = useState<string[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState('');
  const [selectedConfig, setSelectedConfig] = useState('');
  const [selectedDevice, setSelectedDevice] = useState('auto');
  const [selectedBackend, setSelectedBackend] = useState('pt');
  const [initLlm, setInitLlm] = useState(false);
  const [lmModelPath, setLmModelPath] = useState('');
  const [useFlashAttention, setUseFlashAttention] = useState(false);
  const [offloadToCpu, setOffloadToCpu] = useState(false);
  const [offloadDitToCpu, setOffloadDitToCpu] = useState(false);
  const [compileModel, setCompileModel] = useState(false);
  const [quantization, setQuantization] = useState(false);
  const [modelInitStatus, setModelInitStatus] = useState('');
  const [modelInitializing, setModelInitializing] = useState(false);

  // Upload state
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [uploadDatasetName, setUploadDatasetName] = useState('my_lora_dataset');
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scan directory state
  const [scanDir, setScanDir] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');

  // Dataset state
  const [datasetPath, setDatasetPath] = useState('./datasets/my_lora_dataset.json');
  const [datasetLoaded, setDatasetLoaded] = useState(false);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [currentSampleIdx, setCurrentSampleIdx] = useState(0);
  const [currentSample, setCurrentSample] = useState<TrainingSample | null>(null);
  const [datasetSettings, setDatasetSettings] = useState<DatasetSettings>({
    datasetName: 'my_lora_dataset',
    customTag: '',
    tagPosition: 'replace',
    allInstrumental: true,
    genreRatio: 0,
  });
  const [datasetStatus, setDatasetStatus] = useState('');

  // Dataset table state
  const [dataframeHeaders, setDataframeHeaders] = useState<string[]>([]);
  const [dataframeRows, setDataframeRows] = useState<DataframeRow[]>([]);

  // Auto-label state
  const [autoLabeling, setAutoLabeling] = useState(false);
  const [autoLabelStatus, setAutoLabelStatus] = useState('');
  const [skipMetas, setSkipMetas] = useState(false);
  const [formatLyrics, setFormatLyrics] = useState(false);
  const [transcribeLyrics, setTranscribeLyrics] = useState(false);
  const [onlyUnlabeled, setOnlyUnlabeled] = useState(false);

  // Editing sample state
  const [editCaption, setEditCaption] = useState('');
  const [editGenre, setEditGenre] = useState('');
  const [editPromptOverride, setEditPromptOverride] = useState('Use Global Ratio');
  const [editLyrics, setEditLyrics] = useState('');
  const [editBpm, setEditBpm] = useState(120);
  const [editKey, setEditKey] = useState('');
  const [editTimeSig, setEditTimeSig] = useState('');
  const [editDuration, setEditDuration] = useState(0);
  const [editLanguage, setEditLanguage] = useState('instrumental');
  const [editInstrumental, setEditInstrumental] = useState(true);
  const [editRawLyrics, setEditRawLyrics] = useState('');

  // Dataset save state
  const [savePath, setSavePath] = useState('./datasets/my_lora_dataset.json');
  const [saveStatus, setSaveStatus] = useState('');
  const [editSaveStatus, setEditSaveStatus] = useState('');

  // Preprocess state — has its own load-existing-dataset sub-section (matches Gradio)
  const [preprocessDatasetPath, setPreprocessDatasetPath] = useState('./datasets/my_lora_dataset.json');
  const [preprocessDatasetLoading, setPreprocessDatasetLoading] = useState(false);
  const [preprocessDatasetStatus, setPreprocessDatasetStatus] = useState('');
  const [preprocessOutputDir, setPreprocessOutputDir] = useState('./datasets/preprocessed_tensors');
  const [preprocessing, setPreprocessing] = useState(false);
  const [preprocessStatus, setPreprocessStatus] = useState('');

  // Training state
  const [trainingParams, setTrainingParams] = useState({
    tensorDir: './datasets/preprocessed_tensors',
    rank: 64,
    alpha: 128,
    dropout: 0.1,
    learningRate: 0.0003,
    epochs: 1000,
    batchSize: 1,
    gradientAccumulation: 1,
    saveEvery: 200,
    shift: 3.0,
    seed: 42,
    outputDir: './lora_output',
    resumeCheckpoint: '' as string,
  });
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState('');
  const [trainingLog, setTrainingLog] = useState('');
  const [trainingMetrics, setTrainingMetrics] = useState<unknown>(null);
  const [trainingDatasetInfo, setTrainingDatasetInfo] = useState('');

  // Export state
  const [exportPath, setExportPath] = useState('./lora_output/final_lora');
  const [exportOutputDir, setExportOutputDir] = useState('./lora_output');
  const [exportStatus, setExportStatus] = useState('');

  // Loading states
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Audio preview URL
  const audioPreviewUrl = useMemo(() => {
    if (!currentSample?.audio) return undefined;
    return getTrainingAudioUrl(currentSample.audio);
  }, [currentSample?.audio]);

  const markStep = useCallback((step: PipelineStepKey) => {
    setCompletedSteps(prev => new Set([...prev, step]));
  }, []);

  const populateSampleFields = (sample: TrainingSample) => {
    setEditCaption(sample.caption || '');
    setEditGenre(sample.genre || '');
    setEditPromptOverride(sample.promptOverride || 'Use Global Ratio');
    setEditLyrics(sample.lyrics || '');
    setEditBpm(sample.bpm || 120);
    setEditKey(sample.key || '');
    setEditTimeSig(sample.timeSignature || '');
    setEditDuration(sample.duration || 0);
    setEditLanguage(sample.language || 'instrumental');
    setEditInstrumental(sample.instrumental ?? true);
    setEditRawLyrics(sample.rawLyrics || '');
  };

  // Parse dataframe from Gradio response
  const parseDataframe = (df: unknown) => {
    if (!df || typeof df !== 'object') return;
    const dfObj = df as { headers?: string[]; data?: unknown[][] };
    if (dfObj.headers && Array.isArray(dfObj.data)) {
      setDataframeHeaders(dfObj.headers);
      setDataframeRows(dfObj.data.map(row => {
        const obj: DataframeRow = {};
        dfObj.headers!.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
      }));
    }
  };

  // Load checkpoints on mount
  useEffect(() => {
    if (!token) return;
    trainingApi.getCheckpoints(token).then(result => {
      setModelCheckpoints(result.checkpoints);
      setModelConfigs(result.configs);
      if (result.checkpoints.length > 0 && !selectedCheckpoint) {
        setSelectedCheckpoint(result.checkpoints[0]);
      }
      if (result.configs.length > 0 && !selectedConfig) {
        setSelectedConfig(result.configs[0]);
      }
    }).catch(() => { /* ignore */ });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // === Model init ===
  const handleRefreshCheckpoints = useCallback(async () => {
    if (!token) return;
    try {
      const result = await trainingApi.getCheckpoints(token);
      setModelCheckpoints(result.checkpoints);
      setModelConfigs(result.configs);
    } catch { /* ignore */ }
  }, [token]);

  const handleInitModel = useCallback(async () => {
    if (!token) return;
    setModelInitializing(true);
    setModelInitStatus('Initializing model...');
    try {
      const result = await trainingApi.initModel({
        checkpoint: selectedCheckpoint,
        configPath: selectedConfig,
        device: selectedDevice,
        initLlm,
        lmModelPath,
        backend: selectedBackend,
        useFlashAttention,
        offloadToCpu,
        offloadDitToCpu,
        compileModel,
        quantization,
      }, token);
      setModelInitStatus(result.status || result.error || '');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed';
      setModelInitStatus(msg.includes('501') ? 'Use Gradio UI to initialize model' : msg);
    } finally {
      setModelInitializing(false);
    }
  }, [token, selectedCheckpoint, selectedConfig, selectedDevice, initLlm, lmModelPath, selectedBackend, useFlashAttention, offloadToCpu, offloadDitToCpu, compileModel, quantization]);

  // === Drop zone handlers ===
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f: File) => {
      const ext = f.name.toLowerCase().split('.').pop();
      return ['wav', 'mp3', 'flac', 'ogg', 'opus'].includes(ext || '');
    });
    if (files.length > 0) {
      setQueuedFiles(prev => [...prev, ...files]);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setQueuedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeQueuedFile = useCallback((idx: number) => {
    setQueuedFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // === Upload + Build Dataset ===
  const handleUploadAndBuild = useCallback(async () => {
    if (!token || queuedFiles.length === 0) return;
    setUploading(true);
    setUploadStatus('Uploading files...');
    try {
      await trainingApi.uploadAudio(queuedFiles, uploadDatasetName, token);
      setUploadStatus(`Uploaded ${queuedFiles.length} files. Building dataset...`);
      const result = await trainingApi.buildDataset({
        datasetName: uploadDatasetName,
        customTag: datasetSettings.customTag,
        tagPosition: datasetSettings.tagPosition,
        allInstrumental: datasetSettings.allInstrumental,
      }, token);
      setDatasetLoaded(true);
      setSampleCount(result.sampleCount);
      setCurrentSampleIdx(0);
      if (result.sample) {
        setCurrentSample(result.sample);
        populateSampleFields(result.sample);
      }
      if (result.settings) setDatasetSettings(result.settings);
      if (result.dataframe) parseDataframe(result.dataframe);
      const dp = result.datasetPath || `./datasets/${uploadDatasetName}.json`;
      setDatasetPath(dp);
      setSavePath(dp);
      setDatasetStatus(result.status as string);
      setQueuedFiles([]);
      markStep('upload');
      setUploadStatus('');
    } catch (error) {
      setUploadStatus(`Error: ${error instanceof Error ? error.message : 'Upload failed'}`);
    } finally {
      setUploading(false);
    }
  }, [token, queuedFiles, uploadDatasetName, datasetSettings, markStep]);

  // === Scan directory ===
  const handleScanDirectory = useCallback(async () => {
    if (!token || !scanDir) return;
    setScanning(true);
    setScanStatus('Scanning...');
    try {
      const result = await trainingApi.scanDirectory({
        audioDir: scanDir,
        datasetName: datasetSettings.datasetName,
        customTag: datasetSettings.customTag,
        tagPosition: datasetSettings.tagPosition,
        allInstrumental: datasetSettings.allInstrumental,
      }, token);
      setScanStatus(result.status);
      setSampleCount(result.sampleCount);
      if (result.dataframe) parseDataframe(result.dataframe);
    } catch (error) {
      setScanStatus(`Error: ${error instanceof Error ? error.message : 'Scan failed'}`);
    } finally {
      setScanning(false);
    }
  }, [token, scanDir, datasetSettings]);

  // === Load existing dataset ===
  const handleLoadDataset = useCallback(async () => {
    if (!token || !datasetPath) return;
    setDatasetLoading(true);
    setDatasetStatus(t('loadingDataset'));
    try {
      const result = await trainingApi.loadDataset(datasetPath, token);
      setDatasetLoaded(true);
      setSampleCount(result.sampleCount);
      setCurrentSampleIdx(0);
      setCurrentSample(result.sample);
      populateSampleFields(result.sample);
      setDatasetSettings(result.settings);
      parseDataframe(result.dataframe);
      setDatasetStatus(result.status as string);
      setSavePath(datasetPath);
      markStep('upload');
    } catch (error) {
      setDatasetStatus(`${t('error')}: ${error instanceof Error ? error.message : 'Failed'}`);
    } finally {
      setDatasetLoading(false);
    }
  }, [token, datasetPath, t, markStep]);

  // === Auto-label ===
  const handleAutoLabel = useCallback(async () => {
    if (!token) return;
    setAutoLabeling(true);
    setAutoLabelStatus(t('autoLabeling'));
    try {
      const result = await trainingApi.autoLabel({
        skipMetas,
        formatLyrics,
        transcribeLyrics,
        onlyUnlabeled,
      }, token);
      if (result.dataframe) parseDataframe(result.dataframe);
      setAutoLabelStatus(result.status || result.hint || '');
      // Refresh current sample
      if (token && sampleCount > 0) {
        const sample = await trainingApi.getSamplePreview(currentSampleIdx, token);
        setCurrentSample(sample);
        populateSampleFields(sample);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed';
      setAutoLabelStatus(msg.includes('501') ? 'Auto-label requires model loaded in Gradio UI' : msg);
    } finally {
      setAutoLabeling(false);
    }
  }, [token, skipMetas, formatLyrics, transcribeLyrics, onlyUnlabeled, sampleCount, currentSampleIdx, t]);

  // === Sample navigation ===
  const handleSampleNavigate = useCallback(async (idx: number) => {
    if (!token || idx < 0 || idx >= sampleCount) return;
    setCurrentSampleIdx(idx);
    try {
      const sample = await trainingApi.getSamplePreview(idx, token);
      setCurrentSample(sample);
      populateSampleFields(sample);
    } catch (error) {
      console.error('Failed to load sample:', error);
    }
  }, [token, sampleCount]);

  // === Save sample ===
  const handleSaveSample = useCallback(async () => {
    if (!token) return;
    setSaving(true);
    try {
      const result = await trainingApi.saveSample({
        sampleIdx: currentSampleIdx,
        caption: editCaption,
        genre: editGenre,
        promptOverride: editPromptOverride,
        lyrics: editLyrics,
        bpm: editBpm,
        key: editKey,
        timeSignature: editTimeSig,
        language: editLanguage,
        instrumental: editInstrumental,
      }, token);
      if (result.dataframe) parseDataframe(result.dataframe);
      setEditSaveStatus(result.status as string);
      markStep('edit');
    } catch (error) {
      setEditSaveStatus(`${t('error')}: ${error instanceof Error ? error.message : 'Failed'}`);
    } finally {
      setSaving(false);
    }
  }, [token, currentSampleIdx, editCaption, editGenre, editPromptOverride, editLyrics, editBpm, editKey, editTimeSig, editLanguage, editInstrumental, t, markStep]);

  // === Update settings ===
  const handleUpdateSettings = useCallback(async () => {
    if (!token) return;
    try {
      await trainingApi.updateSettings({
        customTag: datasetSettings.customTag,
        tagPosition: datasetSettings.tagPosition,
        allInstrumental: datasetSettings.allInstrumental,
        genreRatio: datasetSettings.genreRatio,
      }, token);
      setDatasetStatus('Settings updated');
    } catch (error) {
      setDatasetStatus(`${t('error')}: ${error instanceof Error ? error.message : 'Failed'}`);
    }
  }, [token, datasetSettings, t]);

  // === Save dataset ===
  const handleSaveDataset = useCallback(async () => {
    if (!token) return;
    setSaving(true);
    setSaveStatus(t('savingDataset'));
    try {
      const result = await trainingApi.saveDataset({
        savePath: savePath || `./datasets/${datasetSettings.datasetName}.json`,
        datasetName: datasetSettings.datasetName,
        customTag: datasetSettings.customTag,
        tagPosition: datasetSettings.tagPosition,
        allInstrumental: datasetSettings.allInstrumental,
        genreRatio: datasetSettings.genreRatio,
      }, token);
      setSaveStatus(result.status as string);
      if (result.path) setSavePath(result.path);
      markStep('save');
    } catch (error) {
      setSaveStatus(`${t('error')}: ${error instanceof Error ? error.message : 'Failed'}`);
    } finally {
      setSaving(false);
    }
  }, [token, savePath, datasetSettings.datasetName, t, markStep]);

  // === Load existing dataset for preprocessing (matches Gradio's load_existing_dataset_for_preprocess) ===
  const handleLoadDatasetForPreprocess = useCallback(async () => {
    if (!token) return;
    setPreprocessDatasetLoading(true);
    setPreprocessDatasetStatus('Loading dataset for preprocessing...');
    try {
      const result = await trainingApi.loadDataset(preprocessDatasetPath, token);
      setPreprocessDatasetStatus(result.status || `Loaded ${result.sampleCount} samples`);
      if (result.sampleCount) setSampleCount(result.sampleCount);
      if (result.dataframe) parseDataframe(result.dataframe);
    } catch (error) {
      setPreprocessDatasetStatus(`Error: ${error instanceof Error ? error.message : 'Failed to load'}`);
    } finally {
      setPreprocessDatasetLoading(false);
    }
  }, [token, preprocessDatasetPath]);

  // === Preprocess ===
  const handlePreprocess = useCallback(async () => {
    if (!token) return;
    setPreprocessing(true);
    setPreprocessStatus('Preprocessing...');
    try {
      const result = await trainingApi.preprocess({
        datasetPath: preprocessDatasetPath || savePath || datasetPath,
        outputDir: preprocessOutputDir,
      }, token);
      setPreprocessStatus(result.message || result.status);
      markStep('preprocess');
    } catch (error) {
      setPreprocessStatus(`Error: ${error instanceof Error ? error.message : 'Preprocessing failed'}`);
    } finally {
      setPreprocessing(false);
    }
  }, [token, preprocessDatasetPath, savePath, datasetPath, preprocessOutputDir, markStep]);

  // === Load tensors ===
  const handleLoadTensors = useCallback(async () => {
    if (!token) return;
    try {
      const result = await trainingApi.loadTensors(trainingParams.tensorDir, token);
      setTrainingDatasetInfo(result.status);
    } catch (error) {
      setTrainingDatasetInfo(`Error: ${error instanceof Error ? error.message : 'Failed'}`);
    }
  }, [token, trainingParams.tensorDir]);

  // === Training ===
  const handleStartTraining = useCallback(async () => {
    if (!token) return;
    setIsTraining(true);
    setTrainingProgress(t('startingTraining'));
    setTrainingLog('');
    setTrainingMetrics(null);
    try {
      const result = await trainingApi.startTraining({
        ...trainingParams,
        resumeCheckpoint: trainingParams.resumeCheckpoint || null,
      }, token);
      setTrainingProgress(result.progress as string);
      setTrainingLog(result.log as string);
      setTrainingMetrics(result.metrics);
      markStep('train');
    } catch (error) {
      setTrainingProgress(`${t('error')}: ${error instanceof Error ? error.message : 'Failed'}`);
    } finally {
      setIsTraining(false);
    }
  }, [token, trainingParams, t, markStep]);

  const handleStopTraining = useCallback(async () => {
    if (!token) return;
    try {
      const result = await trainingApi.stopTraining(token);
      setTrainingProgress(result.status as string);
      setIsTraining(false);
    } catch (error) {
      console.error('Failed to stop training:', error);
    }
  }, [token]);

  // === Export ===
  const handleExportLora = useCallback(async () => {
    if (!token) return;
    setExporting(true);
    setExportStatus('Exporting...');
    try {
      const result = await trainingApi.exportLora({
        exportPath,
        loraOutputDir: exportOutputDir,
      }, token);
      setExportStatus(result.status as string);
      markStep('export');
    } catch (error) {
      setExportStatus(`${t('error')}: ${error instanceof Error ? error.message : 'Failed'}`);
    } finally {
      setExporting(false);
    }
  }, [token, exportPath, exportOutputDir, t, markStep]);

  // === Loss chart ===
  const lossChartSvg = useMemo(() => {
    if (!trainingMetrics) return null;
    let points: { step: number; loss: number }[] = [];
    const m = trainingMetrics as any;
    if (m?.data && Array.isArray(m.data)) {
      points = m.data.map((row: unknown[]) => ({ step: Number(row[0]) || 0, loss: Number(row[1]) || 0 })).filter((p: { loss: number }) => p.loss > 0);
    } else if (Array.isArray(m)) {
      points = m.map((item: any, i: number) => ({ step: item.step ?? item.x ?? i, loss: item.loss ?? item.y ?? 0 })).filter((p: { loss: number }) => p.loss > 0);
    }
    if (points.length < 2) return null;
    const width = 280, height = 100, pad = 4;
    const minStep = Math.min(...points.map(p => p.step));
    const maxStep = Math.max(...points.map(p => p.step));
    const minLoss = Math.min(...points.map(p => p.loss));
    const maxLoss = Math.max(...points.map(p => p.loss));
    const rangeStep = maxStep - minStep || 1;
    const rangeLoss = maxLoss - minLoss || 1;
    const polyPoints = points.map(p => {
      const x = pad + ((p.step - minStep) / rangeStep) * (width - 2 * pad);
      const y = pad + (1 - (p.loss - minLoss) / rangeLoss) * (height - 2 * pad);
      return `${x},${y}`;
    }).join(' ');
    return (
      <svg width={width} height={height} className="w-full" viewBox={`0 0 ${width} ${height}`}>
        <polyline points={polyPoints} fill="none" stroke="rgb(236 72 153)" strokeWidth="1.5" strokeLinejoin="round" />
        <text x={pad} y={height - 2} fontSize="8" fill="rgb(113 113 122)" fontFamily="monospace">{minStep}</text>
        <text x={width - pad} y={height - 2} fontSize="8" fill="rgb(113 113 122)" fontFamily="monospace" textAnchor="end">{maxStep}</text>
        <text x={pad} y={10} fontSize="8" fill="rgb(113 113 122)" fontFamily="monospace">{minLoss.toFixed(4)}</text>
      </svg>
    );
  }, [trainingMetrics]);

  // Mutual exclusion: formatLyrics / transcribeLyrics
  useEffect(() => {
    if (formatLyrics && transcribeLyrics) setTranscribeLyrics(false);
  }, [formatLyrics]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (transcribeLyrics && formatLyrics) setFormatLyrics(false);
  }, [transcribeLyrics]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabs: { id: TrainingTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dataset', label: t('datasetBuilder'), icon: <Database size={16} /> },
    { id: 'train', label: t('trainLora'), icon: <Music2 size={16} /> },
    { id: 'export', label: 'Export', icon: <Download size={16} /> },
  ];

  return (
    <div className="h-full w-full flex flex-col bg-zinc-50 dark:bg-suno-panel overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{t('loraTraining')}</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{t('trainingDescription')}</p>
      </div>

      {/* Pipeline Steps */}
      <div className="flex items-center gap-0.5 px-4 pb-2 flex-shrink-0 overflow-x-auto scrollbar-hide">
        {PIPELINE_STEPS.map((step, i) => {
          const Icon = step.icon;
          const done = completedSteps.has(step.key);
          return (
            <React.Fragment key={step.key}>
              {i > 0 && <ChevronRight size={10} className="text-zinc-600 flex-shrink-0" />}
              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 ${done ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-zinc-500'}`}>
                <Icon size={10} />
                {step.label}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Tab Bar */}
      <div className="flex px-4 gap-1 flex-shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === tab.id ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-hide">

        {/* ===== MODEL CONFIGURATION (shown at top of all tabs) ===== */}
        <Section title={
          <button onClick={() => setShowModelConfig(!showModelConfig)} className="flex items-center gap-1.5 w-full text-left">
            <Settings size={12} />
            <span>Model Configuration</span>
            <ChevronRight size={12} className={`ml-auto transition-transform ${showModelConfig ? 'rotate-90' : ''}`} />
          </button>
        }>
          {showModelConfig && (
            <div className="space-y-2 mt-2">
              <div className="flex gap-2 items-center">
                <FieldRow label="Checkpoint">
                  <select value={selectedCheckpoint} onChange={e => setSelectedCheckpoint(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-200">
                    {modelCheckpoints.map(c => <option key={c} value={c}>{c}</option>)}
                    {modelCheckpoints.length === 0 && <option value="">No checkpoints found</option>}
                  </select>
                </FieldRow>
                <button onClick={handleRefreshCheckpoints} className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-400">
                  <RefreshCw size={12} />
                </button>
              </div>
              <FieldRow label="Config">
                <select value={selectedConfig} onChange={e => setSelectedConfig(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-200">
                  {modelConfigs.map(c => <option key={c} value={c}>{c}</option>)}
                  {modelConfigs.length === 0 && <option value="">No configs found</option>}
                </select>
              </FieldRow>
              <div className="grid grid-cols-2 gap-2">
                <FieldRow label="Device">
                  <select value={selectedDevice} onChange={e => setSelectedDevice(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-200">
                    {DEVICES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </FieldRow>
                <FieldRow label="Backend">
                  <select value={selectedBackend} onChange={e => setSelectedBackend(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-200">
                    {BACKENDS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </FieldRow>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <label className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                  <input type="checkbox" checked={initLlm} onChange={e => setInitLlm(e.target.checked)} className="w-3 h-3 accent-pink-500" />
                  Init LLM
                </label>
                <label className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                  <input type="checkbox" checked={useFlashAttention} onChange={e => setUseFlashAttention(e.target.checked)} className="w-3 h-3 accent-pink-500" />
                  Flash Attention
                </label>
                <label className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                  <input type="checkbox" checked={offloadToCpu} onChange={e => setOffloadToCpu(e.target.checked)} className="w-3 h-3 accent-pink-500" />
                  Offload CPU
                </label>
                <label className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                  <input type="checkbox" checked={offloadDitToCpu} onChange={e => setOffloadDitToCpu(e.target.checked)} className="w-3 h-3 accent-pink-500" />
                  Offload DiT CPU
                </label>
                <label className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                  <input type="checkbox" checked={compileModel} onChange={e => setCompileModel(e.target.checked)} className="w-3 h-3 accent-pink-500" />
                  Compile
                </label>
                <label className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                  <input type="checkbox" checked={quantization} onChange={e => setQuantization(e.target.checked)} className="w-3 h-3 accent-pink-500" />
                  Quantization
                </label>
              </div>
              {initLlm && (
                <FieldRow label="LM Model">
                  <input type="text" value={lmModelPath} onChange={e => setLmModelPath(e.target.value)} placeholder="LM model path" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-200" />
                </FieldRow>
              )}
              <button onClick={handleInitModel} disabled={modelInitializing} className="w-full py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50">
                {modelInitializing ? <Loader2 size={12} className="animate-spin" /> : <Cpu size={12} />}
                Initialize Service
              </button>
              {modelInitStatus && <p className="text-[10px] text-zinc-400 break-words">{modelInitStatus}</p>}
            </div>
          )}
        </Section>

        {activeTab === 'dataset' && (
          <>
            {/* Drop Zone */}
            <Section title={t('uploadAudio')}>
              <div
                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${isDragOver ? 'border-pink-500 bg-pink-500/10' : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'}`}
              >
                <Upload size={24} className={`mx-auto mb-2 ${isDragOver ? 'text-pink-400' : 'text-zinc-500'}`} />
                <p className="text-xs text-zinc-400">Drop audio files here or click to browse</p>
                <p className="text-[10px] text-zinc-600 mt-1">.wav, .mp3, .flac, .ogg, .opus</p>
                <input ref={fileInputRef} type="file" multiple accept=".wav,.mp3,.flac,.ogg,.opus" onChange={handleFileSelect} className="hidden" />
              </div>
              {queuedFiles.length > 0 && (
                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {queuedFiles.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1">
                      <FileAudio size={12} className="text-zinc-400 flex-shrink-0" />
                      <span className="text-[11px] text-zinc-300 truncate flex-1">{f.name}</span>
                      <span className="text-[10px] text-zinc-500">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                      <button onClick={() => removeQueuedFile(i)} className="text-zinc-500 hover:text-red-400"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
              {queuedFiles.length > 0 && (
                <div className="mt-2 space-y-2">
                  <FieldRow label={t('datasetName')}>
                    <input type="text" value={uploadDatasetName} onChange={e => setUploadDatasetName(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" placeholder="my_lora_dataset" />
                  </FieldRow>
                  <button onClick={handleUploadAndBuild} disabled={uploading || !uploadDatasetName.trim()} className="w-full py-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    Upload & Create Dataset ({queuedFiles.length} files)
                  </button>
                </div>
              )}
              {uploadStatus && <p className="text-xs text-zinc-400 mt-1.5 break-words">{uploadStatus}</p>}
            </Section>

            {/* Scan Directory */}
            <Section title="Scan Directory">
              <div className="flex gap-2">
                <input type="text" value={scanDir} onChange={e => setScanDir(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" placeholder="./path/to/audio/folder" />
                <button onClick={handleScanDirectory} disabled={scanning || !scanDir} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50">
                  {scanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  Scan
                </button>
              </div>
              {scanStatus && <p className="text-xs text-zinc-400 mt-1.5 break-words">{scanStatus}</p>}
            </Section>

            {/* Load Existing Dataset */}
            <Section title={t('loadExistingDataset')}>
              <div className="flex gap-2">
                <input type="text" value={datasetPath} onChange={e => setDatasetPath(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" placeholder="./datasets/my_dataset.json" />
                <button onClick={handleLoadDataset} disabled={datasetLoading} className="px-3 py-1.5 bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50">
                  {datasetLoading ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
                  {t('loadDataset')}
                </button>
              </div>
              {datasetStatus && <p className="text-xs text-zinc-400 mt-1.5 break-words">{datasetStatus}</p>}
            </Section>

            {/* Dataset Table */}
            {dataframeRows.length > 0 && (
              <Section title={`Dataset (${dataframeRows.length} samples)`}>
                <div className="overflow-x-auto max-h-48 overflow-y-auto rounded-lg border border-white/5">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="bg-white/5 sticky top-0">
                        <th className="text-left px-2 py-1 text-zinc-400 font-medium">#</th>
                        {dataframeHeaders.slice(0, 6).map(h => (
                          <th key={h} className="text-left px-2 py-1 text-zinc-400 font-medium truncate max-w-[80px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dataframeRows.map((row, i) => (
                        <tr key={i} onClick={() => handleSampleNavigate(i)} className={`cursor-pointer transition-colors ${i === currentSampleIdx ? 'bg-pink-500/10 text-pink-300' : 'hover:bg-white/5 text-zinc-300'}`}>
                          <td className="px-2 py-0.5 text-zinc-500">{i + 1}</td>
                          {dataframeHeaders.slice(0, 6).map(h => (
                            <td key={h} className="px-2 py-0.5 truncate max-w-[80px]">{String(row[h] ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* Dataset Settings */}
            {datasetLoaded && (
              <>
                <Section title={t('datasetSettings')}>
                  <div className="space-y-2">
                    <FieldRow label={t('datasetName')}>
                      <input type="text" value={datasetSettings.datasetName} onChange={e => setDatasetSettings(s => ({ ...s, datasetName: e.target.value }))} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" />
                    </FieldRow>
                    <FieldRow label={t('customActivationTag')}>
                      <input type="text" value={datasetSettings.customTag} onChange={e => setDatasetSettings(s => ({ ...s, customTag: e.target.value }))} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" placeholder="e.g. my_style" />
                    </FieldRow>
                    <FieldRow label={t('tagPosition')}>
                      <select value={datasetSettings.tagPosition} onChange={e => setDatasetSettings(s => ({ ...s, tagPosition: e.target.value as DatasetSettings['tagPosition'] }))} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50">
                        <option value="prepend">{t('tagPrepend')}</option>
                        <option value="append">{t('tagAppend')}</option>
                        <option value="replace">{t('tagReplace')}</option>
                      </select>
                    </FieldRow>
                    <FieldRow label={t('allInstrumental')}>
                      <input type="checkbox" checked={datasetSettings.allInstrumental} onChange={e => setDatasetSettings(s => ({ ...s, allInstrumental: e.target.checked }))} className="w-4 h-4 accent-pink-500" />
                    </FieldRow>
                    <FieldRow label={`${t('genreRatio')} (${datasetSettings.genreRatio}%)`}>
                      <input type="range" min={0} max={100} value={datasetSettings.genreRatio} onChange={e => setDatasetSettings(s => ({ ...s, genreRatio: parseInt(e.target.value) }))} className="flex-1 accent-pink-500" />
                    </FieldRow>
                    <p className="text-[10px] text-zinc-500">{t('genreRatioHint')}</p>
                    <button onClick={handleUpdateSettings} className="w-full py-1.5 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-lg text-xs font-medium">
                      Apply Settings
                    </button>
                  </div>
                </Section>

                {/* Auto-Label */}
                <Section title={t('autoLabelWithAI')}>
                  <p className="text-[10px] text-zinc-500 mb-2">{t('autoLabelDescription')}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
                    <label className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                      <input type="checkbox" checked={skipMetas} onChange={e => setSkipMetas(e.target.checked)} className="w-3 h-3 accent-pink-500" />
                      {t('skipMetas')}
                    </label>
                    <label className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                      <input type="checkbox" checked={formatLyrics} onChange={e => setFormatLyrics(e.target.checked)} className="w-3 h-3 accent-pink-500" />
                      {t('formatLyrics')}
                    </label>
                    <label className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                      <input type="checkbox" checked={transcribeLyrics} onChange={e => setTranscribeLyrics(e.target.checked)} className="w-3 h-3 accent-pink-500" />
                      Transcribe Lyrics
                    </label>
                    <label className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                      <input type="checkbox" checked={onlyUnlabeled} onChange={e => setOnlyUnlabeled(e.target.checked)} className="w-3 h-3 accent-pink-500" />
                      {t('onlyUnlabeled')}
                    </label>
                  </div>
                  <button onClick={handleAutoLabel} disabled={autoLabeling} className="w-full py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50">
                    {autoLabeling ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    {t('autoLabelAll')}
                  </button>
                  {autoLabelStatus && <p className="text-xs text-zinc-400 mt-1.5 break-words">{autoLabelStatus}</p>}
                </Section>

                {/* Sample Editor */}
                <Section title={`${t('editSample')} (${currentSampleIdx + 1}/${sampleCount})`}>
                  {/* Sample Navigation */}
                  <div className="flex items-center gap-2 mb-2">
                    <button onClick={() => handleSampleNavigate(currentSampleIdx - 1)} disabled={currentSampleIdx <= 0} className="px-2 py-1 bg-white/5 hover:bg-white/10 text-zinc-300 rounded text-xs disabled:opacity-30">Prev</button>
                    <input type="number" min={1} max={sampleCount} value={currentSampleIdx + 1} onChange={e => { const v = parseInt(e.target.value) - 1; if (v >= 0 && v < sampleCount) handleSampleNavigate(v); }} className="w-16 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-center text-zinc-200" />
                    <button onClick={() => handleSampleNavigate(currentSampleIdx + 1)} disabled={currentSampleIdx >= sampleCount - 1} className="px-2 py-1 bg-white/5 hover:bg-white/10 text-zinc-300 rounded text-xs disabled:opacity-30">Next</button>
                    <span className="text-[10px] text-zinc-500 ml-auto truncate max-w-[100px]">{currentSample?.filename || ''}</span>
                  </div>

                  {/* Audio Preview */}
                  {audioPreviewUrl && (
                    <div className="mb-2 flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1.5">
                      <Volume2 size={14} className="text-pink-400 flex-shrink-0" />
                      <audio controls src={audioPreviewUrl} className="w-full h-7 [&::-webkit-media-controls-panel]:bg-transparent" preload="metadata" />
                    </div>
                  )}

                  <div className="space-y-2">
                    <FieldRow label={t('caption')}>
                      <input type="text" value={editCaption} onChange={e => setEditCaption(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" placeholder={t('musicDescription')} />
                    </FieldRow>
                    <FieldRow label={t('genre')}>
                      <input type="text" value={editGenre} onChange={e => setEditGenre(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" />
                    </FieldRow>
                    <FieldRow label={t('promptOverride')}>
                      <select value={editPromptOverride} onChange={e => setEditPromptOverride(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50">
                        <option value="Use Global Ratio">{t('useGlobalRatio')}</option>
                        <option value="Caption">{t('caption')}</option>
                        <option value="Genre">{t('genre')}</option>
                      </select>
                    </FieldRow>
                    <div>
                      <label className="text-[11px] text-zinc-500 mb-0.5 block">Lyrics ({t('editableUsedForTraining')})</label>
                      <textarea value={editLyrics} onChange={e => setEditLyrics(e.target.value)} rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50 resize-none" />
                    </div>
                    {editRawLyrics && (
                      <div>
                        <label className="text-[11px] text-zinc-500 mb-0.5 block">Raw Lyrics (read-only)</label>
                        <textarea value={editRawLyrics} readOnly rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-400 resize-none opacity-60" />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-zinc-500 mb-0.5 block">BPM</label>
                        <input type="number" value={editBpm} onChange={e => setEditBpm(parseInt(e.target.value) || 0)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" />
                      </div>
                      <div>
                        <label className="text-[11px] text-zinc-500 mb-0.5 block">Key</label>
                        <input type="text" value={editKey} onChange={e => setEditKey(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" placeholder="e.g. C major" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[11px] text-zinc-500 mb-0.5 block">Time Sig</label>
                        <select value={editTimeSig} onChange={e => setEditTimeSig(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50">
                          {TIME_SIGS.map(ts => <option key={ts} value={ts}>{ts || 'Auto'}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] text-zinc-500 mb-0.5 block">Duration</label>
                        <input type="number" value={editDuration} readOnly className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-400 opacity-60" />
                      </div>
                      <div>
                        <label className="text-[11px] text-zinc-500 mb-0.5 block">Language</label>
                        <select value={editLanguage} onChange={e => setEditLanguage(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50">
                          {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <FieldRow label={t('allInstrumental')}>
                      <input type="checkbox" checked={editInstrumental} onChange={e => setEditInstrumental(e.target.checked)} className="w-4 h-4 accent-pink-500" />
                    </FieldRow>
                    <button onClick={handleSaveSample} disabled={saving} className="w-full py-1.5 bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50">
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Edit3 size={14} />}
                      Save Sample
                    </button>
                    {editSaveStatus && <p className="text-xs text-zinc-400 mt-1.5 break-words">{editSaveStatus}</p>}
                  </div>
                </Section>

                {/* Save Dataset */}
                <Section title={t('saveDataset')}>
                  <FieldRow label="Save Path">
                    <input type="text" value={savePath} onChange={e => setSavePath(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" />
                  </FieldRow>
                  <button onClick={handleSaveDataset} disabled={saving} className="w-full mt-2 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {t('saveDataset')}
                  </button>
                  {saveStatus && <p className="text-xs text-zinc-400 mt-1.5 break-words">{saveStatus}</p>}
                </Section>

                {/* Preprocess to Tensors (matches Gradio's Step 5 with its own Load Existing Dataset) */}
                <Section title="Preprocess to Tensors">
                  <p className="text-[10px] text-zinc-500 mb-2">{t('preprocessDescription')}</p>

                  {/* Load Existing Dataset for Preprocess (Gradio: load_existing_dataset_path/btn/status) */}
                  <div className="mb-3 p-2 bg-white/[0.02] border border-white/5 rounded-lg space-y-2">
                    <label className="text-[10px] text-zinc-500 font-medium">Load Existing Dataset</label>
                    <div className="flex gap-2">
                      <input type="text" value={preprocessDatasetPath} onChange={e => setPreprocessDatasetPath(e.target.value)} placeholder="./datasets/my_lora_dataset.json" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" />
                      <button onClick={handleLoadDatasetForPreprocess} disabled={preprocessDatasetLoading} className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50">
                        {preprocessDatasetLoading ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
                        Load
                      </button>
                    </div>
                    {preprocessDatasetStatus && <p className="text-[10px] text-zinc-400 break-words">{preprocessDatasetStatus}</p>}
                  </div>

                  <FieldRow label="Output Dir">
                    <input type="text" value={preprocessOutputDir} onChange={e => setPreprocessOutputDir(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" />
                  </FieldRow>
                  <button onClick={handlePreprocess} disabled={preprocessing} className="w-full mt-2 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50">
                    {preprocessing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                    {preprocessing ? 'Preprocessing...' : 'Preprocess'}
                  </button>
                  {preprocessStatus && <p className="text-xs text-zinc-400 mt-1.5 break-words">{preprocessStatus}</p>}
                </Section>
              </>
            )}
          </>
        )}

        {activeTab === 'train' && (
          <>
            {/* Load Tensors */}
            <Section title={t('preprocessedDataset')}>
              <div className="flex gap-2">
                <input type="text" value={trainingParams.tensorDir} onChange={e => setTrainingParams(p => ({ ...p, tensorDir: e.target.value }))} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" />
                <button onClick={handleLoadTensors} className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-xs font-medium flex items-center gap-1.5">
                  <FolderOpen size={14} />
                  Load
                </button>
              </div>
              {trainingDatasetInfo && <p className="text-xs text-zinc-400 mt-1.5 break-words whitespace-pre-wrap">{trainingDatasetInfo}</p>}
            </Section>

            {/* LoRA Settings */}
            <Section title={t('loraSettings')}>
              <div className="space-y-2">
                <ParamSlider label={`${t('loraRank')} (r)`} value={trainingParams.rank} min={4} max={256} step={4} onChange={v => setTrainingParams(p => ({ ...p, rank: v }))} />
                <ParamSlider label={`${t('loraAlpha')} (a)`} value={trainingParams.alpha} min={4} max={512} step={4} onChange={v => setTrainingParams(p => ({ ...p, alpha: v }))} />
                <ParamSlider label={`${t('dropout')}`} value={trainingParams.dropout} min={0} max={0.5} step={0.05} onChange={v => setTrainingParams(p => ({ ...p, dropout: v }))} />
              </div>
            </Section>

            {/* Training Parameters */}
            <Section title={t('trainingParameters')}>
              <div className="space-y-2">
                <FieldRow label={t('learningRate')}>
                  <input type="number" value={trainingParams.learningRate} onChange={e => setTrainingParams(p => ({ ...p, learningRate: parseFloat(e.target.value) || 0.0003 }))} step={0.0001} className="w-28 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" />
                </FieldRow>
                <ParamSlider label={t('maxEpochs')} value={trainingParams.epochs} min={1} max={4000} step={1} onChange={v => setTrainingParams(p => ({ ...p, epochs: v }))} />
                <ParamSlider label="Batch Size" value={trainingParams.batchSize} min={1} max={8} step={1} onChange={v => setTrainingParams(p => ({ ...p, batchSize: v }))} />
                <ParamSlider label={t('gradientAccumulation')} value={trainingParams.gradientAccumulation} min={1} max={16} step={1} onChange={v => setTrainingParams(p => ({ ...p, gradientAccumulation: v }))} />
                <ParamSlider label={`${t('saveEvery')} (${t('epochs')})`} value={trainingParams.saveEvery} min={50} max={1000} step={50} onChange={v => setTrainingParams(p => ({ ...p, saveEvery: v }))} />
                <ParamSlider label="Shift" value={trainingParams.shift} min={1.0} max={5.0} step={0.5} onChange={v => setTrainingParams(p => ({ ...p, shift: v }))} />
                <FieldRow label="Seed">
                  <input type="number" value={trainingParams.seed} onChange={e => setTrainingParams(p => ({ ...p, seed: parseInt(e.target.value) || 42 }))} className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" />
                </FieldRow>
                <FieldRow label={t('outputDirectory')}>
                  <input type="text" value={trainingParams.outputDir} onChange={e => setTrainingParams(p => ({ ...p, outputDir: e.target.value }))} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" />
                </FieldRow>
                <FieldRow label="Resume Checkpoint">
                  <input type="text" value={trainingParams.resumeCheckpoint} onChange={e => setTrainingParams(p => ({ ...p, resumeCheckpoint: e.target.value }))} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" placeholder="./lora_output/checkpoints/epoch_200" />
                </FieldRow>
              </div>
            </Section>

            {/* Training Controls */}
            <div className="flex gap-2">
              {!isTraining ? (
                <button onClick={handleStartTraining} className="flex-1 py-2.5 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                  <Play size={16} />
                  {t('startTraining')}
                </button>
              ) : (
                <button onClick={handleStopTraining} className="flex-1 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                  <Square size={16} />
                  {t('stopTraining')}
                </button>
              )}
            </div>

            {/* Training Progress */}
            {(trainingProgress || trainingLog) && (
              <Section title={t('trainingProgress')}>
                {trainingProgress && <p className="text-xs text-zinc-300 mb-2 break-words">{trainingProgress}</p>}
                {trainingLog && (
                  <pre className="text-[10px] text-zinc-400 bg-black/20 rounded-lg p-2 max-h-40 overflow-y-auto whitespace-pre-wrap">{trainingLog}</pre>
                )}
              </Section>
            )}

            {/* Loss Chart */}
            {lossChartSvg && (
              <Section title="Training Loss">
                <div className="bg-black/20 rounded-lg p-2">{lossChartSvg}</div>
              </Section>
            )}
          </>
        )}

        {activeTab === 'export' && (
          <>
            <Section title="Export LoRA">
              <div className="space-y-2">
                <FieldRow label="Export Path">
                  <input type="text" value={exportPath} onChange={e => setExportPath(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" />
                </FieldRow>
                <FieldRow label="LoRA Output Dir">
                  <input type="text" value={exportOutputDir} onChange={e => setExportOutputDir(e.target.value)} className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-pink-500/50" />
                </FieldRow>
              </div>
              <button onClick={handleExportLora} disabled={exporting} className="w-full mt-3 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                Export LoRA
              </button>
              {exportStatus && <p className="text-xs text-zinc-400 mt-2 break-words">{exportStatus}</p>}
            </Section>

            <Section title="Load LoRA for Inference">
              <p className="text-xs text-zinc-500 mb-2">
                After exporting, use the LoRA controls in the Create panel to load your trained adapter.
              </p>
            </Section>
          </>
        )}
      </div>
    </div>
  );
};

// Reusable Section component (supports string or ReactNode title)
const Section: React.FC<{ title: string | React.ReactNode; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
    <h3 className="text-xs font-semibold text-zinc-300 mb-2">{title}</h3>
    {children}
  </div>
);

const FieldRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center gap-2">
    <label className="text-[11px] text-zinc-500 w-28 flex-shrink-0">{label}</label>
    {children}
  </div>
);

const ParamSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}> = ({ label, value, min, max, step, onChange }) => (
  <div>
    <div className="flex items-center justify-between mb-0.5">
      <label className="text-[11px] text-zinc-500">{label}</label>
      <span className="text-[11px] text-zinc-400 font-mono">{step < 1 ? value.toFixed(2) : value}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full accent-pink-500 h-1.5" />
  </div>
);
