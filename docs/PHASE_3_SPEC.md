# OmniDesign Phase 3 Product Specification

## Status and Authority

This document defines the intended Phase 3 product behavior for OmniDesign. It is subordinate to the product principles in `AGENTS.md`, the accepted technical decisions in `ARCHITECTURE.md`, and the trusted-interface rules in `DESIGN_SYSTEM.md`.

Phase 3 implementation must remain local-first, preserve immutable design history, and preserve the generated-preview security boundary. Phase 3 is complete only when the acceptance criteria in this document are implemented and tested.

The product owner defined this contract on 2026-07-27. Provider API keys, multiple provider configurations, provider setup/testing, and an OmniDesign-owned provider harness are explicitly excluded. They are deferred to a future provider-infrastructure milestone with no assigned phase. Phase 3 continues using the installed, authenticated Codex and Claude CLI harnesses already supported by OmniDesign. These provider-owned harnesses receive the original linked project and existing design repositories directly; OmniDesign does not make disposable or safety copies. Their current read-write access is an explicitly accepted temporary limitation.

## Outcome

Phase 3 adds two connected capabilities:

1. A project can own structured design definitions that guide new designs and can be propagated safely to existing designs.
2. A user can select one source-authored element in a focused preview, enter feedback in a trusted popup anchored beside that element, and either fix it immediately or queue several spatially marked comments for one coordinated AI update.

AI-directed work remains the primary editing workflow. Project definitions provide durable, high-level control; focused selection makes a conversational request more precise without becoming a pixel editor or general DOM inspector.

## Scope

### Included

- Structured project-level definitions for colors, typography, spacing, shape, visual guidance, and AI Agent instructions.
- AI-assisted definition proposals from a linked project or existing OmniDesign designs.
- Manual definition entry and editing.
- A dismissible missing-definitions prompt with a per-project permanent-hide option.
- Versioned definition changes and per-design decisions about applying them.
- Applying a pending definition version to one design or all pending designs in the project.
- Deterministic CSS-variable and other programmatic updates when they can satisfy a definition change safely.
- Normal AI generations for definition changes that require interpretation or structural edits.
- Single-element selection in Focused preview mode.
- Exact repository-relative file and line-range context for source-authored selections.
- A nearest-authored-ancestor fallback for elements created dynamically at runtime.
- Focused edits that may update supporting CSS or JavaScript outside the selected element when required.
- A persistent per-design focused-feedback queue and one-generation batch submission.
- Trusted, semi-transparent element-thread markers positioned beside their source elements, with pending and submitted focused feedback revealed chronologically on hover or keyboard focus.

### Deferred

- API-key providers and direct provider HTTP API integrations.
- An OmniDesign-owned provider harness.
- Multiple configurations or accounts for one provider.
- Provider setup, credential storage, and automatic configuration testing.
- Enforceable external-root write denial that requires replacing or materially extending provider-owned harness behavior. Direct read-write repository access is accepted for now; revisiting that access remains part of the future provider-infrastructure milestone.
- Simultaneous multiple-element selection or range/lasso selection. A user may still queue comments for individually selected elements one at a time.
- Selection in Canvas preview mode.
- Pixel-level controls, direct style handles, drag-to-layout editing, or a general developer-tools inspector.
- Editing generated HTML directly inside OmniDesign.
- Replacing the existing provider conversation-resumption model.

## Project Design Definitions

### Ownership and Storage

- Definitions belong to a project, not to an individual design.
- Linked-project definitions live in OmniDesign-managed application storage. OmniDesign never writes them into the linked source project.
- Definition data is structured, versioned, runtime-validated, and stored locally.
- Each saved change creates a new immutable definition version and advances the project's current-definition pointer.
- A design records the definition version it has applied or explicitly kept. This state survives navigation and restart.
- Restoring or viewing an old design revision must render with the definition values captured by that revision, not silently adopt the project's newest values.

### Definition Sections

The initial editor contains:

