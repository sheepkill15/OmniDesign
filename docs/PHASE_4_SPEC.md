# OmniDesign Phase 4 Product Specification

## Status and Authority

This document defines the intended Phase 4 product behavior for OmniDesign. It is subordinate to the product principles in `AGENTS.md`, the accepted technical decisions in `ARCHITECTURE.md`, and the trusted-interface rules in `DESIGN_SYSTEM.md`.

Phase 4 implementation must remain local-first, preserve immutable design history, preserve the generated-preview security boundary, and continue using the installed authenticated Codex and Claude CLI harnesses. Phase 4 is complete only when the acceptance criteria in this document are implemented and tested.

The product owner defined this contract through a specification interview completed on 2026-08-10. Phase 4 does not reopen API-key providers, direct provider APIs, provider setup, multiple configurations or accounts for one provider, or an OmniDesign-owned harness. Those capabilities remain in the unassigned provider-infrastructure milestone.

## Outcome

Phase 4 makes alternative design directions a first-class part of one design:

1. Every design has a protected `Main` branch and may have multiple persistent alternative branches.
2. Each branch owns an independent conversation, revision head, generation queue, worktree, and restored workspace state while retaining shared history through its fork point.
3. A user can fork an ordinary prompt or rerun an earlier prompt through several providers or models to explore alternatives concurrently.
4. A user can compare two branch heads visually, ask AI to summarize their differences, and combine a source branch intelligently into a destination branch through a prompt.
5. Git preserves the fork and combination ancestry while OmniDesign presents product language rather than raw source-control mechanics.

Phase 4 also completes three trusted-application refinements: message Reply/Copy/Read aloud actions, project-only definition controls, and quiet sidebar progress for background application updates.

## Product Principles

- A branch is an alternative direction within one design, not a separate design.
- Branching remains prompt-led. Users do not create empty branches or manage raw Git state.
- AI-directed combination is the primary path. Git merge is a recovery path, not the default combination mechanism.
- `Main` is the stable default direction. Its name is fixed and it cannot be removed.
- Branches appear immediately with a concise prompt-derived provisional title. Provider-backed naming runs concurrently and may replace that provisional title once; the resulting title is immutable and disambiguated quietly when necessary.
- Users may reason about direction, source, destination, comparison, and lineage without needing to understand Git worktrees, refs, indexes, conflicts, or detached heads.
- Concurrent exploration must not permit two jobs to mutate the same branch worktree.
- No branch operation may rewrite or delete an immutable completed revision.

## Terminology

- **Branch:** one product-visible design direction backed by one Git branch and one persistent worktree.
- **Main:** the protected default branch created for every design.
- **Branch head:** the latest valid revision on a branch.
- **Fork point:** the revision from which a child branch begins.
- **Branch conversation:** the inherited conversation through the fork point plus messages created on that branch after it diverges.
- **Source:** the branch whose ideas and implementation are being brought into another branch.
- **Destination:** the branch that receives a combination and advances to a new revision.
- **Combination:** an AI-directed application of one whole source branch to a destination branch, optionally guided by a user prompt.
- **Combination attempt:** one durable record of the intelligent attempt, Git fallback, validation, manual-resolution state, and outcome.
- **Attached branch context:** one or more branch worktrees and their conversations since divergence supplied to a prompt through Add.
- **Lineage:** successful fork and combination relationships between branch heads. Ordinary revisions remain available on demand but do not dominate this view.

## Scope

### Included

- A protected `Main` branch for every existing and new design.
- A persistent Git worktree for every branch for the branch's lifetime.
- Prompt-created branches from the current branch head.
- Message-level Fork from any earlier user prompt as the only historical branching exception.
- One-message provider/model fan-out that creates one child branch per selected configuration.
- Independent sequential queues per branch with concurrency across branches under the existing global limit.
- Branch-specific conversations and complete workspace restoration.
- Manual attachment of several branch folders and conversations through Add.
- A compact composer branch selector plus a branch-focused visual lineage view.
- Explicit visual comparison and AI-generated comparison summaries.
- Multi-page, side-by-side comparison with page selection and unmatched-page states.
- AI-directed whole-branch combination with optional user guidance.
- A Git merge plus AI conflict-resolution fallback.
- Default-editor recovery, validation, completion, and abort for unresolved combinations.
- Permanent branch removal with confirmation and protected `Main`.
- Message Reply, Copy, Fork, and later Phase 4 Read aloud actions.
- Project-definition visibility rules for standalone designs and branch version warnings.
- Sidebar update-download progress, Update, blocked, and Retry states.

