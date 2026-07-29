# Phase 3 Release Audit

## Result

Phase 3 satisfies the product contract in `docs/PHASE_3_SPEC.md` on the
`codex/feature/phase-3` branch as of 2026-07-27. Provider API configuration,
multiple provider configurations, provider setup/testing, and an
OmniDesign-owned harness remain excluded. Installed Codex and Claude harnesses
continue to receive original linked projects and design repositories directly,
with their currently accepted read-write access and no OmniDesign-created
safety copies.

## Definitions acceptance evidence

| Requirement | Implementation and verification |
| --- | --- |
| Structured project definitions | `contracts.ts` validates colors, typography, spacing, shape, visual guidance, and AI Agent instructions. `DesignDefinitions.tsx` provides manual editing, bounded inputs, unique semantic names, safe CSS values, and field-level recovery. |
| Immutable versioning and project ownership | Store migrations 34-36 persist immutable definition versions, the project current-version pointer, prompt suppression, and per-design applied/kept/pending state. Store integration tests cover version creation, superseding decisions, suppression, and restart. |
| Contextual setup prompt | `App.tsx` offers Set up now, Not now, and Don't show again, at most once per project per session. It defers while generation or an unsaved draft/attachment exists. Project and workspace definition shortcuts remain available. React tests cover suppression and all three setup paths. |
| Proposal, manual, and continue paths | The setup chooser exposes AI proposal, manual setup, and continuing without definitions. Proposals use the installed provider gateway, disclose the context sent, remain editable, and are not saved until confirmed. Provider and no-source failures are actionable. |
| Definitions in every new design | `workspaceService.ts` materializes managed semantic CSS variables in ordinary source files. `agentHarness.ts` supplies structured definitions and AI Agent instructions on the initial provider turn, but not resumed ordinary or focused turns. Tests cover prompt context and materialized files. |
| Persistent per-design decisions | Saving a newer version creates or supersedes pending decisions for eligible designs. Apply, keep, and apply-all survive navigation and restart. Newer versions create new decisions even after an earlier version was explicitly kept. |
| Deterministic and AI application | Exact managed-token changes use the deterministic materializer. Interpretive or migration work uses the existing generation queue with the design's last available provider/model/effort; unavailable choices remain pending with diagnostics. |
| Application attempts and recovery | Migration 38 persists mechanism, state, diagnostic, provider/model/effort, generation job, and resulting revision. Applying attempts become interrupted after restart; retry/continue create new attempts; cancellation, removal, failure, and completion finalize them. |
| Git-backed immutable results | Changed deterministic and AI applications pass normal compilation/validation and create revisions with a definition-version reason. No-change completion advances resolved definition state without manufacturing a revision. Revision definition versions drive historical preview, restoration, and export. |
| Bulk partial failure | Apply-all processes designs independently through existing queue semantics. Successful results remain; failed/unavailable designs remain pending with diagnostics and explicit partial-result feedback. |

## Focused-edit acceptance evidence

| Requirement | Implementation and verification |
| --- | --- |
| Single target in Focused mode | The preview toolbar starts selection only for the head revision. Canvas activation switches to Focused first. Pointer selection, Enter/Space selection, Escape cancellation, authored-action suppression, hover/focus outline, and explicit clearing are implemented. Selection opens a collision-fitted trusted feedback popup immediately beside the element instead of moving the user to the conversation composer. |
| Exact immutable source location | `focusedSourceMap.ts` parses immutable revision HTML, removes forged source attributes, assigns opaque keys only in served HTML, and records exact inclusive repository-relative line ranges and bounded excerpts. Multi-page paths are supported. |
| Dynamic content fallback | The shim walks to the nearest authored ancestor. The resolved target discloses that ancestor and retains a bounded description of the clicked runtime descendant; an unresolvable node returns a clear failure instead of attaching an untrusted target. |
| Trust boundary | The sandboxed preview still has no preload, Node access, same-origin permission, filesystem access, or generic IPC. Only the active registered frame and token are accepted. Privileged resolution revalidates design, revision, page, opaque location key, message shape, and size. Bounded rectangles are accepted only as non-authoritative placement hints for expected opaque keys. |
| Prompt and provider continuity | Focus metadata augments the ordinary prompt while the original user wording remains visible. The existing provider session is resumed; no focused-edit conversation is created. Supporting CSS and JavaScript changes remain permitted through normal validation. |
| Persistence and clearing | Resolved targets persist on submitted messages and generation attempts, including retry/continue history. The live target clears on submit, page/revision/layout/workspace changes, restore, and restart. Historical revisions remain non-editable until restored to a new head. |
| Immediate and queued actions | The anchored popup exposes **Submit & fix** and **Queue** while keeping its draft separate from the ordinary composer. Immediate submission retains the single-target path. Queueing persists the comment and trusted exact target, clears the live selection, and adds the pending comment to a semi-transparent element thread marker. |
| Element-level history threads | One marker per matched source element combines submitted immediate edits, submitted batch items, and pending comments in chronological order. Hover or keyboard focus reveals the thread; only pending entries can be removed. Historical targets re-anchor to a displayed revision only through one unique same-page stable identity or unchanged label and source excerpt, so ambiguous or deleted elements never receive guessed markers. |
| One-turn batch generation | **Fix all** revalidates every queued target and atomically moves the ordered items onto one conversation message and one generation job. The installed provider receives one coordinated prompt, Retry/Continue retain the complete batch, and a new head clears stale pending items. |

## Security and quality evidence

- Contract and source-map tests cover malformed, oversized, forged-token,
  forged-path, stale-frame, stale-page, and cross-revision inputs.
- Persistence tests cover migration, durable focused-feedback queue and batch metadata, exact focused metadata, interrupted
  definition attempts, deterministic result pointers, unavailable AI work, and
  failed queue work.
- React coverage exercises critical definition and focused-edit interactions in
  dark and light themes and activates the new controls by keyboard.
- The injected selector has visible non-color-only outlines and labels, includes
  forced-colors behavior, and exists only in the served preview document, so it
  is absent from source, revisions, thumbnails, screenshots, and exports.
- A built-Electron Playwright journey covers linked-project creation, setup,
  manual definitions, keep/apply decisions, deterministic revision creation,
  two exact `index.html:start-end` selections, queued comments, one batch generation, application-attempt
  persistence, restart, and recovered conversation/history.

## Verification gates

Verified on Windows on 2026-07-27:

- `pnpm typecheck`
- `pnpm test` — 25 files, 258 tests
- `pnpm build`
- `pnpm test:e2e` — 9 built-Electron journeys

The production build emits the existing advisory that one renderer chunk is
larger than 500 kB; it does not fail the build.