- **Colors:** named semantic roles and CSS-compatible values, with optional short role descriptions. Prefer names such as `primary`, `surface`, `text`, and `muted` over literal palette names.
- **Typography:** named text roles with font family, size, weight, line height, and letter spacing where applicable.
- **Spacing:** a named spacing scale expressed in CSS-compatible lengths.
- **Shape:** named radius, border-width, and related shape values.
- **Visual guidance:** concise freeform direction that cannot be represented accurately as tokens, such as density, composition, imagery, or interaction character.
- **AI Agent instructions:** project-specific instructions supplied with the initial prompt for each newly created design.

Names must be unique within their section, stable when values change, and suitable for conversion to CSS custom-property names. The editor validates names and values before saving while preserving clear field-level recovery messages.

AI Agent instructions are not automatically repeated on ordinary follow-up or focused-edit prompts. The existing provider thread is resumed and already contains the initial instructions. Structured definitions remain available through the design's applied theme artifacts and generation context.

### Missing-Definitions Prompt

When a project has no saved definitions, OmniDesign may offer setup on any relevant project or design surface. The prompt is contextual rather than tied only to project creation or the first design.

- Do not show it more than once for the same project in one application session unless the user explicitly opens definition setup.
- Do not interrupt an active generation or replace unsaved user input.
- Actions are **Set up now**, **Not now**, and **Don't show again for this project**.
- The permanent-hide choice persists per project and suppresses automatic prompts indefinitely.
- Hiding the prompt never disables definitions; setup remains available from the project page and a design-workspace shortcut.
- Clearing all definitions does not erase the permanent-hide preference.

### Setup Paths

Definition setup offers all three paths:

1. **Generate a proposal.** Use an available installed CLI provider to inspect the original linked project, existing OmniDesign design repositories, or both directly. Do not create copies. The proposal prompt tells the provider not to modify files, while the provider-owned harness retains read-write access for now. If no usable source or provider exists, explain why this path is unavailable.
2. **Fill in manually.** Open the structured editor with empty sections.
3. **Continue without definitions.** Close setup without blocking design creation or other project work.

An AI-generated proposal is always reviewable and editable. It is not saved, propagated, or treated as authoritative until the user confirms it. The setup UI makes clear which local project context and installed provider will receive the analysis request.

### New Designs

- A new design begins with the project's current definitions when they exist.
- OmniDesign materializes programmatic tokens in ordinary design working files that remain compatible with preview, history, and export.
- The initial agent prompt contains the structured definitions and AI Agent instructions, and asks the agent to use the materialized tokens consistently.
- Creating a design without definitions remains supported.
- A permanently hidden prompt does not prevent the user from creating designs without definitions.

### Editing and Versioning

Saving definitions creates a new project-definition version immediately. It does not mutate existing completed design revisions.

For every non-trashed design whose recorded definition version is older than the new version, OmniDesign creates a persistent pending decision. On that design the user can:

- **Apply to this design.** Update the design to the pending definition version.
- **Keep current design.** Acknowledge the pending version without changing the design.
- **Apply to all pending designs.** Apply the newest definition version to every eligible pending design in that project.

The decision behaves like the existing post-move “Adapt design / Keep current design” notice: it persists across navigation and restart until resolved. A newer definition save supersedes any older unresolved target, while retaining enough version history to explain the change.

“Keep current design” is an explicit exemption for that definition version. It does not change historical revisions, and it does not remove the design from decisions created by later definition versions.

### Applying Definitions

OmniDesign chooses the narrowest reliable application mechanism:

1. Use deterministic changes for exact token-value updates when the design uses the corresponding managed CSS variables or another safely recognized programmatic representation.
2. Use the existing AI generation pipeline when the change requires interpretation, structural work, migration from literal values, or updates driven by visual guidance or AI Agent instructions.
3. If deterministic application can perform only part of the requested update, do not report the design as synchronized. Complete the remaining work through AI or keep the decision pending with an actionable explanation.

Every changed design produces a normal validated revision with a clear system-authored reason such as “Apply project definitions version 4.” Git remains the source of truth for changed files. No revision is created when files do not change, but the resolved definition state is still recorded.

