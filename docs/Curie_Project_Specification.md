# Curie — Project Specification

**Document type:** Product and technical specification  
**Version:** 1.0  
**Status:** Baseline specification for the current prototype and planned product  
**Last updated:** 26 October 2026

---

## 1. Project Overview

Curie is a cross-platform learning application for creating, viewing, and sharing rich interactive lessons. Lessons are assembled from portable, structured content blocks—such as Markdown, mathematical notation, images, videos, graphs, animations, quizzes, sliders, reveals, and flashcards—rather than being authored as arbitrary executable code.

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

### 1.2 Non-goals for the initial release

- A full learning-management system with classrooms, grading administration, and institution management.
- A real-time collaborative lesson editor.
- Arbitrary JavaScript or React execution from lesson files.
- A general-purpose 3D simulation engine or advanced physics sandbox.
- Lesson-defined themes or arbitrary CSS.
- A requirement that every lesson work offline if it deliberately references remote media.
- A complete authoring studio in the first prototype milestone.

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

### 2.2 Lesson creators and educators

Creators should eventually be able to:
- Assemble a lesson from supported content blocks.
- Include images, videos, animations, and other local assets.
- Preview the lesson in the same renderer used by learners.
- Validate the lesson package before sharing.
- Export a single `.curie` file that contains its manifest, document, and assets.

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

---

## 4. Platform and Technology

### 4.1 Initial technology stack

| Layer | Technology | Responsibility |
|---|---|---|
| UI framework | React | Component-based interface and rendering |
| Language | TypeScript | Static typing and maintainable contracts |
| Build tooling | Vite | Development server and production frontend build |
| Styling | Tailwind CSS v4 | Utility-first styling |
| UI component system | daisyUI v5 | Base UI patterns and light/dark themes |
| Markdown | `react-markdown` and `remark-gfm` | Markdown and GitHub-flavored Markdown |
| Mathematical notation | `remark-math`, `rehype-katex`, KaTeX | Inline and display equations |
| Charts | Recharts | Line, area, and bar graphs |
| Package archive | JSZip | Read and write ZIP-based `.curie` packages |
| Validation | Zod | Runtime validation of manifests and block data |
| Animation | `lottie-react` | Rendering JSON-format Lottie animations |
| Desktop direction | Tauri 2 | Planned native desktop shell |

Dependency versions must be kept consistent with the project's package manifest and upgraded deliberately. The stack above describes the intended/current prototype architecture, not a claim that every deployment target has already been validated.

### 4.2 Delivery strategy

1. **Web prototype first:** establish the lesson format, renderer, responsive shell, and import/export behavior.
2. **Desktop packaging:** integrate Tauri 2 after the web app's workflows are stable.
3. **Progressive offline support:** make bundled lesson assets work offline and evaluate service-worker caching for the web client.
4. **Future mobile clients:** consider a mobile packaging strategy only after the content format and component contracts stabilize.

### 4.3 Supported environments

The web client should work in current evergreen browsers on desktop and mobile-sized viewports. Desktop builds should target operating systems supported by Tauri 2 once the native wrapper is configured and tested.

The prototype's Tauri scaffolding does not, by itself, mean signed installers or production-ready desktop releases are complete.

---

## 5. Application Experience

### 5.1 Main application shell

The application shell should provide:
- Curie branding and clear application navigation.
- A lesson viewing area with readable line lengths and spacing.
- A lesson import action.
- An export action for the current lesson when export is available.
- A light/dark theme toggle.
- Clear loading, empty, success, and error states.
- Responsive layout behavior for narrow and wide screens.

The interface should feel focused and uncluttered. The product may take general inspiration from modern interactive learning platforms, but must use its own layout, visual identity, and component details.

### 5.2 Theme behavior

- The app provides light and dark modes.
- The selected mode is persisted locally when possible.
- Lessons inherit the active app theme.
- The `.curie` manifest and document schema do not accept lesson-level theme overrides.
- Components must use theme-aware design tokens rather than hard-coded colors wherever practical.

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

Optional metadata may include a description and author. The schema must not include a theme override.

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

## 8. Architecture

### 8.1 High-level modules

