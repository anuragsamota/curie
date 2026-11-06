# Curie — Project Specification

**Document type:** Product and technical specification  
**Version:** 2.0  
**Status:** Specification for Curie 0.3 (shipping on web, Linux, Windows and Android) and its roadmap  
**Last updated:** 31 October 2026

---

## 1. Project Overview

Curie is a cross-platform learning application for creating, viewing, and sharing rich interactive lessons, and for studying from your own notes with an AI study assistant. Lessons are assembled from portable, structured content blocks—such as Markdown, mathematical notation, images, videos, graphs, animations, quizzes, sliders, reveals, and flashcards—rather than being authored as arbitrary executable code.

The product aims to make learning feel visual, active, and approachable, taking inspiration from the polished, guided learning experience of products such as Brilliant without copying any one product's interface or interaction design.

A core product principle is **portable lessons**: a lesson should be packaged with its required local assets so that it can be imported, shared, and rendered consistently by Curie-compatible clients.

### 1.1 Product goals

1. Deliver a clean, modern, responsive learning experience.
2. Support lessons that combine prose, code, equations, diagrams, media, charts, and lightweight interactions.
3. Define a versioned `.curie` lesson format that can be created, validated, imported, exported, and shared.
4. Keep lesson content separate from the app's presentation layer.
5. Inherit light/dark appearance from the app; individual lessons cannot impose their own theme.
6. Keep the implementation modular and maintainable, with room to add lesson components and authoring workflows.
7. Build web-first, while retaining a practical path to desktop packaging and possible mobile clients.
8. Prioritize reliable, accessible learning components over complex simulations in the initial releases.
9. Help students learn from their own material: import notes, ask questions grounded in them, and turn them into lessons and practice quizzes.
10. Assess progress and give specific, encouraging guidance on what to study next.
11. Stay local-first and provider-neutral: notes, progress and lessons live on the device, and the AI runs on the provider the student chooses, including local models through Ollama.

### 1.2 Non-goals for the initial release

- A full learning-management system with classrooms, grading administration, and institution management.
- A real-time collaborative lesson editor.
- Arbitrary JavaScript or React execution from lesson files.
- A general-purpose 3D simulation engine or advanced physics sandbox.
- Lesson-defined themes or arbitrary CSS.
- A requirement that every lesson work offline if it deliberately references remote media.
- A hosted Curie AI service or Curie accounts. The assistant uses the student's own provider key or a local model.
- Cloud sync of notes, progress or lessons (a future, opt-in decision).

---

## 2. Target Users and Primary Use Cases

### 2.1 Learners

Learners should be able to:
- Open a lesson and move through its content in a clear sequence.
- Read formatted explanations, code, and equations.
- View local or remote images and videos.
- Explore supported graphs and Lottie illustrations.
- Answer quizzes and see feedback.
- Use lightweight controls such as sliders, reveals, and flashcards.
- Switch the app between light and dark mode without changing lesson content.
- Add their own notes (PDF, text, Markdown, pasted text, photos of handwritten pages) and search them.
- Ask an AI study assistant questions answered from their notes, with citations.
- Generate interactive lessons, practice quizzes and flashcards from their notes or existing lessons.
- See their progress (completion, first-try quiz accuracy, streak, questions to review) and get guidance.

### 2.2 Lesson creators and educators

Creators should eventually be able to:
- Assemble a lesson from supported content blocks.
- Include images, videos, animations, and other local assets.
- Preview the lesson in the same renderer used by learners.
- Validate the lesson package before sharing.
- Export a single `.curie` file that contains its manifest, document, and assets.
- Ask the assistant for a first draft of a lesson and refine it in the editor.
- Publish lessons in a GitHub repository that students browse from Explore.

### 2.3 Developers and integrators

Developers should be able to:
- Add new block types through a defined schema and renderer.
- Validate package structure and content.
- Build clients against a documented, versioned package format.
- Test package compatibility without depending on app-specific presentation details.

---

## 3. Product Principles

### 3.1 Content and presentation are separate

A lesson describes its content and interaction data. Curie controls layout, typography, colors, spacing, component behavior, and accessibility. Lesson authors must not be able to inject arbitrary styles or override the app's theme.

### 3.2 Structured content over executable lessons

`.curie` files contain structured JSON and assets. They do not contain executable React components or arbitrary scripts. Each supported block type has a schema and a known renderer. Lesson logic is expressed with sandboxed formulas over lesson variables (section 7.7), not code.

### 3.3 Portability by default

Local media should be stored inside the package's `assets/` directory and referenced by relative paths. A lesson that uses only bundled assets should not require a network connection to retrieve those assets.

### 3.4 Small, composable components

Each block should have a clear purpose, predictable properties, and an isolated renderer. New components should not require rewriting the entire lesson renderer.

### 3.5 Accessible interaction

Interactive blocks should support keyboard use where appropriate, visible focus, readable contrast, descriptive labels, and feedback that is not communicated through color alone.

### 3.6 Safe failure

Invalid packages, missing assets, unsupported features, and corrupt media should produce actionable errors or component-level fallbacks rather than crashing the entire app.

### 3.7 Local-first and private

Notes, progress, lessons and settings are stored on the device. Nothing leaves it unless the student uses a feature that needs a network (Explore downloads, remote media, or the AI assistant), and the app says what is sent and where.

