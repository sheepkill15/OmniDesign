# OmniDesign Frontend Design System

## Status and Authority

This document is the authoritative visual and interaction baseline for OmniDesign's trusted application UI. It applies to the Electron and React interface, not automatically to AI-generated designs, which must follow the design language of their associated project or establish an appropriate language of their own.

The principles and explicit rules in this document are accepted. The high-level visual direction and primary interface family are ratified; remaining work is limited to selecting a monospace companion and defining and testing exact tokens and component specifications as the walking skeleton makes them concrete.

## Product Character

OmniDesign should feel like a purpose-built desktop application rather than a website placed in a window. Its interface should be calm, cohesive, efficient, and crafted enough to represent a serious design tool.

Native character means respecting desktop interaction conventions, keyboard use, window resizing, persistent layout, operating-system integrations, and information density. It does not mean imitating one operating system on every platform. Browser-default visual styling must not leak into the product, while genuine operating-system surfaces such as file pickers, notifications, credential storage, and system menus should remain native where appropriate.

The visual language is:

- Fluid rather than a collection of floating cards.
- Quiet and low-chrome, with hierarchy created primarily by composition, spacing, typography, solid color, and restrained separators.
- Icon-forward without becoming cryptic or visually busy.
- Muted and tactile rather than glossy, translucent, or ornamental.
- Spacious and calm, with enough working density for sustained desktop use but no pressure to compress the interface at the expense of satisfaction.

## Spatial Composition Principles

The interface should use:

- Compact controls arranged within a spacious overall composition.
- A quiet, persistent navigation rail with low-height rows and clear selected state.
- Generous outer gutters around a narrower readable content column.
- Strong alignment between the conversation column, response content, activity regions, and composer.
- Restrained borders and tonal changes instead of heavy elevation.
- Icon-led navigation and actions with labels where recognition alone is insufficient.
- A multiline composer that feels anchored and substantial without dominating the workspace.

## Core Visual Rules

### Custom Application Styling

- Every application-owned layout element and interactive control must use OmniDesign tokens and component styling.
- Reset browser-default margins, typography, button appearance, focus presentation, form-control fonts, and other user-agent styling before component styles are applied.
- No application surface should look like an unstyled webpage or stock browser form.
- Custom styling must not remove semantics, keyboard behavior, accessible names, or visible focus.
- Native HTML elements remain preferred when their semantics and behavior fit and their appearance can be controlled to the required quality. The `<select>` element is the explicit exception described below.

### Phase 1 Window Frame

- Phase 1 retains Electron's standard platform window frame and title bar.
- Do not create, restyle, replace, overlay, or visually merge application UI into the title bar during Phase 1.
- Application-owned custom styling begins inside the window content area. The operating system remains responsible for the title bar, window controls, dragging, system menu, and frame behavior.
- A custom integrated title bar may be reconsidered after Phase 1 only as an explicit product and accessibility decision.

### No Gradients

- Do not use gradients in application backgrounds, controls, text, borders, illustrations, loading states, or decorative effects.
- Create depth and emphasis with solid semantic colors, spacing, typography, borders, and state changes.
- The gradient declarations in the original palette export are not part of the OmniDesign design system.

### Fluid Surfaces, Not Card Collections

- Treat the application shell, sidebar, work area, conversation, preview, and supporting panes as one composed workspace.
- Prefer edge-to-edge regions, split panes, grouped rows, inset sections, dividers, and changes in solid surface tone over wrapping every group in a rounded container.
- Do not use cards as the default way to create hierarchy or spacing.
- A card is acceptable only when an item is genuinely discrete, repeatable, and directly manipulable, such as a design thumbnail in the project grid. Even then, keep its chrome restrained and avoid the generic rounded floating-dashboard-card treatment.
- Dialogs, menus, popovers, toasts, and the prompt composer may be visually bounded because their boundary communicates behavior rather than decoration.

### Minimal Blur and Elevation

- Do not use `backdrop-filter`, frosted glass, blurred translucent panels, glow effects, or blurred decorative color fields.
- Prefer a one-pixel border, a solid contrasting surface, or spatial separation before adding a shadow.
- Shadows are reserved for temporary layers that must read above the workspace, such as menus and dialogs. Keep them neutral and restrained; permanent layout regions should not float.