```text
Curie Application
├── App Shell
│   ├── Navigation and lesson header
│   ├── Import/export controls
│   └── Theme control
├── Lesson Viewer
│   ├── Document renderer
│   └── Block registry
│       ├── Markdown renderer
│       ├── Image and video renderers
│       ├── Graph and Lottie renderers
│       └── Interactive renderers
├── Curie Package Layer
│   ├── ZIP loading and writing
│   ├── Manifest validation
│   ├── Document/block validation
│   ├── Asset resolution
│   └── Package safety checks
└── Shared Foundation
    ├── Types and schemas
    ├── Theme tokens
    ├── Error handling
    └── Tests and fixtures
```

### 8.2 Package layer responsibilities

The package module should:
1. Read a ZIP-based `.curie` file.
2. Enforce archive entry and size limits.
3. Normalize supported common archive-root layouts.
4. Reject unsafe paths, including traversal attempts.
5. Locate and parse the manifest and document.
6. Validate their schemas and versions.
7. Verify local asset references.
8. Return a validated lesson model and access to its assets.
9. Export a valid package without losing existing assets.

The package module should remain separate from React components so it can be unit-tested independently.

### 8.3 Renderer responsibilities

The renderer should:
- Map a validated block's `type` to its React component.
- Pass only validated properties to that component.
- Render nested sections recursively.
- Resolve local asset paths through the package asset layer.
- Provide component-level fallbacks for invalid or unavailable media.
- Avoid dynamic code execution and arbitrary component lookup from lesson content.

### 8.4 State management

The current prototype uses component-local UI state for simple interactions. Future shared state should be introduced only with an explicit state model and security boundaries. A future expression or binding engine must be declarative, limited, deterministic, and must not evaluate arbitrary JavaScript from lessons.

---

## 9. Package Validation and Security

Lesson packages are external input and must be treated as untrusted.

### 9.1 Current prototype protections

The prototype includes basic checks such as:
- Package size limit.
- Maximum file-count limit.
- Path traversal checks.
- Manifest and document schema validation.
- Local asset existence checks.
- Extension-based MIME handling for asset blobs.

These protections are a starting point, not a complete security boundary.

### 9.2 Required hardening before production

- Validate compressed and uncompressed sizes to reduce ZIP-bomb risk.
- Limit individual file size, total extracted size, nesting depth, and parsing work.
- Reject duplicate normalized paths and ambiguous archive entries.
- Normalize paths consistently across platforms.
- Ensure no asset can resolve outside the package.
- Sanitize or safely render SVG and other potentially active content.
- Keep raw HTML disabled in Markdown unless a vetted sanitizer is added.
- Restrict or clearly warn about remote media and tracking-capable URLs.
- Avoid unsafe URL schemes such as `javascript:`.
- Apply timeouts and graceful failure to media loading.
- Test malformed JSON, corrupt ZIPs, invalid encodings, duplicate files, and adversarial path names.
- Avoid claiming that package validation makes all untrusted files safe until a security review has been completed.

---

## 10. Accessibility, Responsiveness, and Performance

### 10.1 Accessibility

- Use semantic HTML for headings, sections, buttons, forms, and media.
- Provide meaningful alt text for informative images.
- Ensure keyboard access for interactive components.
- Use visible focus indicators.
- Provide labels for slider and quiz controls.
- Do not use color as the sole signal for correctness or warnings.
- Respect reduced-motion preferences for animation when possible.
- Ensure readable contrast in both themes.

### 10.2 Responsive behavior

- The lesson should be readable on small mobile screens, tablets, and desktop displays.
- Charts and media should scale within their container.
- Code blocks and tables should remain usable on narrow screens.
- Navigation may collapse on narrow viewports without changing lesson content or order.

### 10.3 Performance

- Avoid loading large assets before they are needed where practical.
- Revoke generated object URLs when no longer required.
- Avoid repeated parsing of the same package and animation data.
- Keep block renderers focused and prevent unnecessary rerenders.
- Handle large lessons and media files without freezing the interface.
- Establish measurable performance targets once representative lesson sizes and target devices are agreed.

---

