# Product Trust Polish Specification

Status: implemented on `codex/feature/product-trust-polish`; final verification recorded below.

## Purpose

This post-Phase 3 integration slice improves the moment immediately after generation and makes revision history more trustworthy. It does not add a new roadmap phase or reopen deferred provider infrastructure.

## Product decisions

### Protect the first result

- Never cover a design's first completed result with the automatic project-definitions setup dialog.
- Keep Definitions available in the workspace toolbar from the first result onward.
- The automatic setup prompt may appear after the user has engaged again, or when they are reviewing the project outside that first-result moment.
- Display the applied definition version directly on the Definitions toolbar action.

### Check every completed revision

- Render every HTML page in the existing isolated off-screen preview environment at 390 px and 1,280 px widths.
- Check horizontal overflow at both widths and check landmarks, level-one heading, document language, viewport metadata, accessible control names, and broken images once per page.
- Persist the completion timestamp and findings with the immutable revision. A completed report with no findings is an explicit pass; absence of findings alone is not treated as evidence that checks ran.
- Keep deterministic findings separate from runtime and console diagnostics through the existing `quality` diagnostic kind.
- Surface a concise status in the preview toolbar and an expandable, actionable report in the conversation.
- “Fix issues” sends the persisted findings through the currently selected provider as an ordinary generation request. It creates a normal validated revision and does not mutate history in place.

These checks are a deterministic baseline, not a claim of complete visual correctness or prompt adherence. Human review remains necessary for hierarchy, aesthetics, content accuracy, and nuanced accessibility.

### Make revision history explainable

- History rows label the originating request, provider, and persisted quality-check state.
- When viewing an earlier revision, offer “Compare to current” beside restoration.
- Comparison shows both revision thumbnails and a Git-derived authored-file diff with added, modified, and removed files plus line totals.
- Exclude OmniDesign-managed `.build` output so compiled CSS/runtime churn does not obscure authored changes.
- Never rely on an agent-authored change inventory or conversational claim as evidence of changed files.

## Non-goals

- Provider setup, API keys, direct APIs, new harnesses, or multiple provider configurations.
- Screenshot similarity scoring, AI-authored design scores, or claims of exhaustive accessibility conformance.
- Page reordering, revision rewriting, or low-level manual design editing.
- Automatic repair without an explicit user action.

## Acceptance criteria

- The first-result definitions dialog is absent while the toolbar entry remains usable.
- A built Electron journey persists and displays a successful quality check.
- Quality findings survive reopen, replace older reports atomically, and can generate one explicit repair request.
- A built Electron journey creates two revisions, selects the earlier one, and opens an authored-file comparison against the current head.
- Typecheck, unit/renderer tests, production build, and the full built-Electron suite pass.

## Verification ledger

Verified on 2026-07-30, sequentially:

- `pnpm typecheck` passed.
- `pnpm test` passed: 274 tests across 27 files.
- `pnpm build` passed. Vite retains the existing advisory that the main renderer chunk is larger than 500 kB (544.68 kB, 157.29 kB gzip).
- `pnpm exec playwright test -c playwright.e2e.config.ts` passed: all 10 built-Electron journeys in 3.1 minutes.
- `git diff --check` passed.

The screenshot-failure regression was verified separately in the built app and then in the full suite: an unavailable thumbnail no longer creates a page-render finding. Report versions make prior results stale and replace them on the next active-revision preview.
