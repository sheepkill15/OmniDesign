# OmniDesign Next Steps

This is a working plan, not a finalized product specification. The project owner is developing the details across separate conversations. Future agents should use this document to preserve continuity, avoid prematurely expanding implementation, and update it as decisions are finalized.

## Immediate Objective

Use the completed walking skeleton to expand the implemented vertical slice toward the full Phase 1 acceptance criteria without weakening its tested persistence and preview isolation.

The first complete user journey should be:

```text
Launch OmniDesign
        |
        v
Create a standalone design or open an existing project
        |
        v
Choose and configure an AI provider
        |
        v
Describe the desired design
        |
        v
Receive a streamed response
        |
        v
Compile and preview the generated design
        |
        v
Request a change
        |
        v
Preserve both revisions in history
        |
        v
Close and reopen the thread
        |
        v
Export the design
```

## Recommended Sequence

### 1. Review and Ratify the Phase 1 Product Specification

An initial specification is now recorded in `docs/PHASE_1_SPEC.md`. Review it with the project owner and keep it aligned as implementation discoveries resolve remaining foundation decisions.

Define:

- Primary screens and navigation.
- The conversation and generation flow.
- Standalone-design and existing-project entry points.
- Project folder selection and permission behavior.
- Relationships between projects, designs, pages, threads, messages, and revisions.
- Provider selection and configuration UX.
- Loading, streaming, cancellation, retry, and recovery behavior.
- Empty, error, offline, and partially completed states.
- History restoration behavior.
- Preview behavior and viewport controls.
- Export behavior and available export modes.
- Phase 1 acceptance criteria.

The installed-subscription pilot now reuses the sign-in state of local Codex and Claude Code CLIs without storing credentials. Full provider configuration and API-key behavior remain deferred.

### 2. Establish OmniDesign's Visual Language

The accepted and ratified baseline is now recorded in `DESIGN_SYSTEM.md`. It defines the native-desktop character, React Aria Components as the headless interaction foundation, custom control requirement, no-`<select>` rule, no-gradient rule, fluid low-card composition, restricted blur and elevation, supplied brand palette, dark-first and user-selectable light themes, Oak Sans v2.0 as the bundled interface family, spacious and calm density, icon direction, accessibility baseline, standard Phase 1 window frame, and Phase 1 composition guidance.

Select a monospace companion, pin and integrate Oak Sans from its official repository with the required license notice, and convert the baseline into exact semantic and component tokens before UI implementation spreads across the application.

Cover:

- Application shell and layout.
- Typography and type scale.
- Color and semantic color roles.
- Spacing and sizing scales.
- Borders, radii, elevation, and surfaces.
- Controls and reusable components.
- Conversation presentation.
- Design preview framing and viewport controls.
- History and navigation presentation.
- Loading, progress, empty, error, and success feedback.
- Motion and reduced-motion behavior.
- Keyboard navigation, focus, contrast, and accessibility expectations.
- Responsive and smaller-window behavior.

The remaining design work is monospace selection, Oak Sans metric validation, exact dark and light semantic color mappings, final token scales, and representative component and screen specifications. `DESIGN_SYSTEM.md` records proportional starting ranges for spacing and sizing; these are ergonomic ranges to prototype rather than final tokens.

The product must demonstrate the level of UI and UX quality expected from a design tool.

### 3. Resolve Remaining Foundation Decisions

Before full implementation, decide and record:

- Electron packaging and update tooling.
- Application state-management approach.
- SQLite library and migration strategy.
- Runtime schema-validation library.
- Logging, diagnostics, and error boundaries.
- Test runners and responsibilities for each test layer.
- Continuous-integration targets for Windows, macOS, and Linux.
- Supported operating-system versions and architectures.
- Development, preview, and production Content Security Policies.

Use current official documentation when these choices are made.

### 4. Build a Walking Skeleton

After the Phase 1 flow and initial visual language are sufficiently defined, scaffold Electron, React, TypeScript, and Vite and implement one end-to-end flow using a mock provider.

The walking skeleton should:

- Open the desktop application.
- Create a local project and thread.
- Accept a prompt.
- Stream a fixed or simulated provider response.
- Receive a representative generated HTML design.
- Compile its Tailwind CSS.
- Render it inside the isolated preview boundary.
- Capture browser and compilation errors.
- Save the thread and immutable design revision locally.
- Reopen the saved thread and revision.
- Export a working offline design.

