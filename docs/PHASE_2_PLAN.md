# OmniDesign Phase 2 Implementation Plan

## Status and Authority

This document is a working implementation plan for **Phase 2: Project and Design
Organization**, as defined in `AGENTS.md`. It is subordinate to the product
principles in `AGENTS.md`, the accepted technical decisions in `ARCHITECTURE.md`,
and the trusted-UI rules in `DESIGN_SYSTEM.md`. `docs/PHASE_1_SPEC.md` remains the
authority for Phase 1 behavior that Phase 2 builds on.

Not everything here is finalized product specification. It records the decisions
taken with the product owner in planning (July 2026) and the concrete engineering
approach that follows from them. Future agents should keep it aligned as
implementation resolves the open items in the last section.

## Phase 2 Goals (from `AGENTS.md`)

1. Add a project and design library.
2. Support multiple designs per project.
3. Support multiple pages per design.

Some Phase 1 audit items remain open (see `phase1-release-audit-fixset`); the
product owner has **moved those to Phase 3** and they are out of scope here.

## Decisions Locked in Planning

- **D1 — Pages are discovered from Git.** Every `*.html` file in a design's
  repository (outside the managed `.build/` directory) is a page. There is no
  page manifest, no page table with independent per-page history, and the agent
  never declares pages or an entry point. A revision stays a single whole-design
  Git commit. Lightweight page metadata (display title, order, which file is the
  home page) is keyed by relative path at the design level.
- **D2 — The library includes folders and tags.** Folders organize projects and
  nest; tags are cross-cutting labels on both projects and designs.
- **D3 — The preview moves in-DOM to sandboxed iframes (Option A).** This is a
  deliberate, documented reversal of the Phase 1 decision to use only an isolated
  native `WebContentsView`. It is required to support the new canvas preview mode
  and is mitigated as described below. It must land as a dated ADR in
  `ARCHITECTURE.md` before the preview rewrite merges.
- **D4 — The preview has two view modes and a global size/fit setting.** Canvas
  mode lays out all pages of a design on a pan/zoom board; focused mode shows one
  page. Device size and fit mode are global preview settings honored by both
  modes and persisted per design.

## Where Phase 1 Leaves Us

- **Multiple designs per project already works** end to end: `designs.project_id`
  foreign key with cascade, `listDesignsByProject`
  (`src/electron/workspace/store.ts`), the project design grid
  (`src/renderer/App.tsx` `ProjectPage`), the sidebar design sublist
  (`ProjectNavItem`), create-in-project, and associate/move.
- **A design is one Git repository, single-page today but multi-file-ready.** The
  preview protocol handler already serves any relative path from the revision file
  map (`src/electron/workspace/previewController.ts` `handleRequest`), and
  `RevisionFiles` is already a `{ path: content }` map
  (`src/electron/workspace/designRepository.ts`). What is hard-wired to single-page
  is: `readRevisionFiles` reads three fixed paths, the preview loads `index.html`,
  export requires `index.html` (`src/electron/workspace/exportService.ts`), and the
  Tailwind compiler takes one HTML string (`src/electron/workspace/compiler.ts`).
- **There is no library screen.** Home shows only the top three recent designs;
  projects live solely in the sidebar. There is no router — views switch on state
  in the `App` root (`src/renderer/App.tsx`).
- **Structural friction:** the renderer is one ~1,640-line `App.tsx`, and the
  project→designs list is fetched independently in three places (`App`,
  `ProjectPage`, `ProjectNavItem`).

## Track 0 — Enabling Refactor (do first, low risk)

Consolidate before expanding.

- Lift the per-project design list into shared renderer state (or a small context),
  replacing the local `useState` + `getProject` fetches in `ProjectPage` and
  `ProjectNavItem` so there is one source of truth for a project's designs.
- Recommended given the file size: split `App.tsx` into per-screen modules
  (`Home`, `ProjectPage`, `DesignWorkspace`, `Sidebar`, `Library`, and the preview
  surface). No behavior change; this makes the rest of Phase 2 reviewable.

## Track A — Project and Design Library (with folders and tags)

### Data model