### Deferred or Excluded

- Empty branch creation without a prompt.
- Editable or user-authored branch names.
- Branching directly from an arbitrary historical revision outside message-level Fork.
- Archiving, trash, or recovery for removed branches.
- Manual cherry-picking or combination by file, page, element, region, or individual commit.
- Raw Git terminology and controls such as ahead/behind, dirty state, rebasing, force operations, or direct ref management.
- Showing every revision as a first-class node in the default lineage view.
- Failed combination attempts as lineage nodes. They remain in destination conversation and attempt history.
- Enforceable read-only filesystem access for source worktrees under provider-owned harnesses.
- A built-in source-code editor.
- Cloud sharing or multi-user collaboration.
- Definitions for product-level standalone designs.
- Provider-infrastructure work already deferred by the roadmap.

## Branch Model and Git Worktrees

### Repository Shape

Each design continues to own one OmniDesign-managed Git repository. `Main` uses the repository's main worktree. Every alternative product branch uses a linked Git worktree stored outside the main worktree but within the same managed design directory.

```text
workspace/
  designs/
    <design-id>/
      repository/                 Main worktree and common Git directory
      branches/
        <branch-id>/
          worktree/               Persistent linked worktree
```

Linked worktrees share Git objects and refs while keeping per-worktree `HEAD`, index, and working files separate. OmniDesign must use `git worktree` lifecycle commands rather than copying repositories or deleting linked-worktree folders directly. Worktree discovery and repair use machine-readable Git output and validated managed paths.

Product branch IDs are authoritative. User-facing titles are not used as filesystem authority and do not need to be valid Git ref names. Internal refs and worktree paths use validated stable identifiers so an AI-generated title cannot escape managed storage or collide with another branch.

### Migration and Main

- Every existing design is migrated to one `Main` branch containing its complete current Git history.
- Every new design creates `Main` before its first design prompt.
- `Main` always retains that exact product-visible name.
- `Main` cannot be renamed or removed.
- Existing active and selected revision pointers become `Main` branch state without manufacturing revisions.
- Migration is forward-only, restart-safe, and idempotent.

### Branch Lifetime

- A branch and linked worktree are created only when a branching prompt is submitted.
- The worktree remains present for the branch's entire lifetime.
- Branch removal permanently removes the linked worktree, Git branch ref, branch conversation, branch-only workspace state, and branch-only application metadata after confirmation.
- OmniDesign resolves and validates the exact managed worktree before removal. A dirty or conflicted branch requires explicit wording that removal discards unresolved files.
- Removed branches have no archive or recovery flow in Phase 4.
- When a removed source remains a parent of a successful two-parent combination commit, Git retains that commit ancestry. The stored combination record may label it as a removed source; Phase 4 does not build a separate branch archive when Git and the combination record cannot recover more information.

## Branch Creation

### Ordinary Composer Branching

Continuing the selected branch remains the composer default. The composer branch selector shows the current branch and lets the user explicitly choose **New branch** for one prompt.

- Separate-branch mode is available only while the current branch head is selected.
- Selecting a historical revision disables the mode and explains that the user must return to the branch head.
- The composer shows a branch icon, the text **This change will happen in a separate branch**, and a hover/focus information control that explains a branch in plain product language.
- The explanatory text is essential state and cannot exist only in a tooltip.
- Submitting creates a child branch at the current head, creates its worktree, copies the inherited conversation boundary, and queues the prompt on the new branch.
- The source branch remains unchanged.
- The new branch, worktree, conversation, and queued prompt appear before provider-backed title generation finishes. A concise prompt-derived title is shown immediately, then may be replaced once by the generated title. The resulting title is immutable, and a collision adds a quiet numeric suffix.
- If initial generation fails, the branch remains visible with its failure state, Retry, and Remove actions.