This slice must test the difficult architectural boundaries rather than presenting a broad but disconnected UI mockup.

Implementation is now underway on `feature/phase-1-core`. The current slice exercises real renderer-to-main IPC and includes:

- Standalone design creation through a deterministic development provider.
- Simulated generation-stage activity.
- Tailwind 4 compilation with complete candidate extraction.
- Blocking validation for malformed documents, scripts, inline handlers, and external runtime resources.
- SQLite persistence with numbered migration state, foreign keys, and WAL journaling.
- Immutable HTML revision snapshots in OmniDesign-managed application storage.
- A session-isolated `WebContentsView` using `omnidesign-preview://`, no preload, sandboxing, denied permissions, denied navigation, blocked network requests, and a restrictive preview CSP.
- Conversational follow-up generation, revision selection, and non-destructive restoration.
- Draft persistence, restart recovery, and selected-revision offline ZIP export.
- Automated coverage for persistence/recovery, restoration, compilation/validation, preview policy, export contents, and critical React interactions.

The walking skeleton boundaries are complete. Browser-console, runtime, and preview-load diagnostics are captured, persisted with their revision metadata, and surfaced through the trusted UI. The workspace's keyboard-operable divider persists independently per design, and the isolated preview generates aspect-ratio-preserving managed thumbnails for revisions after they load. Home uses the active revision thumbnail, while history exposes revision-specific thumbnails. Rejected generated candidates are stored outside completed history with their diagnostics and remain inspectable without replacing the prior valid revision. Playwright drives the built Electron application through creation, preview, offline export, close, relaunch, and recovery using isolated test data. The current development provider is not a substitute for connecting the real Codex and Claude adapters to structured design generation.

### 5. Complete the Provider Integration

The narrow installed-subscription pilot is implemented behind a provider-neutral adapter gateway. The accepted next execution model is repo-native agent work: OmniDesign initializes a self-contained Git repository and `index.html` for each design, starts the provider harness in that repository, and supplies a linked original project only as an explicit read-only reference. Git determines changes and revisions; the agent neither inventories changed files nor chooses an entry point. Continue by:

- Preserving the provider-neutral contracts described in `ARCHITECTURE.md` and keeping provider-specific concepts in adapters.
- Preserve the mock provider for automated tests and local development.
- Add Codex and Claude contract and integration tests appropriate to their supported capabilities.
- Add the deferred cancellation, continuation, configuration, and API-key behavior when its Phase 1 contract is defined.
- Implement the managed design-repository lifecycle and provider-harness working-directory contract.
- Define and validate the remaining JSON completion-payload schema with the product owner. `response` is required for the agent's conversational reply and may be returned without a design change. Keep Git state, validation and diagnostics harness-owned, and usage adapter-owned; no agent field may inventory changed files or choose an entry point.

### 6. Run the Generation-Framework Benchmark

Use the working preview, validation, and export pipeline to compare:

1. HTML, Tailwind CSS, and Alpine.js.
2. React-style components and Tailwind CSS, potentially using Preact compatibility for the exported runtime.
3. HTML, Tailwind CSS, and vanilla JavaScript.
4. HTML, ordinary CSS, and vanilla JavaScript as a control.

Use the benchmark definition and metrics in `ARCHITECTURE.md`. Do not promote Tailwind and Alpine from provisional to accepted until results support the choice.

## First Implementation Milestone

The first milestone is complete only when a user can perform this local flow end to end:

1. Start OmniDesign.
2. Create a standalone design session.
3. Enter a prompt.
4. Receive a simulated streamed response.
5. See a generated Tailwind-based design in a securely isolated preview.
6. Request one change and see a new revision.
7. Move between the two revisions.
8. Restart the application and recover the thread and selected revision.
9. Export the selected revision to an offline HTML artifact.

The milestone also requires automated coverage of its domain behavior, IPC contracts, persistence, preview isolation, export behavior, and critical desktop journey.

## Current Handoff State

