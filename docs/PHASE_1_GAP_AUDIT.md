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

## Remaining functional gaps

### 1. Enforceable read-only provider access — blocking security gap

Linked-project and attachment paths are currently passed to providers as explicit read-only instructions. That is not an enforceable filesystem boundary. Before Phase 1 can be complete, each adapter must provide a verified mechanism that permits reads from explicitly selected external roots while denying writes there. The current Codex app-server adapter only establishes the managed design workspace as its runtime root; the Claude adapter runs from that workspace but has no verified external-root policy.

Required proof:

- Automated adapter/security tests show a provider can read an approved linked project or attachment.
- The same tests show create, modify, rename, and delete operations outside the managed design workspace are denied.
- The provider contract documents the granted roots and does not rely on prompt instructions as authorization.

### 2. Project/design association workflow

Phase 1 still lacks manual reassociation of an existing standalone design to a linked project, the non-blocking matching suggestion, and optional adaptation after association.

### 3. Provider and generation-detail acceptance

The queue exposes basic status and elapsed time, but the active-generations surface does not yet show the complete required stage, provider/model, detailed streamed activity, and queued-item removal behavior. Codex and Claude capability/contract coverage must also prove the advertised installed-CLI pilot behavior.

### 4. Attachment completeness

Attachments can be selected in an existing design workspace, but the initial home composer does not yet attach references to the first generation. Enforceable external read-only access remains the more important attachment requirement.

### 5. Notifications and settings

The specification's optional Windows notifications and persisted preference to disable them are not implemented. The in-app generation badge updates, but it is not a substitute for the full notifications behavior.

### 6. Project removal while generations are active

The trusted UI now exposes project and design removal plus Trash restoration. It still needs the required confirmation, cancellation, and dependent-queue pause behavior when a project or design being removed has active generation work.

### 7. Quality and acceptance coverage

The current automated suite does not yet prove all Phase 1 quality gates:

- representative generated designs need automated responsive and accessibility checks;
- provider adapter contracts need capability coverage for both real adapters;
- exported ZIPs need an offline browser-execution test, not only archive-content checks;
- all primary screens and reusable controls need explicit dark and light theme verification;
- the close/interruption and external-root security flows need targeted Electron coverage.

## Implementation order

1. Resolve verified external read-only roots for Codex and Claude, or revise the provider pilot architecture with an accepted, documented boundary.
2. Add project/design association and the remaining project-removal UI.
3. Complete generation detail, attachment-first-generation, and notification behavior.
4. Build the missing security, adapter, offline-execution, accessibility, responsiveness, theme, and Electron acceptance tests.
5. Re-audit every `docs/PHASE_1_SPEC.md` acceptance bullet before declaring Phase 1 complete.
