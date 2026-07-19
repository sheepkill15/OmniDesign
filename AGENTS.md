# OmniDesign Project Charter

This file is the authoritative product and working baseline for agents and contributors working on OmniDesign. `ARCHITECTURE.md` is the authoritative source for accepted and proposed technical decisions. `NEXT_STEPS.md` preserves the current working sequence and handoff state while the Phase 1 specification is being developed. Preserve all three when making plans, architectural decisions, designs, and code changes. If a future request conflicts with these documents, surface the conflict explicitly rather than silently changing the project's direction.

## Product Vision

OmniDesign is an open-source, AI-first design tool for designers and developers. It operates in the same broad product space as Google Antigravity, Claude Design, and Figma, but is intentionally different in how it works.

The defining product principles are:

- OmniDesign is open source.
- Users can use their own subscriptions or API keys for any supported AI provider.
- The primary audiences are designers and developers.
- Easy integration into the software development workflow is a central focus, not a secondary feature.
- Designs are minimally interactive HTML pages.
- When a design is created for an established project, it should adopt that project's existing design language.
- When a design is created for a new project, OmniDesign should establish a coherent new design language.
- The design workflow depends primarily on communicating requested changes to AI.
- Manual editing and adjustment should exist only at a high level; the product is not intended to center on low-level, pixel-by-pixel editing.

Parts of the application architecture, frameworks, and supporting technologies are now decided, while others remain provisional or open. Consult `ARCHITECTURE.md` for current decision status and do not treat a proposal as settled until it is recorded as accepted.

## Development Standards

All development work must follow these standards:

- Make regular, reasonably scoped commits with clear, meaningful commit messages.
- Use a separate branch for each major feature and follow Git Flow conventions.
- Write tests for everything implemented. New behavior, fixes, and important edge cases must be covered by appropriate automated tests.
- Strive for maximum UI and UX satisfaction. Treat visual quality, interaction quality, accessibility, responsiveness, feedback, and usability as core product requirements.
- Minimize comments. Prefer readable names, clear abstractions, and self-explanatory code. Add comments only when they communicate important reasoning that the code cannot express clearly.
- Modularize and compartmentalize the code as much as practical. Avoid huge files and components with many unrelated responsibilities.
- Establish a strong, coherent design language at the beginning of development and follow it consistently.
- Use current official documentation and up-to-date, supported APIs. Verify documentation when decisions depend on information that may have changed.

## Git Workflow

Use Git Flow conventions unless the repository later records a more specific compatible policy:

- Keep production-ready work on `main`.
- Integrate ongoing work through `develop`.
- Create major feature work on dedicated `feature/<name>` branches based on `develop`.
- Use `release/<name>` branches to prepare releases when releases become necessary.
- Use `hotfix/<name>` branches for urgent production fixes.
- Keep commits focused and make them throughout implementation rather than accumulating an entire feature into one commit.
- Use commit messages that explain the completed change clearly.
- Do not mix unrelated changes into a feature branch or commit.

Do not create commits that knowingly leave the branch in a broken or untestable state. Run the relevant tests before committing whenever the environment permits it.

## Design and UX Direction

- The product itself must demonstrate the quality expected from a design tool.
- Define the initial visual language, interaction patterns, reusable components, layout rules, typography, color, spacing, motion, and accessibility expectations before the interface expands significantly.
- Reuse established components and tokens rather than introducing one-off visual treatments.
- Optimize the central workflow for AI-directed iteration: the user describes intent, reviews a generated result, and requests changes conversationally.
- Keep manual controls high-level and purposeful.
- Generated outputs should be useful to real development projects, not merely static visual mockups.
- Designs should be minimally interactive HTML pages and should preserve or establish a consistent design language as appropriate to their project context.

## Architecture Principles

The current concrete and proposed architecture is recorded in `ARCHITECTURE.md`. Architectural proposals and implementations should continue to favor:

- Clear boundaries between the desktop or web application, AI-provider integrations, project context, generation, rendering, history, persistence, and future cloud services.
- A provider abstraction that can support Codex, Claude, and additional providers without coupling the product to a single vendor.
- Safe isolation and rendering of AI-generated HTML.
- Replaceable, testable modules with narrow responsibilities.
- Local and open-source core functionality that does not require an OmniDesign-hosted backend.
- A path toward optional hosted collaboration without forcing cloud dependencies into features that can reasonably work locally.

Record major architecture choices and their reasoning when they are made.

## Roadmap

### Phase 0: Foundation

This is the preparation required to begin Phase 1 responsibly; it does not replace or change the requested product phases.

- Define the product boundaries and primary user journeys.
- Select the application architecture, frameworks, and supporting technologies.
- Establish the initial design language and component system.
- Define abstractions for Codex, Claude, and future AI providers.
- Decide how generated HTML is isolated, rendered, stored, restored, and exported.
- Establish the repository structure, testing strategy, Git workflow, and contribution standards.
- Record significant architectural decisions.

### Phase 1: Functional Base

- Make Codex integration work.
- Make Claude integration work.
- Support the relevant user-owned subscriptions and/or API keys.
- Make design generation work for an already established project.
- Make standalone design generation work for a new project.
- Produce minimally interactive HTML designs.
- Provide a working history feature.
- Provide a conversation-like UI and make AI-directed iteration the main workflow.

### Phase 2: Project and Design Organization

- Add a project and design library.
- Support multiple designs per project.
- Support multiple pages per design.

### Phase 3: Focused Editing and Project-Level Design Definitions

- Make focused edits through AI work reliably.
- Support project-level definitions such as:
  - Color palette
  - Fonts
  - Font sizes
  - Styles
  - Other shared design-system values and tokens
- Generate these definitions automatically with AI when appropriate.
- Use the definitions consistently throughout a design.
- Automatically update the design when the user changes a project-level definition.

### Phase 4: Design Branching

- Allow users to work on multiple versions of the same design.
- Support communication and context-sharing between design branches.
- Let users compare branches and choose the best parts from multiple versions: the best of all worlds.
- Preserve the lineage and history needed to understand branching and combination decisions.

### Phase 5: Cloud and Collaboration

- Move appropriate capabilities to an optional cloud offering.
- Provide collaboration tools for a subscription fee.
- Additional subscription features may be introduced, but paid restrictions should apply only to features that require a running hosted backend.
- Keep locally feasible core functionality available in the open-source product and compatible with users bringing their own subscriptions or API keys.

## Phase Discipline

- Build a stable foundation before expanding scope.
- Do not prematurely implement later-phase features in a way that destabilizes the current phase.
- Architectural work should keep later phases possible, especially multiple providers, project-wide design systems, branching, and optional cloud collaboration.
- Treat each phase as complete only when its behavior is implemented, tested, and provides a polished end-to-end user experience.

## Guidance for Future Agents

Before making changes:

1. Read this file completely.
2. Read `ARCHITECTURE.md` completely.
3. Read `NEXT_STEPS.md` completely.
4. Inspect the repository and any more narrowly scoped `AGENTS.md` files.
5. Identify the current roadmap phase and keep the work within its intended scope.
6. Confirm that proposed frameworks or APIs are based on current official documentation.
7. Plan for tests, UI/UX quality, modularity, and an appropriate Git Flow branch before implementation.

When completing changes, verify the relevant behavior, keep documentation aligned with important decisions, and leave the codebase in a testable state.