- Phase 1 implementation has begun on `feature/phase-1-core`. A working development-provider slice can create, iterate, preview, persist, reopen, select/restore history, and export a standalone design.
- Runtime verification on Windows created two revisions in Electron, rendered the generated result through the isolated `WebContentsView`, restarted the application, and recovered both revisions from local storage.
- The walking skeleton is complete: it captures and persists preview console, runtime, and load diagnostics; its per-design split-divider state survives restart and is keyboard operable; aspect-ratio-preserving revision thumbnails are captured through the isolated preview and persisted as managed artifacts; and invalid candidates persist outside completed history without replacing the prior valid revision. The built Electron application has automated coverage for creation, preview framing, offline export, close, relaunch, and recovery with isolated test storage.
- The product owner accepted the Quiet Studio home direction. The consolidated implementation and its future-screen rules are documented in `docs/HOME_DESIGN_BASELINE.md` and `DESIGN_SYSTEM.md`.
- The trusted application now exposes a Settings appearance screen. Its dark and light themes use the existing semantic tokens, persist through the validated Electron IPC boundary and SQLite migration, and never alter the isolated generated-design preview.
- Providers now has an availability surface backed by the provider-neutral discovery gateway. It refreshes locally installed Codex and Claude Code availability, sign-in diagnostics, and adapter-reported model counts without exposing credentials or subprocess access to the renderer. Persisted provider configurations and per-prompt provider/model selection remain to be connected to design generation.
- Generation now enters a persisted job queue. The initial coordinator runs up to two designs concurrently while maintaining a sequential queue per design, retains job state in SQLite, and marks queued or running work interrupted on application shutdown or restart. The workspace exposes Stop for active or queued work and Retry for stopped attempts; cancellation avoids creating an invalid candidate and retries create a fresh queued attempt while retaining prior diagnostics. Stop now aborts the active Codex or Claude provider invocation through the provider-neutral adapter contract, rather than waiting for its eventual response. Queued mock generations make up to three automatic validation self-repair attempts before retaining an invalid candidate; provider/transport retries, Continue, and broader queue management remain the next additions to this subsystem.
- The persistent Generations navigation entry now shows the active-job count and opens a cross-design queue view. It identifies queued and running prompts, lets the user open the associated design, and provides Stop without requiring the user to return to that design first. Per-job elapsed time, provider/model details, detailed activity, and queue-paused state remain to be surfaced.
- A failed or cancelled predecessor now persists a paused state for its design queue. Later prompts remain queued, including after restart, until the user retries the stopped attempt; the retry resumes the queue and is ordered ahead of its paused successors.
- Agent-backed designs now receive a managed Git repository with a prepared `index.html`. Codex and Claude harness calls run in that workspace, return a strict conversational `response` payload, and leave Git plus independent validation to determine whether a revision is created. Git commit identities are retained with completed revisions; response-only turns persist without manufacturing a revision.
- Provider, model, and optional effort selection now persists on queued work and survives Retry. Both the home and design-workspace composers expose one layered generation-settings menu for the development provider plus authenticated discovered provider models; effort uses the adapter-advertised levels and is omitted when Provider default is selected. The home project control now offers standalone creation or a native local-folder choice, which creates a linked project without writing to its source folder.
- Projects are now first-class in the trusted UI. The sidebar and home "Continue designing" list persisted projects (ordered by recent activity) rather than individual designs; sidebar rows expand to reveal and open their designs, and opening a project applies the specified direct-open-versus-grid behavior (empty or multi-design projects open a project page with a preselected new-design composer and a design grid, while a single-design project opens straight into its workspace). Linking a local folder deduplicates onto the existing project instead of registering a duplicate, a linked project is named after its source folder, and a project may hold multiple designs. The home composer can also add a design to an existing linked project; standalone projects stay the private container of their single design and are not offered as reuse targets. Project/design trash and removal, linked-folder availability recovery, and Git clone remain to be built on this model.
- The design workspace now supports all Phase 1 layout modes, chosen from a header layout control and persisted per design alongside the divider position: split (docked preview), conversation-only (preview hidden), preview-only (conversation hidden), and popped-out. Pop-out moves the single shared isolated preview `WebContentsView` into a dedicated top-level window; docking, switching layout, closing that window, or leaving the workspace returns the preview to the docked layout. The e2e suite covers popping the preview into its own window and docking it back. Remaining layout item: exact popped-out window sizing restoration is intentionally not required by the spec.
- Dropdown controls are shared components in `src/renderer/components/`. There are two, chosen by context:
  All four dropdowns (layout, revision-history, generation-settings, project-selector) use one shared component: `src/renderer/components/DropdownButton.tsx` — a plain-DOM popover with a rotating caret, CSS `:hover` rows, and capture-phase outside/Escape dismissal. Its `onOpenChange` drives the preview freeze.
  This is a **documented exception to the React Aria mandate in `DESIGN_SYSTEM.md`**. React Aria's overlay cannot satisfy this product's needs over the isolated preview's native layer: a *modal* RA popover dismisses on outside click but inerts the background (other controls lose hover, the window reads as unfocused), while a *non-modal* RA popover keeps the background live but only dismisses when focus leaves it (a click on a non-focusable area leaves it stuck). We need both "background stays interactive" and "any outside click dismisses," which only the plain-DOM capture-phase handler provides. If a future dropdown needs rich keyboard semantics (typeahead, roving focus), add them to `DropdownButton` directly rather than reintroducing an RA overlay.