### Message-Level Fork

Hovering or moving keyboard focus onto a user prompt reveals a Fork quick action. Fork is the sole exception to head-only branch creation.

- Fork may be used on a completed, failed, cancelled, or interrupted user prompt.
- The new branch begins at the revision that existed immediately before that prompt.
- OmniDesign replays the original prompt, attachments, focused targets, reply reference, and attached-branch references.
- The new branch conversation inherits history only through the point before the replayed prompt, then records the replay as its own turn.
- Simple Fork reuses the original provider and model.
- Before submission, the user may change provider, model, or effort.
- The user may add several provider/model selections. Each selection creates one independent child branch from the same base and replays the same message.
- Every result receives its own immediate provisional title and worktree. Provider-backed naming may replace each provisional title once in the background; the resulting titles are immutable.
- An unavailable original attachment, branch reference, provider, or model produces an actionable preflight state rather than silently changing the replay.

### Queue and Concurrency

- Jobs remain sequential within one branch.
- Jobs on different branches may run concurrently.
- The existing global concurrency limit remains authoritative; excess branch jobs queue normally.
- A failed or cancelled job pauses only its branch queue, not sibling branches.
- Switching branches never cancels background work.
- Branch status uses plain states: **Ready**, **Generating**, **Queued**, **Failed**, **Combining**, and **Needs manual resolution**.
- The UI does not expose Git-oriented status such as ahead, behind, detached, dirty, or conflicted.

## Branch Conversations and Context

### Inheritance and Divergence

- A child branch inherits the completed conversation through its fork point.
- Messages after divergence belong only to their branch.
- Provider continuation state must also diverge. Concurrent branches may not mutate or resume one shared provider session.
- The local conversation and its exact message relationships remain authoritative even when an adapter must establish a new provider session from inherited context.
- Branch conversation ancestry must not be implemented by duplicating mutable messages in a way that permits one branch to rewrite another branch's inherited history.

### Attaching Parallel Branches

The existing composer Add control can attach one or several parallel branches as context.

- Each attachment supplies the selected branch's managed worktree and its conversation since divergence.
- Attached source worktrees are presented to the provider as reference material. The prompt instructs the provider not to modify them.
- Provider-owned harnesses do not currently enforce read-only external roots. This remains an explicitly disclosed instruction-only boundary; the product must not claim stronger protection.
- Attached context is resolved when execution begins, not snapshotted when the prompt is queued. The agent therefore receives the branch's latest head and latest conversation at execution time.
- The persisted generation attempt records the branch IDs, actual commit IDs, and conversation cutoff used so history remains explainable.
- If an attached branch changes while the request is queued, the latest state is used without treating it as the originally queued state.
- If attached conversations exceed provider context capacity, OmniDesign creates and clearly discloses an AI-generated summary. It never silently drops older messages. The summary and its source boundaries persist with the attempt.
- If an attached branch is removed or unavailable before execution, the job pauses with actions to remove the reference or cancel the prompt.

### Reply

Reply adds precise conversational context without branching.

- Reply is available on user and agent messages through pointer hover and keyboard focus.
- One outgoing prompt may reply to exactly one earlier message.
- Activating Reply adds a visible reference to the ordinary composer while preserving the user's draft.
- The outgoing message stores the exact referenced message ID and displays the relationship after navigation and restart.
- Reply generation always operates on the current selected branch head; replying to an old message does not restore or branch from its historical revision.
- The user can remove the reply reference before submission.

### Copy and Read Aloud

- Copy is available on user and agent messages through pointer hover and keyboard focus.
- Read aloud is also available on both roles and is implemented in a later Phase 4 slice after the core branching journey.
- The quick-action row is visually quiet until its message is hovered or focused, but keyboard users receive the same commands and accessible labels.
- Copy preserves ordinary plain-text message content. Read aloud uses the trusted application layer and does not expose generated-preview privileges.