## 11. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | Open and render a valid `.curie` lesson | Must |
| FR-02 | Validate manifest and document structure | Must |
| FR-03 | Render every component listed in Section 7 | Must for current prototype scope |
| FR-04 | Resolve local image, video, and Lottie assets | Must |
| FR-05 | Display a useful error for missing manifest/document/assets | Must |
| FR-06 | Support light and dark app themes | Must |
| FR-07 | Prevent lesson-level theme overrides | Must |
| FR-08 | Export a lesson while preserving its assets | Must |
| FR-09 | Support remote image/video sources where permitted | Should |
| FR-10 | Support common ZIP wrappers and `./` prefixes safely | Should |
| FR-11 | Provide authoring UI for adding/reordering/editing blocks | Future |
| FR-12 | Persist learner progress and interaction results | Future |
| FR-13 | Add declarative cross-component bindings | Future, requires separate design |
| FR-14 | Package and distribute a Tauri desktop application | Planned |
| FR-15 | Support mobile-specific packaging | Future evaluation |

---

## 12. Non-Functional Requirements

- **Maintainability:** use modular TypeScript modules, schemas, and focused components.
- **Reliability:** invalid lesson data should not crash the application.
- **Portability:** package assets should use relative paths and be self-contained where possible.
- **Compatibility:** package and document versions must be explicit.
- **Security:** treat all imported lessons as untrusted input.
- **Accessibility:** target WCAG-aligned interaction and contrast practices.
- **Performance:** keep common lesson interactions responsive on mid-range devices.
- **Extensibility:** adding a block type should require a documented, repeatable workflow.
- **Privacy:** avoid collecting learner data unless a feature explicitly requires it and its data handling is documented.

---

## 13. Testing and Quality Assurance

### 13.1 Unit tests

Test:
- Manifest and document schema validation.
- Every block schema and required property.
- Path normalization and traversal rejection.
- Asset path resolution and missing-asset detection.
- Package import/export round trips.
- ZIP wrapper normalization.
- Correct behavior for duplicate paths and malformed archives.

### 13.2 Component tests

Test:
- Every block type renders valid data.
- Missing and invalid media show a fallback.
- Quiz feedback and correct-answer handling work.
- Slider boundaries and step behavior are respected.
- Reveals open and close.
- Flashcards flip with keyboard and pointer input.
- Theme changes do not alter lesson data.
- Nested sections render their children in order.

### 13.3 Integration tests

Test end-to-end workflows:
1. Import a valid lesson.
2. Render text, equations, local image, local MP4, local Lottie JSON, graph, and interactive blocks.
3. Change app theme.
4. Export and re-import the lesson.
5. Confirm assets and content are preserved.
6. Import malformed packages and confirm useful errors appear.

### 13.4 Example and regression fixtures

Maintain fixture packages for:
- Minimal valid lesson.
- Full-feature lesson.
- Lesson with local video.
- Lesson with SVG and raster images.
- Lesson with Lottie JSON.
- Missing asset.
- Missing manifest/document.
- Extra enclosing directory.
- `./`-prefixed paths.
- Unsafe traversal paths.
- Unsupported required feature.
- Corrupt or oversized archive.

### 13.5 Build verification

Before a release, run and record the results of:
- Dependency installation.
- TypeScript checking.
- Production web build.
- Unit and integration tests.
- Tauri build for each supported target.

Do not label the project production-ready based only on static inspection or successful archive creation.

---

## 14. Roadmap

### Phase 1 — Reliable lesson format and renderer

- Stabilize manifest and document schemas.
- Validate all current block types.
- Fix and test local image/video/animation asset loading.
- Improve package import errors and root-path normalization.
- Add automated tests for package handling and rendering.
- Maintain a full-feature example lesson.

**Exit criteria:** a valid `.curie` package with local assets imports and renders; export/re-import preserves content and assets; malformed packages produce actionable errors.

### Phase 2 — Better learning interactions

- Improve keyboard accessibility and feedback.
- Add component-level error and loading states.
- Add a lesson progress indicator if supported by the navigation model.
- Decide how progress should be stored before implementing persistence.
- Define reduced-motion behavior for Lottie animations.