AI application defaults to the design's most recently used available provider, model, and effort. If those are unavailable, the decision remains pending and the UI asks the user to choose from the existing installed-provider options.

“Apply to all” submits independent per-design work through the existing queue. Per-design sequential ordering, cross-design concurrency, cancellation, failure, and restart recovery continue to apply. One failure does not roll back successful designs or erase their revisions; failed and unavailable designs remain pending with diagnostics.

### Programmatic Theme Contract

- Prefer regular CSS custom properties for portable runtime tokens.
- Preserve semantic names rather than encoding literal values into component-specific names.
- Tailwind utilities may consume those properties, but the exported design must not require Tailwind at runtime.
- The applied theme representation must be captured in each design revision so history, offline export, and restoration are deterministic.
- Programmatic rewriting is allowed only when OmniDesign can identify the managed representation unambiguously. It must not perform broad search-and-replace across agent-authored files.
- Existing designs that do not yet use managed variables require an AI-assisted migration before deterministic propagation can be claimed.

## Focused Element Editing

### Entry and Mode

- Element selection is available only for the current head revision in Focused preview mode.
- Activating selection from Canvas mode opens the chosen page in Focused mode before selection begins.
- A preview-toolbar control enters selection mode. Escape exits without selecting.
- While selection mode is active, pointer activation is used for inspection: authored clicks, navigation, submission, and other page actions are suppressed.
- Hover and keyboard focus expose a restrained outline and a concise semantic label without restyling the design itself.
- Selecting one element exits selection mode and opens a compact trusted feedback popup immediately above or below the selected element, collision-fitted within the preview pane.
- The popup owns its own feedback draft so the ordinary conversation composer remains unchanged. It shows the exact target, focuses its multiline field, closes with Escape, and exposes two explicit actions: **Submit & fix** sends that one edit immediately, while **Queue** stores it for a later batch.
- Popup placement uses a bounded element rectangle reported by the injected shim only as presentation data. Authoritative target identity still comes exclusively from the privileged immutable source map.

The live selection is ephemeral. It clears after immediate submission, queueing, page or revision changes, leaving the design workspace, or application restart. The user can clear it explicitly before submission. It is not restored as draft state. Queued and submitted focused comments and their trusted resolved targets are durable records rather than live selection state.

### Source Mapping

For source-authored HTML, the attached target contains:

- The current design and revision identifiers.
- The repository-relative HTML file path.
- The exact inclusive start and end line of the selected element in that revision.
- A concise semantic label and stable `data-od-*` identifier when one exists.
- A bounded source excerpt sufficient to disambiguate the target.

The agent-facing request explicitly identifies the target as `relative/path.html:start-end` and states that supporting CSS or JavaScript may be changed when necessary while the requested outcome remains focused on that element.

Line ranges are computed from the immutable source for the selected revision, never from serialized live DOM. Runtime DOM changes therefore cannot falsify the source location.

### Dynamic Elements

If the selected node was created or replaced dynamically and has no literal source range:

- Resolve to the nearest source-authored ancestor.
- Show the user that the ancestor is the actual edit target before submission.
- Include the ancestor's exact file and line range plus a bounded description of the dynamic descendant that was clicked.
- If no authored ancestor can be resolved, do not attach a target; explain that the element cannot be mapped reliably.

### Trust Boundary

Focused selection extends the existing injected preview shim and validated `postMessage` channel; it does not add a preload bridge, Node.js access, same-origin access, or privileged IPC to generated code.

- The iframe reports an opaque location identifier and bounded presentation metadata.
- The trusted side accepts selection messages only from the active registered preview frame and validates message shape and size.
- The privileged workspace resolves the opaque identifier against the registered immutable revision and returns only a validated repository-relative file and line range.
- File paths, line numbers, revision identifiers, and source excerpts claimed directly by generated code are never trusted.
- Selection messages cannot request arbitrary files or read outside the selected design revision.
- Element rectangles and marker positions are non-authoritative visual hints. The trusted renderer accepts them only from the active registered frame and only for opaque identifiers it already expects.