### 3.8 Provider-neutral AI

The assistant is defined by a provider-neutral conversation and tool model. Claude, OpenAI-compatible services and Ollama are adapters behind the same interface, so features work the same on every provider that supports tool calling.

### 3.9 AI output is content, not code

Anything the assistant creates is ordinary lesson data. Generated lessons pass the same schema, semantic and logic validation as imported lessons, and chat replies are rendered as Markdown and math only.

---

## 4. Platform and Technology

### 4.1 Technology stack

| Layer | Technology | Responsibility |
|---|---|---|
| UI framework | React 19 | Component-based interface and rendering |
| Language | TypeScript | Static typing and maintainable contracts |
| Build tooling | Vite 6 | Development server, production build, Web Workers |
| Styling | Tailwind CSS v4 + daisyUI v5 | Utilities, components and the Curie light/dark themes |
| Typography | Geist and Geist Mono (self-hosted) | Interface, lesson and code text, offline |
| Markdown and math | `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex` | Lesson text and chat replies |
| Charts | Recharts | Data graphs and function plots |
| Package archive | JSZip (in a Web Worker) | Read and write `.curie` packages off the UI thread |
| Validation | Zod | Runtime validation of lessons, tool inputs and settings |
| Animation | `lottie-react` | JSON-format Lottie animations |
| Notes | pdf.js (legacy build) | Local PDF text extraction |
| AI | Anthropic TypeScript SDK; plain HTTP for OpenAI-compatible APIs and Ollama | The study assistant's providers |
| Native shell | Tauri 2 (fs, dialog and http plugins) | Desktop and Android apps, file access, native HTTP |
| Testing | Vitest, Testing Library (jsdom), Playwright | Unit, component and browser tests |

### 4.2 Delivery

1. **Web:** a static build that runs in current browsers. Data lives in browser storage.
2. **Desktop:** Tauri builds for Linux (deb, rpm, AppImage) and Windows (NSIS installer). macOS is supported by Tauri but not yet built or tested.
3. **Android:** a Tauri build for arm64 (minimum Android 7, API 24), signed with the project's release key.
4. **iOS:** not planned until there is demand and a signing setup.

### 4.3 Supported environments

The web client targets current evergreen browsers at phone, tablet and desktop sizes. Native builds use the system webview: WebKitGTK on Linux, WebView2 on Windows, Android System WebView on Android.

## 5. Application Experience

### 5.1 Main application shell

| Area | Wide screens | Phones |
|---|---|---|
| Navigation | Collapsible sidebar: New lesson, Import, Library, Explore, Study (Assistant, Notes, Progress), Settings, Continue learning, theme and sound toggles | Top bar (logo, import, theme, sound) and a bottom tab bar: Library, Explore, Create, Study, Settings |
| Library | Card grid or list with search, sort, cover art, progress | Same, single column |
| Lesson | Reading progress bar, "On this page" outline panel | Outline in a sheet |
| Editor | Outline/files panel, canvas, inspector panel | Full-width canvas, bottom tool bar, panels in bottom sheets |
| Study | Tabs for Assistant, Notes and Progress | Same, with the composer above the tab bar |
| Notifications | Floating toasts bottom right, progress toasts for long tasks | Same, above the tab bar |

The interface should feel focused and uncluttered. Curie takes general inspiration from modern interactive learning products, but uses its own layout, visual identity and components.

### 5.2 Theme and design system

- Light and dark themes, following the system or a manual choice; the choice is saved. Lessons always inherit the app theme and cannot override it.
- **Palette:** cool neutral surfaces; one accent (electric blue, `oklch(54% 0.21 266)` in light, `oklch(71% 0.155 268)` in dark) for actions, focus and progress; a mint highlight (`oklch(78% 0.13 168)`) used sparingly. Semantic colours for info, success, warning and error. All colours are theme tokens; components don't hard-code colours.
- **Type:** Geist for interface and lessons (headings with tight tracking), Geist Mono for code and formulas. Lesson text size is adjustable (small, default, large).
- **Shape and depth:** corner radii of 8, 12 and 16 px for small controls, inner elements and cards; hairline borders and minimal shadow.
- **Logo:** a blue tile with a white open orbit that reads as a lowercase "c", and a mint electron closing the gap. The same mark is used for the favicon, desktop icons and Android adaptive icons (foreground mark on a solid brand background).
- **Motion:** short, purposeful transitions and sounds, all disabled by the reduce-motion and sound settings.

### 5.3 Lesson viewing

The lesson viewer renders the document's blocks in order. Sections can contain nested blocks. Each block is rendered by a known component selected by its `type`.

The viewer should:
- Keep block ordering stable.
- Display local assets correctly.
- Give missing assets a helpful error state.
- Handle unsupported block types gracefully, subject to the document's required-feature policy.
- Avoid allowing lesson data to execute arbitrary application code.
- Preserve semantic headings and appropriate reading order.

### 5.4 Import and export

Users should be able to select a `.curie` package from their device, import it, view its lesson, and export the package where supported.

Import should validate the package before making it the active lesson. Errors should identify the missing or invalid file and provide a useful next step.

Export should preserve the manifest, document, and package assets. If the user has not edited the lesson or its assets, import/export should not silently drop files.