## Branch Navigation and Workspace State

### Composer Branch Selector

Branch navigation reuses the branch control in the ordinary composer footer instead of reserving a separate workspace row or adding another control to the crowded header and preview toolbar.

- The compact selector shows the current branch title and remains available in the composer wherever conversation controls are shown. Submission immediately changes it to a clearly announced creating state, then opens the provisional branch while provider-backed naming continues.
- Its menu supports ordinary keyboard navigation, switching among existing directions, clear busy/failure states, and recent branch scanning.
- The last branch selected in each design persists. Returning to the design or reopening OmniDesign restores that branch rather than defaulting to Main.
- **New branch** activates separate-branch mode for the next prompt; it does not create an empty branch.
- Choosing the current branch while **New branch** is selected returns the composer to continuing that branch.
- **Manage branches** opens the visual lineage view from the same menu.
- Project-definition warnings do not appear in the selector.

### Per-Branch Restoration

Switching branches restores that branch's:

- Selected revision.
- Draft and attachments.
- Reply reference and separate-branch composer state where applicable.
- Provider, model, and effort selection.
- Layout mode and conversation-divider position.
- Preview page, Focused/Canvas mode, device and fit choices, and Canvas zoom/pan viewport.
- Queued and active generation state.

Historical selection remains branch-local. Prompting and separate-branch mode stay disabled until the user returns to that branch's head.

Focused selections, pending focused-feedback items, and queued jobs are never copied into a newly forked branch. Only completed conversation and revision history through the fork point are inherited. After creation, each branch owns its own focused-feedback and generation state.

## Lineage and Comparison

### Lineage View

The visual lineage view focuses on decisions rather than every commit.

- Show branches, fork points, successful combination commits, branch names, current heads, and simple statuses.
- Ordinary revisions are revealed on demand within a branch rather than rendered as permanent top-level nodes.
- `Main` is visually stable and protected without being disproportionately emphasized.
- Failed combination attempts remain in the destination conversation and attempt history; they do not become lineage nodes.
- A removed source may remain as a non-openable **Removed branch** node only when its Git ancestry and stored combination evidence still support that representation.
- Permanent branch removal is available from this management view, not from the everyday selector.

### Starting a Comparison

- The user selects two branches in the lineage view.
- Comparison uses their current valid heads.
- The currently selected branch defaults to destination; the other branch defaults to source.
- The roles are clearly labeled and may be changed before combination.
- Comparison is read-only and never checks out or mutates either worktree.

### Comparison Evidence

- Render corresponding pages side by side.
- Provide a page selector for multi-page designs.
- Identify pages that exist in only one branch rather than pairing them incorrectly.
- Preserve the existing isolated-preview restrictions for comparison renders.
- An AI-generated difference summary runs only after an explicit user request because it consumes provider time.
- Summary generation receives both branch folders and the relevant conversations under the same instruction-only reference boundary.
- Summary generation also receives bounded Git-authored diff hunks containing the actual changed lines and nearby context; OmniDesign-managed build output is excluded.
- The summary is clearly labeled as AI-generated and cannot substitute for rendered review.
- The comparison records the source and destination commits it inspected. If either head changes, the result becomes stale and must not be used for combination without refresh.

## Branch Combination

### Entry and Roles

Comparison offers **Combine**. It opens a prompt with source and destination already identified.

- The selected branch defaults to destination.
- The compared branch defaults to source.
- The user may supply an ordinary natural-language prompt describing what to carry over or preserve. When omitted, OmniDesign supplies a clear default instruction to combine the strongest source qualities while preserving the destination's coherent structure, intent, and working behavior.
- Combination operates on the entire source branch as context. Phase 4 does not expose file-, page-, or element-level picking.
- Source and destination must each be at a valid head and must be distinct branches of the same design.

### Locking

When combination begins:

- Source and destination are locked against new OmniDesign generations and additional combinations.
- The comparison remains visible with an immediate announced progress state naming the source and destination. It cannot be dismissed while the agent is applying and validating the combination.
- Existing queued work on either branch does not start until the attempt resolves or aborts.
- The source worktree is treated as immutable by product orchestration and by an explicit provider instruction.
- The destination is the only worktree the intelligent attempt may edit.
- The current provider-owned harness cannot enforce source filesystem read-only access. OmniDesign must state the instruction accurately and must not claim an operating-system sandbox that does not exist.
- Application updates are blocked while a combination or manual resolution remains active.

### Intelligent Combination First

The primary path does not run `git merge`.

1. Capture the exact source head, destination head, conversations, and prompt.
2. Start the provider in the destination worktree with both roles stated explicitly.
3. Supply the source folder and source conversation as reference context.
4. Ask the agent to apply the desired source qualities intelligently while preserving the destination according to the prompt.
5. Independently inspect Git state, compile, render, validate, and run quality checks.
6. When valid changes exist, record the destination tree as one two-parent Git commit whose first parent is the pre-combination destination head and whose second parent is the source head.
7. Advance only the destination branch and create one immutable destination revision.

The agent does not author commit ancestry or declare success. Git state and OmniDesign validation remain authoritative. A response-only or no-change result does not manufacture a merge revision.

### Git Merge Fallback

If the intelligent combination fails for any reason, OmniDesign restores the destination worktree to its exact pre-attempt head and enters the fallback:

1. Start a conventional Git merge of the captured source head into the destination without finalizing an invalid result.
2. Give the merge state, conflicts, original source and destination roles, and resolved combination instruction to the agent.
3. Ask the agent to resolve conflicts and finish the requested combination in the destination.
4. Validate the complete result independently.
5. On success, finish one two-parent destination merge commit and immutable revision.

The fallback and its diagnostics are visible in the durable attempt record without exposing raw Git terminology as the primary user experience.

### Manual Resolution

If the Git fallback also fails:

- Keep the destination in **Needs manual resolution** state and explain that OmniDesign could not resolve the combination.
- Offer **Open in editor** using the configured or discovered default code editor for the destination worktree.
- Keep source and destination generation locks active.
- Offer **Check resolution**. This verifies that Git has no unresolved entries, then runs normal compilation, preview, validation, and quality checks before recording the two-parent merge revision.
- Offer **Abort combination**. This discards the unresolved attempt, restores the exact pre-combination destination head and clean worktree, releases both locks, and retains the failed attempt in conversation history.
- An unavailable editor produces contextual setup or recovery help; it never opens an arbitrary renderer-supplied executable or path.

### Completion and Source Removal

After a successful combination:

- Advance only the destination branch.
- Preserve the source branch unchanged.
- Persist source branch, destination branch, captured commits, prompt, provider/model/effort, AI response, fallback path, validation outcome, resulting revision, and merge commit.
- Show the successful combination in lineage.
- Ask whether the user wants to remove the source branch.
- Source removal is permanent and uses the same explicit confirmation as removal from Manage branches.

## Project Definitions Across Branches

- Definitions remain owned and versioned by the project. A branch never owns a divergent definition record.
- Each branch nevertheless retains the definition version captured in its current code and revisions.
- Forking begins with the definition version applied at the fork point.
- When the project's current definition version advances, an older branch retains its version until the user applies or keeps the newer version.
- Show the existing pending-definition warning only inside the selected branch workspace.
- Do not add definition warnings to the branch selector or lineage view.
- Applying definitions produces a normal revision on the selected branch worktree. Apply-all orchestration must process eligible branch worktrees independently because their authored code may have diverged.
- Definition application and branch combination cannot mutate the same worktree concurrently.

### Standalone Designs

Product-level standalone designs do not expose project definitions.

- Hide the Definitions button in a standalone design workspace.
- Do not show missing-definition prompts, version warnings, or definition-application actions for standalone designs.
- The private persistence container used internally for a standalone design does not make definitions a user-visible product concept.
- If the design is later associated with a user-visible project, the project definition entry and applicable version state may appear.
- Project pages remain the primary definition-management surface.

