# Curie — starter app

Curie is a cross-platform learning app prototype built with **React + TypeScript + Vite**, **Tailwind CSS v4**, **daisyUI v5**, and a portable `.curie` lesson package format. Tauri 2 is included as the planned desktop wrapper.

This is an early vertical slice, not the complete product. It demonstrates the app shell, light/dark mode, a document renderer, math-capable Markdown, image/video/graph blocks, and basic `.curie` import/export.

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- For desktop packaging: Rust toolchain and platform prerequisites from the Tauri 2 documentation.

## Run the web app

```bash
npm install
npm run dev
```

Check TypeScript and build:

```bash
npm run typecheck
npm run build
```

## Tauri desktop

Tauri 2's platform configuration is intentionally not generated yet. After confirming the web prototype, initialize the wrapper with:

```bash
npm run tauri init
```

Choose `npm run dev` as the dev command, `http://localhost:5173` as the dev URL, `npm run build` as the build command, and `dist` as the frontend distribution directory. Then use `npm run tauri:dev`.

## Current blocks

- `markdown`: GitHub-flavoured Markdown, fenced code, inline/display math via `$...$` and `$$...$$`, scientific symbols via LaTeX.
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

- Re-exporting an imported lesson preserves its package files and assets. The starter does not yet provide a lesson editor or a UI for adding/replacing assets, so asset authoring is a future milestone.
- Remote images/video require network access. For portable lessons, prefer assets inside `assets/`.
- Local asset MIME types are inferred from file extensions when creating object URLs. Image loading errors are surfaced in the lesson viewer.
- Lottie support expects JSON-format Lottie animation data, not a `.lottie` binary container. Keep animations in `assets/` for portability.
- Interactive quiz, slider, reveal, and flashcard states are currently in-memory UI state; they are not yet persisted or connected to a lesson-wide expression/binding engine.
- Package loading has basic size, file-count, path traversal, and schema checks. It is not yet a comprehensive untrusted-file security boundary.
- Markdown is content from a lesson, so do not add raw HTML execution or arbitrary scripts to it.
- Graphs display supplied data. They do not evaluate arbitrary formulas or run simulations.
- Theme follows the app's light/dark mode; lesson authors cannot override it.
- The Tauri desktop wrapper, editor, lesson library, learner progress, and mobile packaging are future milestones.

## Project structure

```text
src/
├── components/
│   └── BlockRenderer.tsx
├── curie/
│   ├── package.ts
│   ├── sample.ts
│   └── types.ts
├── App.tsx
├── main.tsx
└── styles.css
```

## Next implementation milestone

1. Add automated tests for manifest/document validation, asset MIME handling, and package safety.
2. Add lesson-wide reactive state and bindings so slider values can drive equations, text, and charts.
3. Add a basic lesson library and responsive navigation.
4. Add authoring/editing only after the package contract stabilizes.
5. Initialize Tauri and validate desktop packaging.

## v0.2 notes

- Image rendering now creates Blob URLs with the correct MIME type inferred from the asset extension (especially important for SVG images).
- Added Lottie JSON rendering using `lottie-react`. `.lottie` binary containers are not supported in this first iteration.
- Added multiple-choice quiz, slider, reveal, flashcard, callout, and divider components.
- Interactive state is local to each component for now. A lesson-wide state graph and declarative bindings are the next runtime milestone.
- The `examples/intro-to-functions.curie` file contains an SVG image and a Lottie JSON animation for testing imported package assets.