Two migrations appended to the ordered migration array in
`src/electron/workspace/store.ts` (next is `migrationTwentyNine`):

- **Folders organize projects and nest.**
  - `folders`: `id`, `name`, `parent_folder_id TEXT REFERENCES folders(id) ON
    DELETE CASCADE`, `sort_order`, `created_at`, `updated_at`.
  - `projects.folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL`. A project
    with `NULL` sits at the library root. Deleting a folder cascades to its
    subfolders but re-roots the affected projects (SET NULL fires per project)
    rather than trashing any design data.
- **Tags are cross-cutting labels.**
  - `tags`: `id`, `name`, `color`, `created_at`.
  - `project_tags(project_id, tag_id)` and `design_tags(design_id, tag_id)`, each
    primary-keyed on the pair, both foreign keys cascading.

### Contracts and IPC

- Extend `projectSummarySchema` with `folderId` and `tags[]`, and `designSchema`
  with `tags[]`, in `src/electron/workspace/contracts.ts`. Add `folderSchema` and
  `tagSchema`.
- New channels in `src/electron/preload/index.ts` and handlers in
  `src/electron/main/index.ts` (each guarded by the existing `authorize(event)`):
  `list-folders`, `create-folder`, `rename-folder`, `delete-folder`,
  `move-project-to-folder`, `list-tags`, `create-tag`, `delete-tag`, and
  `tag`/`untag` for both designs and projects.

### UI

- A new **Library** screen listing all projects and designs with thumbnails,
  backed by the data already loaded in `refresh()` — filtering, sorting, and search
  are client-side for v1 (promote to a `workspace:search` IPC only if the dataset
  grows).
- **Search + filter + sort** over title, project kind (`standalone`/`linked`),
  provider (`last_provider_id`), tags, and updated-at.
- A **folder tree rail** (nested, drag-to-file projects), reusing the disclosure
  caret pattern already in `ProjectNavItem`.
- **Tag filter chips** feeding the same client-side filter.
- Add a `libraryOpen` branch to the state router in the `App` root and a sidebar
  entry beside Home/Generations. Home stays the "start an idea" surface; Library is
  "browse everything."
- **Sidebar scope for v1:** keep the sidebar Projects section flat-by-recency;
  folders are a Library-only concern so the sidebar does not grow a second nesting
  level on top of its project→design caret.

## Track B — Mature Multiple Designs per Project

Small additive work on top of the existing multi-design foundation.

- **Duplicate a design** — copy the Git repository plus head revision and design
  metadata; new store method and `workspace:duplicate-design` IPC.
- **Move any design between projects** — generalize the existing standalone→project
  `associateDesignWithProject` in `store.ts` to any target project, keeping the
  adapt-to-project follow-up already built.
- **Project grid polish** (`ProjectPage`): multi-select, bulk trash/move, and
  optional manual ordering (`designs.sort_order` via a migration).

## Track C — Multiple Pages per Design and the Preview Rewrite

This is the largest track and the only architecturally hard one. It also lands the
generalized multi-file revision read that was deferred out of Phase 1
(`phase1-multifile-deferred`).

### C1 — Backend: pages discovered from Git

- **Generalize revision reads.** Replace the three-path loop in `readRevisionFiles`
  (`designRepository.ts`) with `git ls-tree -r --name-only <commit>` plus
  `git show` per file, so a revision returns every committed file. This feeds both
  the preview and export and closes the deferred multi-file gap (agent-authored
  assets, fonts, and per-page JS now flow through).
- **Compile Tailwind across all pages.** `collectTailwindCandidates` and the
  `<html>`/`<body>` validation in `compiler.ts` must run across every HTML/JS file
  in the repository, not a single string. `compileTailwindCss` takes the file set
  and produces one shared `.build/tailwind.css` linked by every page. The agent
  never manages builds per page.
- **Export the entry page, not a required `index.html`.** Drop the hard
  `index.html` requirement in `exportService.ts`; require the design's resolved
  entry page instead. The archive already zips the whole file map.
