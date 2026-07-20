# Phase 1 Home Concept Review

## Status

The first Phase 1 application screen is implemented as three runnable visual concepts. No concept is accepted yet. Application work pauses at this review point so the product owner can select and refine the trusted application's visual direction before it spreads to other screens.

The review switcher above the application is temporary development UI. It will be removed after a direction is accepted.

## Shared Product Structure

All concepts preserve the Phase 1 home contract:

- Persistent project sidebar and global navigation.
- A prominent new-design composer.
- Standalone or project-associated design context.
- Provider and model controls without a native HTML `select`.
- Three recent entries.
- Provider availability sourced through the existing provider bridge when Electron is running.
- Dark and light theme review.
- Oak Sans, Heroicons, React Aria Components, keyboard focus, reduced motion, and the accepted semantic palette.

The project names and recent designs are representative review data only. Persistence and creation behavior are intentionally not implemented in this design-review increment.

## Concept A: Quiet Studio

The most conversation-led direction. A calm, readable central column gives the prompt composer the strongest emphasis. Recent designs use low-chrome rows, making the page feel like a focused desktop workspace rather than a gallery.

Best fit when OmniDesign should feel quiet, approachable, and primarily driven by describing intent.

## Concept B: Visual Gallery

The most artifact-led direction. It uses a more expressive headline, a wide composer, and visual recent-design tiles. It gives generated work more presence while keeping the shell restrained.

Best fit when OmniDesign should immediately communicate that it is a visual design product.

## Concept C: Project Workbench

The densest and most developer-oriented direction. A system-status toolbar, centered creation task, workspace-activity pane, and status footer make local project integration and operational context more visible.

Best fit when OmniDesign should feel like a professional development tool with design-generation capabilities.

## Review Questions

When selecting or combining concepts, decide:

1. Which overall composition should become the baseline: A, B, or C?
2. Should recent work be presented as rows, visual tiles, or a compact activity feed?
3. Is the persistent sidebar density comfortable?
4. Should the home voice be personal, aspirational, or task-focused?
5. Which parts from the other concepts should be carried into the selected direction?

After selection, remove the temporary review bar and unused concept code, then document the accepted home composition in `DESIGN_SYSTEM.md` before implementing the next Phase 1 screen.
