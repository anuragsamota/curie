# Curie

Curie is a cross-platform app for creating, sharing, and learning from interactive lessons. It is built with **React + TypeScript + Vite**, **Tailwind CSS v4**, and **daisyUI v5**, and uses a portable `.curie` lesson package format. Tauri 2 is included as the planned desktop wrapper.

## Features

- **Library**: lessons are stored on the device (IndexedDB) with generated covers, search, sorting, grid/list views, reading progress, and "continue learning". The library starts empty; an example lesson can be added from the empty state.
- **Lesson viewer**: reading-progress bar, "On this page" outline (side panel on wide screens, drawer on small ones), quiz scoring, and a completion celebration.
- **Editor**: a block canvas with click-to-select, inline insert, move/duplicate/delete, an outline with drag-and-drop (including into sections), a per-block inspector, a files panel for uploading packaged assets (or drop files onto the editor), live validation with a problem list, edit/preview modes, undo/redo, and autosave.
- **Per-lesson menu** (⋯): open, edit, export `.curie`, duplicate, delete (with confirmation and undo).
- **Global notifications**: toasts in the bottom-right that dismiss themselves, pause on hover, and can offer actions such as Undo.
- **Settings page**: theme (system/light/dark), lesson text size, panels, animations, sound effects and volume, storage usage, resetting preferences, deleting all lessons, and a list of keyboard shortcuts.
- **Theme and brand**: custom "Lab paper" (light) and "Night lab" (dark) daisyUI themes, the orbit logo (`src/ui/Logo.tsx`, `public/favicon.svg`), and self-hosted Inter, Bricolage Grotesque, and JetBrains Mono fonts.
- **Sound and motion**: sound effects are synthesised with Web Audio (no audio files). Page transitions, quiz feedback, 3D flashcard flips, and confetti all respect the reduced-motion setting.
- **Responsive**: a collapsible sidebar on desktop (Ctrl+B); a top bar and bottom tab bar on mobile; editor panels that become drawers on small screens.

## Requirements

- Node.js 20.19+ or 22.12+
- pnpm (the repo ships a `pnpm-lock.yaml`)
- For desktop packaging: Rust toolchain and platform prerequisites from the Tauri 2 documentation.

## Run the web app

```bash
pnpm install
pnpm dev
```

Check TypeScript, run the tests, and build:

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Example lessons

`examples/` holds the source folder and packaged `.curie` file for each example. "Or add some example lessons" in the empty library imports all of them.

| Lesson | Shows off |
|---|---|
| **Why is the sky blue?** | SVG diagrams, the Rayleigh $1/\lambda^4$ law, area chart, slider, puzzle reveals, quizzes, flashcards |
| **The rice and the chessboard** | Exponential growth: bar/line/area charts, geometric-series proof in a reveal, rule of 70 |
| **Kepler's laws of planetary motion** | Lottie animation, an equal-area orbit diagram, a planetary data table, T²/a³ chart |
| **A first look at functions** | The original example: every block type in a short lesson |

After editing an example folder, run `pnpm pack:example` to rebuild all the archives (or `pnpm pack:example <name>` for one). A test fails if an archive drifts from its folder, has validation issues, or declares the wrong required features.

## Tauri desktop

A minimal `src-tauri/` shell (config, capabilities, `main.rs`) is checked in but has not been validated with real platform builds or icons yet. With the Rust toolchain installed, try `pnpm tauri:dev`.

## Current blocks

- `markdown`: GitHub-flavoured Markdown, fenced code, and LaTeX math. Use `$...$` for inline math. For display math, put `$$` on its own lines (`$$\nf(x)=2x+1\n$$`); a one-line `$$...$$` renders inline. `\(...\)` delimiters are **not** supported.
- `image`: remote URL or a relative `assets/...` path in a `.curie` package.
- `video`: browser-native HTML5 video; remote URL or package asset path.
- `graph`: line, area, and bar charts with explicit data points.
- `lottie`: local or remote Lottie JSON animation.
- `quiz`: multiple-choice check with feedback and explanation.
- `slider`: numeric input control (currently local to that component).
- `reveal`: expandable hint/explanation.
- `flashcard`: tap-to-flip recall card.
- `callout`: info, tip, warning, and success note.
- `divider`: section separator.
- `section`: groups nested blocks.

No lesson-level theme is accepted. Lessons inherit the app's current light/dark theme.

## Portable `.curie` package v0.1

A `.curie` file is a ZIP archive renamed with the `.curie` extension.

```text
intro-to-functions.curie
├── manifest.json
├── document.json
└── assets/
    ├── function-plot.png
    └── lesson-video.mp4
```

### `manifest.json`

```json
{
  "format": "curie",
  "formatVersion": "0.1.0",
  "id": "org.example.intro-to-functions",
  "title": "A first look at functions",
  "description": "A short introduction to functions.",
  "author": "Example Author",
  "entry": "document.json",
  "assetsDirectory": "assets/",
  "requiredFeatures": ["markdown", "math", "image", "video", "graph"]
}
```

The manifest deliberately has no theme field. Visual styling belongs to the app, not to the lesson.

### `document.json`

```json
{
  "documentVersion": 1,
  "blocks": [
    {
      "id": "intro",
      "type": "markdown",
      "content": "# Functions\\n\\nA function maps each input to one output.\\n\\n$$f(x)=2x+1$$"
    },
    {
      "id": "photo",
      "type": "image",
      "src": "assets/function-plot.png",
      "alt": "Graph of a linear function",
      "caption": "A linear function."
    },
    {
      "id": "video",
      "type": "video",
      "src": "assets/lesson-video.mp4",
      "title": "Watch the explanation"
    },
    {
      "id": "chart",
      "type": "graph",
      "title": "Input and output",
      "kind": "line",
      "xLabel": "Input",
      "yLabel": "Output",
      "data": [
        { "x": 0, "y": 1 },
        { "x": 1, "y": 3 },
        { "x": 2, "y": 5 }
      ]
    }
  ]
}
```

