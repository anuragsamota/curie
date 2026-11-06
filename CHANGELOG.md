# Changelog

## 0.3.0 — 31 October 2026

### Study assistant
- New **Study** section with Assistant, Notes and Progress tabs.
- **Notes**: add PDFs (read on the device), text, Markdown, pasted text and photos of handwritten notes (transcribed by your AI model). Notes are split into passages and searched on the device with BM25.
- **Assistant**: answers questions from your notes with citations, creates lessons and practice quizzes (validated before they're saved), reads lessons, summarises notes, and gives guidance from your progress. Answers stream with a reasoning summary; tool steps show as cards, with **Open** on created lessons.
- **Providers**: Claude (Opus 5.5, Sonnet 5.5, Haiku 5.5) through the official Anthropic SDK with prompt caching and refusal fallbacks; any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, LM Studio, custom); Ollama on this computer or the local network, with a configurable context window.
- Quick actions: **Quiz me with AI** on lessons, **Make a lesson / Quiz me / Summarise** on notes, **Get study guidance** and **Practise my weak spots** on Progress.

### Progress
- Every quiz answer is recorded: first-try result, attempts, the answer chosen and the correct one.
- Progress tab: lessons completed, first-try accuracy, study streak, a 15-week heatmap, questions to review and per-lesson scores.
- Settings → Library & data → **Clear study data**.

### Design
- New minimal theme: cool neutral surfaces, an electric-blue accent with a mint highlight, Geist and Geist Mono type, tighter corners and quieter shadows.
- New logo and app icons, including Android adaptive icons.
- Calmer generated lesson covers.
- Touch sizing: larger controls and 16 px fields on touch screens; menus become action sheets on phones.
- Phone editor: full-width canvas, a bottom tool bar (Outline, Undo, Add, Redo, Block), block actions inside the selected block, and bottom-sheet panels and pickers.

### Platform and quality
- Native apps send AI requests through Tauri's HTTP plugin (no CORS, LAN `http://` hosts, streaming).
- Browser tests with Playwright on desktop and phone viewports, component tests with Testing Library, and many new unit tests; CI workflow for every push.
- Specification 2.0 with chapters on notes and retrieval, the assistant, and progress.

## 0.2.0

- Library, lesson viewer, block editor, settings, toasts, sounds and the first Curie theme.
- Desktop (Linux, Windows) and Android apps with native storage.
- Explore: lessons from GitHub repositories. Lesson cover images.
- Lesson variables and live logic: sliders, toggles, choices, buttons, live values, function plots, interactive SVG and conditional blocks.
- Background import and export with progress.
