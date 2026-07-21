# OmniDesign Phase 1 Product Specification

## Status and Authority

This document defines the intended Phase 1 product behavior for OmniDesign. It is subordinate to the product principles in `AGENTS.md` and the accepted technical decisions in `ARCHITECTURE.md`. Where this document describes a user-visible outcome without prescribing an implementation, the implementation must preserve the architecture's security, local-first, portability, and testing requirements.

The trusted application UI must also follow `DESIGN_SYSTEM.md`, including its custom-control, visual-composition, iconography, and accessibility rules. Those rules do not automatically constrain the visual language of AI-generated designs.

Phase 1 is complete only when the full acceptance criteria in this document are met. The walking skeleton is an earlier engineering milestone and is not itself Phase 1 completion.

## Phase 1 Outcome

Phase 1 delivers a Windows desktop application in which a user can:

1. Configure a supported AI provider.
2. Create a standalone design or associate a design with a local software project.
3. Prompt Codex or Claude to generate a single-page, minimally interactive HTML design.
4. Watch generation progress, continue using other parts of OmniDesign, and queue follow-up prompts.
5. Preview the generated design in an isolated Chromium context.
6. Iterate conversationally while preserving completed revisions.
7. Restore earlier revisions without destroying later history.
8. Close and reopen OmniDesign without losing projects, designs, conversations, drafts, layout state, or history.
9. Export the selected design revision as a ready-to-open offline ZIP.

Phase 1 supports basic multiple-design organization within a project. Multiple conversations per design, visible design branching, and multi-provider comparison are deferred.

## Product Principles Applied to Phase 1

- AI-directed iteration is the primary editing workflow.
- Generated designs are single-page, minimally interactive HTML artifacts.
- Designs associated with existing projects use that project's design language and relevant development context.
- Standalone designs remain independent from user-selected source projects.
- Users can change provider and model on every prompt.
- OmniDesign remains useful for browsing, previewing, restoring, and exporting existing work when no provider is available.
- Source projects and referenced attachments are read-only to OmniDesign's generation process in Phase 1.
- Completed history is non-destructive.
- Generated code never receives privileged application access.
- The local, open-source workflow does not require an OmniDesign-hosted service.

## Phase Boundaries

### Included in Phase 1

- Windows application packaging and testing.
- Real Codex and Claude integrations, informed by the supplied reference implementation.
- A mock provider for development and automated testing.
- Multiple configured providers and multiple configurations of the same provider.
- Provider and model selection on every composer.
- Standalone project containers and linked local-folder projects.
- Cloning a remote Git repository through the installed `git` command.
- Basic multiple-design support within a project.
- One conversation per design.
- One page per design.
- Text, image, PDF, file, source-code, and folder prompt attachments.
- Background generation, cross-design concurrency, and per-design prompt queues.
- Immutable completed revisions, restoration, interruption recovery, and offline export.
- Docked, hidden, conversation-only, preview-only, and popped-out preview layouts.

### Deferred Beyond Phase 1

- Multiple conversations per design.
- Visible branching, merging, branch comparison, and running one prompt through multiple providers or models.
- Editing or resubmitting an earlier prompt.
- Multiple pages per design.
- Full project and design library capabilities such as search, filtering, folders, tags, and advanced organization.
- Persistent, AI-extracted project design profiles and editable project-level tokens.
- Automatic project analysis during import.
- Focused element selection and focused editing tools.
- Preview viewport presets, custom dimensions, zoom controls, and design-tool overlays.
- Progressive preview updates while a revision is being generated.
- macOS and Linux packaging and release qualification.
- Automatic application updates.
- Custom or integrated application title-bar chrome.
- Telemetry and crash reporting.
- Hosted collaboration and cloud-only features.

The application architecture must remain cross-platform even though Phase 1 is released and qualified on Windows first.

## Terminology and Data Model

### Project

A project is OmniDesign's top-level container for designs. A project has one of two kinds:

- **Linked project:** References a user-selected local folder, including a folder cloned from a remote Git repository. The source folder remains outside OmniDesign storage and is read-only to generation.
- **Standalone project:** An internal container created automatically for a standalone design. It has no source-project association and remains independent.