Large packages are unpacked and packed in a Web Worker, and native file reads happen in chunks, so the interface stays responsive. Long operations show a progress notification.

### 5.5 Lesson editor

- A block canvas that uses the production renderer, with Edit and Preview modes, undo/redo, autosave and a problems list.
- Blocks can be added between others, moved, duplicated and deleted; sections can be nested; files can be uploaded, dropped and reused.
- An inspector edits the selected block or the lesson's details (title, description, author, id, cover image, variables).
- On phones the canvas is full width; the tools sit in a bottom bar (Outline, Undo, Add, Redo, Block or Lesson), the selected block shows its actions in a row inside it, and panels and pickers open as bottom sheets.

### 5.6 Explore and lesson sources

Explore lists `.curie` files from public GitHub repositories ("lesson sources"). Only the file list is fetched until the student downloads a lesson; a downloaded lesson shows Open, or Update when the file changed. Sources are managed in Settings, and a default source can be removed and restored. A repository may include `curie-index.json` with titles and descriptions.

### 5.7 Touch and sizing

On touch screens, compact controls grow to at least 36–44 px, form fields use 16 px text (avoiding browser zoom), menus become action sheets, and pickers become bottom sheets. Content respects safe areas (status bar, notch, home indicator and keyboard).

### 5.8 Native storage

The desktop and Android apps keep a Curie folder in the app data directory: `library.json` (lesson index and progress), `settings.json`, `keys.json` (AI keys), `progress.json`, `assistant-chat.json`, `lessons/` (lessons created or downloaded in Curie) and `notes/`. Imported lessons stay where the student keeps them and are read from their path.

---

## 6. Portable `.curie` Package Format

### 6.1 Definition

A `.curie` file is a ZIP archive using the `.curie` extension. It contains a manifest, a document JSON file, and optionally an assets directory.

### 6.2 Canonical package layout

```text
intro-to-functions.curie
├── manifest.json
├── document.json
└── assets/
    ├── function-plot.png
    ├── lesson-video.mp4
    └── animation.json
```

`manifest.json` and `document.json` should be at the archive root. The importer may normalize common ZIP layouts that introduce a single enclosing folder or `./` path prefixes, but the canonical format remains root-based.

### 6.3 Manifest

Example:

```json
{
  "format": "curie",
  "formatVersion": "0.1.0",
  "id": "org.example.intro-to-functions",
  "title": "A First Look at Functions",
  "description": "An introduction to functions.",
  "author": "Example Author",
  "entry": "document.json",
  "assetsDirectory": "assets/",
  "requiredFeatures": [
    "markdown",
    "math",
    "image",
    "video",
    "graph"
  ]
}
```

Required fields:
- `format`: must be `curie`.
- `formatVersion`: package-format version.
- `id`: stable lesson identifier.
- `title`: user-facing lesson title.
- `entry`: document entry point, currently `document.json`.
- `assetsDirectory`: asset directory, currently `assets/`.
- `requiredFeatures`: list of features required to render the lesson correctly.

Optional metadata may include a description, an author, and `cover`: a path inside `assets/` to an image shown on library cards and at the top of the lesson. Readers that don't know `cover` ignore it; a missing cover file falls back to generated art. The schema must not include a theme override.

The current `formatVersion` is `0.2.0`. Packages written as `0.1.0` remain valid.

### 6.4 Document

The document is JSON and contains an ordered list of blocks:

```json
{
  "documentVersion": 1,
  "blocks": [
    {
      "id": "intro",
      "type": "markdown",
      "content": "# Functions\n\nA function maps an input to an output.\n\n$$f(x)=2x+1$$"
    },
    {
      "id": "lesson-image",
      "type": "image",
      "src": "assets/function-plot.png",
      "alt": "Graph of a linear function",
      "caption": "A linear function."
    }
  ]
}
```

Every block must have a stable `id` and a recognized `type`. Nested sections use a `children` array. Block-specific data must be validated against the schema for that type.

### 6.5 Asset path rules

- Local assets are referenced using relative paths such as `assets/test.mp4`.
- Paths must not escape the package root.
- Absolute filesystem paths are not valid portable asset references.
- Path comparison must account for exact case, particularly when packages move between operating systems.
- The importer must verify that each referenced local asset exists.
- Media MIME types should be inferred or assigned using a safe extension-to-MIME mapping.
- Missing or unsupported media should produce a clear component-level error.

### 6.6 Versioning and compatibility

- `formatVersion` versions the package format; `documentVersion` versions the document structure.
- Schema changes that break existing content require a versioning and migration strategy.
- Unknown optional fields should not break older readers unless strict validation is required for security or correctness.
- Unknown required features should produce an explicit compatibility error rather than silently rendering an incomplete lesson.
- Example packages and schema fixtures should be version-controlled with the codebase.

---

## 7. Lesson Component Catalogue

The component system is a portable registry of known block types. Each block type requires a schema, a renderer, documentation, and tests.

