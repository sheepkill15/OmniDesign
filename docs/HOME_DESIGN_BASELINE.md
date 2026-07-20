# Phase 1 Home Design Baseline

## Status

Accepted by the product owner on 2026-07-20. This is the implementation-facing reference for OmniDesign's first trusted application screen and the composition baseline for subsequent Phase 1 work.

The accepted direction originated as the Quiet Studio concept. The rejected Visual Gallery and Project Workbench concepts, their alternate sidebars, and the temporary review switcher have been removed from the application so future work cannot accidentally build on them.

## Accepted Composition

The home screen uses:

- A full-height, quiet project sidebar on the left.
- A spacious main work area with a narrower readable column.
- A concise greeting and supporting sentence.
- A substantial multiline new-design composer as the visual anchor.
- Provider, model, attachment, and project-context actions inside the composer boundary.
- Recent designs presented as low-chrome rows with small previews, not large gallery tiles.
- Solid surfaces, subtle separators, restrained radii, no gradients, no glass effects, and no permanent elevation.

The sidebar uses the accepted full layout rather than an icon-only or two-level rail:

- OmniDesign identity and notifications at the top.
- Home and active generations as primary global destinations.
- A plainly labeled project section with compact rows and design counts.
- Provider settings, trash, general settings, and local account context anchored at the bottom.
- Text labels remain visible; icons support recognition rather than replacing navigation language.

## Interaction Baseline

- React Aria Components supplies trusted control behavior.
- Heroicons supplies application icons.
- Oak Sans supplies the interface typography.
- All controls have visible hover, pressed, focus-visible, disabled, and unavailable states as applicable.
- Enter submits a non-empty prompt and Shift+Enter remains available for multiline entry.
- The composer submit action is unavailable until a prompt and usable provider/model selection exist in the functional implementation.
- The full primary journey remains keyboard operable.

## Theme Baseline

Dark is the default review and implementation context. The corresponding light semantic-token mapping remains required and must be exposed through general settings when that screen is implemented. Theme changes apply only to the trusted OmniDesign interface.

## Implementation Notes

`src/renderer/App.tsx` and `src/renderer/styles.css` are the current executable reference. Their representative projects, designs, greeting, timestamps, and generation count are temporary review data, not accepted persistence behavior.

As the application is modularized, move tokens and reusable primitives into the planned design-system and UI boundaries without changing this accepted composition silently. Any meaningful departure must update `DESIGN_SYSTEM.md` and this baseline with rationale.