Both kinds appear in project navigation and recent items. A standalone project's initial title matches its initial design title. Project display names are editable in OmniDesign without renaming source folders.

### Design

A design belongs to exactly one project. Each Phase 1 design has:

- One editable title.
- One single-page generated artifact.
- One continuous conversation.
- One ordered history of completed revisions.
- Zero or one active generation job.
- Zero or more queued prompts.
- Saved draft composer state.
- Saved layout state.
- A thumbnail representing its latest completed active revision.

Design working files live in OmniDesign-managed storage, never inside the linked source project.

### Conversation and Message

A Phase 1 design has exactly one conversation. It contains user prompts, provider responses, generation progress, tool activity, validation results, errors, usage information, and interrupted attempts. Messages are preserved even when no design revision is created.

### Generation Attempt

A generation attempt begins when a prompt starts executing and ends in one of these states:

- Completed with a changed, valid revision.
- Completed without design changes.
- Failed.
- Cancelled.
- Interrupted by application shutdown or crash.

Partial responses, partial working files, errors, and diagnostics are retained for failed, cancelled, and interrupted attempts so the provider can continue or the user can retry.

### Revision

A revision is an immutable, completed design snapshot created only when design files changed. A revision records at minimum:

- Timestamp.
- Originating prompt.
- Provider configuration and model.
- Resulting design snapshot.
- Validation outcome and warnings.
- Parent revision.

The user-visible revision list is linear in Phase 1. Restoration never deletes later revisions.

### Provider Configuration

A provider configuration represents one usable connection to a provider. Multiple configurations may exist for one provider, such as separate accounts or an installed subscription and an API-key configuration. Secrets must use operating-system credential storage when persistence is required.

## Global Application Shell

The Phase 1 shell contains:

- A persistent project sidebar.
- A main content area for home, project grids, and design workspaces.
- Global navigation for Home, active generations, provider settings, general settings, trash, and diagnostics.
- An active-generation badge showing the number of currently running jobs.

The application starts in its dark theme by default. General settings provide an explicit light-theme option, and the selected theme persists across restarts. Theme changes affect only the trusted OmniDesign interface and never restyle a generated design preview.

Provider settings must be functional. General settings, trash, and diagnostics expose the behavior required by this specification; unrelated settings may remain clearly labeled stubs during Phase 1.

## Home and Launch Experience

OmniDesign always opens to the home experience unless application restoration policy explicitly returns the user to a previously open design window.

### Home Layout

- The persistent left sidebar lists all linked and standalone projects, ordered by most recent activity.
- The center of the page contains a prominent new-design prompt composer.
- The composer contains a project selector. Leaving it empty creates a standalone project and design.
- The composer contains provider-configuration and model selectors.
- Below the composer, the three most recently active entries are shown. Recent entries may be linked projects or standalone projects.

Phase 1 does not require project or design search and filtering.

### No Provider Configured

The normal home interface remains visible when no provider is configured.

- Prompt entry and submission are disabled.
- A prominent action opens provider setup.
- Existing projects, designs, conversations, previews, history, trash, and exports remain accessible.
- Importing or opening projects remains available.

### Creating a Design

When the user submits a new-design prompt:

1. OmniDesign immediately creates the project container when needed, creates the design record, saves the prompt, and opens the design workspace.
2. The first generation starts in the background.
3. The selected provider generates a title from the prompt.
4. The user can edit the title at any time.
5. If title generation fails, OmniDesign creates an editable fallback title from the first few words of the prompt.
6. If initial generation fails, the empty design and its conversation remain available for Continue or Retry.

For a standalone design, the internal standalone project initially receives the same generated or fallback title as the design.

## Project Creation and Import

### Open Local Folder

- The user selects a local folder.
- OmniDesign remembers the folder association and access across restarts.
- The project display name defaults to the folder name and is editable without renaming the folder.
- Selecting a folder already registered with OmniDesign opens the existing project rather than creating a duplicate.
- Source-project access is read-only for provider tools and generation.

### Clone Remote Git Repository

- The user supplies a remote Git URL and selects a clone destination.
- OmniDesign calls the installed `git` command rather than implementing Git transport or authentication.
- Existing Git credential-manager and SSH configuration are used.
- Standard output, progress, and actionable errors are relayed to the user.
- A successful clone is registered like any other local-folder project.
- Removing the OmniDesign project never deletes the cloned source folder.