| Block type | Purpose | Key data |
|---|---|---|
| `markdown` | Explanations, lists, tables, code, math | `content` |
| `image` | Local or remote image with alternative text and caption | `src`, `alt`, optional `caption` |
| `video` | Native video playback | `src`, optional `title`, `caption` |
| `graph` | Data visualization | `kind`, `data`, optional title and axis labels |
| `lottie` | Lottie JSON animation | `src`, optional `loop`, `autoplay` |
| `callout` | Emphasized note | `variant`, `content` |
| `divider` | Visual separation between blocks | `id`, `type` |
| `reveal` | Expandable hint or explanation | `title`, `content` |
| `quiz` | Multiple-choice question with feedback | `question`, `options`, `correctIndex`, optional explanation |
| `slider` | Numeric control | `label`, `min`, `max`, `step`, `initial`, optional unit |
| `flashcard` | Recall prompt with hidden answer | `front`, `back` |
| `section` | Group related content | `title`, `children` |

### 7.1 Markdown and equations

Markdown should support:
- Headings, paragraphs, emphasis, lists, links, tables, and fenced code blocks.
- GitHub-flavored Markdown features where supported.
- Inline math using `$...$`.
- Display math using `$$...$$`.
- Safe rendering without enabling arbitrary raw HTML execution by default.

### 7.2 Images

- Support common web image formats, including PNG, JPEG, WebP, and SVG where safe.
- Local assets should load from the package archive.
- Alternative text should be available for accessibility.
- Captions are optional.
- Failed image loads should show a visible fallback and not break the lesson.

SVG handling must be considered a security-sensitive area. If SVG content can originate from untrusted lesson files, the implementation should sanitize or safely constrain it before rendering.

### 7.3 Video

- Use the browser's native HTML5 video element.
- Accept a remote URL or a local package asset reference.
- Display playback controls.
- Support optional title/caption metadata.
- Report unsupported codecs, missing assets, and media load errors clearly.
- Prefer bundled media for portability; remote video requires a network connection.
- Large media files must respect package size limits and should not be unnecessarily copied into memory.

### 7.4 Graphs

- Support line, area, and bar chart types.
- Data is explicitly declared in the document; charts do not execute arbitrary code.
- Support optional title and axis labels.
- Validate data points and chart kind.
- Include readable labels and accessible context or a text summary where practical.

### 7.5 Lottie animations

- Support JSON-format Lottie animation files.
- Support configurable looping and autoplay behavior where allowed by the schema.
- Do not claim support for the binary `.lottie` container unless it is separately implemented.
- Respect reduced-motion preferences where practical.
- Invalid animation data should fail gracefully.

### 7.6 Interactive blocks

Quizzes, sliders, reveals, and flashcards provide lightweight interaction without a general-purpose simulation engine. Interaction state is in-memory and starts fresh each time a lesson is opened.

### 7.7 Variables and live logic (format 0.2.0, feature `variables`)

Lessons can connect interactive blocks to text, equations, plots and diagrams through **variables** and **expressions**. This is declarative logic, not scripting: lessons still cannot run code.

**Declaring variables**

- Input blocks declare variables: `slider` (optional `variable`), `toggle` (`variable`, boolean), `choice` (`variable`, value of the chosen option).
- `document.variables` declares lesson-level variables. Each one is either a **value** (`{ "name": "count", "initial": 0 }`), which buttons can change, or a **formula** (`{ "name": "range", "expression": "speed^2 * sin(2 * theta) / g" }`), which is recomputed whenever its inputs change. Formulas may refer to each other in any order but not in a loop.
- Names use letters, digits and `_`, start with a letter, and must not clash with built-in function or constant names. The first declaration of a name wins.

**Using variables**

| Where | How |
|---|---|
| Markdown, callout, reveal, flashcard text and math | `{{ expression }}` placeholders, filled before Markdown and KaTeX render |
| Any block | `showIf`: the block is shown only while the expression is true |
| `display` | Cards showing `items[].expression` with a label and unit |
| `plot` | `functions[].expression` in terms of `x` over `xMin`…`xMax`, optional fixed `yMin`/`yMax` |
| `diagram` | An SVG asset whose elements (by `id`) get an attribute, or `text`, set from `bindings[].expression` |
| `button` | `actions[]` set value or input variables in order when pressed |

**Expression language**

Numbers, text in quotes, `true`/`false`; `+ - * / % ^`; `== != < <= > >=`; `and or not` (or `&& || !`); `cond ? a : b`; constants `pi`, `e`; functions `sin cos tan asin acos atan atan2 sqrt cbrt abs sign floor ceil round(x, digits) min max pow exp ln log(x, base) hypot clamp lerp deg rad if fixed(x, digits) text`. `+` joins text when either side is text. Numbers are shown with at most 4 decimals.

**Safety**

- Expressions are parsed and evaluated by Curie's own interpreter over a plain map of variable values. They cannot access JavaScript globals, object prototypes, the DOM, storage, or the network.
- Diagram SVGs are sanitized before display: scripts, `foreignObject`, event-handler attributes, animation elements and external links or `url()` references are removed. Bindings cannot set `on*`, `href`, `src` or `style`.
- Logic mistakes (unknown variables, syntax errors) are reported in the editor but never stop a lesson from loading; the affected value shows as `?`.

Lessons using any of this list `variables` (and the new block types) in `requiredFeatures`, so older versions of Curie refuse them with a clear message instead of rendering them wrongly.

---

## 8. Study Notes and Retrieval

Students add the notes they study from. Curie turns them into searchable passages so the assistant can ground its answers, lessons and quizzes in the student's own material.

### 8.1 Supported inputs

