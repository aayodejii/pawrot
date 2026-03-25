export type AppStatus = 'idle' | 'loading-model' | 'transcribing' | 'done' | 'error';

export interface TranscriptChunk {
  timestamp: [number, number];
  text: string;
}

export interface FileInfo {
  name: string;
  baseName: string;
  duration: string;
  size: string;
}

export interface ProgressState {
  percent: number;
  message: string;
  stage: 'loading' | 'transcribing' | '';
}

export type WorkerIncoming =
  | { type: 'progress'; stage: 'loading' | 'transcribing'; progress: number; message: string }
  | { type: 'result'; text: string; chunks: TranscriptChunk[] }
  | { type: 'error'; message: string };

export type WorkerCommand = {
  audio: Float32Array;
  modelId: string;
};