### Project Availability

If a linked folder is moved, renamed, disconnected, or otherwise unavailable:

- Its OmniDesign-managed designs still open normally.
- The project displays a clear unavailable-source warning.
- The user may reconnect the project to a folder or convert it to a standalone project.

### Project Context in Phase 1

Phase 1 does not create a persistent extracted project profile during import. Instead, when generating for a linked project, the provider runs with read-only access to relevant project context or receives an explicit reference to the project path. The exact integration must follow the provider reference implementation and preserve the trust boundary.

Persistent AI-assisted project analysis is deferred. A later phase may let users run it during import, choose the provider and model, or leave it pending until a provider is configured. That later analysis must finish before prompts that depend on the extracted profile are enabled.

## Project Page and Design Grid

Opening behavior depends on the number of designs:

- An empty project opens its new-design prompt experience.
- A project with one design opens that design directly.
- A project with multiple designs opens the project page.

The project page contains:

- A new-design composer at the top with the project preselected.
- A grid of design cards below it.
- Cards ordered by most recent activity.

Each design card shows, when available:

- Current thumbnail.
- Editable design title.
- Last-modified timestamp.
- Provider and model used for the latest generation attempt.
- Latest prompt summary or excerpt.
- Current generation or interruption status.

A thumbnail is regenerated after every successful completed generation that produces a revision. Thumbnails must remain synchronized with the corresponding completed design state.

## Design Workspace

### Default Layout

The default workspace is a split conversation layout:

- Conversation feed and composer on the left.
- Live preview on the right.
- A draggable divider resizes the two panels.

The design header contains:

- Editable title.
- Provider and generation status.
- Revision-history dropdown.
- Layout controls.
- Preview visibility and pop-out controls.

### Layout Modes

The user can select:

- Split conversation and preview.
- Conversation only.
- Preview only.
- Preview hidden while the conversation remains available.
- Preview popped into a separate window, leaving the primary workspace available for conversation.

Only one preview surface is open at a time. It is either docked, popped out, or hidden. The hidden preview remains synchronized with completed revisions so reopening it does not require avoidable regeneration work.

### Layout Restoration

OmniDesign saves layout independently for each design and restores it when that design is reopened. Saved state includes all applicable layout choices, including:

- Active layout mode.
- Divider position.
- Preview visibility.
- Popped-out state.
- Relevant window and panel sizing.

The screen position of a popped-out preview window does not need to be restored exactly.

## Prompt Composer

Every composer used for design generation includes:

- Multiline prompt input.
- Provider-configuration selector.
- Model selector.
- Attachment controls.
- Submit control.
- Stop control while work is running.
- Queue visibility when prompts are waiting.

### Keyboard Behavior

- Enter submits.
- Shift+Enter inserts a new line.

### Provider and Model Defaults

- Each prompt may use any configured, currently available provider and model.
- A design defaults to the provider configuration and model used by its most recent prompt.
- The user may change provider or model at any time before submitting.
- The composer provides a shortcut for adding another provider configuration.
- If the selected provider or model becomes unavailable, the draft is preserved and submission is disabled until a usable selection is made.

When the provider reports the information, the composer or completed response shows context limits, actual usage, and actual cost. Phase 1 does not require a pre-submission cost estimate.

### Drafts

Prompt text, selected provider and model, and attachment references are autosaved per design. Drafts survive navigation and application restart.

### Attachments

Phase 1 supports attaching:

- Images.
- PDFs.
- Text and source-code files.
- Other ordinary files supported by the selected provider.
- Folders.

Attachments are referenced in place and are not copied into OmniDesign storage. Provider access is read-only. OmniDesign records enough identity information to warn if an attachment is unavailable or has changed since it was selected. A changed attachment may still be used after warning the user.

## Provider Setup and Availability

### Setup

- Provider setup supports multiple providers and multiple configurations for the same provider.
- OmniDesign automatically tests a configuration during setup.
- A failed test produces a warning and clear diagnostic information.
- Availability and capability reporting come from provider adapters rather than provider-specific UI assumptions.