### Prompting and History

- A focused target augments an ordinary user prompt; it does not create a separate conversation or provider session.
- **Submit & fix** preserves the original user wording in the conversation, accompanied by a compact target reference.
- **Queue** adds the comment and exact target to a bounded durable queue. A compact conversation-side summary retains the batch-level **Fix all** action, while each source element has one semi-transparent thread marker above or below it in the focused preview.
- Hovering a marker or moving keyboard focus to it reveals that element's submitted focused-edit history and pending comments in chronological order. Pending comments remain removable; submitted history is read-only. Markers follow their elements as the preview scrolls or reflows and survive navigation and restart.
- Across revisions, a historical thread is re-anchored only when the privileged source map finds one unique match on the same page by stable `data-od-*` identity or by unchanged label and source excerpt. If no unique match exists, the submitted record remains in conversation history without guessing a preview anchor.
- **Fix all** atomically converts the selected queue items into one user message and one generation attempt. The provider receives every comment and exact target in a single coordinated turn, and successful generation creates at most one new revision for the batch.
- Submitted batch history lists every original comment and its exact target reference. Retry and Continue preserve the whole batch.
- A newly created revision invalidates and clears any still-pending focused-feedback queue because its source ranges belong to the previous immutable revision.
- The agent may modify supporting styles, scripts, shared components, or adjacent markup when necessary.
- Normal Git change detection, validation, repair, cancellation, queueing, and revision creation apply.
- Focused prompting from a historical revision remains disabled until the user restores that revision to a new head.

## Trusted UI

- Add a project-level Design definitions entry on the project page and a shortcut from the design workspace.
- Use the existing OmniDesign modal, field, button, banner, and accessible custom-selection primitives.
- Do not introduce browser-default selects, gradients, excessive cards, or a feature-local overlay system.
- The definition editor must remain usable with keyboard alone, at smaller supported windows, at 200% zoom, in both themes, and in forced-colors mode.
- Selection outlines and labels must remain visible without relying on color alone and must not be included in screenshots, thumbnails, exports, or authored files.
- Status text distinguishes current, pending, applying, kept, failed, and unavailable states.

## Persistence and Recovery

Persist at minimum:

- Definition versions and the current version per project.
- Structured section contents and AI Agent instructions.
- Per-project missing-prompt suppression.
- Per-design applied, kept, and pending definition-version state.
- Definition-application attempts, diagnostics, provider/model choice when AI is used, and resulting revision pointers.
- Resolved focused-target metadata on submitted messages and generation attempts.
- Pending focused-feedback queue items, including their original comments, order, revision, exact source targets, and creation times.
- The stable opaque source-location identifier needed to restore trusted marker placement for the same immutable revision.
- Submitted focused-feedback batches on their conversation messages and generation attempts.
- The per-element thread view is derived from submitted message metadata plus pending queue records; it does not create a second persistence model or provider conversation.

Definition editing drafts may remain renderer-owned in the first slice, but a saved version and every pending decision must survive restart. Active definition-application jobs recover through the existing interrupted-job behavior.

## Accessibility and Error States

Phase 3 provides actionable behavior for:

- No definitions and an automatically hidden prompt.
- No source material from which AI can propose definitions.
- No installed provider available for proposal or interpretive application.
- Invalid token names or CSS values.
- A definition version saved while designs have active or queued work.
- Partial “Apply to all” success.
- A design that cannot be migrated programmatically.
- A selected dynamic element mapped to an ancestor.
- A preview node that cannot be mapped to source.
- A stale selection after revision or page state changes.
- A focused generation that completes without changing files.

Important state changes are announced without turning hover movement into noisy live-region output. Selection remains keyboard operable and does not trap focus inside the untrusted frame.

## Implementation Sequence

### Track A: Definition Foundation

1. Add versioned definition schemas, persistence, migrations, and narrow IPC.
2. Add the project editor, manual setup, missing-definitions prompt, and permanent suppression.
3. Materialize semantic CSS variables for new designs and include definitions plus AI Agent instructions in initial prompts.
4. Add AI-assisted proposals using the existing installed-provider gateway.