| Input | How it is read | Leaves the device? |
|---|---|---|
| PDF | Text layer extracted with pdf.js, page by page | No |
| Text, Markdown, CSV, TeX, JSON, HTML | Read as text (HTML reduced to its text) | No |
| Pasted text | Saved as a note with a name | No |
| Photos of notes (PNG, JPEG, WebP, GIF) | Shrunk to at most 2000 px, then transcribed to Markdown by the configured AI model | Yes, to the chosen AI provider |

Scanned PDFs without a text layer are reported with a suggestion to add photos of their pages instead. Word documents are not read yet; students can save them as PDF.

### 8.2 Processing

1. Extract text, keeping page numbers for PDFs.
2. Split into passages of about 1,100 characters along paragraph and sentence boundaries, carrying about 180 characters of overlap so ideas cut at a boundary stay findable. Each passage keeps the page it starts on.
3. Index passages with BM25 (k1 = 1.2, b = 0.75) over lowercase, accent-folded words, without common stopwords and with light English stemming. The note's name is indexed with each passage.

### 8.3 Storage

Web: the IndexedDB database `curie-notes`. Native: one JSON file per note in `<Curie folder>/notes/`. A note stores its name, kind, size, page count, extracted text and passages. The index is rebuilt in memory at start-up.

### 8.4 Search and context

- **Manual search** on the Notes tab shows the best passages with their note and page; it works without any AI provider.
- **Automatic excerpts:** when enabled, each question to the assistant is sent with up to four matching passages, keeping only those within 40% of the best match's score, wrapped in a clearly labelled `<note_excerpts>` block.
- **Tool search:** with tools enabled, the model searches the notes itself (`search_notes`) and can read a whole note (`read_note`). Answers cite passages as [1], [2] with the note name.

### 8.5 Planned improvements

- Hybrid search with local embeddings, keeping BM25 as the offline baseline.
- OCR for scanned PDFs, Word documents, and slide decks.
- Collections (per subject or course) to scope search, lessons and quizzes.
- Showing the exact passage behind each citation.

---

## 9. AI Study Assistant

### 9.1 Capabilities

- Answer questions from the student's notes, citing what was used, and say clearly when the notes don't cover something.
- Create interactive lessons, practice quizzes and flashcard sets from notes or existing lessons, saved to the library as ordinary `.curie` lessons.
- Assess progress and give guidance: what's going well, what to review (specific questions and ideas), and an ordered plan, with an offer to create targeted practice.
- Summarise a note, and "quiz me" on a lesson or note from their menus.

Entry points: the Assistant tab, quick actions on notes and lessons, and the Progress tab ("Get study guidance", "Practise my weak spots").

### 9.2 Providers

| Provider | Transport | Notes |
|---|---|---|
| Claude | Official Anthropic TypeScript SDK, streaming | Claude Opus 5.5 by default; Sonnet 5.5 and Haiku 5.5 selectable. Adaptive thinking with readable summaries, a chosen effort level (low, medium or high), prompt caching of the system prompt, tools and conversation, and server-side refusal fallbacks (`fallbacks: "default"`) on Opus and Sonnet. |
| OpenAI-compatible | Chat Completions over HTTP, streaming | Presets for OpenAI, OpenRouter, Groq and LM Studio, or any base URL (vLLM, LiteLLM, self-hosted gateways). Streams text, reasoning (`reasoning_content`, `<think>` tags) and function calls. Optional API key. |
| Ollama | Native `/api/chat`, streaming | On this device or another computer on the network. The context window (`num_ctx`) is set explicitly (8K–64K tokens, default 16K) so the system prompt and excerpts aren't truncated. Model list from `/api/tags`. |

The student picks the provider and model in Settings, can load the provider's model list, and can run a connection test.

### 9.3 The agent loop

