# Phase 4 Release Audit

Audit date: 2026-08-10  
Specification: `docs/PHASE_4_SPEC.md`  
Implementation branch: `codex/feature/phase-4-foundation`

## Outcome

Phase 4 design branching is implemented end to end. The desktop application now treats each design direction as a durable product branch with its own Git worktree, conversation, generation queue, revision head, draft, preview state, and provider continuation. Users can create prompt-led alternatives, replay one prompt through several provider/model choices, attach other branch context, compare exact heads, request a persisted AI interpretation, combine the best parts into a destination, recover or abort conflicts, and retain or remove the source.

The accepted standalone-design, updater, and message-action refinements are also implemented. Automatic-update controls remain hidden on platforms where updates are disabled, including the current unsigned macOS packages.

## Evidence by Track

### Branch and Worktree Foundation

- Migrations 42-48 create protected Main records, branch-owned workspace and conversation state, durable combination locks/attempts, persisted summaries and comparisons, branch context evidence, and branch-local page metadata.
- Alternative branches use validated internal IDs, refs, and persistent linked worktrees. Startup verifies associations; removal uses the Git worktree lifecycle and requires explicit confirmation for dirty state.
- Revisions, export, preview, project-definition application, generation, recovery, selected revision, page metadata, and provider session resolve through the active branch.
- Main cannot be removed. Alternative branches appear immediately with collision-safe provisional titles; background provider naming may replace each once, after which product titles are immutable and never become filesystem authority.

### Conversation, Context, and Concurrency

- The ordinary composer branch selector shows the current direction, switches existing branches, and activates prompt-led **New branch** without creating an empty branch.
- Each design's last selected branch persists through navigation and application restart using the existing active-branch authority.
- Reply, Copy, Fork, and Read aloud are keyboard-accessible message actions. Fork replays a user prompt and may fan out to several provider/model selections.
- Queues remain sequential within one branch and run concurrently across branches under the global limit.
- Branch attachments persist with drafts and messages, resolve the latest commit and bounded conversation at execution time, disclose summarization, and pause safely when unavailable. Recovery offers Remove reference, Retry, Continue, or Cancel prompt.

### Lineage, Comparison, and Combination

- Manage branches shows fork ancestry, status, ordinary revisions on demand, and successful combination evidence. Failed attempts remain recovery/history records rather than lineage nodes.
- Exact branch heads render in isolated comparison frames. Page tabs include one-sided pages, and Git supplies authored-file evidence plus bounded changed-line hunks excluding managed build output for requested AI summaries.
- AI summaries run only on request, retain provider/model and exact head commits, persist after branch removal, and become stale without automatic regeneration.
- Combination captures an opaque comparison record, locks source and destination, applies only to the destination on the primary path, validates independently, and creates a destination commit with destination and source parents.
- Combination guidance is optional; an omitted prompt resolves to a persisted default instruction rather than blocking the action.
- While the agent combines, the comparison remains visible and non-dismissible with an announced source-to-destination status covering application and validation. Completion presents source retention and removal as consistent neutral actions.
- Failure restores the exact destination before Git merge fallback. A second failure persists manual resolution across restart with allow-listed editor opening, unresolved preview, Check resolution, Retry, and Abort. Success advances only the destination and asks whether to keep or remove the source.

### Trusted Application Refinements

- Standalone designs omit Definitions controls, setup prompts, version warnings, and application actions. Project-associated branches retain version-aware definition behavior.
- Enabled update platforms expose compact sidebar progress, Update, blocked reason, and Retry states. Installation is refused during active generation or combination and is never scheduled silently.
- Copy, Reply, and Read aloud cover user and assistant messages. Read aloud uses the operating system Web Speech implementation and exposes a stop state.

## Security and Platform Coverage

- Runtime-validated IPC accepts product IDs and opaque comparison/attempt IDs rather than renderer-supplied paths, refs, commits, or editor commands.
- Main-process services re-resolve managed worktrees and exact captured commits before comparison, combination, removal, export, preview, or editor launch.
- Branch comparison is read-only. Provider source immutability is described as an instruction/application-orchestration boundary, not a filesystem sandbox.
- CI now runs the real branch worktree lifecycle and workspace recovery suites on both `windows-latest` and `macos-latest`; Windows Electron E2E remains the complete desktop journey gate.

## Automated Journeys

The principal Phase 4 Electron journey covers creation, prompt-led **New branch** selection, two-model Fork fan-out, independent branch settlement, restart, Main switching, execution-time branch context, persisted comparison summary, manual combination completion, source retention, and selected-branch export.

The recovery journey covers a failed intelligent combination, Git fallback, durable manual-resolution state, restart, Abort, and exact destination recovery.

## Verification

Local Windows verification on 2026-08-10:

- `pnpm typecheck` — passed.
- `pnpm test` — 33 files and 328 tests passed.
- `pnpm build` — passed; the renderer bundle remains above Vite's advisory threshold at 582.71 kB (166.11 kB gzip).
- Focused Phase 4 Electron journey — passed in 49.1 seconds.
- Focused manual-recovery Electron journey — passed in 26.0 seconds.
- `pnpm test:e2e` — all 12 Electron journeys passed sequentially in 4.7 minutes; the Phase 4 principal journey took 56.4 seconds and recovery took 33.2 seconds in the full run.
- `git diff --check` — passed before and after the documentation closeout.

Native Windows/macOS worktree coverage also runs on every pull request through the platform matrix; its hosted result is expected when this branch is opened as a pull request.

Post-audit branch-selector refinement on 2026-08-11:

- Removed the dedicated branch workspace row and consolidated switching, prompt-led **New branch**, and **Manage branches** into the existing composer branch control.
- `pnpm typecheck`, all 328 unit/component tests, and `pnpm build` passed. The renderer bundle remains above Vite's advisory threshold at 582.88 kB (166.08 kB gzip).
- The focused Phase 4 principal and manual-recovery Electron journeys both passed in 95.3 seconds total.
- `git diff --check` passed.
- Follow-up responsiveness work creates and opens provisional branches before provider title generation, announces the creating state immediately, and refreshes the collision-safe final title in the background.
- The same follow-up passed `pnpm typecheck`, all 328 unit/component tests, `pnpm build`, the focused principal and manual-recovery Phase 4 Electron journeys in 109.7 seconds, and `git diff --check`. The renderer bundle advisory remains at 583.45 kB (166.24 kB gzip).
- Selected-branch and combination-feedback refinement passed `pnpm typecheck`, all 328 unit/component tests, `pnpm build`, the principal Phase 4 Electron journey with an explicit selected-branch restart assertion in 1.1 minutes, and `git diff --check`. The renderer bundle advisory remains at 584.03 kB (166.39 kB gzip).
- Shared composer-dropdown focus restoration retains the actual textarea caret and selection after pointer-opened branch and generation-settings menus are dismissed; the Electron journey covers both controls rather than relying on the surrounding `:focus-within` outline. `pnpm typecheck`, all 328 unit/component tests, `pnpm build`, the updated journey in 1.2 minutes, and `git diff --check` passed; the renderer bundle advisory remains at 584.87 kB (166.71 kB gzip).

## Residual Notes

- The current provider-owned Codex and Claude harnesses cannot enforce a read-only source worktree. OmniDesign supplies explicit source-reference instructions and independently verifies the destination commit and parents.
- Automatic updates remain disabled for unsigned macOS artifacts under the accepted release policy, so macOS shows no misleading updater action.
- The renderer chunk-size advisory predates Phase 4 and is non-blocking, but future work should split large workspace surfaces before bundle size materially affects startup.