**Exit criteria:** interactions behave consistently, have accessible controls, and do not imply persistence that is not implemented.

### Phase 3 — Lesson authoring

- Design a block-based authoring interface.
- Add, remove, reorder, and edit blocks.
- Upload, replace, and remove assets.
- Preview lessons using the production renderer.
- Validate and export the lesson before sharing.

**Exit criteria:** a user can create and export a lesson without manually editing JSON or ZIP archives.

### Phase 4 — Desktop packaging

- Complete Tauri 2 configuration.
- Test import/export through native file dialogs.
- Verify file access, security boundaries, and packaging.
- Produce installers for selected target operating systems.

**Exit criteria:** reproducible builds and successful import/export on each declared supported platform.

### Phase 5 — Progress and advanced learning features

- Define learner progress and persistence.
- Consider attempts, completion state, and bookmarks.
- Evaluate a safe declarative binding model for interactions.
- Add further components only when their schemas, accessibility, and tests are specified.

**Exit criteria:** each feature has a written data model, migration strategy, security review, and automated coverage.

---

## 15. Acceptance Criteria for the Current Prototype

The prototype is considered functionally ready for its next development stage when:

- [ ] The web app starts using the documented development command.
- [ ] TypeScript checking and the production build pass.
- [ ] A valid `.curie` file imports and renders.
- [ ] The manifest and document are validated before rendering.
- [ ] Local image, MP4 video, and Lottie JSON assets render from the archive.
- [ ] Graph, Markdown/math, quiz, slider, reveal, flashcard, callout, divider, and section blocks render.
- [ ] The light/dark theme toggle changes app appearance without requiring lesson changes.
- [ ] The importer handles a canonical ZIP and the explicitly supported wrapper layouts.
- [ ] Missing or invalid package files produce clear errors.
- [ ] Unsafe paths are rejected.
- [ ] Export and re-import preserve all package assets.
- [ ] Automated tests cover the package format and critical renderer paths.
- [ ] Known limitations are documented accurately.

---

## 16. Known Limitations and Open Decisions

The following are not considered complete unless separately implemented and verified:

- The current prototype does not yet provide a full lesson authoring studio.
- Interactive state is currently local/in-memory; learner progress is not a persistent feature.
- There is no general lesson-wide expression or binding engine.
- Remote media requires a network connection and may be unavailable or blocked.
- Lottie support is for JSON-format animation data, not automatically for `.lottie` binary files.
- The package security model needs further hardening before treating arbitrary downloaded lessons as safe.
- Tauri scaffolding/configuration must be validated with real platform builds.
- Offline caching, mobile packaging, analytics, accounts, synchronization, and cloud lesson libraries require separate product decisions.

Open decisions to document before implementing related features:
1. Should lesson progress be local-only, exportable, or account-synchronized?
2. Should authors be allowed to embed external URLs, and what warnings or restrictions should apply?
3. What is the policy for unsupported required features and older client versions?
4. What size limits should apply to a single asset and a complete lesson?
5. Which operating systems and browser versions are official release targets?
6. What authoring workflow is preferred: in-app block editor, Markdown/JSON source editing, or both?

---

## 17. Glossary

- **Block:** A single typed unit of lesson content or interaction.
- **Lesson document:** The ordered, nested collection of blocks in `document.json`.
- **Manifest:** Package metadata and compatibility information in `manifest.json`.
- **Asset:** A media file bundled with a lesson, usually inside `assets/`.
- **Renderer:** The React component responsible for displaying a particular block type.
- **Package format:** The structure and versioning rules used by `.curie` files.
- **Required feature:** A component or capability a client must support to render a lesson correctly.
- **Portable lesson:** A lesson whose structure and required local resources are packaged together without relying on machine-specific paths.

---

## 18. Summary

Curie is a web-first, component-driven learning application built around a portable, versioned `.curie` package format. Its initial focus is a reliable lesson viewer with rich but bounded components, local media support, light/dark themes controlled by the app, and safe package import/export.

The next priority is **correctness and testability**—especially asset loading, ZIP handling, schema validation, and import/export round trips—before expanding into a full authoring studio, persistent learner progress, or more advanced interactive systems.
