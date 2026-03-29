import { useState, useRef, useEffect, useCallback } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import type { AppStatus, FileInfo, ProgressState, TranscriptChunk, WorkerIncoming } from './types';
import { downloadTxt, downloadDocx } from './export';
import './App.css';

const ACCEPTED = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/x-m4a', 'audio/webm', 'audio/ogg', 'video/mp4'];
const ACCEPTED_EXT = ['.mp3', '.mp4', '.wav', '.m4a', '.webm', '.ogg'];
const MODEL_SMALL = 'Xenova/whisper-small';
const MODEL_TINY  = 'Xenova/whisper-tiny';

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function getAudioDuration(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  return new Promise(resolve => {
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (!isFinite(audio.duration) || isNaN(audio.duration)) { resolve('—'); return; }
      const m = Math.floor(audio.duration / 60);
      const s = Math.floor(audio.duration % 60);
      resolve(`${m}:${s.toString().padStart(2, '0')}`);
    };
    audio.onerror = () => { URL.revokeObjectURL(url); resolve('—'); };
  });
}

async function fileToFloat32(file: File): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  return audioBuffer.getChannelData(0);
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function App() {
  const [status, setStatus]         = useState<AppStatus>('idle');
  const [fileInfo, setFileInfo]     = useState<FileInfo | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress]     = useState<ProgressState>({ percent: 0, message: '', stage: '' });
  const [transcript, setTranscript] = useState('');
  const [chunks, setChunks]         = useState<TranscriptChunk[]>([]);
  const [showTs, setShowTs]         = useState(false);
  const [error, setError]           = useState('');
  const [dragging, setDragging]     = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [modelId, setModelId]       = useState(MODEL_SMALL);
  const [copied, setCopied]         = useState(false);

  const workerRef       = useRef<Worker | null>(null);
  const mediaRecRef     = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const transcriptRef   = useRef<HTMLDivElement>(null);

  // Keep a stable ref to the message handler so it can use latest state
  const onWorkerMessage = useCallback((e: MessageEvent<WorkerIncoming>) => {
    const msg = e.data;
    if (msg.type === 'progress') {
      setStatus(msg.stage === 'loading' ? 'loading-model' : 'transcribing');
      setProgress({ percent: msg.progress, message: msg.message, stage: msg.stage });
    } else if (msg.type === 'result') {
      setTranscript(msg.text);
      setChunks(msg.chunks);
      setStatus('done');
    } else if (msg.type === 'error') {
      setError(msg.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => onWorkerMessage(e);
    worker.onerror = (e) => {
      setError(e.message ?? 'Worker error');
      setStatus('error');
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, [onWorkerMessage]);

  const handleFile = useCallback(async (file: File) => {
    if (!ACCEPTED.includes(file.type) && !ACCEPTED_EXT.some(ext => file.name.endsWith(ext))) {
      setError(`Unsupported format: ${file.name.split('.').pop()?.toUpperCase() ?? 'unknown'}. Use MP3, MP4, WAV, M4A, WebM, or OGG.`);
      setStatus('error');
      return;
    }

    const duration = await getAudioDuration(file);
    const baseName = file.name.replace(/\.[^.]+$/, '');
    setFileInfo({ name: file.name, baseName, duration, size: formatSize(file.size) });
    setSelectedFile(file);
    setStatus('idle');
    setTranscript('');
    setChunks([]);
    setError('');
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  const startTranscription = useCallback(async () => {
    if (!selectedFile || !workerRef.current) return;
    setError('');
    setStatus('loading-model');
    setProgress({ percent: 0, message: 'Preparing audio…', stage: 'loading' });
    try {
      const float32 = await fileToFloat32(selectedFile);
      workerRef.current.postMessage({ audio: float32, modelId });
    } catch {
      setError('Could not decode audio. The file may be corrupted or in an unsupported format.');
      setStatus('error');
    }
  }, [selectedFile, modelId]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      mediaRecRef.current = rec;
      recordChunksRef.current = [];

      rec.ondataavailable = (e) => { if (e.data.size > 0) recordChunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recordChunksRef.current, { type: 'audio/webm' });
        handleFile(new File([blob], `recording-${Date.now()}.webm`, { type: 'audio/webm' }));
      };

      rec.start();
      setIsRecording(true);
    } catch {
      setError('Microphone access denied or not available.');
    }
  }, [handleFile]);

  const stopRecording = useCallback(() => {
    mediaRecRef.current?.stop();
    setIsRecording(false);
  }, []);

  const copyTranscript = useCallback(() => {
    const text = showTs && chunks.length > 0
      ? chunks.map(c => `[${formatTimestamp(c.timestamp[0])}]  ${c.text.trim()}`).join('\n')
      : transcript;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [transcript, chunks, showTs]);

  const reset = useCallback(() => {
    setStatus('idle');
    setSelectedFile(null);
    setFileInfo(null);
    setTranscript('');
    setChunks([]);
    setError('');
    setProgress({ percent: 0, message: '', stage: '' });
  }, []);

  const isProcessing = status === 'loading-model' || status === 'transcribing';

  return (
    <div className="app">
      {/* ── HEADER ── */}
      <header className="header">
        <span className="header-logo">PAWROT</span>
        <div className="header-meta">
          <span className="tag">NO BACKEND</span>
          <span className="tag">NO UPLOAD</span>
          <span className="tag">OFFLINE AFTER FIRST USE</span>
        </div>
      </header>

      <main className="main">
        {/* ── HERO ── */}
        <div className="hero">
          <h1 className="hero-title">BROWSER<br />AUDIO<br />TRANSCRIBER</h1>
          <p className="hero-sub">Whisper · Runs entirely on your device</p>
        </div>

        {/* ── INPUT SECTION ── */}
        {!isProcessing && status !== 'done' && (
          <section className="input-section">
            {/* Drop zone */}
            <div
              className={`dropzone${dragging ? ' dropzone--over' : ''}${selectedFile ? ' dropzone--has-file' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
              aria-label="Drop audio file or click to browse"
            >
              <div className="dropzone-inner">
                <div className="dropzone-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                {selectedFile && fileInfo ? (
                  <div className="dropzone-file-info">
                    <span className="file-name">{fileInfo.name}</span>
                    <span className="file-meta">{fileInfo.duration} · {fileInfo.size}</span>
                    <span className="file-change">Click or drop to change file</span>
                  </div>
                ) : (
                  <div className="dropzone-cta">
                    <span className="dropzone-primary">DROP AUDIO FILE</span>
                    <span className="dropzone-secondary">or click to browse</span>
                  </div>
                )}
              </div>
              <div className="dropzone-formats">
                {['MP3', 'MP4', 'WAV', 'M4A', 'WebM', 'OGG'].map(f => (
                  <span key={f} className="format-chip">{f}</span>
                ))}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXT.join(',')}
                style={{ display: 'none' }}
                onChange={handleInputChange}
              />
            </div>

            {/* Divider */}
            <div className="divider"><span>OR</span></div>

            {/* Mic recorder */}
            <div className="mic-section">
              {isRecording ? (
                <button className="btn-record btn-record--stop" onClick={stopRecording}>
                  <span className="rec-dot rec-dot--active" />
                  STOP RECORDING
                </button>
              ) : (
                <button className="btn-record" onClick={startRecording}>
                  <span className="rec-dot" />
                  START RECORDING
                </button>
              )}
              {isRecording && (
                <span className="rec-live">● LIVE</span>
              )}
            </div>

            {/* Model picker */}
            <div className="model-picker">
              <span className="model-label">MODEL</span>
              <button
                className={`model-btn${modelId === MODEL_SMALL ? ' model-btn--active' : ''}`}
                onClick={() => setModelId(MODEL_SMALL)}
              >
                Whisper Small
                <span className="model-hint">244 MB · Best accuracy</span>
              </button>
              <button
                className={`model-btn${modelId === MODEL_TINY ? ' model-btn--active' : ''}`}
                onClick={() => setModelId(MODEL_TINY)}
              >
                Whisper Tiny
                <span className="model-hint">~75 MB · Faster</span>
              </button>
              <p className="model-notice">
                First use downloads the model ({modelId === MODEL_SMALL ? '~244 MB' : '~75 MB'}).
                This can take a few minutes on slower connections. After that, it loads from cache instantly.
              </p>
            </div>

            {/* Transcribe action */}
            {selectedFile && (
              <button className="btn-transcribe" onClick={startTranscription}>
                TRANSCRIBE
                <span className="btn-transcribe-sub">{fileInfo?.name}</span>
              </button>
            )}
          </section>
        )}

        {/* ── PROGRESS ── */}
        {isProcessing && (
          <section className="progress-section">
            <div className="progress-header">
              <span className="progress-stage">
                {status === 'loading-model' ? 'LOADING MODEL' : 'TRANSCRIBING'}
              </span>
              <span className="progress-pct">
                {`${progress.percent}%`}
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="progress-message">{progress.message}</p>
            {status === 'loading-model' && (
              <p className="progress-hint">
                Downloading {modelId === MODEL_SMALL ? '~244 MB' : '~75 MB'} model — this is a one-time download.
                Next time it loads from cache in seconds.
              </p>
            )}
          </section>
        )}

        {/* ── ERROR ── */}
        {status === 'error' && (
          <section className="error-section">
            <span className="error-label">ERROR</span>
            <p className="error-message">{error}</p>
            <button className="btn-reset" onClick={reset}>TRY AGAIN</button>
          </section>
        )}

        {/* ── TRANSCRIPT ── */}
        {status === 'done' && (
          <section className="transcript-section">
            <div className="transcript-toolbar">
              <div className="transcript-toolbar-left">
                <button
                  className={`ts-toggle${showTs ? ' ts-toggle--on' : ''}`}
                  onClick={() => setShowTs(v => !v)}
                  title="Toggle timestamps"
                >
                  <span className="ts-track">
                    <span className="ts-thumb" />
                  </span>
                  TIMESTAMPS
                </button>
              </div>
              <div className="transcript-toolbar-right">
                <button className="toolbar-btn" onClick={copyTranscript}>
                  {copied ? 'COPIED ✓' : 'COPY'}
                </button>
                <button className="toolbar-btn" onClick={() => fileInfo && downloadTxt(transcript, chunks, fileInfo.baseName, showTs)}>
                  TXT
                </button>
                <button className="toolbar-btn" onClick={() => fileInfo && downloadDocx(transcript, chunks, fileInfo.baseName, showTs)}>
                  DOCX
                </button>
                <button className="toolbar-btn toolbar-btn--reset" onClick={reset}>
                  NEW FILE
                </button>
              </div>
            </div>

            <div className="transcript-body" ref={transcriptRef}>
              {showTs && chunks.length > 0 ? (
                <div className="transcript-chunks">
                  {chunks.map((chunk, i) => (
                    <div key={i} className="chunk">
                      <span className="chunk-ts">
                        {formatTimestamp(chunk.timestamp[0])}
                      </span>
                      <span className="chunk-text">{chunk.text.trim()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="transcript-plain">{transcript}</p>
              )}
            </div>

            {fileInfo && (
              <div className="transcript-footer">
                <span>{fileInfo.name}</span>
                <span>{fileInfo.duration}</span>
                <span>{chunks.length} segments</span>
                <span>{transcript.split(/\s+/).filter(Boolean).length} words</span>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="footer">
        <span>Runs on Whisper via Transformers.js · Your audio never leaves your device</span>
      </footer>
    </div>
  );
}