The precise installed-subscription, discovery, authentication, and API-key mechanisms remain deferred until the reference implementation is examined.

### Removing or Losing a Provider

- Removing a provider configuration never removes existing projects, designs, conversations, revisions, usage records, or exports.
- Existing work remains readable and exportable.
- Draft prompts are preserved.
- New generation requires selecting another available provider configuration and model.

## Generation Lifecycle

### Execution Model

- Every agent-backed design runs in a self-contained Git repository in OmniDesign-managed storage. OmniDesign prepares the repository and its `index.html` entry page before the agent starts.
- The provider harness starts the agent in that design repository. The agent may work on its files as it would on any other project.
- When a design is linked to an existing project, the harness provides that original project as an explicit read-only reference. It is never the design working directory and the agent receives no write authority to it.
- Git detects changed files and records the resulting revision. The agent is not required to produce a changed-file list, and OmniDesign does not derive change detection from an agent report.
- The prepared `index.html` is the fixed preview and export entry page. The agent does not choose or report an entry point.
- After execution, the agent returns a validated JSON completion report. It includes a `response` field containing the agent's conversational reply to the user; a response may be returned without design changes or a new revision. The remaining product-defined fields communicate outcome and useful diagnostics or metadata, and do not contain file inventory or entry-point fields.
- The currently active completed revision remains previewable until a new candidate is complete and passes blocking validation.
- Progressive file-by-file preview updates are deferred.

### Background Work and Concurrency

- Generations continue when the user navigates elsewhere in OmniDesign.
- Different designs may generate concurrently.
- Each individual design has at most one active generation.
- Additional prompts for that design are queued.
- The global badge displays the number of active generations.
- Clicking it opens the active-generations view.

The active-generations view shows:

- Project and design.
- Current stage.
- Elapsed time.
- Provider configuration and model.
- Detailed progress and tool activity.
- Cancel action.

### Prompt Queue

- Queued prompts execute in submission order.
- Each queued prompt runs against the successful result of the preceding prompt.
- Users can inspect and remove queued prompts before they start.
- Phase 1 does not allow editing or reordering queued prompts.
- A failure or cancellation pauses the remaining queue for user intervention.

### Progress Detail

By default, the conversation shows full streamed provider output, tool activity, stages, and validation details. Detailed sections are collapsible. A global setting controls the default detail level so users can choose a more concise presentation.

### Provider Retry

For a transient provider or transport failure:

1. OmniDesign retries automatically up to three times.
2. The user can stop the current request and all remaining automatic retries at any time.
3. After the final failed retry, the job stops, explains what happened, and offers manual Retry.

Provider retry is separate from design self-repair.

### Validation and Self-Repair

Each generated candidate passes through compilation, security, runtime, and quality validation. When errors are found, OmniDesign gives the provider the diagnostics and allows up to three automatic self-repair attempts. The user can stop the repair loop at any time.

If a provider can securely invoke a narrow validation tool during generation, that tool may reduce the need for post-generation repair, but it does not remove final independent validation.

Blocking failures include:

- Compilation or parsing failures that prevent a working export.
- Preview security-policy violations.
- Disallowed privileged access or dependencies.
- Fatal runtime errors that prevent the page from functioning.

Non-blocking findings include accessibility and responsive-layout issues that do not prevent rendering. These appear as warnings and are included in repair context, but they do not prevent activation after repair attempts are exhausted.

If all repair attempts fail:

- The previous valid revision remains active.
- The invalid candidate and its diagnostics remain inspectable.
- No completed revision is created for the invalid candidate.
- The user can Continue, Retry, or submit a corrective prompt as appropriate.

### Completion

When a valid generation changes design files:

- It becomes the active revision immediately.
- A revision and internal history commit are created automatically.
- The preview updates.
- A thumbnail is generated.
- The conversation records validation warnings, provider/model, usage, and cost when available.

No revision is created when the provider response does not change design files. The agent's completion-report `response`, conversation message, and attempt record are still preserved.

### Cancel, Continue, and Retry

The composer Stop action cancels the active provider request, automatic provider retries, and self-repair loop.

On cancellation:

- The previous completed revision remains active.
- Partial provider output, partial files, and diagnostics are preserved outside completed history.
- The prompt queue pauses.