## Background Application Update Experience

On platforms where automatic updates are enabled, background update state lives quietly in the bottom-left sidebar region.

### Downloading

- Continue downloading in the background.
- Show an explicit numeric percentage in the sidebar footer.
- Keep the state compact and non-modal; it must not cover the first completed design result or interrupt prompting.
- Announce meaningful percentage milestones accessibly without sending every progress event through a live region.

### Ready

- Replace progress in the same location with a compact **Update** button when the package is ready.
- Clicking **Update** installs immediately and restarts OmniDesign without an additional confirmation.
- Do not show a separate native restart-decision dialog.
- If generation, branch combination, or manual conflict resolution is active, do not restart. Explain the blocker in place and enable Update when work is safe.
- A blocked click does not schedule a surprise restart. The user clicks Update again after the blocker clears.
- Ordinary quit behavior may continue installing an already retained update according to the accepted platform updater policy.

### Failure

- Replace failed download progress with a compact **Retry** action in the same sidebar location.
- Retry restarts the existing updater download flow.
- Keep technical diagnostics available through existing diagnostic surfaces without promoting a transient network failure into a modal interruption.
- Platforms on which automatic updates are deliberately disabled do not show misleading progress or controls. Phase 4 does not change the unsigned macOS delivery policy.

## Persistence and Recovery

Persist at minimum:

- Branch ID, product-visible title, internal Git ref, worktree path, parent branch, fork revision, fork message when applicable, lifecycle state, and created time.
- Per-branch active and selected revision pointers.
- Per-branch draft, attachments, reply reference, generation selection, layout, preview page, viewport, and queue state.
- Branch message ownership plus immutable inherited-conversation relationships.
- Provider-session identity per branch where the adapter supplies one.
- Message reply IDs and replay/fork provenance.
- Attached branch IDs, execution-time commits, conversation cutoffs, and any disclosed context summary.
- Combination source, destination, captured commits, prompt, provider selection, lifecycle, fallback stage, diagnostics, validation, result revision, and merge commit.
- Manual-resolution and application locks.
- Update download state exposed by the updater while the current application session is running.

Recovery requirements:

- Restart reconstructs and validates every worktree association before permitting generation.
- Missing or stale linked-worktree administration triggers a bounded repair path using managed paths; it never silently creates an unrelated branch.
- Jobs running at shutdown become interrupted under the existing queue policy and remain associated with the correct branch.
- An interrupted combination restores or resumes only from a recorded safe stage. It must never guess whether an unrecorded working tree is valid.
- Manual-resolution state survives restart with Check resolution and Abort combination available.
- The last-open design, branch, selected revision, and complete branch workspace state restore deterministically.

## Security and Integrity

- All branch, worktree, ref, message, comparison, and combination IPC payloads use narrow runtime-validated contracts.
- Renderer input never supplies an arbitrary filesystem path, Git ref, executable, editor command, or commit ID as authority.
- Product IDs resolve to paths, refs, commits, and allowed editors in the privileged main process.
- Every destructive operation re-resolves the exact managed design and branch and rejects `Main`, foreign paths, shared roots, or mismatched worktree metadata.
- Worktree removal uses Git's lifecycle command before any bounded filesystem cleanup. Never recursively delete a computed path that has not been resolved inside the exact design branch directory.
- Comparison is read-only. Combination may modify only the destination worktree through application orchestration.
- The source read-only rule remains an instruction-only limitation under provider-owned harnesses and must be described honestly.
- Two-parent combination commits are constructed from independently verified source and destination commit IDs and the validated destination tree. The provider cannot choose parents.
- Branch attachments expose only explicitly selected managed design branches and their bounded conversation context.
- Generated preview isolation is unchanged for branch previews and comparisons.

## Accessibility and Error States

Phase 4 provides keyboard-complete, clearly worded behavior for:

