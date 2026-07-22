# Phase 1 Gap Audit

**Audited:** 2026-07-22  
**Authority:** `docs/PHASE_1_SPEC.md`  
**Status:** Phase 1 is not complete.

This audit distinguishes behavior demonstrated by current implementation and tests from behavior that is absent or only partially demonstrated. A passing unit or Electron journey is not evidence for a broader acceptance criterion unless that criterion is directly covered.

As of the verification snapshot below, the non-deferred functional audit is closed. The remaining functional blocker is the explicitly deferred external-root write boundary.

## Completed slices with direct evidence

- Standalone and linked project containers, multiple designs, history, isolated preview, thumbnails, offline ZIP export, layout restoration, and the mock-provider walking skeleton are implemented and covered by unit and Electron tests.
- Linked-project lifecycle now includes local-folder deduplication, availability warnings, reconnect or standalone conversion, Git clone import, recoverable trash, restoration, and permanent purge. Linked source folders are never deleted by OmniDesign.
- Draft attachment references are persisted without copying attachment content. Queued work snapshots those references and warns when they are missing or changed.
- Per-design sequential queues, cross-design concurrency, cancellation, queue pausing, transient provider retry, Retry, Continue, restart interruption, and close confirmation are implemented.
- Global diagnostics now aggregates retained preview warnings/errors, rejected candidates, and failed generation details, links each issue back to its design or originating revision, and exposes an issue count in persistent navigation.
- Trash supports confirmed individual permanent deletion and confirmed bulk emptying, keeps linked source folders explicitly out of scope, and presents purge failures inline instead of dropping the rejected operation.
- Cancelling the native active-generation removal warning now leaves the current project or design open; the renderer no longer reports a cancelled removal as completed navigation.
- Preview diagnostics exclude Electron's internal security-warning console banner for the intentionally documented Alpine-compatible CSP, preventing every healthy revision from appearing broken while retaining generated-page warnings and errors.
- Reopening or reloading a revision no longer stores the same preview diagnostic repeatedly; retained issue counts represent unique revision findings.
- Concurrent background activity is retained per design, and every activity event refreshes that design's persisted job state; navigating between active designs no longer displays another design's stage or enables a busy composer.
- Workspace actions now report actionable inline success or failure feedback; a rejected prompt submission restores its text and attachments instead of silently clearing the draft.
- Design titles and project display names are editable and persisted; renaming a linked project never renames its source folder, while standalone navigation stays synchronized with its design title.
- The shared agent contract and validation pipeline now enforce baseline document semantics through up to three real-provider repair attempts; exhausted non-blocking quality findings remain visible on the accepted revision instead of being silently lost.
- Live Windows acceptance on 2026-07-22 exercised authenticated Codex CLI 0.144.6 and Claude Code 2.1.215 through OmniDesign. Both produced valid revisions and offline ZIPs with responsive compact/wide layouts, named interactions, and no console errors; the shared quality contract corrected Claude's initially missing main landmark and the rebuilt case passed without repair.
- The trusted renderer now fits Electron's actual content viewport at the 900x600 minimum outer-window size without clipping or document overflow; package-equivalent coverage also verifies keyboard focus under forced colors and suppresses repeated motion when reduced motion is requested.
- The persisted system-notification preference now uses a semantic, keyboard-operable switch with custom dark/light and forced-colors styling; built-Electron coverage verifies keyboard activation and persistence across restart.
- The no-provider state now disables both initial and follow-up submission without clearing drafts, keeps project/history/export access available, and links directly to provider availability. The deterministic mock provider is advertised only in development or explicitly enabled package-equivalent tests, never assumed in a normal packaged launch.
- Multi-design project cards now expose separate, keyboard-named open and rename controls without nested interactive elements. Card renames update optimistically, roll back on failure, and no longer navigate into the design; background design refreshes likewise cannot steal the user's current screen.
- Completed provider progress now records the metadata each CLI actually reports: Codex shows per-turn input/output usage and the model context limit, while Claude shows turn count, input/output usage when present, and actual USD cost. Claude's full final response is no longer duplicated into its completion-detail row.
- Full generation history groups streamed provider, tool, validation, and saving activity into open-by-default collapsible sections; the persisted Concise preference keeps only queue and terminal outcomes visible.
- Real-provider creation now persists and opens the design immediately with an editable fallback title. The lightweight title request runs in the background, can inspect the explicitly supplied attachment paths through provider reference roots, refreshes the open workspace when ready, and cannot overwrite a title the user edited while it was running.
- An application-level renderer error boundary replaces blank-screen failures with a keyboard-accessible reload action, local-data reassurance, and collapsed technical diagnostics.
- Stopped work now distinguishes connection, sign-in, model, cancellation, interruption, and generic failure states with a concise next action. Raw provider diagnostics remain available in a collapsed technical section, and provider-related failures link back to availability.
- The design workspace now treats running and queued jobs separately: Stop always targets the provider request, every queued prompt shows its provider/model and Remove action, and a paused dependent queue no longer hides Continue/Retry behind a queued item or displays a false running spinner.
- Continue now resumes a stopped attempt before its already-queued dependent prompts and reuses the original conversation message instead of inserting a duplicate prompt.
- Continue persists and resumes the original Codex thread or Claude session when the provider exposes one, including across cancellation, failure, and application restart; Retry still starts a fresh provider session.
- Active-work elapsed time now advances live instead of remaining frozen at the instant the Generations view opened.
- A successfully completed later attempt now retires older failure recovery controls instead of resurrecting stale Continue and Retry actions.
- Restart recovery now interrupts only work that was actually running, preserves queued follow-ups in submission order, persists the queue as paused, and exposes an explicit Resume action when no failed predecessor needs Continue or Retry.
- Global generation controls now expose scoped busy labels and actionable inline failures, while provider discovery failures retain available development tooling and show the underlying diagnostic instead of collapsing silently to an unexplained empty state.
- Settings no longer claim persistence before writes finish: controls expose a saving state, failed writes roll back the optimistic value, and both load and save failures remain visible with their local diagnostic.
- Initial and background workspace refresh failures now preserve the last loaded shell state and expose a persistent sidebar diagnostic with Retry instead of failing silently or leaving unexplained empty navigation.
- Initial composer operations now retain the draft and report actionable local diagnostics when project-folder selection, clone-destination selection, attachment selection, saved generation defaults, or design creation fails.
- Project reads now fail in place instead of clearing the current screen, and project-page loading, reconnect, conversion, and removal failures expose scoped diagnostics with retry or dismissal controls.
- Sidebar project expansion distinguishes loading, failure, and genuine empty states with an inline retry; attachment-open and project-association folder-picker failures are likewise reported instead of rejecting silently.

