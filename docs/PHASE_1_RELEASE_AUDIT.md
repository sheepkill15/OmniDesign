# Phase 1 Release Audit

**Audited:** 2026-07-22
**Authority:** `docs/PHASE_1_SPEC.md`, `ARCHITECTURE.md`, `DESIGN_SYSTEM.md`
**Baseline at audit time:** `pnpm typecheck`, `pnpm build`, 163 unit/integration tests, and 7 built-Electron journeys all green.

This is a companion to `docs/PHASE_1_GAP_AUDIT.md` (the evidence-based completion ledger). It records a full pre-v1 audit — planned-but-unbuilt behavior (excluding items the owner deferred), security, correctness/data-fidelity, UI/UX, and design-system/accessibility — and the fixes applied in the `feature/phase-1-audit-fixes` pass.

Multi-file design support (agent-authored images/fonts/page-JS in preview and export) was reviewed and **deferred beyond Phase 1 by owner decision (2026-07-22)**. Findings that only matter for multi-file designs (the hardcoded 3-file read set; `restore()` not deleting files absent from the target commit) are recorded here for continuity but are **not** Phase 1 blockers.

---

## Fixes applied in this pass

All changes are test-gated. Post-pass verification: typecheck, build, **171** unit/integration tests, and **7/7** e2e journeys green.

### Owner-requested

- **Recent = designs, direct open.** Home's "Continue designing" lists the most recently active *designs* (not projects); opening one goes straight to its workspace. (`src/renderer/App.tsx`)
- **Background title + spinner.** Title generation already ran concurrently with the first generation; added the missing affordance. A persisted `title_pending` flag (migration 26) drives a spinner in place of the rename control until the title lands; it is cleared on rename, on resolution, and on restart (a request never survives a process exit). (`contracts.ts`, `store.ts`, `workspaceService.ts`, `main/index.ts`, `App.tsx`)
- **Conversation panel.** Codex emitted one activity **per streamed token**, each persisted as its own `generation_step` (the `stage+detail` dedup never matched) and each triggering a renderer `get()` — flooding the feed and lagging live updates. Streamed `text` activities are now dropped from the milestone stream (the reply is preserved whole as the final assistant message); the feed is curated (prompt → collapsible activity → reply → outcome) and restyled to read as a dialogue. (`main/index.ts`, `App.tsx`, `styles.css`)

### Audit fixes

- **Accessibility (design system).** `--focus-ring`, `--surface`, and `--text-muted` were referenced but never defined, silently disabling focus rings and input styling; repointed to the real tokens. `.theme-option`/`.settings-switch` focus now uses React Aria's `[data-focus-visible]` (native `:focus-visible` never matched the styled label). Added pressed/`[data-pressed]` states. (`styles.css`)
- **Validation.** Added the accessible-name and image-`alt` quality checks the agent contract promises but that `findDesignQualityWarnings` did not enforce. (`compiler.ts`)
- **Preview CSP.** `connect-src 'none'` denies programmatic network egress (fetch/XHR/WebSocket/EventSource/beacon) from the untrusted preview — closing the most direct exfiltration channel. (`previewPolicy.ts`)
- **Provider retry.** Auto-retry did 2 retries with a misleading counter; now performs up to 3 retries (4 attempts) with a correct "N of 3" label. (`generationQueue.ts`)
- **Trash auto-purge.** Ran only at startup; now also on a ~6h unref'd timer, cleared on `close()`. (`store.ts`)
- **Association suggestion.** Naive case-insensitive substring match (a project named "app" matched almost every prompt) replaced with a conservative word-boundary match that ignores very short names. (`App.tsx`)
- **Notifications.** OS notifications no longer fire while the window is focused or for user-initiated cancels, and check `Notification.isSupported()`. (`main/index.ts`)

---

## Remaining gaps (honest path to "Phase 1 complete")

### 1. Enforceable read-only external-root access — blocking security gap (deferred, tracked)

Linked projects and attachments are passed to providers as reference roots with only prompt-level "read-only" instructions:

- **Codex** folds `referencePaths` into `runtimeWorkspaceRoots` (`codexAdapter.ts`), i.e. alongside the writable design repo.
- **Claude** runs `--permission-mode acceptEdits` with `--add-dir <ref>` (`claudeAdapter.ts`); its Bash tool is a write vector that tool-permission deny rules do not sandbox.

A **verified** mechanism is required: OS-level sandboxing (Codex) / a robust deny that covers the Bash vector (Claude), plus adapter/security tests proving reads succeed and create/modify/rename/delete outside the design workspace are denied — **run against the live CLIs**. Not landed blind, because a change that looks like a write boundary but leaves the sandbox/Bash vector open is worse than the documented gap.

### 2. Full preview network lockdown — entangled with deferred multi-file support

The agent contract deliberately tells agents to load assets (fonts, images, plugin scripts) from **HTTPS CDNs** *because* local sibling files are not yet supported (see multi-file deferral). So external-HTTPS resource loading — and thus beacon-style exfiltration via `img`/`script` `src` — cannot be fully closed until designs carry local assets. `connect-src 'none'` (landed) removes the direct fetch/XHR channel; reducing `img/font/style/script-src https:` to a strict allowlist, and dropping `'unsafe-eval'` via Alpine's CSP build (`ARCHITECTURE.md:384`), should land with multi-file support.

### 3. Runtime + full security validation not blocking (partial)

`compileTailwindCss` + a `file:`-only security check + document-quality checks run before commit. The spec also lists **fatal runtime errors** and **preview security-policy violations** as *blocking* failures that feed self-repair. Runtime errors are currently captured only post-hoc by the preview (after activation). A true pre-activation runtime gate needs headless execution of the candidate — a larger change than a polish slice, recommended as a dedicated follow-up.

### 4. Multi-file designs (deferred beyond Phase 1)

`readRevisionFiles` reads only `index.html` + `.build/{tailwind.css,alpine.js}` though `git add --all` commits everything; agent-authored assets are dropped from preview and export, and `restore()` does not delete files a later revision added. Deferred by owner decision; recorded for continuity.

### 5. Lower-priority correctness noted, not yet addressed

- Git commit and the DB revision-row insert are not atomic; a crash between them can orphan a `main` head with no `revisions` row (`workspaceService.ts`). Recommend reconciling orphan heads against `active_revision_id` on startup.
- Usage/cost and per-attempt partial-output/diagnostics are not persisted as structured records (free-text step detail only).
- Running provider CLI processes are not explicitly aborted on window close (rely on child-dies-with-parent).

---

## Quality / coverage still open

- Preview isolation wiring (permission/navigation/network/IPC handlers) has no direct automated security coverage; `previewPolicy.test.ts` covers only the pure policy functions.
- Real Codex/Claude adapters are covered by contract tests + manual live sampling, not automated live journeys.
- Pixel-level visual-regression coverage of reusable controls remains open (as noted in the gap ledger).
