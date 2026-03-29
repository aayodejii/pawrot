# Contributing to Pawrot

Thanks for your interest in contributing. Here's everything you need to get started.

## Getting started

```bash
git clone https://github.com/aayodejii/pawrot.git
cd pawrot
npm install
npm run dev
```

## How to contribute

- **Bug reports**: open an issue with steps to reproduce, browser/OS, and what you expected vs what happened
- **Feature requests**: open an issue describing the use case before starting work
- **Pull requests**: fork the repo, make your changes on a branch, then open a PR against `main`

## Before opening a PR

- Keep changes focused. One fix or feature per PR
- Test in Chrome (WebGPU) and Firefox (WASM fallback)
- Test on mobile if your change touches layout
- Run `npm run build` to confirm no TypeScript or build errors

## Project structure

```
src/
  App.tsx       Main UI. State, file handling, worker communication
  worker.ts     Whisper inference (runs in a Web Worker)
  export.ts     .txt and .docx download logic
  types.ts      Shared TypeScript interfaces
  index.css     Full design system (tokens, components, animations)
```

## Commit style

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(worker): add language detection
fix(app): handle empty transcript result
style(ui): adjust progress bar contrast
chore(deps): update @xenova/transformers
```

## What's in scope for V1

- Improvements to transcription accuracy or speed
- Better progress/status feedback
- Bug fixes (format support, edge cases, mobile layout)
- Accessibility improvements
- WebGPU / WASM backend handling

## Out of scope for V1

- Backend or server-side transcription
- User accounts or cloud storage
- Real-time/live captions
- Multi-language support (planned for later)

## License

By contributing, you agree your contributions will be licensed under the [MIT License](LICENSE).