## Remaining functional gaps

### 1. Enforceable read-only provider access — blocking security gap

Linked-project and attachment paths are passed to providers as explicit read-only instructions. A selected linked project is also supplied as a provider-visible reference root: Codex receives it in `runtimeWorkspaceRoots`, and Claude receives it through `--add-dir`. This enables real exploration, but the adapters have no verified external-root write-denial policy; the instructions are not an enforceable filesystem boundary. Before Phase 1 can be complete, each adapter must provide a verified mechanism that permits reads from explicitly selected external roots while denying writes there.

Required proof:

- Automated adapter/security tests show a provider can read an approved linked project or attachment.
- The same tests show create, modify, rename, and delete operations outside the managed design workspace are denied.
- The provider contract documents the granted roots and does not rely on prompt instructions as authorization.

## Recently closed functional gaps

### Project/design association workflow

Manual reassociation of an existing standalone design to a linked project now preserves its history and managed repository, then offers an optional normal generation to adapt the design language. A standalone prompt that names a linked project now receives a non-blocking association suggestion; the user can associate it and continue, associate then restart the active request with the linked context, or dismiss it. Detection is deliberately conservative name matching.

### Provider and generation-detail acceptance

The active-generations surface now shows the recorded stage, provider/model, elapsed time, cancellation, and the latest detailed progress/tool activity for each running job. Queued prompts can be removed before they start without pausing their design queue, and their unrun prompt message is removed with the queue item. Distinct streamed activity details are retained and a persisted Full/Concise setting controls their conversation presentation. Transport-contract coverage verifies standalone Codex read-only/streaming behavior and Claude plan-mode/cancellation behavior, and live installed-CLI interoperability has been exercised on Windows.

### Attachment completeness

Attachments can be selected for both initial and follow-up prompts, and their references are retained with queued generation work. Enforceable external read-only access remains the more important attachment requirement.

### Notifications and settings

The in-app generation badge updates, and cross-platform system notifications for completed or attention-needed generation can be disabled through a persisted preference.

## Remaining quality and acceptance coverage

The current automated suite does not yet prove all Phase 1 quality gates:

- development-provider exports are checked automatically in a fresh sandboxed Electron window at compact and wide sizes, including semantic names, a real disclosure interaction, and captured console output; live Codex and Claude exports have equivalent manual sampling recorded above;
- an Electron journey now verifies both themes across Home, Generations, Providers, Diagnostics, Trash, Settings, and the design workspace, including viewport fit and restart persistence; pixel-level regression coverage for every reusable control remains open;
- an Electron journey now covers declining close, confirming interruption, restart recovery, Continue, and Retry affordances; external-root security still needs targeted acceptance coverage.

## Verification snapshot

The 2026-07-22 polish baseline passes `pnpm typecheck`, `pnpm build`, all 163 unit and integration tests, and all 7 built-Electron journeys. This snapshot includes the initial composer, project navigation and recovery, attachment history, cross-platform notifications, restart recovery, both trusted-UI themes, minimum-window keyboard coverage, generated-design export behavior, and preview layout transitions.

## Implementation order

1. Keep the deferred external-root enforcement gap explicit in provider instructions and architecture until that boundary is resumed.
2. Add pixel-level reusable-control regression coverage when the visual baseline is ready to be frozen.
3. Resume the external-root security boundary and re-run every acceptance gate before declaring Phase 1 complete.
