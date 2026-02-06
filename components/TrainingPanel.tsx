import React, { useState, useEffect, useRef } from 'react';
import { Upload, Play, Square, FolderOpen, Save, FileJson, Zap, Database, ChevronDown, ChevronUp, Edit2, X } from 'lucide-react';

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
import { useI18n } from '../context/I18nContext';
import { useAuth } from '../context/AuthContext';
import { trainingApi, DatasetSample } from '../services/api';

interface DisplaySample {
  index: number;
  filename: string;
  duration: string;
  lyrics: string;
  labeled: string;
  bpm: string;
  key: string;
  caption: string;
}

interface TrainingPanelProps {}

export const TrainingPanel: React.FC<TrainingPanelProps> = () => {
  const { t } = useI18n();
  const { token } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'dataset' | 'training'>('dataset');
  
  // Dataset Builder State
  const [loadJsonPath, setLoadJsonPath] = useState('./datasets/my_lora_dataset.json');
  const [audioDirectory, setAudioDirectory] = useState('./datasets');
  const [scanStatus, setScanStatus] = useState('');
  const [loadJsonStatus, setLoadJsonStatus] = useState('');
  const [audioFiles, setAudioFiles] = useState<DisplaySample[]>([]);
  const [datasetName, setDatasetName] = useState('my_lora_dataset');
  const [allInstrumental, setAllInstrumental] = useState(true);
  const [customTag, setCustomTag] = useState('');
  const [tagPosition, setTagPosition] = useState<'prepend' | 'append' | 'replace'>('replace');
  const [genreRatio, setGenreRatio] = useState(0);
  const [skipMetas, setSkipMetas] = useState(false);
  const [onlyUnlabeled, setOnlyUnlabeled] = useState(false);
  const [labelProgress, setLabelProgress] = useState('');
  const [labelStatus, setLabelStatus] = useState<{ current: number; total: number; status: string } | null>(null);
  const labelPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [selectedSampleIndex, setSelectedSampleIndex] = useState(0);
  const [savePath, setSavePath] = useState('./datasets/my_lora_dataset.json');
  const [saveStatus, setSaveStatus] = useState('');
  const [preprocessOutputDir, setPreprocessOutputDir] = useState('./datasets/preprocessed_tensors');
  const [preprocessProgress, setPreprocessProgress] = useState('');
  const [preprocessStatus, setPreprocessStatus] = useState<{ current: number; total: number; status: string } | null>(null);
  
  // Collapsible sections
  const [datasetSettingsOpen, setDatasetSettingsOpen] = useState(true);
  
  // Sample editing
  const [editingSample, setEditingSample] = useState<DatasetSample | null>(null);
  const [editForm, setEditForm] = useState({
    caption: '',
    lyrics: '',
    bpm: '',
    keyscale: '',
    timesignature: '',
    genre: '',
    prompt_override: '',
    language: '',
    duration: '',
    is_instrumental: false,
  });
  
  // Training State
  const [trainingTensorDir, setTrainingTensorDir] = useState('./datasets/preprocessed_tensors');
  const [trainingDatasetInfo, setTrainingDatasetInfo] = useState('');
  const [loraRank, setLoraRank] = useState(64);
  const [loraAlpha, setLoraAlpha] = useState(128);
  const [loraDropout, setLoraDropout] = useState(0.1);
  const [learningRate, setLearningRate] = useState(3e-4);
  const [trainEpochs, setTrainEpochs] = useState(1000);
  const [trainBatchSize, setTrainBatchSize] = useState(1);
  const [gradientAccumulation, setGradientAccumulation] = useState(1);
  const [saveEveryNEpochs, setSaveEveryNEpochs] = useState(200);
  const [trainingShift, setTrainingShift] = useState(3.0);
  const [trainingSeed, setTrainingSeed] = useState(42);
  const [loraOutputDir, setLoraOutputDir] = useState('./lora_output');
  const [useFP8, setUseFP8] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState('');
  const [trainingLog, setTrainingLog] = useState('');
  const [isTraining, setIsTraining] = useState(false);
  const [tensorboardUrl, setTensorboardUrl] = useState<string | null>(null);
  const [showTensorboard, setShowTensorboard] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [trainingStartTime, setTrainingStartTime] = useState<number | null>(null);
  const [currentEpoch, setCurrentEpoch] = useState(0);
  const [trainingStatus, setTrainingStatus] = useState<any>(null);

  // Transform API samples to display format
  const transformSamples = (samples: any[]): DisplaySample[] => {
    return samples.map((s: any) => ({
      index: s.index,
      filename: s.filename,
      duration: s.duration?.toFixed(1) || 'N/A',
      lyrics: s.lyrics || '',
      labeled: s.labeled ? 'Yes' : 'No',
      bpm: s.bpm?.toString() || '',
      key: s.keyscale || '',
      caption: s.caption || '',
    }));
  };

  // Check training status on mount to restore state after refresh
  useEffect(() => {
    if (!token) return;
    
    const checkInitialTrainingStatus = async () => {
      try {
        const status = await trainingApi.getTrainingStatus(token);
        
        if (status.is_training) {
          setIsTraining(true);
          if (status.tensorboard_url) {
            setTensorboardUrl(status.tensorboard_url);
          }
          if (status.start_time) {
            setTrainingStartTime(status.start_time);
          }
          if (status.current_epoch !== undefined) {
            setCurrentEpoch(status.current_epoch);
          }
          if (status.training_log) {
            setTrainingLog(status.training_log);
          }
          if (status.current_step !== undefined) {
            setTrainingStatus(status);
            setTrainingProgress('training');
          }
        }
      } catch (error) {
        console.error('Failed to check initial training status:', error);
      }
    };
    
    checkInitialTrainingStatus();
  }, [token]);

  // Clean up label polling on unmount
  useEffect(() => {
    return () => {
      if (labelPollRef.current) {
        clearInterval(labelPollRef.current);
        labelPollRef.current = null;
      }
    };
  }, []);

  // Poll training status when training is active
  useEffect(() => {
    if (!isTraining || !token) return;

    const pollInterval = setInterval(async () => {
      try {
        const status = await trainingApi.getTrainingStatus(token);
        
        if (!status.is_training) {
          setIsTraining(false);
          clearInterval(pollInterval);
        }
        
        // Update TensorBoard URL if available
        if (status.tensorboard_url) {
          setTensorboardUrl(status.tensorboard_url);
        }
        
        // Update training start time and epoch
        if (status.start_time) {
          setTrainingStartTime(status.start_time);
        }
        if (status.current_epoch !== undefined) {
          setCurrentEpoch(status.current_epoch);
        }
        
        // Auto-expand TensorBoard when training starts (step > 0)
        if (status.current_step && status.current_step > 0 && !showTensorboard && status.tensorboard_url) {
          setShowTensorboard(true);
        }
        
        // Update training log from backend
        const prevLog = trainingLog;
        if (status.training_log && status.training_log !== prevLog) {
          setTrainingLog(status.training_log);
          // Refresh iframe when log changes (new training step)
          if (showTensorboard) {
            setIframeKey(prev => prev + 1);
          }
        }
        
        // Update progress display
        if (status.current_step !== undefined) {
          setTrainingStatus(status);
          setTrainingProgress('training'); // Simple flag
        }
        
        if (status.error) {
          setTrainingProgress(`${t('error')}: ${status.error}`);
          setTrainingStatus(null);
          setIsTraining(false);
          clearInterval(pollInterval);
        }
      } catch (error: any) {
        console.error('Failed to poll training status:', error);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [isTraining, token]);

  const handleLoadJson = async () => {
    if (!token) return;
    setLoadJsonStatus(t('loadingTracks'));
    try {
      const result = await trainingApi.loadDataset({ dataset_path: loadJsonPath }, token);
      if (!result) {
        setLoadJsonStatus('Failed to load dataset: No response from server');
        return;
      }
      setLoadJsonStatus(result.message || 'Dataset loaded');
      setDatasetName(result.dataset_name || '');
      setAudioFiles(transformSamples(result.samples || []));
    } catch (error: any) {
      setLoadJsonStatus(`${t('error')}: ${error?.message || 'Failed to load dataset'}`);
    }
  };

  const handleScanDirectory = async () => {
    if (!token) return;
    setScanStatus(t('scanning'));
    try {
      const result = await trainingApi.scanDirectory({
        audio_dir: audioDirectory,
        dataset_name: datasetName,
        custom_tag: customTag,
        tag_position: tagPosition,
        all_instrumental: allInstrumental,
      }, token);
      if (!result) {
        setScanStatus('Failed to scan: No response from server');
        return;
      }
      setScanStatus(result.message || 'Scan completed');
      setAudioFiles(transformSamples(result.samples || []));
    } catch (error: any) {
      setScanStatus(`${t('error')}: ${error?.message || 'Failed to scan directory'}`);
    }
  };

  const handleAutoLabel = async () => {
    if (!token) return;
    setLabelProgress(t('autoLabeling'));

    try {
      // Start async labeling task
      const startResult = await trainingApi.autoLabelAsync({
        skip_metas: skipMetas,
        only_unlabeled: onlyUnlabeled,
      }, token);

      if (!startResult || !startResult.task_id) {
        setLabelProgress('Failed to start auto-labeling: No response from server');
        return;
      }
      const taskId = startResult.task_id;
      setLabelProgress(`${startResult.message || 'Starting'} (0/${startResult.total || 0})`);
      setLabelStatus({ current: 0, total: startResult.total || 0, status: 'running' });

      // Clear any previous poll before starting a new one
      if (labelPollRef.current) {
        clearInterval(labelPollRef.current);
      }

      // Poll for status
      const pollInterval = setInterval(async () => {
        try {
          const statusResult = await trainingApi.getAutoLabelStatus(taskId, token);

          // Update progress display
          const progressText = `${statusResult.progress} (${statusResult.current}/${statusResult.total})`;
          setLabelProgress(progressText);
          setLabelStatus({ current: statusResult.current, total: statusResult.total, status: statusResult.status });

          // Check if completed
          if (statusResult.status === 'completed') {
            clearInterval(pollInterval);
            labelPollRef.current = null;
            if (statusResult.result) {
              setLabelProgress(statusResult.result.message || 'Labeling completed');
              setAudioFiles(transformSamples(statusResult.result.samples || []));
              setDatasetSettingsOpen(false);
            }
            setLabelStatus(null);
          } else if (statusResult.status === 'failed') {
            clearInterval(pollInterval);
            labelPollRef.current = null;
            setLabelProgress(`${t('error')}: ${statusResult.error || 'Unknown error'}`);
            setLabelStatus(null);
          }
        } catch (pollError: any) {
          clearInterval(pollInterval);
          labelPollRef.current = null;
          setLabelProgress(`${t('error')}: ${pollError?.message || 'Failed to check labeling status'}`);
          setLabelStatus(null);
        }
      }, 2000); // Poll every 2 seconds

      labelPollRef.current = pollInterval;

    } catch (error: any) {
      setLabelProgress(`${t('error')}: ${error?.message || 'Failed to start auto-labeling'}`);
    }
  };

  const handleEditSample = async (index: number) => {
    if (!token) return;
    try {
      const sample = await trainingApi.getSample(index, token);
      setEditingSample(sample);
      // Handle timesignature: if it's a number, convert to 'n/4' format
      let timesig = sample.timesignature || '';
      if (timesig && !isNaN(Number(timesig))) {
        timesig = `${timesig}/4`;
      }
      
      setEditForm({
        caption: sample.caption || '',
        lyrics: sample.lyrics || '',
        bpm: sample.bpm?.toString() || '',
        keyscale: sample.keyscale || '',
        timesignature: timesig,
        genre: sample.genre || '',
        prompt_override: sample.prompt_override || '',
        language: sample.language || 'unknown',
        duration: sample.duration?.toString() || '',
        is_instrumental: sample.is_instrumental || false,
      });
    } catch (error: any) {
      console.error('Failed to load sample:', error);
    }
  };

  const handleSaveSample = async () => {
    if (!token || !editingSample) return;
    try {
      const result = await trainingApi.updateSample(editingSample.index, {
        caption: editForm.caption || undefined,
        lyrics: editForm.lyrics || undefined,
        bpm: editForm.bpm ? Number(editForm.bpm) : null,
        keyscale: editForm.keyscale || undefined,
        timesignature: editForm.timesignature || undefined,
        genre: editForm.genre || undefined,
        prompt_override: editForm.prompt_override || null,
        language: editForm.language || undefined,
        duration: editForm.duration ? Number(editForm.duration) : undefined,
        is_instrumental: editForm.is_instrumental,
      }, token);
      
      const updatedSamples = await trainingApi.getSamples(token);
      setAudioFiles(transformSamples(updatedSamples.samples));
      setEditingSample(null);
    } catch (error: any) {
      console.error('Failed to update sample:', error);
    }
  };

  const handleSaveDataset = async () => {
    if (!token) return;
    setSaveStatus(t('savingDataset'));
    try {
      const result = await trainingApi.saveDataset({
        save_path: savePath,
        dataset_name: datasetName,
        custom_tag: customTag,
        tag_position: tagPosition,
        all_instrumental: allInstrumental,
        genre_ratio: genreRatio,
      }, token);
      if (!result) {
        setSaveStatus('Failed to save: No response from server');
        return;
      }
      setSaveStatus(result.message || 'Dataset saved');
    } catch (error: any) {
      setSaveStatus(`${t('error')}: ${error?.message || 'Failed to save dataset'}`);
    }
  };

  const handlePreprocess = async () => {
    if (!token) return;
    setPreprocessProgress(t('preprocessing'));
    
    try {
      // Start async preprocessing task
      const startResult = await trainingApi.preprocessDatasetAsync({
        output_dir: preprocessOutputDir,
      }, token);
      
      if (!startResult || !startResult.task_id) {
        setPreprocessProgress('Failed to start preprocessing: No response from server');
        return;
      }
      const taskId = startResult.task_id;
      setPreprocessProgress(`${startResult.message || 'Starting'} (0/${startResult.total || 0})`);
      setPreprocessStatus({ current: 0, total: startResult.total || 0, status: 'running' });
      
      // Poll for status
      const pollInterval = setInterval(async () => {
        try {
          const statusResult = await trainingApi.getPreprocessStatus(taskId, token);
          
          // Update progress display
          const progressText = `${statusResult.progress} (${statusResult.current}/${statusResult.total})`;
          setPreprocessProgress(progressText);
          setPreprocessStatus({ current: statusResult.current, total: statusResult.total, status: statusResult.status });
          
          // Check if completed
          if (statusResult.status === 'completed') {
            clearInterval(pollInterval);
            if (statusResult.result) {
              setPreprocessProgress(statusResult.result.message || 'Preprocessing completed');
            }
            setPreprocessStatus(null);
          } else if (statusResult.status === 'failed') {
            clearInterval(pollInterval);
            setPreprocessProgress(`${t('error')}: ${statusResult.error || 'Unknown error'}`);
            setPreprocessStatus(null);
          }
        } catch (pollError: any) {
          clearInterval(pollInterval);
          setPreprocessProgress(`${t('error')}: ${pollError?.message || 'Failed to check preprocessing status'}`);
          setPreprocessStatus(null);
        }
      }, 2000); // Poll every 2 seconds
      
      // Cleanup on unmount
      return () => clearInterval(pollInterval);
      
    } catch (error: any) {
      setPreprocessProgress(`${t('error')}: ${error?.message || 'Failed to start preprocessing'}`);
    }
  };

  const handleLoadDataset = async () => {
    if (!token) return;
    setTrainingDatasetInfo(t('loadingDataset'));
    try {
      const result = await trainingApi.loadTensorInfo({ tensor_dir: trainingTensorDir }, token);
      if (!result) {
        setTrainingDatasetInfo('Failed to load dataset info: No response from server');
        return;
      }
      setTrainingDatasetInfo(
        `${t('datasetInfo')
          .replace('{name}', result.dataset_name || 'Unknown')
          .replace('{samples}', (result.num_samples || 0).toString())
          .replace('{labeled}', (result.num_samples || 0).toString())}\n${result.message || ''}`
      );
    } catch (error: any) {
      setTrainingDatasetInfo(`${t('error')}: ${error?.message || 'Failed to load dataset info'}`);
    }
  };

  const handleStartTraining = async () => {
    if (!token) return;
    setTrainingProgress(t('startingTraining'));
    try {
      const result = await trainingApi.startTraining({
        tensor_dir: trainingTensorDir,
        lora_rank: loraRank,
        lora_alpha: loraAlpha,
        lora_dropout: loraDropout,
        learning_rate: learningRate,
        train_epochs: trainEpochs,
        train_batch_size: trainBatchSize,
        gradient_accumulation: gradientAccumulation,
        save_every_n_epochs: saveEveryNEpochs,
        training_shift: trainingShift,
        training_seed: trainingSeed,
        lora_output_dir: loraOutputDir,
        use_fp8: useFP8,
      }, token);
      if (!result) {
        setTrainingProgress('Failed to start training: No response from server');
        return;
      }
      setIsTraining(true);
      setTrainingProgress(result.message || 'Training started');
    } catch (error: any) {
      setTrainingProgress(`${t('error')}: ${error?.message || 'Failed to start training'}`);
    }
  };

  const handleStopTraining = async () => {
    if (!token) return;
    try {
      const result = await trainingApi.stopTraining(token);
      if (!result) {
        setTrainingProgress('Failed to stop training: No response from server');
        return;
      }
      setTrainingProgress(result.message || 'Training stopped');
    } catch (error: any) {
      setTrainingProgress(`${t('error')}: ${error?.message || 'Failed to stop training'}`);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-zinc-800 p-6">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">🎓 {t('loraTraining')}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t('trainingDescription')}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-white/5 bg-zinc-50 dark:bg-zinc-800 px-6">
        <button
          onClick={() => setActiveTab('dataset')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'dataset'
              ? 'border-pink-500 text-pink-500'
              : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          📁 {t('datasetBuilder')}
        </button>
        <button
          onClick={() => setActiveTab('training')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'training'
              ? 'border-pink-500 text-pink-500'
              : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          🚀 {t('trainLora')}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 pb-24 lg:pb-32 space-y-6 bg-white dark:bg-zinc-900">
        {activeTab === 'dataset' ? (
          <>
            {/* Load & Scan */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Load Existing Dataset Card */}
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 rounded-xl p-5 border-2 border-blue-200 dark:border-blue-800 space-y-3 hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-2 mb-1">
                  <FileJson className="text-blue-600 dark:text-blue-400" size={20} />
                  <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100">{t('loadExistingDataset')}</h4>
                </div>
                <input
                  type="text"
                  value={loadJsonPath}
                  onChange={(e) => setLoadJsonPath(e.target.value)}
                  placeholder="./datasets/my_lora_dataset.json"
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-blue-300 dark:border-blue-700 rounded-lg text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleLoadJson}
                  className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg"
                >
                  <FolderOpen size={16} />
                  {t('loadDataset')}
                </button>
                {loadJsonStatus && (
                  <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 rounded-lg px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 border-2 border-blue-200 dark:border-blue-800">
                    {loadJsonStatus}
                  </div>
                )}
              </div>

              {/* Scan New Directory Card */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-xl p-5 border-2 border-green-200 dark:border-green-800 space-y-3 hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-2 mb-1">
                  <FolderOpen className="text-green-600 dark:text-green-400" size={20} />
                  <h4 className="text-sm font-bold text-green-900 dark:text-green-100">{t('scanNewDirectory')}</h4>
                </div>
                <input
                  type="text"
                  value={audioDirectory}
                  onChange={(e) => setAudioDirectory(e.target.value)}
                  placeholder="/path/to/your/audio/folder"
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-green-300 dark:border-green-700 rounded-lg text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                  onClick={handleScanDirectory}
                  className="w-full px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg"
                >
                  <Upload size={16} />
                  {t('scanDataset')}
                </button>
                {scanStatus && (
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-lg px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 border-2 border-green-200 dark:border-green-800">
                    {scanStatus}
                  </div>
                )}
              </div>
            </div>

            {/* Audio Files Table */}
            {audioFiles.length > 0 && (
              <div className="bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950/30 dark:to-gray-950/30 rounded-xl border-2 border-slate-300 dark:border-slate-800 overflow-hidden shadow-lg">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gradient-to-r from-slate-100 to-zinc-100 dark:from-slate-900/50 dark:to-zinc-900/50 border-b-2 border-slate-300 dark:border-slate-700 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">#</th>
                        <th className="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">{t('filename')}</th>
                        <th className="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">{t('duration')}</th>
                        <th className="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">{t('labeled')}</th>
                        <th className="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">{t('bpm')}</th>
                        <th className="px-4 py-3 text-left font-medium text-zinc-700 dark:text-zinc-300">{t('key')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {audioFiles.map((file) => (
                        <tr
                          key={file.index}
                          className="hover:bg-blue-50 dark:hover:bg-zinc-800/50 cursor-pointer group transition-colors"
                          onClick={() => handleEditSample(file.index)}
                        >
                          <td className="px-4 py-3 text-zinc-900 dark:text-white">{file.index + 1}</td>
                          <td className="px-4 py-3 text-zinc-900 dark:text-white flex items-center gap-2">
                            {file.filename}
                            <Edit2 size={14} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{file.duration}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs ${
                              file.labeled === 'Yes'
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                            }`}>
                              {file.labeled}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{file.bpm}</td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{file.key}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Dataset Settings */}
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 rounded-xl border-2 border-indigo-200 dark:border-indigo-800 shadow-md">
              <button
                onClick={() => setDatasetSettingsOpen(!datasetSettingsOpen)}
                className="w-full flex items-center justify-between p-4 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors rounded-t-xl"
              >
                <h3 className="text-base font-semibold text-zinc-900 dark:text-white">⚙️ {t('datasetSettings')}</h3>
                {datasetSettingsOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>
              
              {datasetSettingsOpen && (
                <div className="p-4 pt-0 space-y-4">
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    {t('datasetName')}
                  </label>
                  <input
                    type="text"
                    value={datasetName}
                    onChange={(e) => setDatasetName(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    {t('customActivationTag')}
                  </label>
                  <input
                    type="text"
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    placeholder="e.g., 8bit_retro, my_style"
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allInstrumental}
                    onChange={(e) => setAllInstrumental(e.target.checked)}
                    className="w-4 h-4 text-pink-500 bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 rounded focus:ring-pink-500"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{t('allInstrumental')}</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  {t('tagPosition')}
                </label>
                <select
                  value={tagPosition}
                  onChange={(e) => setTagPosition(e.target.value as 'prepend' | 'append' | 'replace')}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                >
                  <option value="prepend">{t('tagPrepend')}</option>
                  <option value="append">{t('tagAppend')}</option>
                  <option value="replace">{t('tagReplace')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  {t('genreRatio')}: {genreRatio}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="10"
                  value={genreRatio}
                  onChange={(e) => setGenreRatio(Number(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  {t('genreRatioHint')}
                </p>
              </div>
                </div>
              )}
            </div>

            {/* Auto-Label */}
            <div className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 rounded-xl p-4 space-y-4 border-2 border-violet-200 dark:border-violet-800 shadow-md">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-white">🤖 {t('autoLabelWithAI')}</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {t('autoLabelDescription')}
              </p>
              
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipMetas}
                    onChange={(e) => setSkipMetas(e.target.checked)}
                    className="w-4 h-4 text-pink-500 bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 rounded focus:ring-pink-500"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{t('skipMetas')}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyUnlabeled}
                    onChange={(e) => setOnlyUnlabeled(e.target.checked)}
                    className="w-4 h-4 text-pink-500 bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 rounded focus:ring-pink-500"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{t('onlyUnlabeled')}</span>
                </label>
              </div>

              <button
                onClick={handleAutoLabel}
                disabled={labelStatus?.status === 'running'}
                className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
                  labelStatus?.status === 'running'
                    ? 'bg-zinc-300 dark:bg-zinc-700 text-zinc-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white'
                }`}
              >
                <Zap size={18} />
                {t('autoLabelAll')}
              </button>

              {labelProgress && labelStatus && labelStatus.status === 'running' && (() => {
                const current = labelStatus.current || 0;
                const total = labelStatus.total || 1;
                const progressPercent = (current / total) * 100;
                
                return (
                  <div className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 rounded-lg p-4 border-2 border-violet-200 dark:border-violet-800 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-700 dark:text-zinc-200 font-medium">
                        🤖 Auto-labeling: {current}/{total} samples
                      </span>
                      <span className="text-xs font-mono text-violet-600 dark:text-violet-400 font-semibold">
                        {progressPercent.toFixed(1)}%
                      </span>
                    </div>
                    
                    <div className="relative w-full h-4 bg-white/30 dark:bg-zinc-800/50 rounded-full overflow-hidden shadow-inner border border-violet-300 dark:border-violet-700">
                      <div 
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300 ease-out"
                        style={{ width: `${Math.min(progressPercent, 100)}%` }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white drop-shadow-md">
                        {current}/{total}
                      </div>
                    </div>
                  </div>
                );
              })()}
              
              {labelProgress && (!labelStatus || labelStatus.status !== 'running') && (
                <div className="bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30 rounded-lg p-3 text-sm text-zinc-700 dark:text-zinc-300 border-2 border-violet-200 dark:border-violet-800">
                  {labelProgress}
                </div>
              )}
            </div>

            {/* Save & Preprocess */}
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-sky-50 to-cyan-50 dark:from-sky-950/30 dark:to-cyan-950/30 rounded-xl p-4 space-y-3 border-2 border-sky-200 dark:border-sky-800 shadow-md">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-white">💾 {t('saveDataset')}</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={savePath}
                    onChange={(e) => setSavePath(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                  <button
                    onClick={handleSaveDataset}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                  >
                    <Save size={16} />
                    {t('save')}
                  </button>
                </div>
                {saveStatus && (
                  <div className="bg-gradient-to-r from-sky-50 to-cyan-50 dark:from-sky-950/30 dark:to-cyan-950/30 rounded-lg px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 border-2 border-sky-200 dark:border-sky-800">
                    {saveStatus}
                  </div>
                )}
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 rounded-xl p-4 space-y-3 border-2 border-amber-200 dark:border-amber-800 shadow-md">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-white">⚡ {t('preprocessToTensors')}</h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {t('preprocessDescription')}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={preprocessOutputDir}
                    onChange={(e) => setPreprocessOutputDir(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                  <button
                    onClick={handlePreprocess}
                    disabled={preprocessStatus?.status === 'running'}
                    className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                      preprocessStatus?.status === 'running'
                        ? 'bg-zinc-300 dark:bg-zinc-700 text-zinc-500 cursor-not-allowed'
                        : 'bg-purple-500 hover:bg-purple-600 text-white'
                    }`}
                  >
                    <Zap size={16} />
                    {t('preprocess')}
                  </button>
                </div>
                
                {preprocessProgress && preprocessStatus && preprocessStatus.status === 'running' && (() => {
                  const current = preprocessStatus.current || 0;
                  const total = preprocessStatus.total || 1;
                  const progressPercent = (current / total) * 100;
                  
                  return (
                    <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 rounded-lg p-4 border-2 border-amber-200 dark:border-amber-800 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-700 dark:text-zinc-200 font-medium">
                          ⚡ Preprocessing: {current}/{total} samples
                        </span>
                        <span className="text-xs font-mono text-amber-600 dark:text-amber-400 font-semibold">
                          {progressPercent.toFixed(1)}%
                        </span>
                      </div>
                      
                      <div className="relative w-full h-4 bg-white/30 dark:bg-zinc-800/50 rounded-full overflow-hidden shadow-inner border border-amber-300 dark:border-amber-700">
                        <div 
                          className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500 to-amber-500 transition-all duration-300 ease-out"
                          style={{ width: `${Math.min(progressPercent, 100)}%` }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white drop-shadow-md">
                          {current}/{total}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                
                {preprocessProgress && (!preprocessStatus || preprocessStatus.status !== 'running') && (
                  <div className="bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30 rounded-lg px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 border-2 border-amber-200 dark:border-amber-800">
                    {preprocessProgress}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Training Tab */}
            <div className="space-y-6">
              {/* Dataset Selection */}
              <div className="bg-gradient-to-br from-slate-50 to-zinc-100 dark:from-slate-950/30 dark:to-zinc-950/30 rounded-xl p-4 space-y-3 border-2 border-slate-200 dark:border-slate-800 shadow-sm">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                  <Database size={18} className="text-blue-500" />
                  {t('preprocessedDataset')}
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={trainingTensorDir}
                    onChange={(e) => setTrainingTensorDir(e.target.value)}
                    placeholder="./datasets/preprocessed_tensors"
                    className="flex-1 px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                  <button
                    onClick={handleLoadDataset}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                  >
                    <FolderOpen size={16} />
                    {t('loadDataset')}
                  </button>
                </div>
                {trainingDatasetInfo && (
                  <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 rounded-lg p-3 text-sm text-zinc-700 dark:text-zinc-300 border-2 border-blue-200 dark:border-blue-800">
                    {trainingDatasetInfo}
                  </div>
                )}
              </div>

              {/* LoRA Settings */}
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 rounded-xl p-4 space-y-4 border-2 border-purple-200 dark:border-purple-800 shadow-md">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-white">⚙️ {t('loraSettings')}</h3>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      {t('loraRank')}: {loraRank}
                    </label>
                    <input
                      type="range"
                      min="4"
                      max="256"
                      step="4"
                      value={loraRank}
                      onChange={(e) => setLoraRank(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      {t('loraAlpha')}: {loraAlpha}
                    </label>
                    <input
                      type="range"
                      min="4"
                      max="512"
                      step="4"
                      value={loraAlpha}
                      onChange={(e) => setLoraAlpha(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      {t('dropout')}: {loraDropout.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="0.5"
                      step="0.05"
                      value={loraDropout}
                      onChange={(e) => setLoraDropout(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Training Parameters */}
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 rounded-xl p-4 space-y-4 border-2 border-orange-200 dark:border-orange-800 shadow-md">
                <h3 className="text-base font-semibold text-zinc-900 dark:text-white">🎛️ {t('trainingParameters')}</h3>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      {t('learningRate')}
                    </label>
                    <input
                      type="number"
                      value={learningRate}
                      onChange={(e) => setLearningRate(Number(e.target.value))}
                      step="0.0001"
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      {t('maxEpochs')}: {trainEpochs}
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="4000"
                      step="100"
                      value={trainEpochs}
                      onChange={(e) => setTrainEpochs(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      {t('batchSize')}: {trainBatchSize}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="8"
                      step="1"
                      value={trainBatchSize}
                      onChange={(e) => setTrainBatchSize(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      {t('gradientAccumulation')}: {gradientAccumulation}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="16"
                      step="1"
                      value={gradientAccumulation}
                      onChange={(e) => setGradientAccumulation(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      {t('saveEvery')}: {saveEveryNEpochs} {t('epochs')}
                    </label>
                    <input
                      type="range"
                      min="50"
                      max="1000"
                      step="50"
                      value={saveEveryNEpochs}
                      onChange={(e) => setSaveEveryNEpochs(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      {t('shift')}: {trainingShift.toFixed(1)}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="0.5"
                      value={trainingShift}
                      onChange={(e) => setTrainingShift(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      {t('seed')}
                    </label>
                    <input
                      type="number"
                      value={trainingSeed}
                      onChange={(e) => setTrainingSeed(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    {t('outputDirectory')}
                  </label>
                  <input
                    type="text"
                    value={loraOutputDir}
                    onChange={(e) => setLoraOutputDir(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>

                <div className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                  <input
                    type="checkbox"
                    id="useFP8"
                    checked={useFP8}
                    onChange={(e) => setUseFP8(e.target.checked)}
                    className="w-4 h-4 text-purple-600 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="useFP8" className="text-sm font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    ⚡ {t('useFP8')} <span className="text-xs text-zinc-500 dark:text-zinc-400">({t('fp8Description')})</span>
                  </label>
                </div>
              </div>

              {/* Training Controls */}
              <div className="flex gap-4">
                <button
                  onClick={handleStartTraining}
                  disabled={isTraining}
                  className={`flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
                    isTraining
                      ? 'bg-zinc-300 dark:bg-zinc-700 text-zinc-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white'
                  }`}
                >
                  <Play size={18} />
                  {t('startTraining')}
                </button>
                <button
                  onClick={handleStopTraining}
                  disabled={!isTraining}
                  className={`flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
                    !isTraining
                      ? 'bg-zinc-300 dark:bg-zinc-700 text-zinc-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white'
                  }`}
                >
                  <Square size={18} />
                  {t('stopTraining')}
                </button>
              </div>

              {/* Training Progress */}
              {trainingProgress && trainingStatus && (() => {
                const status = trainingStatus;
                const currentEpoch = status.current_epoch || 0;
                const totalEpochs = status.config?.epochs || 1;
                const currentStep = status.current_step || 0;
                const currentLoss = status.current_loss?.toFixed(4) || 'N/A';
                
                // Calculate steps per epoch and total steps
                const stepsPerEpoch = currentEpoch > 0 ? Math.ceil(currentStep / currentEpoch) : currentStep;
                const totalSteps = totalEpochs * stepsPerEpoch;
                
                // Calculate progress percentage
                const epochProgress = (currentEpoch / totalEpochs) * 100;
                
                // Format elapsed time
                const elapsed = trainingStartTime ? Math.floor(Date.now() / 1000 - trainingStartTime) : 0;
                const formatTime = (seconds: number) => {
                  const h = Math.floor(seconds / 3600);
                  const m = Math.floor((seconds % 3600) / 60);
                  const s = seconds % 60;
                  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
                };
                
                // Format ETA
                const eta = status.estimated_time_remaining || 0;
                const etaStr = eta > 0 ? formatTime(Math.floor(eta)) : '--:--';
                
                // Format speed
                const speed = status.steps_per_second || 0;
                const speedStr = speed > 1 ? `${speed.toFixed(2)} it/s` : speed > 0 ? `${(1/speed).toFixed(2)} s/it` : '-- it/s';
                
                return (
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-xl p-5 border-2 border-emerald-200 dark:border-emerald-800 shadow-lg space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">📊 {t('trainingStatus')}</h4>
                      {tensorboardUrl && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowTensorboard(!showTensorboard)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-medium transition-colors"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
                            </svg>
                            {showTensorboard ? t('hideTensorboard') : t('showTensorboard')}
                          </button>
                          <a
                            href={tensorboardUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
                            title={t('openInNewTab')}
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
                            </svg>
                          </a>
                        </div>
                      )}
                    </div>
                    
                    {/* Progress Info */}
                    <div className="space-y-3">
                      <div className="bg-white/50 dark:bg-zinc-800/50 rounded-lg p-3 flex items-center justify-between text-sm">
                        <span className="text-zinc-700 dark:text-zinc-200 font-medium">
                          Epoch {currentEpoch}/{totalEpochs} - Step {currentStep}/{totalSteps} - Loss: {currentLoss}
                        </span>
                        <span className="text-xs font-mono text-zinc-500 dark:text-emerald-400 font-semibold">{speedStr}</span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="relative w-full h-6 bg-white/30 dark:bg-zinc-800/50 rounded-full overflow-hidden shadow-inner border-2 border-emerald-300 dark:border-emerald-700">
                        <div 
                          className="absolute top-0 left-0 h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-300 ease-out"
                          style={{ width: `${Math.min(epochProgress, 100)}%` }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xs font-semibold text-zinc-800 dark:text-white drop-shadow-md">
                            {epochProgress.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      
                      {/* Time Info */}
                      <div className="bg-white/50 dark:bg-zinc-800/50 rounded-lg p-2 flex items-center justify-between text-xs">
                        <span className="text-zinc-600 dark:text-zinc-300">⏱️ Elapsed: <span className="font-mono font-semibold">{formatTime(elapsed)}</span></span>
                        <span className="text-zinc-600 dark:text-zinc-300">🎯 ETA: <span className="font-mono font-semibold">{etaStr}</span></span>
                      </div>
                    </div>
                  </div>
                );
              })()}
              
              {/* Error Display */}
              {trainingProgress && !trainingStatus && (
                <div className="bg-gradient-to-br from-red-50 to-pink-50 dark:bg-red-900/30 rounded-xl p-4 border-2 border-red-300 dark:border-red-800 shadow-md">
                  <p className="text-sm text-red-700 dark:text-red-300">{trainingProgress}</p>
                </div>
              )}

              {/* TensorBoard iframe */}
              {showTensorboard && tensorboardUrl && (
                <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                  <div className="bg-zinc-50 dark:bg-zinc-800 px-4 py-2 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">📊 {t('tensorboardView')}</h4>
                    <button
                      onClick={() => setShowTensorboard(false)}
                      className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <iframe
                    key={iframeKey}
                    src={tensorboardUrl}
                    className="w-full h-[600px] bg-white dark:bg-zinc-900"
                    style={{ border: 'none' }}
                    title="TensorBoard"
                  />
                </div>
              )}

              {/* Training Log */}
              {trainingLog && (
                <div className="bg-gradient-to-br from-slate-900 to-zinc-900 dark:from-slate-950 dark:to-zinc-950 rounded-xl p-4 border-2 border-slate-700 dark:border-slate-800 overflow-hidden shadow-lg">
                  <h4 className="text-sm font-semibold text-white mb-2">{t('trainingLog')}</h4>
                  <pre className="text-xs text-green-400 font-mono overflow-x-auto max-h-64">
                    {trainingLog}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Edit Sample Modal */}
      {editingSample && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 p-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <Edit2 size={20} className="text-pink-500" />
                {t('editSample')}: {editingSample.filename}
              </h3>
              <button
                onClick={() => setEditingSample(null)}
                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  {t('caption')}
                </label>
                <textarea
                  value={editForm.caption}
                  onChange={(e) => setEditForm({ ...editForm, caption: e.target.value })}
                  rows={3}
                  placeholder={t('musicDescription')}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  {t('genre')}
                </label>
                <input
                  type="text"
                  value={editForm.genre}
                  onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
                  placeholder="pop, electronic, dance..."
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  {t('promptOverride')} <span className="text-xs text-zinc-500">({t('thisSample')})</span>
                </label>
                <select
                  value={editForm.prompt_override || ''}
                  onChange={(e) => setEditForm({ ...editForm, prompt_override: e.target.value || null })}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                >
                  <option value="">{t('useGlobalRatio')}</option>
                  <option value="caption">{t('caption')}</option>
                  <option value="genre">{t('genre')}</option>
                </select>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t('overrideGlobalRatio')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                  {t('lyrics')} <span className="text-xs text-zinc-500">({t('editableUsedForTraining')})</span>
                </label>
                <textarea
                  value={editForm.lyrics}
                  onChange={(e) => setEditForm({ ...editForm, lyrics: e.target.value })}
                  rows={5}
                  placeholder="[Verse 1]\nLyrics here...\n\n[Chorus]"
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    {t('bpm')}
                  </label>
                  <input
                    type="number"
                    value={editForm.bpm}
                    onChange={(e) => setEditForm({ ...editForm, bpm: e.target.value })}
                    placeholder="120"
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    {t('key')}
                  </label>
                  <input
                    type="text"
                    value={editForm.keyscale}
                    onChange={(e) => setEditForm({ ...editForm, keyscale: e.target.value })}
                    placeholder="C Major"
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    {t('timeSignature')}
                  </label>
                  <select
                    value={editForm.timesignature}
                    onChange={(e) => setEditForm({ ...editForm, timesignature: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                  >
                    <option value="">n/a</option>
                    <option value="2/4">2/4</option>
                    <option value="3/4">3/4</option>
                    <option value="4/4">4/4</option>
                    <option value="6/8">6/8</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    {t('duration')} (s)
                  </label>
                  <input
                    type="number"
                    value={editForm.duration}
                    onChange={(e) => setEditForm({ ...editForm, duration: e.target.value })}
                    placeholder="30"
                    step="0.1"
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    {t('language')}
                  </label>
                  <select
                    value={editForm.language}
                    onChange={(e) => setEditForm({ ...editForm, language: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                  >
                    {VOCAL_LANGUAGE_VALUES.map(lang => (
                      <option key={lang.value} value={lang.value}>{t(lang.key)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="instrumental-check"
                  checked={editForm.is_instrumental}
                  onChange={(e) => setEditForm({ ...editForm, is_instrumental: e.target.checked })}
                  className="w-4 h-4 text-pink-500 bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 rounded focus:ring-pink-500"
                />
                <label htmlFor="instrumental-check" className="text-sm font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  {t('instrumental')}
                </label>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 p-4 flex gap-3">
              <button
                onClick={() => setEditingSample(null)}
                className="flex-1 px-4 py-2 bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSaveSample}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-lg font-medium transition-colors"
              >
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