**Continue** asks the same provider session, when supported, to resume using the partial output and files.

**Retry** starts a fresh attempt from the last completed revision. Partial files from the failed attempt are discarded, while its messages and diagnostics remain in the conversation.

### Application Close or Crash

- Closing OmniDesign while generations are active warns that they will be interrupted and requires confirmation.
- Jobs do not continue after application exit.
- On restart, incomplete jobs are marked interrupted.
- The conversation offers Continue and Retry.
- Saved drafts and queued prompts remain available, with queues paused.

### Notifications

When a background generation completes, fails, or requires attention:

- The in-app badge and relevant project/design cards update.
- OmniDesign may send a Windows notification.
- Operating-system notifications can be disabled in settings.

## Project Association Changes

### Matching a Standalone Design to a Project

If OmniDesign detects that a standalone prompt likely belongs to an existing project, it shows a non-blocking notification rather than interrupting generation. The notification identifies the suggested project and offers:

- Associate the design and allow the current generation to continue with the new project context when safe.
- Associate the design, stop the current generation, and restart it using the project context.
- Dismiss the suggestion.

The user can also change project association manually.

### Adapting an Existing Standalone Design

When a standalone design is associated with a project after it already has completed revisions, OmniDesign offers to adapt the design to that project's design language. Adaptation is optional and, when accepted, runs as a normal generation that creates a new revision.

## Preview

### Behavior

- The preview fills its available panel or window.
- Its width can be changed through the workspace divider.
- Phase 1 has no viewport, zoom, fit, or device-preset controls.
- The page is as interactive as its generated HTML, CSS, and JavaScript allow.
- Phase 1 has no element-selection or design-inspector mode.
- Preview UI state such as open dialogs, selected tabs, and form values may reset whenever the revision changes or the preview reloads.

### Isolation

The preview must follow the isolation requirements in `ARCHITECTURE.md`, including no Node.js integration, no application preload bridge, denied navigation and permissions by default, restricted network access, and a restrictive Content Security Policy.

### Synchronization

Selecting a revision or completing generation updates the single preview surface whether it is docked, popped out, or hidden. A hidden preview remains prepared or cached so opening it avoids unnecessary delay.

## History and Restoration

### History UI

Revision history is opened from a dropdown in the design header. Each entry shows:

- Timestamp.
- Originating prompt.

The selected entry fully switches the displayed design and preview to that snapshot.

### Historical Mode

Selecting a non-head revision places the design in historical mode:

- The preview and relevant design files reflect the selected snapshot.
- Export may target the selected snapshot.
- New prompting from that snapshot is disabled until the user explicitly restores it.

### Restore

Restoring an older revision creates a new head revision containing the older snapshot. It does not delete or rewrite any later revision. Prompting can then continue linearly from the restored head.

This behavior provides the outcome the user expects from restoration without using a destructive Git hard reset. Visible branching remains deferred.

### Internal Git History

Each agent-backed design uses one Git repository in OmniDesign-managed storage. The repository is the agent harness workspace and Git is the authoritative mechanism for determining whether agent execution changed the design working tree.

- OmniDesign initializes the repository and prepares `index.html` before execution.
- Users are not required to understand or manage Git.
- Completed changed revisions create commits automatically.
- Restoration is non-destructive and must not rewrite or delete later history.
- Source-project repositories are never nested with or modified by design repositories.
- The design repository may become accessible to advanced users in a later phase.

SQLite remains responsible for application metadata, conversations, job records, revision pointers, diagnostics, and migration-safe queries. The completion report, including its `response` field, is validated and retained with the attempt, but it is not a substitute for Git state.

## Export

Phase 1 exports the currently selected revision as a portable, ready-to-open offline ZIP.

### Export Contents

The archive contains only runtime output needed to open and use the design offline, such as:

- HTML entry page.
- Compiled CSS.
- Pinned local runtime JavaScript when required.
- Page-specific JavaScript.
- Local assets and fonts required by the design.

The archive does not contain:

- The internal `.git` directory or Git history.
- OmniDesign conversation data.
- Provider credentials or configuration.
- Source-project files.
- Intermediate or invalid candidates.
- Editable working sources that are unnecessary for the ready-to-open output.

