# Pawrot

Browser-based audio transcriber powered by Whisper. No backend, no API keys, no uploads. Your audio never leaves your device.

## What it does

Drop in an audio file (or record from your mic), wait a few minutes, get a clean transcript you can copy or download. Runs entirely in your browser using [Transformers.js](https://huggingface.co/docs/transformers.js) and OpenAI's Whisper model.

## Features

- **File upload** — drag and drop or click to browse (MP3, MP4, WAV, M4A, WebM, OGG)
- **Mic recording** — record directly in the browser
- **Real progress** — chunk-level progress bar with estimated time remaining
- **Export** — copy to clipboard, download as `.txt` or `.docx`
- **Timestamps** — toggle segment-level timestamps on/off
- **Model choice** — Whisper Small (best accuracy) or Whisper Tiny (faster, smaller download)
- **Offline after first use** — model is cached in IndexedDB after the first 244 MB download
- **Privacy** — zero server involvement, zero tracking

## Getting started

```bash
git clone https://github.com/your-username/pawrot.git
cd pawrot
npm install
npm run dev
```

Open `http://localhost:5173` in Chrome (WebGPU) or any modern browser (WASM fallback).

### First run

The first transcription downloads the Whisper model (~244 MB for Small, ~75 MB for Tiny). This is a one-time download — subsequent uses load from browser cache instantly.

## Tech stack

- **React** + **TypeScript** + **Vite**
- **@xenova/transformers** (Transformers.js v2) — Whisper inference in the browser
- **Web Workers** — transcription runs off the main thread
- **docx** — `.docx` export

## How it works

1. You drop an audio file or record from your mic
2. The audio is decoded to 16kHz mono Float32 using the Web Audio API
3. The Float32 array is sent to a Web Worker
4. The worker loads the Whisper model (cached after first download) and runs inference in 30-second chunks
5. Progress updates are sent back to the main thread in real time
6. The transcript is displayed with optional timestamps

No data ever leaves your browser. The Whisper model runs entirely in WebAssembly (or WebGPU if available).

## Performance

| Device                 | Model         | 10 min audio | 20 min audio |
| ---------------------- | ------------- | ------------ | ------------ |
| Modern laptop, WebGPU  | Whisper Small | ~60–90s      | ~2–3 min     |
| Mid-range laptop, WASM | Whisper Small | ~2–4 min     | ~4–8 min     |
| Low-end device, WASM   | Whisper Tiny  | ~1–2 min     | ~2–4 min     |

## Project structure

```
src/
  App.tsx          # Main UI — file handling, state, progress display
  worker.ts        # Web Worker — Whisper inference with progress callbacks
  export.ts        # .txt and .docx download logic
  types.ts         # Shared TypeScript types
  index.css        # Full design system
  main.tsx         # React entry point
```

## License

[MIT](LICENSE)
