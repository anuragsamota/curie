# Curie

Curie is a learning app for interactive lessons and for studying from your own notes. Lessons are portable `.curie` packages built from safe, structured blocks: text and math, media, charts, quizzes, flashcards, and live logic where sliders and choices drive equations, plots and diagrams. A study assistant answers questions from your notes, turns them into lessons and practice quizzes, and gives guidance based on your progress. It runs on the AI provider you choose: Claude, any OpenAI-compatible service, or Ollama on your own computer or network.

Curie runs in the browser and as a native app on Linux, Windows and Android (Tauri 2). Everything is stored on your device.

## Features

- **Library**: lessons with cover art, search, sorting, reading progress and "continue learning". Import `.curie` files by picking or dropping them; large lessons unpack in the background with a progress notification.
- **Lessons**: reading progress, an "On this page" outline, quizzes with explanations, flashcards, reveals, and live variables (`{{ expression }}` in text and math, function plots, interactive SVG diagrams, conditional blocks).
- **Editor**: a block canvas with preview, undo/redo, autosave, an outline with drag and drop, a files panel, cover images, lesson variables and formulas, and live validation. On phones it has a bottom tool bar and bottom-sheet panels.
- **Explore**: browse lessons published in GitHub repositories and download the ones you want.
- **Study**:
  - **Notes**: add PDFs, text, Markdown, pasted text or photos of handwritten notes (transcribed by your AI model). Notes are searched on the device.
  - **Assistant**: answers from your notes with citations, creates lessons and practice quizzes, reads your lessons, and assesses your progress.
  - **Progress**: lessons completed, first-try quiz accuracy, study streak, a study-days heatmap, questions to review, and personal guidance.
- **Design**: a minimal light/dark theme with Geist type, touch-friendly sizing, sounds and motion that respect your settings.

## Requirements

- Node.js 22 and pnpm
- For native apps: the Rust toolchain and the Tauri 2 prerequisites for your platform (for Android: the Android SDK and NDK)

## Run and build

```bash
pnpm install
pnpm dev          # web app at http://localhost:5173
pnpm build        # production web build in dist/
pnpm tauri dev    # desktop app in development
```

## AI assistant setup

Open **Settings → AI assistant** and pick a provider:

| Provider | What you need |
|---|---|
| Claude | An Anthropic API key. Opus 5.5 is the default; Sonnet 5.5 and Haiku 5.5 are cheaper. |
| OpenAI-compatible | A base URL (presets for OpenAI, OpenRouter, Groq, LM Studio), an API key if the service needs one, and a model that supports tool calling. |
| Ollama | The Ollama address (`http://localhost:11434`, or another computer's address on your network) and a model with tool support, e.g. Qwen 3 or Llama 3.1. |

For Ollama on another computer, start it with `OLLAMA_HOST=0.0.0.0` so it listens on the network. The desktop and Android apps send AI requests through Tauri's native HTTP client, so no CORS setup is needed. In a browser, also set `OLLAMA_ORIGINS` to allow the site, and note that a page served over `https` can only reach Ollama at `http://localhost`, not at a network address.

Keys are stored only on the device and never exported. See [PRIVACY.md](PRIVACY.md) for what the assistant sends.

## Native apps

```bash
pnpm tauri build                                    # Linux: .deb, .rpm, AppImage
pnpm tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc   # Windows installer (cross-compiled)
pnpm tauri android build --apk --target aarch64     # Android APK
```

Android release builds are signed with the key described in `src-tauri/gen/android/keystore.properties` (not committed). Native apps keep their data in the app data folder (shown in Settings → Library & data): `library.json`, `settings.json`, `keys.json`, `progress.json`, `assistant-chat.json`, `lessons/` and `notes/`. Imported lessons stay where they are and are opened from their files.

## Tests

```bash
pnpm typecheck
pnpm test                     # unit and component tests (Vitest, Testing Library)
pnpm build && pnpm test:e2e   # browser tests (Playwright, desktop and phone viewports)
```

Browser tests mock every AI provider at the network layer, so they need no keys. To use a system Chromium instead of Playwright's, set `CHROMIUM_PATH=/usr/bin/chromium`. CI runs all of this on every push (`.github/workflows/ci.yml`).

## Lesson format

A `.curie` file is a ZIP with `manifest.json`, `document.json` and an `assets/` folder. The full format (blocks, variables and formulas, covers, versioning and safety rules) is in [docs/Curie_Project_Specification.md](docs/Curie_Project_Specification.md). Example lessons live in the separate [curie-lessons](https://github.com/anuragsamota/curie-lessons) repository, which is the default source in Explore.

## Project structure

```text
src/
├── App.tsx, main.tsx     app shell, routes and providers
├── pages/                Library, Lesson, Editor, Explore, Study, Settings
├── components/           block renderer, Markdown, lesson variables
├── editor/               block catalogue, inspector, outline, files panel
├── curie/                .curie format: schemas, load/export (Web Worker), expressions, logic, SVG sanitising
├── lib/                  library storage, settings, progress, lesson sources, router, sound
├── rag/                  notes: text extraction, chunking, BM25 search, storage
├── ai/                   agent loop, tools, lesson generation, prompts, configuration, providers/
├── study/                Assistant, Notes and Progress tabs
└── ui/                   toasts, menus, sheets, dialogs, logo, covers, AI settings
src-tauri/                Tauri 2 shell, icons, Android project
tests/e2e/                Playwright tests
docs/                     specification
```

## Changes

See [CHANGELOG.md](CHANGELOG.md).
