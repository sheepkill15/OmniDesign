# Phase 1 Gap Audit

**Audited:** 2026-07-22  
**Authority:** `docs/PHASE_1_SPEC.md`  
**Status:** Phase 1 is not complete.

This audit distinguishes behavior demonstrated by current implementation and tests from behavior that is absent or only partially demonstrated. A passing unit or Electron journey is not evidence for a broader acceptance criterion unless that criterion is directly covered.

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

The active-generations surface now shows the recorded stage, provider/model, elapsed time, and cancellation. Queued prompts can be removed before they start without pausing their design queue, and their unrun prompt message is removed with the queue item. Distinct streamed activity details are retained and a persisted Full/Concise setting controls their conversation presentation. Mocked transport-contract coverage now verifies standalone Codex read-only/streaming behavior and Claude plan-mode/cancellation behavior; live installed-CLI interoperability remains a manual acceptance check.

### Attachment completeness

Attachments can be selected for both initial and follow-up prompts, and their references are retained with queued generation work. Enforceable external read-only access remains the more important attachment requirement.

### Notifications and settings

The in-app generation badge updates, and cross-platform system notifications for completed or attention-needed generation can be disabled through a persisted preference.

## Remaining quality and acceptance coverage

The current automated suite does not yet prove all Phase 1 quality gates:

- the development-provider representative export now receives compact/wide overflow checks and basic semantic-accessibility checks; representative real-provider outputs still need equivalent sampling;
- direct adapter-contract tests cover Codex and Claude discovery, authentication state, advertised models/efforts, prompting, streaming normalization, reference roots, and cancellation; live installed-CLI interoperability remains a manual acceptance check;
- exported ZIPs are now unzipped and loaded in a fresh sandboxed Electron browser window; broader representative-design coverage remains useful;
- an Electron journey now verifies dark/light token application, Home-to-workspace continuity, and restart persistence; exhaustive visual regression coverage for every primary screen/control remains open;
- an Electron journey now covers declining close, confirming interruption, restart recovery, Continue, and Retry affordances; external-root security still needs targeted acceptance coverage.

## Implementation order

1. Keep the deferred external-root enforcement gap explicit in provider instructions and architecture until that boundary is resumed.
2. Manually sample installed Codex and Claude generation and equivalent real-provider export quality when both CLIs are available.
3. Expand trusted-UI visual, keyboard, reduced-motion, forced-colors, and smaller-window acceptance coverage while continuing the polish pass.
4. Re-audit every `docs/PHASE_1_SPEC.md` acceptance bullet before declaring Phase 1 complete.