- The isolated preview is a native layer composited above the DOM, so trusted-UI overlays that sit over a docked preview (the header layout menu and revision-history dropdown) would otherwise be hidden behind it. The fix keeps the accepted `WebContentsView` isolation (dedicated session partition, sandboxed process, no preload) and uses a freeze-frame: while such an overlay is open, the main process `capturePage()`s the docked preview, the renderer shows that still image on the preview surface, and only then is the native layer hidden via `setVisible(false)` — so the overlay paints over a frozen frame with no visible gap. Closing the overlay restores the live layer. Only a docked preview is affected (detached/popped-out views are untouched). An in-renderer `<iframe>`/`<webview>` was considered and rejected: a plain iframe shares the trusted renderer's session and lives inside it (an isolation downgrade the spec forbids without an explicit ARCHITECTURE change). If future overlays sit over the preview, drive them through the same `overlayCoversPreview` signal in `DesignWorkspace`.
- Full provider configuration is deferred to Phase 3 by product-owner decision (2026-07-21): API-key configuration, the provider setup UI, multiple configurations per provider, and configuration testing. Phase 1 continues to reach Codex and Claude through the installed-CLI discovery pilot. `AGENTS.md`, `docs/PHASE_1_SPEC.md`, and this file record the deferral.
- The temporary concept switcher and rejected Visual Gallery and Project Workbench implementations have been removed. Representative project/design data remains non-functional placeholder content until persistence is connected.
- The project charter and roadmap are recorded in `AGENTS.md`.
- Accepted and proposed technical direction is recorded in `ARCHITECTURE.md`.
- Electron, React, TypeScript, Vite, local-first persistence, and isolated previews are accepted directions.
- React Aria Components is the accepted headless behavior and accessibility foundation for the trusted UI; OmniDesign retains full ownership of styling and product components.
- Tailwind CSS with Alpine.js is the provisional generated-design stack.
- The generated-design stack requires a benchmark before final acceptance.
- A narrow Codex and Claude Code installed-subscription pilot is implemented with live model and effort discovery, normalized streamed activity, and a provider-neutral adapter gateway; broader Phase 1 provider capabilities remain deferred.
- The initial Phase 1 product specification is recorded in `docs/PHASE_1_SPEC.md` and awaits review and ratification.
- The trusted-UI design language in `DESIGN_SYSTEM.md` is ratified: dark-first with a selectable light theme, extensible semantic colors, Oak Sans v2.0 as the bundled interface family, spacious and calm density, and the standard platform title bar in Phase 1.
- Basic multiple-design support is now included in Phase 1; multiple conversations and visible branching remain deferred.
- Phase 1 is qualified on Windows first while preserving the accepted cross-platform architecture.
- Persistent AI-extracted project profiles are deferred; Phase 1 uses read-only project context on demand during generation.
- The primary Phase 1 flow, provider dispatch pilot, and trusted visual language are sufficiently defined for implementation. Continue in vertical slices and keep the full `docs/PHASE_1_SPEC.md` acceptance matrix distinct from walking-skeleton progress.