- Creating a branch from the composer.
- Understanding branch mode without relying on hover or color.
- Switching branches and opening Manage branches.
- Accessing message quick actions through keyboard focus.
- Selecting one or several provider/model selections for Fork.
- Attaching several branch contexts and removing them before submission.
- Viewing a stale or unavailable branch attachment.
- Comparing branches with unmatched pages or unavailable renders.
- Requesting and identifying an AI-generated comparison summary.
- Running, waiting for, retrying, manually resolving, or aborting a combination.
- Confirming permanent branch removal.
- Returning from a historical revision to the branch head.
- Seeing an outdated project-definition warning in the selected workspace.
- Understanding update download, ready, blocked, and retry states.

Status never relies on color alone. Lineage, menus, dialogs, quick actions, comparison pages, and editor recovery work with keyboard alone, visible focus, both themes, forced colors, smaller supported windows, and 200% zoom.

## Implementation Sequence

### Track A: Branch and Worktree Foundation

1. Add branch, branch-conversation, combination-attempt, reply, context-reference, and per-branch workspace schemas with forward-only migrations.
2. Migrate every design to protected `Main` without rewriting revisions.
3. Add a narrow design-repository worktree manager using stable internal IDs, machine-readable discovery, repair, and safe removal.
4. Move revision, preview, export, definition-application, and queue resolution from design-global heads to branch heads.

### Track B: Branching and Conversation UX

1. Add the composer branch selector, complete restoration, and simple statuses.
2. Add ordinary composer separate-branch mode and automatic branch titles.
3. Add message hover/focus actions, Reply, and message-level Fork.
4. Add multi-provider/model Fork fan-out and concurrent per-branch orchestration.
5. Add manual branch-context attachments, execution-time resolution, and disclosed summarization.

### Track C: Lineage and Comparison

1. Add branch/fork lineage with revisions revealed on demand.
2. Add paired isolated renders, multi-page matching, and unmatched-page states.
3. Add explicit provider-backed comparison summaries and stale-head detection.
4. Add permanent branch removal and successful removed-source representation.

### Track D: Combination and Recovery

1. Add durable branch locks and intelligent destination-only combination.
2. Create validated two-parent commits without invoking Git merge on the primary path.
3. Add conventional Git merge plus agent resolution fallback.
4. Add default-editor opening, Check resolution, Abort combination, restart recovery, and source-removal prompt.

### Track E: Trusted-Application Refinements

1. Hide definition controls and warnings for standalone designs; adapt definition application to divergent branch worktrees.
2. Move updater progress into the sidebar footer with percentage, Update, blocked, and Retry states.
3. Add Copy and the later Phase 4 Read aloud message action with complete accessibility coverage.

Each track lands in small, testable commits. Track A precedes production branch UI. Comparison may land before combination. Read aloud deliberately follows the critical branching and recovery journey but remains required for Phase 4 completion.

## Acceptance Criteria

Implementation status: complete on `codex/feature/phase-4-foundation`. Requirement-to-evidence mapping and verification results are recorded in `docs/PHASE_4_RELEASE_AUDIT.md`.

### Branch Foundation

- Every existing and new design has one protected `Main` branch after migration.
- Every alternative branch owns a persistent linked Git worktree for its lifetime.
- Restart validates and restores branch-to-worktree associations and complete per-branch workspace state.
- Branch creation is immediately visible with a collision-safe provisional title; provider-backed naming may replace it once, after which the title is immutable.
- `Main` cannot be renamed or removed through UI, IPC, or persistence calls.
- Permanent removal safely removes only the selected managed branch and worktree after confirmation.

### Creation, Conversation, and Concurrency

- The ordinary composer continues the current branch by default and clearly identifies explicit separate-branch mode.
- A branch can be created only by submitting a prompt from a head, except message-level Fork.
- Forking any user prompt replays its complete context from the immediately preceding revision.
- One Fork may select several provider/model selections and produces one independent child branch per selection.
- A failed first generation leaves a visible retryable/removable branch.
- Each branch queue is sequential while separate branches run concurrently under the global limit.
- Branches have independent provider continuation state and cannot cross-contaminate conversations.
- Reply to one user or agent message persists an exact reference while generation continues from the current head.
- Several attached branches resolve to their latest execution-time folders and conversations, and oversized context is summarized with disclosure rather than silently truncated.