### Export Flow

1. OmniDesign validates and assembles the ZIP in temporary application storage.
2. When the archive is ready, the user chooses the save location.
3. OmniDesign moves or copies the completed ZIP to that location.
4. Phase 1 does not need post-export actions to reveal the file or open it in a browser.

Export must work without a provider and must not require internet access, Node.js, package installation, or a build step on the recipient's computer.

## Removal, Trash, and Recovery

### Removing a Project or Design

- Deleting a project includes all of its OmniDesign-managed designs.
- Deleting a design affects only that design.
- Linked source folders and cloned repositories outside OmniDesign storage are never deleted.
- If work is actively generating, OmniDesign asks for confirmation, cancels the job, pauses dependent queues, and moves the item to trash.

### Trash

- Deleted projects and designs are recoverable for 30 days.
- Items are purged automatically after 30 days.
- The user may empty trash immediately after confirmation.
- Restoring a project or design restores its internal data and original association when the source folder remains available.
- If the source folder is unavailable, restoration succeeds and offers reconnect or conversion to standalone.

## Empty, Error, Offline, and Recovery States

Phase 1 must provide explicit, actionable UI for at least:

- No provider configured.
- Provider configuration test warning.
- Provider or model unavailable.
- No projects or designs.
- Empty project.
- Initial generation in progress.
- Initial generation failed with an empty design retained.
- Generation queued, retrying, repairing, cancelled, failed, or interrupted.
- Queue paused by a failed or cancelled predecessor.
- Invalid candidate after exhausted repair attempts.
- Linked project folder unavailable.
- Attachment missing or changed.
- Git executable unavailable.
- Git clone authentication, network, destination, or repository failure.
- Preview compilation or runtime failure.
- Export validation, assembly, or destination failure.
- Trash restoration with a missing source association.
- No network connection when the chosen provider requires one.

Error messages preserve technical diagnostics for detailed mode while presenting a concise explanation and next action in the primary UI.

## Accessibility and Interaction Requirements

The OmniDesign application UI must:

- Be fully keyboard navigable for the primary Phase 1 journey.
- Use visible, consistent focus indicators.
- Expose meaningful names and states to assistive technology.
- Meet appropriate contrast requirements.
- Respect reduced-motion preferences.
- Announce generation state changes without overwhelming screen-reader users.
- Make the draggable split divider keyboard operable.
- Avoid relying on color alone for generation, validation, provider, and history status.
- Preserve usable layouts at smaller supported window sizes.

Generated designs are checked for accessibility issues. Such findings are visible warnings in Phase 1 unless they also prevent the design from functioning.

## Persistence and Recovery Requirements

OmniDesign persists locally:

- Projects and source-folder associations.
- Designs and titles.
- Conversations and detailed generation activity.
- Provider-independent generation records.
- Immutable completed revisions.
- Active-revision pointers.
- Interrupted attempts and diagnostics.
- Prompt drafts and attachment references.
- Queued prompts and paused queue state.
- Per-design layout state.
- Thumbnails.
- Provider configuration metadata, excluding ordinary secret storage.
- Trash timestamps and restoration metadata.
- Notification and generation-detail preferences.
- Application theme preference.

Application restart must deterministically recover all completed data and safely mark in-flight work as interrupted.

## Security and Privacy Requirements

- Linked projects and attachments are read-only to provider tooling in Phase 1.
- Design working storage is writable only through the appropriate privileged and provider orchestration boundaries.
- Renderer IPC remains narrow, typed, sender-validated, and runtime-validated.
- Generated previews never receive filesystem, shell, provider, credential, or application IPC access.
- Provider credentials are not stored in project files, design exports, conversation content, or the ordinary SQLite database.
- No telemetry or crash reporting is included in Phase 1.
- The UI makes clear which provider configuration and model receive each prompt and attachment.
- Exported ZIPs contain no private project context unless the generated design deliberately incorporated an asset into its runtime output.

## Walking Skeleton Milestone

Before real provider integration, implement and test one vertical slice with a mock provider:

1. Launch the desktop application.
2. Configure or enable the mock provider in development/test mode.
3. Create a standalone project and design.
4. Submit a prompt and receive simulated streamed output.
5. Generate and compile a representative Tailwind-based single-page design.
6. Render it in the isolated preview.
7. Capture compilation and browser errors.
8. Request one change and create a second revision.
9. Switch revisions and restore the earlier revision non-destructively.
10. Restart and recover the design, conversation, selected revision, draft, and layout.
11. Export the selected revision as a working offline ZIP.

The walking skeleton must exercise real IPC, persistence, preview-isolation, validation, history, thumbnail, and export boundaries rather than mocking them at the UI boundary.

## Phase 1 Acceptance Criteria

Phase 1 is complete only when all of the following are true.

### Providers

- Codex and Claude both work through real provider adapters based on the reference implementation.
- The mock provider remains available for automated tests and development.
- Multiple configurations per provider work.
- Setup testing, availability reporting, removal, switching, retry, cancellation, streaming, usage, and error reporting behave as specified.
- Provider contract tests cover both real adapters' supported capabilities.

### Home, Projects, and Designs

- Home, persistent sidebar, recent entries, folder opening, Git cloning, deduplication, unavailable-folder recovery, and standalone containers work.
- A project may contain multiple designs and shows the correct direct-open or grid behavior.
- Design cards show current metadata and thumbnails.
- Project and design deletion, 30-day trash, restoration, and permanent purge work without modifying linked source folders.

### Conversation and Generation

- Text and supported attachment prompts work.
- Provider and model may change on every prompt.
- Drafts survive navigation and restart.
- Background generation, cross-design concurrency, per-design queues, active-job UI, retries, repair, cancellation, interruption, Continue, and Retry work as specified.
- Only changed, valid completed results create revisions.
- Invalid and partial attempts remain diagnosable without replacing the last valid revision.

### Preview and Layout

- Generated designs run inside the required isolated preview boundary.
- Docked, hidden, conversation-only, preview-only, and popped-out modes work.
- Only one preview surface is active and all modes stay synchronized.
- Layout and divider state restore independently per design.
- Preview navigation, permission, network, and IPC policies have automated security coverage.

### History and Persistence

- Completed revisions are immutable and restorable.
- Selecting history switches the full displayed snapshot.
- Prompting from historical mode requires non-destructive restoration to a new head.
- Restart recovers projects, designs, conversations, revisions, selected state, drafts, queues, thumbnails, and layout deterministically.
- Persistence and migration tests use temporary databases and directories.

### Export

- The selected revision exports as a ready-to-open ZIP.
- The exported design works offline without installation or a build step.
- No Git metadata, credentials, conversation data, project files, or invalid candidates leak into the archive.
- Export snapshot and offline-execution tests cover representative generated designs.

### Quality

- The primary end-to-end journey passes in packaged or package-equivalent Windows testing.
- Domain behavior, IPC contracts, provider adapters, persistence, preview isolation, export, and critical React interactions have automated coverage.
- The application UI meets the defined accessibility and keyboard requirements.
- All reusable trusted-UI components and primary Phase 1 screens are verified in both the default dark theme and selectable light theme.
- Representative generated designs receive automated console, responsive, and accessibility checks.
- No known critical security, data-loss, or unrecoverable-history defects remain.

## Outstanding Foundation Decisions

These implementation decisions must be resolved and recorded before or during the walking skeleton without changing the product behavior above:

- Package manager and workspace tooling.
- Electron packaging approach for Windows.
- Application state management.
- SQLite library and migration strategy.
- Runtime schema-validation library.
- Logging, diagnostics, and error-boundary approach.
- Test runner responsibilities and Windows CI.
- Development, preview, and production Content Security Policies.
- Extensions to the accepted immutable snapshot directory shape needed for assets, invalid candidates, and thumbnails.
- Exact Codex and Claude installed-subscription and API-key integration after examining the reference implementation.
- How providers receive read-only project context without weakening isolation.

## Specification Change Rules

- New Phase 1 behavior must update this document and its acceptance criteria.
- Later-phase ideas should be recorded as deferred rather than silently added to Phase 1.
- Changes to accepted technical direction must update `ARCHITECTURE.md` with rationale.
- Security boundaries, non-destructive history, source-project read-only access, and local-first operation may not be weakened for implementation convenience.