## Color Foundation

The supplied palette is accepted as OmniDesign's brand palette. Preserve these source values exactly and expose them through primitive tokens rather than scattering literals through components.

| Primitive token | Source name | Value |
| --- | --- | --- |
| `palette.mauve-shadow` | Mauve Shadow | `#4b3b47` |
| `palette.dim-grey` | Dim Grey | `#6a6262` |
| `palette.grey-olive` | Grey Olive | `#9c9990` |
| `palette.sand-dune` | Sand Dune | `#cfd2b2` |
| `palette.lavender-blush` | Lavender Blush | `#e0d8de` |

Components must consume semantic roles such as `background`, `surface`, `text`, `text-muted`, `border`, `accent`, `focus`, and `danger`, not primitive palette names. Theme-specific semantic tokens may map those roles to different primitives without changing component code.

The palette is intentionally low-saturation. It contains strong accessible pairs for both light and dark surfaces, but its middle tones are not interchangeable as normal text and background colors. Every semantic foreground/background pairing must be contrast-tested. Do not infer that two colors are safe together merely because both belong to the palette.

Status and validation communication must always combine color with an icon and clear wording. Provider, generation, history, warning, success, and error states may never rely on hue alone.

### Theme Policy

- OmniDesign is dark-first. The dark theme is the default and the primary context for design review and visual-quality decisions.
- Phase 1 also ships a complete light theme that the user can select in general settings.
- The selected application theme persists across restarts and must be applied early enough during startup to avoid a visible flash of the wrong theme.
- Both themes are first-class supported contexts. All reusable components, states, overlays, and Phase 1 screens must be verified in both, even though dark is the default.
- Changing the OmniDesign application theme changes only the trusted application interface. It must not restyle, mutate, or imply a theme change in the generated design preview.
- Following the operating-system theme automatically is not a Phase 1 requirement. The explicit in-application choice remains authoritative.

### Palette Extension

- The five supplied colors are the immutable brand foundation, not the complete set of usable UI colors.
- The design system may add neutral tonal steps needed for surface hierarchy, text, borders, disabled states, and contrast in both themes.
- It may add restrained semantic colors for success, warning, danger, information, and focus when the brand primitives cannot communicate those states accessibly.
- Extensions must harmonize with the muted brand palette, remain subordinate to it, and be introduced as named primitive or semantic tokens rather than one-off values.
- Every foreground/background and control-state pairing must be contrast-tested in both themes.

## Typography

Typography should feel like application interface typography, not editorial web typography.

OmniDesign uses Oak Sans as its bundled cross-platform interface family rather than the operating-system UI stack. This gives the application a consistent voice and layout across Windows, macOS, and Linux.

