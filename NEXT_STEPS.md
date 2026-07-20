# OmniDesign Next Steps

This is a working plan, not a finalized product specification. The project owner is developing the details across separate conversations. Future agents should use this document to preserve continuity, avoid prematurely expanding implementation, and update it as decisions are finalized.

## Immediate Objective

Turn Phase 1 into a narrow, testable vertical slice before broadly scaffolding or implementing the application.

The first complete user journey should be:

```text
Launch OmniDesign
        |
        v
Create a standalone design or open an existing project
        |
        v
Choose and configure an AI provider
        |
        v
Describe the desired design
        |
        v
Receive a streamed response
        |
        v
Compile and preview the generated design
        |
        v
Request a change
        |
        v
Preserve both revisions in history
        |
        v
Close and reopen the thread
        |
        v
Export the design
```

## Recommended Sequence

### 1. Review and Ratify the Phase 1 Product Specification

An initial specification is now recorded in `docs/PHASE_1_SPEC.md`. Review it with the project owner and keep it aligned as implementation discoveries resolve remaining foundation decisions.

Define:

- Primary screens and navigation.
- The conversation and generation flow.
- Standalone-design and existing-project entry points.
- Project folder selection and permission behavior.
- Relationships between projects, designs, pages, threads, messages, and revisions.
- Provider selection and configuration UX.
- Loading, streaming, cancellation, retry, and recovery behavior.
- Empty, error, offline, and partially completed states.
- History restoration behavior.
- Preview behavior and viewport controls.
- Export behavior and available export modes.
- Phase 1 acceptance criteria.

The provider authentication mechanism remains deferred until the planned reference implementation is available.

### 2. Establish OmniDesign's Visual Language

The accepted and ratified baseline is now recorded in `DESIGN_SYSTEM.md`. It defines the native-desktop character, custom control requirement, no-`<select>` rule, no-gradient rule, fluid low-card composition, restricted blur and elevation, supplied brand palette, dark-first and user-selectable light themes, bundled typography direction, spacious and calm density, icon direction, accessibility baseline, standard Phase 1 window frame, and Phase 1 composition guidance.

Select the exact bundled font family and convert the baseline into exact semantic and component tokens before UI implementation spreads across the application.

Cover:

- Application shell and layout.
- Typography and type scale.
- Color and semantic color roles.
- Spacing and sizing scales.
- Borders, radii, elevation, and surfaces.
- Controls and reusable components.
- Conversation presentation.
- Design preview framing and viewport controls.
- History and navigation presentation.
- Loading, progress, empty, error, and success feedback.
- Motion and reduced-motion behavior.
- Keyboard navigation, focus, contrast, and accessibility expectations.
- Responsive and smaller-window behavior.

The remaining design work is font-family selection, exact dark and light semantic color mappings, token scales, and representative component and screen specifications.

The product must demonstrate the level of UI and UX quality expected from a design tool.

### 3. Resolve Remaining Foundation Decisions

Before full implementation, decide and record:

- Package manager and workspace tooling.
- Electron packaging and update tooling.
- Application state-management approach.
- SQLite library and migration strategy.
- Runtime schema-validation library.
- Logging, diagnostics, and error boundaries.
- Test runners and responsibilities for each test layer.
- Continuous-integration targets for Windows, macOS, and Linux.
- Supported operating-system versions and architectures.
- Development, preview, and production Content Security Policies.

Use current official documentation when these choices are made.

### 4. Build a Walking Skeleton

After the Phase 1 flow and initial visual language are sufficiently defined, scaffold Electron, React, TypeScript, and Vite and implement one end-to-end flow using a mock provider.

The walking skeleton should:

- Open the desktop application.
- Create a local project and thread.
- Accept a prompt.
- Stream a fixed or simulated provider response.
- Receive a representative generated HTML design.
- Compile its Tailwind CSS.
- Render it inside the isolated preview boundary.
- Capture browser and compilation errors.
- Save the thread and immutable design revision locally.
- Reopen the saved thread and revision.
- Export a working offline design.

This slice must test the difficult architectural boundaries rather than presenting a broad but disconnected UI mockup.

### 5. Integrate the Reference Provider Implementation

When the installed-subscription reference implementation is available:

- Study it before choosing authentication, discovery, or process-integration mechanisms.
- Implement it behind the provider-neutral contracts described in `ARCHITECTURE.md`.
- Keep provider-specific concepts in adapters.
- Preserve the mock provider for automated tests and local development.
- Add Codex and Claude contract and integration tests appropriate to their supported capabilities.

### 6. Run the Generation-Framework Benchmark

Use the working preview, validation, and export pipeline to compare:

1. HTML, Tailwind CSS, and Alpine.js.
2. React-style components and Tailwind CSS, potentially using Preact compatibility for the exported runtime.
3. HTML, Tailwind CSS, and vanilla JavaScript.
4. HTML, ordinary CSS, and vanilla JavaScript as a control.

Use the benchmark definition and metrics in `ARCHITECTURE.md`. Do not promote Tailwind and Alpine from provisional to accepted until results support the choice.

## First Implementation Milestone

The first milestone is complete only when a user can perform this local flow end to end:

1. Start OmniDesign.
2. Create a standalone design session.
3. Enter a prompt.
4. Receive a simulated streamed response.
5. See a generated Tailwind-based design in a securely isolated preview.
6. Request one change and see a new revision.
7. Move between the two revisions.
8. Restart the application and recover the thread and selected revision.
9. Export the selected revision to an offline HTML artifact.

The milestone also requires automated coverage of its domain behavior, IPC contracts, persistence, preview isolation, export behavior, and critical desktop journey.

## Current Handoff State

- The project charter and roadmap are recorded in `AGENTS.md`.
- Accepted and proposed technical direction is recorded in `ARCHITECTURE.md`.
- Electron, React, TypeScript, Vite, local-first persistence, and isolated previews are accepted directions.
- Tailwind CSS with Alpine.js is the provisional generated-design stack.
- The generated-design stack requires a benchmark before final acceptance.
- Provider subscription integration awaits the reference implementation.
- The initial Phase 1 product specification is recorded in `docs/PHASE_1_SPEC.md` and awaits review and ratification.
- The trusted-UI design language in `DESIGN_SYSTEM.md` is ratified: dark-first with a selectable light theme, extensible semantic colors, bundled typography, spacious and calm density, and the standard platform title bar in Phase 1.
- Basic multiple-design support is now included in Phase 1; multiple conversations and visible branching remain deferred.
- Phase 1 is qualified on Windows first while preserving the accepted cross-platform architecture.
- Persistent AI-extracted project profiles are deferred; Phase 1 uses read-only project context on demand during generation.
- Broad implementation should not begin until the primary Phase 1 flow and initial visual language are sufficiently defined.