### Navigation and Lineage

- The composer branch selector switches existing directions, exposes prompt-led **New branch**, and removes the need for a dedicated branch workspace row.
- Switching branches restores selected revision, draft, attachments, settings, layout, preview state, and queue state.
- Lineage shows branches, fork points, successful combinations, and simple statuses with revisions available on demand.
- Failed combinations do not appear as lineage nodes.
- A removed source appears only when Git ancestry and stored combination evidence support it.

### Comparison and Combination

- Two branch heads can be compared through corresponding isolated page renders.
- Multi-page comparison identifies pages found in only one branch.
- AI summary runs only after explicit request and is labeled as generated interpretation.
- A changed head makes prior comparison evidence stale.
- Combination clearly identifies source and destination and works with or without optional user guidance.
- Source and destination reject new generation while combination or manual resolution is active.
- The primary attempt edits only the destination, does not invoke Git merge, validates independently, and creates one two-parent destination revision on success.
- Failure restores the destination before starting the Git merge plus agent-resolution fallback.
- A second failure offers default-editor recovery, Check resolution, and Abort combination.
- Check resolution cannot commit unresolved or invalid files.
- Abort returns the destination exactly to its pre-combination head.
- Success preserves the source, advances only the destination, records complete evidence, and asks whether to remove the source.

### Definitions, Updates, and Message Actions

- Standalone designs show no Definitions button, setup prompt, version warning, or application action.
- Project-associated branches retain their applied definition version and warn only inside the selected workspace when behind.
- Copy and Reply are accessible on applicable messages through pointer and keyboard.
- Read aloud works on user and agent messages before Phase 4 is declared complete.
- Enabled automatic-update platforms show background download percentage in the bottom-left sidebar.
- Download completion replaces progress with Update; one safe click installs and restarts without another confirmation.
- Active generation, combination, or manual resolution prevents restart and explains the blocker without scheduling a surprise restart.
- Download failure offers Retry in the same location.
- Platforms with automatic updates disabled show no misleading updater controls.

### Security and Quality

- Branch and worktree IPC rejects forged IDs, refs, paths, commits, editor commands, cross-design access, and `Main` removal.
- Worktree migration, repair, clean removal, dirty removal confirmation, and restart recovery have integration coverage on Windows and macOS.
- Provider prompts and tests preserve the honest instruction-only source write boundary.
- Combination commit parents and destination tree come from independent Git evidence rather than agent claims.
- Branch comparison and preview preserve the accepted isolated iframe policy.
- Component tests cover branch strip, lineage, quick actions, Reply, Fork fan-out, context attachments, comparison, combination recovery, definition visibility, and updater states in both themes and with keyboard input.
- A Playwright Electron journey covers Main migration, prompt branching, provider fan-out, concurrent work, restart, branch switching, context attachment, comparison, intelligent combination, source retention/removal decision, and export of the selected branch and revision.
- A second recovery journey covers failed intelligent combination, Git fallback, manual editor state, Check resolution or Abort, and restart safety.
- `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, and `git diff --check` pass before Phase 4 is declared complete.

## External References

- [Git worktree documentation](https://git-scm.com/docs/git-worktree)
- [Git commit-tree documentation](https://git-scm.com/docs/git-commit-tree)

## Specification Change Rules

- New Phase 4 behavior must update this document and its acceptance criteria.
- Branching must remain prompt-led; empty branch management or low-level Git UI requires an explicit product decision.
- Provider configuration work must not return to Phase 4 without an explicit roadmap decision.
- Worktree isolation, immutable revision history, local-first operation, and generated-preview isolation may not be weakened for convenience.
- The source worktree's instruction-only write boundary must not be presented as enforceable until provider infrastructure actually enforces it.
- Project definitions remain project-owned even though divergent branch worktrees retain and apply versions independently.