### Track B: Definition Propagation

1. Add per-design pending/applied/kept state.
2. Implement deterministic managed-token updates with Git-backed revisions.
3. Fall back to normal AI generation when interpretation is required.
4. Add per-design and apply-to-all queue UX, failure handling, and restart recovery.

### Track C: Focused Editing

1. Build immutable HTML source maps at preview registration.
2. Extend the isolated shim and trusted message validation for hover, selection, and opaque-location resolution.
3. Add Focused-mode overlays, composer target attachment, clearing rules, and accessible keyboard behavior.
4. Persist resolved target context and integrate it into ordinary agent prompts.
5. Cover dynamic-element fallback, historical-mode behavior, and multi-page paths.

Each track lands in small, testable commits. Track C may be prototyped while Track B is underway, but the accepted contract and security tests must precede production UI wiring.

## Acceptance Criteria

### Definitions

- A user can manually create and edit every structured section.
- A user can generate, review, edit, and accept a proposal from linked-project or existing-design context.
- Missing definitions trigger the specified contextual prompt, and “Don't show again” survives restart without hiding manual access.
- Every new design uses the current materialized definitions and receives AI Agent instructions in its initial prompt.
- Saving a new definition version creates a persistent decision for each affected design.
- A user can apply or keep the version per design and can apply it to all pending designs.
- Exact managed-token changes use deterministic updates when safe; other changes use the existing AI generation pipeline.
- Every changed result passes ordinary validation and creates an immutable design revision.
- History and offline exports retain the definition state that belonged to their selected revision.
- Partial bulk failure is recoverable and does not corrupt or roll back successful designs.

### Focused Editing

- In Focused mode, a pointer or keyboard user can select one element and see a clear target attachment.
- Canvas activation opens the page in Focused mode before selection.
- A source-authored selection resolves to the exact repository-relative HTML file and inclusive line range.
- A runtime-generated element resolves to the nearest authored ancestor or produces a clear unmappable state.
- Submitted target metadata survives in conversation and attempt history while the live selection clears.
- A selected target opens a collision-fitted trusted feedback popup beside the element with **Submit & fix** and **Queue** actions.
- Each element's pending and submitted focused comments appear as one subtle anchored thread marker, reveal their chronological content on hover and keyboard focus, keep only pending items removable, and survive restart.
- Historical threads follow uniquely matched stable identities or unchanged source into the displayed revision and never attach through fuzzy or ambiguous matching.
- **Fix all** sends every queued comment and exact target in one provider turn and creates one generation attempt rather than one attempt per comment.
- Submitted batch history and Retry/Continue retain every comment and exact target in order.
- A revision change cannot apply stale queued source ranges.
- The existing installed provider thread receives the focused target without starting a separate conversation.
- Supporting CSS and JavaScript changes are permitted and validated through the normal pipeline.
- Switching page, revision, workspace, or submitting clears the live target.
- Historical revisions cannot be edited until restored non-destructively.

### Security and Quality

- Generated code cannot forge a file path, line range, revision, or arbitrary source read through the selection channel.
- Preview selection adds no preload, Node.js access, same-origin permission, or generic IPC.
- Source-location and message contracts have malformed, stale, oversized, and cross-revision tests.
- Persistence migrations and restart recovery have integration coverage.
- Critical definition and focused-edit interactions have React coverage in both themes and with keyboard input.
- A Playwright Electron journey covers definition setup, a definition update decision, exact focused selection, generation, revision creation, restart, and recovery.
- `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` pass before Phase 3 is declared complete.

## Specification Change Rules

- New Phase 3 behavior must update this document and its acceptance criteria.
- Provider configuration work must not return to Phase 3 without an explicit product-owner roadmap decision.
- Preview isolation, immutable history, and local-first operation may not be weakened for convenience. The accepted direct read-write provider access may change only through an explicit product-owner decision or the future provider-infrastructure work.
- Direct manipulation, multi-selection, and later-phase branching remain deferred unless explicitly moved into scope.