- **Page metadata and entry resolution.** Add per-design page metadata (display
  title, order, home flag) keyed by relative path, plus `entry_page_path`, via a
  migration after the Track A migrations. Entry page resolves to `index.html` if
  present, otherwise the first discovered page. Extend `designSchema` with a
  `pages[]` array and `entryPagePath`.

### C2 — Preview rewrite (Option A: sandboxed iframes)

Replace the native `WebContentsView` preview surface with an in-DOM surface that
manages one sandboxed iframe per page.

- **Isolation model.** Each page renders in an `<iframe sandbox="allow-scripts">`
  (no `allow-same-origin`, giving an opaque origin) whose `src` is served over the
  existing `omnidesign-preview://` custom protocol with the restrictive preview
  CSP (including `connect-src 'none'`). Relative to the Phase 1 native view this
  gives up the OS-level process sandbox and the dedicated session partition; it
  keeps opaque-origin DOM/storage isolation, denied network egress, and the custom
  protocol boundary. Recorded as an ADR in `ARCHITECTURE.md` (D3). Requires
  relaxing `frame-ancestors` from `'none'` — see C5.
- **Deletes native-layer complexity.** Moving in-DOM removes the freeze-frame /
  detach-on-overlay logic (`setSuspended`, `freeze`, `capturePage` occlusion dance)
  in `previewController.ts`, because DOM overlays paint over iframes naturally.
  Pop-out becomes a second window loading the same content.
- **Injected shim (OmniDesign-owned, invisible to the agent).** The protocol
  handler injects a tiny script into served pages that:
  1. reports content height via `ResizeObserver` + `postMessage` (drives Artboard
     fit — see C3),
  2. forwards console output and `window.onerror` as diagnostics (preserves the
     Phase 1 diagnostics feature, which otherwise regresses under iframes), and
  3. reports the current page path on navigation (keeps the focused-mode switcher
     in sync when in-page links are followed).
  The shim is served, never committed to Git, and never authored by the agent. If
  the preview CSP is tightened, the shim needs a nonce.
- **Thumbnails.** `capturePage` screenshots painted pixels, so thumbnails can still
  be captured over an iframe's on-screen region; alternatively keep one hidden
  offscreen view solely for thumbnailing. Do not regress per-revision thumbnails.

### C3 — View modes and size/fit settings (D4)

Two global preview settings apply in both modes:

- **Device size** — presets (Phone / Tablet / Desktop) plus custom. A preset holds
  a width and a height.
- **Fit mode** —
  - **Artboard (full height):** uses the size's **width only**; height is the
    page's real content height via the shim; no internal scroll. Best for overview.
  - **Fixed size:** uses the size's **width × height** exactly; content scrolls
    inside the frame; the literal device-screen look.

Behavior:

- **Canvas mode** lays out all pages as device-framed tiles on a padded board with
  free CSS pan/zoom (transform/translate on the canvas container; iframes are DOM
  so they clip and transform correctly). Each tile carries trusted-UI device chrome
  drawn in the parent DOM around the iframe (desktop: browser-window chrome; phone
  and tablet: device bezel), gap/spacing between tiles, and a page label. Chrome and
  fit follow `DESIGN_SYSTEM.md` tokens.
- **Focused mode** shows one selected page filling the pane, with a page switcher.
  It honors the same device size and fit setting.
- The shim's height role is active only in Artboard fit; it runs in Fixed fit for
  diagnostics and current-page reporting.
- **Persistence.** `previewDeviceSize` and `previewFit` (and the selected page and
  view mode) persist per design alongside the existing layout state via the
  `saveLayout` path; extend `layoutSchema` in `contracts.ts`. No new table.

### C4 — Agent contract (kept deliberately minimal)

- Every `*.html` file outside `.build/` is a page. No manifest, no config, no
  entry-point declaration.
- Pages link with ordinary relative `<a href="about.html">`.
- `index.html` is the home page if present; otherwise the first discovered page.
- One shared `.build/tailwind.css` across all pages; OmniDesign compiles it.
- Update the provider prompt contract so the agent knows it may author multiple
  linked HTML pages. `git add --all` already commits them and OmniDesign discovers
  them, so the strict "no file inventory / no entry-point choice" completion payload
  from Phase 1 stays intact. Add multi-page fixtures to the mock provider and to the
  Codex/Claude contract tests.