The authoritative source is [Walven/OakSans](https://github.com/Walven/OakSans). Phase 1 targets the official Oak Sans v2.0 release and must pin the integrated files to that release or its immutable commit rather than downloading the moving default branch during builds.

- Use a compact, deliberate type scale with a limited number of roles: display only where truly needed, page title, section title, body, compact UI label, and metadata.
- Use weight, size, spacing, and tone to establish hierarchy. Do not create hierarchy by placing every heading in a separate container.
- Body and control text must remain comfortably readable at normal desktop viewing distance and operating-system scaling.
- Use tabular numerals for elapsed time, usage, cost, dimensions, and other rapidly changing numeric UI where alignment matters.
- Code, paths, model identifiers, and technical diagnostics use a dedicated monospace role.
- Truncation must preserve access to the full value through an appropriate tooltip, expandable region, or detail view.
- Oak Sans files must be bundled locally and usable without network access. Do not load application typography from a CDN or another remote service.
- Prefer the official WOFF2 assets for the trusted web-based renderer. The repository provides both static styles and variable roman and italic WOFF2 files; choose the smallest set that covers the accepted type roles during implementation.
- Begin token evaluation with Regular `400` for body copy, Medium `500` for controls and labels, and Semibold `600` for headings and stronger emphasis. Add other weights only when a demonstrated hierarchy need justifies their cost.
- Bundle only the weights and styles the interface actually uses. Font loading must not block the interface indefinitely or cause disruptive layout shifts.
- Oak Sans is distributed under the SIL Open Font License 1.1. Preserve its copyright and license text alongside redistributed font files and in the application's third-party notices.

The monospace companion remains to be selected through visual comparison in representative code, path, usage, and diagnostics content. Do not choose it implicitly during scaffolding.

## Layout, Spacing, and Shape

- The shell is a continuous desktop workspace built from a persistent sidebar, content regions, toolbars, split panes, and temporary overlays.
- Align controls and content to a consistent spacing grid. Avoid one-off margins and arbitrary component heights.
- Prioritize usable content area, especially for the conversation and preview. Decorative framing must not consume meaningful workspace.
- Use responsive constraints for smaller windows, not mobile-web transformations. Collapse secondary labels or regions deliberately while preserving the primary workflow.
- Dividers and resize handles are functional elements. They require clear hover, active, keyboard-focus, and enlarged pointer-target behavior even when their visible line is thin.
- Radii should communicate component type and containment. Do not apply the same large radius to every surface.
- Favor a moderately spacious and calm desktop density. Give controls comfortable targets, labels room to breathe, and high-consequence actions clear separation.
- Maximum user satisfaction takes priority over maximizing the number of controls visible at once. Reduce secondary information or adapt layout before compressing primary controls into a cramped presentation.
- Spaciousness must remain purposeful: protect conversation and preview working area, and avoid oversized decorative whitespace that makes routine actions slower.

Exact spacing, control-height, radius, and density tokens remain to be specified and visually tested within this accepted direction.

### Initial Spatial Reference Ranges

Use the following starting ranges for OmniDesign prototypes. They are proportional guardrails, not final tokens, and must be evaluated with the bundled font, both themes, Windows display scaling, smaller windows, and real Phase 1 content.

| Element | Initial range | Intent |
| --- | --- | --- |
| Base spacing unit | `4px` | Supports a coherent scale without forcing every distance to be equally tight. |
| Small internal gaps | `4–8px` | Icon-to-label, compact metadata, and tightly related controls. |
| Ordinary control gaps | `8–12px` | Related toolbar actions and form-control internals. |
| Component padding | `12–16px` | Calm controls and bounded work surfaces without excessive bulk. |
| Region gutters | `16–24px` | Separation around toolbars, panes, conversation content, and sidebars. |
| Major section rhythm | `24–32px` | Distinguishes meaningful content groups without card wrappers. |
| Persistent sidebar width | `248–280px` | Enough room for icons and useful project names while protecting workspace width. |
| Top workspace toolbar | `44–48px` | Compact desktop chrome with comfortable alignment and targets. |
| Navigation and compact rows | `32–36px` | Efficient repeated scanning inside the more spacious shell. |
| Standard controls | `36–40px` | Comfortable default for inputs, buttons, and combobox triggers. |
| Primary reading column | `720–800px` maximum | Keeps long conversation and diagnostic text readable on wide windows. |
| Multiline composer | Approximately `96–120px` minimum at rest | Makes prompting feel central while leaving most height for conversation and preview. |

Use the lower end of a range for repeated dense structures such as navigation and tool activity, and the upper end for primary actions and creation surfaces. These values must not be applied mechanically: preview-led layouts, split panes, empty states, and smaller windows require fluid sizing and content-aware constraints.

### Shape and Alignment Reference

- Align major content, activity regions, and composer edges to a shared column wherever the layout mode permits.
- Use negative space around a readable column on wide windows rather than stretching prose edge to edge.
- Use approximately `8–10px` radii for compact selected rows and ordinary controls as an initial prototype range.
- Reserve approximately `16–20px` radii for substantial bounded surfaces such as the multiline composer or temporary panels. Do not spread this larger treatment across every section.
- Prefer one subtle separator or tonal boundary between persistent regions. Avoid multiple nested outlines.
- A visible icon may be `16–20px` while its interactive target remains at least the full control height.
- Keep compact metadata around `12–13px` and ordinary interface copy around `14–15px` as initial optical targets; finalize sizes only after the bundled font is chosen.

## Controls and Interaction Primitives

### Searchable Selection Instead of `<select>`

The trusted OmniDesign UI must never use the built-in HTML `<select>` element.

Use shared, application-styled selection primitives:

- `Combobox` for searchable single selection, including projects, provider configurations, and model lists.
- `Listbox` or menu-style picker for very short fixed sets where search adds no value.
- `MultiCombobox` only when multiple values are a real product requirement.

The combobox is a controlled text input with an associated popup, not a cosmetic imitation of a native select. It must support filtering, clear empty and no-result states, loading and unavailable states, option descriptions where needed, and virtualization when a list can become large.

All selection primitives must implement the applicable WAI-ARIA pattern and be tested for:

- Arrow-key navigation, Enter selection, Escape dismissal, Home/End behavior where applicable, and ordinary text-editing keys.
- Correct focus return and predictable Tab order.
- Accessible label, expanded state, active option, selected value, validation message, and result count.
- Pointer, keyboard, screen-reader, high-contrast, zoom, and reduced-motion behavior.
- Popup collision handling and visibility in small or resized windows.

Do not create feature-local dropdown implementations. Provider, model, project, history, and other selectors must share the same tested primitives, with modes or composition used for legitimate differences.

### Buttons

- Prefer icon-and-label buttons for primary actions, unfamiliar actions, and destructive actions.
- Use icon-only buttons only for compact, familiar actions whose meaning remains unambiguous in context. Every icon-only button requires an accessible name and a tooltip.
- Do not add an icon when it merely decorates text or makes a dense interface harder to scan.
- Primary, secondary, subtle, and destructive button styles must have distinct semantic purposes and complete hover, active, focus-visible, disabled, and busy states.
- A busy button preserves its label or otherwise keeps the pending action understandable; it must not shift layout when progress appears.

### Inputs and Editors

- Text fields, multiline composers, search fields, checkboxes, radios, switches, and range-like controls require application-owned styling and shared behavior.
- Placeholder text never replaces a persistent label when the field's purpose would become ambiguous.
- Validation appears near the relevant control with an icon, concise wording, and an actionable recovery path.
- The prompt composer is a central work surface, not a generic textarea inside a decorative card.

### Menus, Popovers, Dialogs, and Tooltips

- Menus contain commands; listboxes contain choices. Do not substitute one interaction model for the other because they look similar.
- Popovers and dialogs use solid surfaces. No frosted or blurred backdrop treatment.
- Dialogs require an explicit title, initial-focus strategy, focus containment, Escape behavior where safe, and focus restoration.
- Tooltips supplement controls; they do not contain essential instructions or interactive content.

## Iconography

Heroicons is the accepted default icon family for the trusted React UI. Use the official `@heroicons/react` package and import individual icons from the size and style set appropriate to their rendered role.

- Use one visual style consistently within a region. Do not mix outline and solid variants arbitrarily.
- Use icons for most buttons, statuses, badges, navigation items, toolbars, empty states, and contextual metadata where they improve recognition.
- Pair icons with text when the action or state is not universally understood.
- Decorative icons are hidden from assistive technology. Meaningful standalone icons receive an accessible name through their control or surrounding semantic element.
- Do not communicate different states only by swapping visually similar icons; include wording and, where useful, shape or placement changes.
- Avoid custom icons unless Heroicons lacks a product-specific concept. Custom additions must match the chosen grid, stroke, corner, and optical-weight conventions.

Exact icon sizes and the default outline-versus-solid usage belong in the component token specification once control density is decided.

## Motion and Feedback

- Motion explains spatial change, state transition, progress, or direct manipulation. It is not ambient decoration.
- Prefer short opacity, position, and size transitions. Avoid springy, theatrical, or attention-seeking motion in routine work.
- Never use animated gradients, glowing pulses, or blurred motion effects.
- Respect `prefers-reduced-motion`; essential state changes must remain clear with transitions removed.
- Long-running generation uses explicit stage text, elapsed state, and cancellable progress rather than an indefinite decorative animation alone.
- Success feedback should be calm and proportional. Errors and warnings should state what happened and the next useful action.

Exact duration and easing tokens remain open until representative components can be evaluated in the walking skeleton.

## Accessibility and Input Methods

- Target WCAG 2.2 AA contrast and interaction expectations for the application UI.
- The complete Phase 1 journey must work with keyboard alone.
- Every interactive element has a visible `:focus-visible` treatment that is not dependent on subtle color change alone.
- Pointer targets must remain comfortably operable at supported display scaling even when the visible icon is compact.
- Information must remain usable at 200% zoom and in smaller supported windows.
- Respect operating-system text scaling, reduced motion, and forced-colors/high-contrast modes where Chromium exposes them.
- Announce important asynchronous changes, but do not stream every generation token through an assertive live region.
- Destructive and irreversible actions require explicit language and confirmation proportional to their consequence.

Custom styling is never a reason to reimplement native text editing, remove focus outlines without replacement, block browser or assistive-technology shortcuts, or reduce semantic quality.

## Phase 1 Composition Guidance

### Application Shell and Sidebar

- Keep the sidebar visually integrated with the workspace rather than presenting navigation as a stack of cards.
- Navigation items combine a Heroicon, clear label, and restrained selected treatment.
- Active-generation count is visible but does not dominate navigation.

### Home and Project Views

- The new-design composer is the visual anchor and should feel embedded in the page composition.
- Recent projects use rows or a low-chrome list where practical.
- The required multi-design grid may use bounded design tiles because each thumbnail is a discrete manipulable artifact. Avoid extra nested cards inside each tile.

### Design Workspace

- Conversation and preview read as two working panes separated by a functional divider, not two floating cards.
- The design header acts as an application toolbar with an editable title, status, history, layout, and preview commands.
- Preview framing stays minimal so the generated design receives most of the available area.

### Conversation and Generation

- Do not render every conversation event as a generic chat bubble or card. Distinguish user intent, provider narrative, tool activity, validation, and system status through alignment, typography, icons, solid tonal regions, and collapsible structure.
- Keep detailed generation output scannable. Metadata and repeated tool activity should use compact rows rather than large containers.
- Queue, retry, repair, interruption, and failure states use consistent status primitives and direct next actions.

### Empty, Loading, Warning, and Error States

- Each state includes an appropriate icon, a concise title or message, and the most useful next action when one exists.
- Empty states belong in the region they explain and should not become oversized marketing panels.
- Skeletons, when used, are solid tonal blocks without shimmer gradients.
- Do not show a spinner without context for long-running work.

## Component-System Requirements

- Build trusted UI components in the planned portable `packages/design-system` and `packages/ui` boundaries when those boundaries become meaningful.
- Separate primitive tokens, semantic tokens, component tokens, and component implementation.
- Feature code consumes reusable components and semantic variants instead of copying styles or importing palette literals.
- Every primitive includes all interaction states, accessible behavior, and automated tests before broad reuse.
- Add visual regression coverage for representative states and both supported theme contexts if both themes are accepted.
- Exercise components at normal and smaller desktop windows, increased text/zoom, keyboard-only use, and Windows high contrast.
- Document exceptions. If a feature must diverge from a system rule, record why and decide whether the system itself needs a new supported variant.

## Ratified Direction and Next Design Deliverable

The product owner has ratified:

1. A dark-first application with a user-selectable light theme in Phase 1.
2. The supplied palette as an extensible brand foundation rather than an exclusive set of colors.
3. Oak Sans v2.0 from the official Walven repository as the bundled cross-platform interface family.
4. A spacious and calm density optimized for maximum user satisfaction.
5. The standard platform window frame and title bar remaining untouched in Phase 1.

The next design-system deliverable should select a monospace companion; validate Oak Sans sizes, weights, and metrics in representative UI; define semantic color mappings for both themes; define spacing, sizing, radius, border, shadow, icon-size, and motion tokens; and specify representative shell, composer, combobox, conversation, status, and preview-toolbar states.

## References

- [Heroicons](https://github.com/tailwindlabs/heroicons)
- [Oak Sans](https://github.com/Walven/OakSans)
- [WAI-ARIA Authoring Practices: Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