### Current supported schema

- `markdown`: `{ "id": "...", "type": "markdown", "content": "..." }`
- `image`: `{ "id": "...", "type": "image", "src": "assets/image.png", "alt": "...", "caption": "..." }`
- `video`: `{ "id": "...", "type": "video", "src": "assets/video.mp4", "title": "...", "caption": "..." }`
- `graph`: `{ "id": "...", "type": "graph", "kind": "line|area|bar", "data": [{"x": 0, "y": 1}] }`
- `lottie`: `{ "id": "...", "type": "lottie", "src": "assets/animation.json", "loop": true }`
- `quiz`: `{ "id": "...", "type": "quiz", "question": "...", "options": ["A", "B"], "correctIndex": 0 }`
- `slider`: `{ "id": "...", "type": "slider", "label": "...", "min": 0, "max": 10, "initial": 5 }`
- `reveal`: `{ "id": "...", "type": "reveal", "title": "Hint", "content": "..." }`
- `flashcard`: `{ "id": "...", "type": "flashcard", "front": "Prompt", "back": "Answer" }`
- `callout`: `{ "id": "...", "type": "callout", "variant": "tip", "content": "..." }`
- `divider`: `{ "id": "...", "type": "divider" }`
- `section`: `{ "id": "...", "type": "section", "title": "...", "children": [] }`

## Important prototype limitations

- **Web:** lessons live in this browser's IndexedDB. Clearing site data deletes them, so export lessons you want to keep. If IndexedDB is unavailable, the app warns that lessons are kept only for the session.
- **Desktop and Android:** nothing is kept in the webview's storage. Curie uses its app data folder (shown in Settings → Library & data; on Linux `~/.local/share/com.curie.app/`):
  - `library.json` indexes every lesson: title and summary, progress, and the path of its `.curie` file.
  - `settings.json` holds preferences.
  - `lessons/` holds lessons created in Curie.
  - Imported lessons stay where they are and are opened from their files; edits are saved back to that file. Removing an imported lesson only removes it from the library. If a file moves, the library marks it "File missing" and offers **Locate file…**.
  - On Android, picked files arrive as `content://` URIs that don't stay readable after a restart, so imports there are copied into `lessons/`.
  - Export uses the native save dialog.
- Remote images/video require network access. For portable lessons, prefer assets inside `assets/`.
- Local asset MIME types are inferred from file extensions when creating object URLs. Image loading errors are surfaced in the lesson viewer.
- Lottie support expects JSON-format Lottie animation data, not a `.lottie` binary container. Keep animations in `assets/` for portability.
- Reading progress and completion are saved per lesson. Individual quiz answers, slider values, and flashcard states are not saved, and there is no lesson-wide binding engine yet.
- Package loading checks the archive size (50 MB), extracted size (200 MB), file count (300), unsafe or traversal paths, duplicate or case-conflicting paths, JSON and schema validity, unsupported required features, duplicate block ids, and that every local asset exists (case-sensitive). It accepts a single enclosing folder and `./` prefixes, and ignores `__MACOSX/` and `.DS_Store`. This is not yet a full security boundary: SVG is shown through `<img>` (no script execution), but it is not sanitized, and remote media is not restricted.
- Markdown is content from a lesson, so do not add raw HTML execution or arbitrary scripts to it.
- Graphs display supplied data. They do not evaluate arbitrary formulas or run simulations.
- Theme follows the app's light/dark mode; lesson authors cannot override it.
- The Tauri desktop wrapper and mobile packaging are future milestones.

## Project structure

```text
src/
├── App.tsx                 # app shell: sidebar, mobile nav, routes, drop-to-import, shortcuts
├── main.tsx                # providers: settings → toasts → confirm → library → app actions
├── styles.css              # themes, typography, motion
├── components/
│   └── BlockRenderer.tsx   # block type → component, asset loading, per-block error boundary
├── curie/                  # the .curie format (no UI)
│   ├── assets.ts           # shared path-safety and MIME rules
│   ├── package.ts          # import/validation/export, issue collection, feature detection
│   └── types.ts            # zod schemas + types
├── editor/
│   ├── blocks.ts           # block catalogue (labels, icons, defaults)
│   ├── tree.ts             # immutable block-tree operations (tested)
│   ├── Inspector.tsx       # per-block and lesson-details forms
│   ├── Outline.tsx         # drag-and-drop outline, add-block menu
│   └── AssetsPanel.tsx     # packaged files
├── lib/
│   ├── library.tsx         # lesson library state (create/import/export/duplicate/delete)
│   ├── storage.ts          # IndexedDB persistence
│   ├── settings.tsx        # preferences, theme and motion resolution
│   ├── sound.ts            # Web Audio sound effects
│   ├── router.ts           # hash router
│   └── lesson.ts           # reading time, outline, formatting helpers
├── pages/                  # Library, Lesson, Editor, Settings, NotFound
└── ui/                     # Toasts, Confirm, Menu, Logo, LessonCover, LessonActions, AppActions, Confetti
scripts/
└── pack-example.mjs        # rebuilds examples/*.curie from its folder
docs/
└── Curie_Project_Specification.md
```

## Next implementation milestone

1. Add component tests for the block renderers and editor interactions.
2. Add lesson-wide reactive state and bindings so slider values can drive equations, text, and charts.
3. Initialize Tauri and validate desktop packaging, including native open/save dialogs.