- The conversation is provider-neutral: user turns (with optional hidden excerpts), assistant turns (text, reasoning summary, tool calls, and the provider's native content for exact replay) and tool-result turns.
- Each step streams the model's reply. When it calls tools, each input is validated against the tool's schema before it runs; invalid input is returned to the model as an error to fix. A turn whose tool call is malformed JSON is asked for again (twice at most).
- Tools of a turn that was refused or cut off at its length limit are never run. Unanswered tool calls (after a stop, refusal or error) get an error result, so the conversation stays valid for the next request.
- The loop stops after ten tool steps. The student can stop a run at any time.
- The conversation lives at the app level, so answers keep streaming while the student navigates, and is saved locally. "New chat" clears it.

### 9.4 Tools

| Tool | Effect |
|---|---|
| `search_notes` | Best-matching passages with note name, page and id |
| `list_notes` | The student's notes with ids and sizes |
| `read_note` | A note's full text, 16,000 characters at a time |
| `get_progress` | Lessons completed and in progress, first-try accuracy overall and per lesson, streak, and missed questions with the chosen and correct answers |
| `list_lessons` | Library lessons with keys and reading progress |
| `read_lesson` | A lesson as text, including quiz answers |
| `create_lesson` | Builds, validates and saves a new lesson; returns problems to fix instead of saving an invalid one |

All tools except `create_lesson` are read-only. `create_lesson` only adds a lesson, which the student can delete. No tool reaches the network or the file system directly.

### 9.5 Generated lessons

- The tool accepts a deliberately flat block format (one block shape with a `type`) so smaller local models can produce it: Markdown, callout, quiz, flashcard, reveal, divider, section (one level), slider, toggle, choice, live values, function plot and data graph, plus lesson variables.
- Blocks are converted into the real schema with stable ids (`b3-quiz`, `b2.1-slider`), then checked with the same schema, semantic and logic validation as imported lessons. Problems are returned to the model in terms it can act on.
- Saved lessons are `formatVersion` `0.2.0`, authored "Curie assistant", with `requiredFeatures` derived from their content.
- With tools turned off (for models without tool calling), the assistant may write a ```` ```curie-lesson ```` JSON block; the chat shows it as a card with "Save as lesson", using the same validation.

### 9.6 Networking

- **Native apps** send AI requests through Tauri's HTTP plugin: no CORS restrictions, plain-HTTP hosts on the local network (Ollama), and streamed responses. Because students choose their own endpoints, the plugin's allow-list permits any `http` and `https` host; only Curie's own code can make these requests (lesson content cannot run code).
- **The web build** uses the browser's fetch. Claude is called with the SDK's browser mode. Ollama in a browser additionally needs `OLLAMA_ORIGINS` to allow the site.
- For network access to Ollama on another computer, Ollama must listen on the network (`OLLAMA_HOST=0.0.0.0`).

### 9.7 Privacy and safety

- **Keys:** API keys are entered by the student, stored separately from settings (`keys.json` natively, browser storage on the web), never exported, and sent only to their provider.
- **What is sent:** the conversation, any attached note excerpts, and the results of tools the model calls (which may include note text, lesson text and the progress summary). Notes, lessons and progress are otherwise never uploaded. The Notes tab and Settings state this plainly.
- **Untrusted content:** note text and lesson content reach the model inside labelled blocks or tool results and are treated as material, not instructions. Model output is rendered as Markdown and math only (no HTML or scripts), and generated lessons are validated data.
- **Refusals:** a declined request shows a short notice. On Claude Opus and Sonnet, server-side fallbacks first retry declined requests on Anthropic's recommended fallback model, which reduces false positives on, for example, biology notes.

### 9.8 Cost and performance

Prompt caching (Claude) and a stable system prompt keep follow-up turns cheaper; the effort setting trades depth for cost; automatic excerpts are capped at four passages; Ollama's context window is configurable. Provider code, including the Anthropic SDK, loads only when the assistant is first used. Streaming text is applied once per animation frame.

### 9.9 Errors

Failures are explained in the chat with a next step: a rejected key or missing model (with a link to Settings), rate limits, an unreachable server (with its address), a model without tool support (suggesting a tool-capable model or turning tools off), refusals, and answers cut off at their length limit.

---

## 10. Progress and Assessment

### 10.1 Data recorded

| Data | When |
|---|---|
| Lesson opened, furthest reading position, completion | While reading (stored with the lesson's library entry) |
| Quiz attempts per question: first-try result, solved, last wrong answer, question and correct answer | When an answer is checked |
| Study days | When a lesson is opened or a quiz is answered |

Progress is local only (`progress.json` natively, browser storage on the web). Retrying a solved quiz is practice and doesn't change its first-try result. Settings can clear notes, quiz history and the chat.

### 10.2 Progress tab

Lessons completed and in progress, first-try accuracy, study streak (counted back from today, or from yesterday when the student hasn't studied yet today), questions to review, a 15-week study heatmap, per-lesson reading and quiz scores, and the AI guidance actions.

### 10.3 Guidance

The assistant reads the progress report through `get_progress`, combines it with the student's notes, and replies with strengths, specific review items, an ordered plan for the next session, and an offer of a targeted practice quiz.

### 10.4 Planned

Spaced repetition for flashcards and missed questions, mastery per topic or note collection, goals and reminders, and exporting progress.

---

## 11. Architecture

### 11.1 Modules

```text
src/
├── App.tsx, pages/            Shell, routes (library, lesson, editor, explore, study, settings)
├── components/                Block renderer, Markdown, lesson variables
├── editor/                    Block definitions, inspector, outline, asset panel, tree operations
├── curie/                     Package format: schemas, ZIP load/export (Web Worker), expressions, logic, SVG sanitising
├── lib/                       Library (storage backends), settings, progress, lesson sources, router, sound, app data files
├── rag/                       Notes: extraction, chunking, BM25 index, notes store
├── ai/                        Provider-neutral types, agent loop, tools, lesson tool, prompts, configuration, assistant state
│   └── providers/             Claude (Anthropic SDK), OpenAI-compatible, Ollama
├── study/                     Assistant, Notes and Progress tabs
└── ui/                        Shared UI: toasts, menus, sheets, confirm dialog, logo, covers, AI settings
src-tauri/                     Tauri 2 shell (fs, dialog, http plugins), icons, Android project
tests/e2e/                     Playwright browser tests
```

### 11.2 Package layer

The package module reads and writes `.curie` ZIPs, enforces entry-count and size limits, normalises wrapper folders and `./` prefixes, rejects unsafe and duplicate paths, validates manifest and document, verifies local assets, and exports without losing assets. It runs in a Web Worker with progress reporting and is independent of React so it can be unit-tested.

### 11.3 Renderer

The renderer maps each validated block's `type` to its component, renders sections recursively, resolves assets through object URLs it revokes, evaluates expressions only through the sandboxed interpreter, isolates each block behind an error boundary, and never executes lesson-supplied code.

### 11.4 State

- **Lesson variables:** per open lesson, in memory, recomputed from inputs and formulas.
- **App state:** React context providers for settings, library, AI configuration, notes, progress and the assistant conversation.
- **Persistence:** library backends (IndexedDB or native files), JSON app-data documents, and the notes store, as described in 5.8 and 8.3.

---

## 12. Package Validation and Security

Lesson packages, downloaded lessons, notes and AI output are all treated as untrusted.

### 12.1 Current protections

- Package size (50 MB), extracted size (200 MB), entry-count (300) and per-asset (50 MB) limits, checked against declared and actual sizes.
- Path traversal, absolute paths, backslashes and control characters rejected, including JSZip's silently resolved `..` entries.
- Duplicate and case-conflicting paths rejected; macOS archive noise ignored.
- Manifest, document, block and expression validation; unknown required features refused with a clear message.
- Interactive SVGs sanitised (scripts, `foreignObject`, event handlers, animation elements and external references removed); bindings cannot set `href`, `src`, `style` or event attributes.
- Expressions evaluated by Curie's own interpreter with no access to JavaScript globals or prototypes.
- AI output rendered as Markdown only; generated lessons validated before saving.

### 12.2 Remaining work

- Content Security Policy for the web build (the native apps already set one).
- Signing and integrity checks for lessons downloaded from sources.
- Keychain storage for API keys on desktop and Android.
- A security review of the HTTP plugin allow-list once a curated list of AI endpoints is acceptable.

---

## 13. Accessibility, Responsiveness, and Performance

### 13.1 Accessibility

- Semantic HTML, labelled controls, keyboard access and visible focus everywhere, including the editor and the assistant.
- Meaningful alt text for informative images; colour is never the only signal for correctness or warnings.
- Reduced-motion and sound settings; readable contrast in both themes.
- Streaming chat output is announced politely; tool activity is shown as text.

### 13.2 Responsive behaviour

- Layouts adapt from 320 px phones to wide desktops (see 5.1 and 5.7).
- Charts, media, code and tables scale or scroll within their containers.
- Bottom sheets, action sheets and a thumb-reachable editor bar on phones; safe areas respected.

### 13.3 Performance

- Package work in a Web Worker; chunked native file reads with progress.
- Lazy-loaded pages and heavy features (editor, renderer, PDF reader, AI providers).
- Memoised Markdown rendering; streamed AI text batched per frame.
- Object URLs revoked; animation and package data parsed once.

---

## 14. Functional Requirements

| ID | Requirement | Status |
|---|---|---|
| FR-01 | Open, validate and render `.curie` lessons with local assets | Done |
| FR-02 | Light and dark themes; no lesson-level theme overrides | Done |
| FR-03 | Export lessons without losing assets | Done |
| FR-04 | Block editor: add, reorder, nest, edit, preview, undo, autosave | Done |
| FR-05 | Lesson variables, formulas, live values, plots, interactive SVG, conditional blocks | Done |
| FR-06 | Persistent library with reading progress and completion | Done |
| FR-07 | Explore lessons from GitHub sources, download and update | Done |
| FR-08 | Lesson cover images | Done |
| FR-09 | Desktop (Linux, Windows) and Android apps | Done |
| FR-10 | Responsive Import with progress for large lessons | Done |
| FR-11 | Notes: import PDF, text, Markdown, photos and pasted text; local search | Done |
| FR-12 | AI assistant with Claude, OpenAI-compatible endpoints and Ollama (local or LAN) | Done |
| FR-13 | Answers grounded in notes with citations | Done |
| FR-14 | Generate validated lessons and practice quizzes | Done |
| FR-15 | Track quiz attempts, accuracy, streak and questions to review | Done |
| FR-16 | Personal study guidance from progress | Done |
| FR-17 | Clear study data | Done |
| FR-18 | Spaced repetition and mastery tracking | Planned |
| FR-19 | Semantic (embedding) search and note collections | Planned |
| FR-20 | OCR for scanned PDFs; Word and slide import | Planned |
| FR-21 | AI-assisted editing inside the editor (rewrite, add quiz for this section) | Planned |
| FR-22 | Opt-in sync and backup | Future decision |
| FR-23 | macOS and iOS builds | Future decision |

---

## 15. Non-Functional Requirements

- **Privacy:** local-first storage; AI requests only to the provider the student configures; clear statements of what is sent; no analytics or tracking.
- **Security:** all external input untrusted (see 12); no execution of lesson or model-supplied code.
- **Reliability:** invalid lessons, notes or model output never crash the app; every failure has a readable message.
- **Offline:** lessons, notes, search and progress work offline; the assistant needs its provider (Ollama on the local network works without internet).
- **Performance:** interactions stay responsive on mid-range phones; long tasks show progress.
- **Accessibility:** WCAG-aligned semantics, focus, contrast and motion.
- **Maintainability:** typed modules, schemas, provider adapters behind one interface, documented extension points.
- **Portability:** `.curie` packages are self-contained and versioned.

---

## 16. Testing and Quality Assurance

### 16.1 Unit tests (Vitest)

Package format (loading, normalisation, limits, unsafe paths, export round trips, covers), expressions and lesson logic, editor tree operations, lesson sources, chunking and BM25 search, progress records and summaries, the agent loop (tool validation, malformed-JSON retry, refused or truncated turns, dangling tool calls), lesson generation and validation, and every provider adapter: message mapping, stream accumulation, `<think>` splitting, Claude fallback handling, and the Claude adapter end to end through the Anthropic SDK against a stubbed stream (checking the request it sends and the reply it parses).

### 16.2 Component tests (Testing Library, jsdom)

The block renderer with lesson variables (placeholders, conditional blocks, slider input) and quiz feedback.

### 16.3 Browser tests (Playwright, desktop and phone viewports)

Creating a lesson, the phone editor's tool bar and sheets, live variables in an imported lesson, quiz results on the Progress tab, adding and searching notes, an Ollama conversation that searches notes and creates a lesson that then opens, Claude streaming with its reasoning summary, the setup prompt when no model is configured, and loading Ollama models and testing the connection. AI providers are mocked at the network layer, so the tests need no keys or network and are deterministic.

### 16.4 Continuous integration

Every push runs type checking, unit and component tests, the production build and the browser tests, and checks that the Tauri app compiles.

### 16.5 Release checklist

Type check, all test suites, production build, Tauri builds for each target, signed Android APK verified with `apksigner`, a manual pass on a real phone (import, editor, assistant with a real provider), and updated changelog and privacy notes.

---

## 17. Roadmap

### Done (0.1–0.3)

Reliable package format and renderer; block editor; persistent library and progress; Tauri desktop and Android apps; lesson sources; cover images; variables and live logic; responsive import; new design system and logo; phone-first editor; notes with local search; the AI study assistant with three provider types; progress tracking and guidance; automated unit, component and browser tests.

### Next (0.4): Learning loop

- Spaced repetition queue built from flashcards and missed questions, with a daily review.
- Mastery per note collection and topic; guidance that uses it.
- AI actions in the editor: draft a section, add quick checks for a section, rewrite for a reading level.
- Show the cited passage when tapping a citation.

### Later

- Embedding-based semantic search (local models where possible), OCR, Word and slide import.
- Keychain storage for keys; signed lesson sources.
- Opt-in sync and backup; classroom sharing of lesson sources.
- macOS and iOS builds.

Each feature needs a written data model, privacy notes, migration plan and automated tests before release.

---

## 18. Acceptance Criteria for Release 0.3

- [x] Type check, unit, component and browser tests pass; production build succeeds.
- [x] Lessons import, render, edit, export and re-import without losing assets.
- [x] The phone editor works with the bottom tool bar and sheets.
- [x] Notes can be added from PDF, text, Markdown, pasted text and (with AI) photos, and searched offline.
- [x] The assistant works with Claude, an OpenAI-compatible endpoint and Ollama, answers from notes with citations, creates valid lessons and gives progress guidance.
- [x] Quiz attempts and study days are recorded and shown on the Progress tab.
- [x] Keys stay on the device and are never exported; the app explains what the assistant sends.
- [ ] Verified on a real Android phone and a Windows PC with real providers (manual).

---

## 19. Known Limitations and Open Decisions

- Notes search is keyword-based (BM25); synonyms and paraphrases may be missed until semantic search lands.
- Scanned PDFs need page photos for AI transcription; Word documents aren't read.
- Small local models may not support tool calling or may produce weaker lessons; tools can be turned off, with lesson drafts saved from the chat instead.
- API keys are stored in the app's private data, not the OS keychain.
- Progress and notes are per device; there is no sync.
- Remote media and Explore need a network connection.
- Lottie support is for JSON animation data, not `.lottie` files.

Open decisions:
1. Should progress and notes be exportable, and in which format?
2. Should Curie offer a curated list of AI endpoints in place of an open allow-list?
3. Which spaced-repetition algorithm (SM-2, FSRS) and how should it interact with lesson quizzes?
4. Should generated lessons record which notes they were built from?

---

## 20. Glossary

- **Block:** a single typed unit of lesson content or interaction.
- **Lesson document:** the ordered, nested blocks in `document.json`.
- **Manifest:** package metadata and compatibility information in `manifest.json`.
- **Asset:** a media file bundled with a lesson, inside `assets/`.
- **Required feature:** a capability a client must support to render a lesson correctly.
- **Lesson source:** a GitHub repository whose `.curie` files appear in Explore.
- **Note:** a student's own study material, stored as text and passages.
- **Passage:** a chunk of a note used for search and citation.
- **BM25:** the keyword ranking function used for note search.
- **Provider:** the AI service or local server the assistant uses (Claude, an OpenAI-compatible endpoint, or Ollama).
- **Tool:** an action the assistant can take inside Curie, such as searching notes or creating a lesson.
- **First-try accuracy:** the share of quiz questions answered correctly on the first attempt.

---

## 21. Summary

Curie is a local-first learning app built around a portable, versioned `.curie` format: lessons with rich, safe interactivity, an editor that works on phones, and native apps for desktop and Android. Release 0.3 adds a study loop around the student's own material: notes searched on the device, an AI assistant that runs on the provider the student chooses (Claude, OpenAI-compatible services or a local Ollama), lessons and quizzes generated as validated content, and progress tracking that turns into specific guidance. The next priority is closing the learning loop with spaced repetition and mastery, while keeping every feature private by default and covered by automated tests.