### C5 — Spikes (VALIDATED 2026-07-23)

A standalone Electron 43.1.1 harness mirroring the real setup (privileged
`omnidesign-preview` scheme, the actual CSP directives, a `file://` parent as in
production) validated every load-bearing assumption. Both spikes passed:

1. **Custom protocol + `sandbox="allow-scripts"` (opaque origin, no
   `allow-same-origin`) + relative subresources + CSP.** The document loads, and its
   relative `.build/tailwind.css` and `.build/alpine.js` are requested, load, and
   apply/execute inside the opaque-origin frame (`origin: "null"`). CSP source
   `omnidesign-preview:` (a scheme source, not `'self'`) is why the opaque origin
   does not break subresource loading — keep it that way.
2. **Height-shim round trip.** The injected `ResizeObserver` → `postMessage` shim
   reported distinct per-tile content heights (1246px vs 483px) that the parent used
   to size each tile, inside a `scale()`+`translate()` canvas that clipped and
   transformed the iframes correctly.

Additional confirmations: **`connect-src 'none'` is enforced inside the sandboxed
frame** (a `fetch()` was blocked), the opaque origin prevents parent-DOM access, and
device-framed tiles render as intended. **Option B (`<webview>`) is therefore not
needed.**

**Required change surfaced — `frame-ancestors`.** The real preview CSP sets
`frame-ancestors 'none'` (`previewPolicy.ts`), which blocks the document from loading
in an iframe at all (`ERR_BLOCKED_BY_RESPONSE`, before subresources are requested).
With a `file://` parent, `frame-ancestors *` does NOT help (the wildcard matches only
network schemes). Working options: `frame-ancestors file:` (simple and safe — the
preview scheme is not web-reachable, so only OmniDesign can embed it), or migrate the
trusted renderer to a custom `app://` scheme with a stable origin and use
`frame-ancestors app://<host>` (cleaner hardening). Decide at C2.

Spike harness kept at `scratchpad/iframe-spike/` for reference (not committed).

## Suggested Sequencing

Track 0 → Track C backend (C1) → Track A → C5 spikes → Track C preview (C2/C3) →
Track B → Track C agent contract and tests (C4).

Rationale: the Track 0 refactor de-risks everything; C1 is a self-contained backend
change that also unlocks the deferred multi-file behavior; the library (A) is
high-value and independent; the preview rewrite waits behind its spikes; Track B is
small and can slot in wherever convenient.

Each slice stays test-gated (unit plus the Playwright end-to-end journey),
consistent with the Phase 1 discipline in `AGENTS.md`.

## Testing

- Unit coverage for the new store methods and migrations (folders, tags, page
  metadata, duplicate/move), multi-file `readRevisionFiles`, multi-page Tailwind
  compilation and validation, and entry-page export.
- Preview: shim height round-trip, diagnostics forwarding, canvas pan/zoom layout,
  fit-mode switching, and per-design persistence of size/fit/page/view-mode.
- End-to-end: create a multi-page design, switch between canvas and focused modes,
  change device size and fit, export a multi-page design offline, and recover
  preview settings after restart.

## Open Decisions and Owner Sign-offs

- **ADR for the isolation downgrade (D3).** Record in `ARCHITECTURE.md` with the
  mitigations pinned before the preview rewrite merges. Confirm the isolation floor
  is acceptable, or choose `<webview>` (Option B) instead.
- **Folder deletion semantics.** Confirmed direction: `ON DELETE SET NULL` re-roots
  a deleted folder's projects rather than blocking deletion of non-empty folders.
- **Folders group projects, tags apply to both projects and designs.** Confirm this
  rather than folders holding designs directly.
- **Folders in the sidebar.** v1 keeps folders Library-only; revisit if the sidebar
  should reflect the hierarchy.
- **Tags/folders migration timing.** They land in Track A ahead of the page-metadata
  migration; confirm no reordering is needed against any in-flight Phase 3 work.
