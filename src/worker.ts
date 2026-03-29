import type { WorkerIncoming, WorkerCommand } from './types';

// Load @xenova/transformers from CDN to avoid Vite bundling onnxruntime-web's
// UMD wrapper, which breaks registerBackend initialisation in ESM workers.
const TRANSFORMERS_CDN_URL =
  'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedPipeline: any = null;
let cachedModelId: string | null = null;

self.onmessage = async (e: MessageEvent<WorkerCommand>) => {
  const { audio, modelId } = e.data;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { pipeline, env } = await import(/* @vite-ignore */ TRANSFORMERS_CDN_URL) as any;
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    if (!cachedPipeline || cachedModelId !== modelId) {
      cachedPipeline = null;
      cachedModelId = null;

      cachedPipeline = await pipeline(
        'automatic-speech-recognition',
        modelId,
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          progress_callback: (p: any) => {
            if (p.status === 'downloading' || p.status === 'loading') {
              const fileName = p.file ? p.file.split('/').pop() : 'model';
              const msg: WorkerIncoming = {
                type: 'progress',
                stage: 'loading',
                progress: Math.round(p.progress ?? 0),
                message: `Loading ${fileName}`,
              };
              self.postMessage(msg);
            } else if (p.status === 'ready') {
              const msg: WorkerIncoming = {
                type: 'progress',
                stage: 'loading',
                progress: 100,
                message: 'Model ready',
              };
              self.postMessage(msg);
            }
          },
        }
      );

      cachedModelId = modelId;
    }

    const totalChunks = Math.ceil(audio.length / (16000 * 30));
    let processedChunks = 0;

    self.postMessage({
      type: 'progress',
      stage: 'transcribing',
      progress: 0,
      message: `Transcribing chunk 0 of ${totalChunks}…`,
    } satisfies WorkerIncoming);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (cachedPipeline as any)(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
      chunk_callback: () => {
        processedChunks++;
        const pct = Math.min(Math.round((processedChunks / totalChunks) * 100), 99);
        self.postMessage({
          type: 'progress',
          stage: 'transcribing',
          progress: pct,
          message: `Transcribing chunk ${processedChunks} of ${totalChunks}…`,
        } satisfies WorkerIncoming);
      },
    });

    self.postMessage({
      type: 'result',
      text: result.text ?? '',
      chunks: result.chunks ?? [],
    } satisfies WorkerIncoming);
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'Transcription failed. Please try again.',
    } satisfies WorkerIncoming);
  }
};
