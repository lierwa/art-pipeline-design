# Course Planner UX Gap Audit - 2026-07-07

## Purpose

This file records the current UX implementation gaps against:

- the user-provided screenshots from 2026-07-07;
- the two committed visual references:
  - `docs/assets/course-planner-assembly-editor-normal-reference.png`
  - `docs/assets/course-planner-assembly-generated-assets-drawer-overlay-on-current-reference.png`
- the July 6 issue record in `docs/course-planner-ux-issue-record-2026-07-06.md`;
- the implementation plan in `docs/superpowers/plans/2026-07-06-course-planner-ux-assembly-overhaul.md`.

No runtime code changes are part of this audit.

## Current Verdict

The current Course Planner / Chapter Studio / Assembly Editor UI is not aligned with the agreed reference direction. The largest failures are:

- the normal Assembly Editor reference was not visually restored;
- route transitions show broken-looking loading layouts;
- Chapter Studio still has header/status overlap and layout collision;
- Board cards and Chapter List actions are cramped and icon sizing is inconsistent;
- Assembly Editor contains visible controls that were not requested in that form, especially the noisy alignment toolbar and text `Save Assembly` button;
- generated pipeline assets are not presented as the primary asset source in the visible Assembly state;
- previous verification did not catch real screenshot regressions in the actual user flows.

## Gap List

### G01 - Board Scene Pack action icons are the wrong size and density

- Evidence: user screenshot `codex-clipboard-6665ecea-5d8c-4378-a1b9-4890f9d5cc55.png`, left red box.
- Current failure: the Scene Pack card actions are tiny square icon buttons, visually cramped, and not balanced with the card content.
- Expected: compact, legible icon buttons with consistent hit targets, clear hover/tooltip labels, and stable placement that does not make the card look broken.
- Requirement source: July 6 discussion on using icon buttons properly and improving Scene Pack layout density.
- Severity: high.
- Required follow-up: redesign the Scene Pack card action row against the reference density, with one shared icon-button sizing rule.

### G02 - Board Chapter List item layout is wrong

- Evidence: user screenshot `codex-clipboard-6665ecea-5d8c-4378-a1b9-4890f9d5cc55.png`, right red box.
- Current failure: the drag handle, chapter number, title, description, `Open Designer`, and delete action are crowded into one awkward card; the right-side action area dominates the content.
- Expected: a dense but readable Chapter List item with a clear drag handle, title/content hierarchy, primary open action, and secondary destructive action that does not compete with content.
- Requirement source: July 6 issue record covered Scene Pack / Chapter Board layout quality and consistent navigation operations.
- Severity: high.
- Required follow-up: rebuild the Chapter List card composition instead of only shrinking controls.

### G03 - Route transition loading state looks like a broken page

- Evidence: user screenshot `codex-clipboard-c23eef76-d007-4e79-a602-96b5cc8266a6.png`.
- Current failure: navigating Scene Pack -> Chapter and Chapter -> Assembly shows a mostly blank page, tiny content stranded in the middle-left, and a floating `Loading` pill on the far right.
- Expected: stable app shell and local header remain in place; loading should use an inline skeleton, overlay, or centered workspace placeholder that reads as intentional.
- Requirement source: July 6 navigation unification requirement; user explicitly called out Scene -> Chapter and Chapter -> Assembly loading.
- Severity: critical.
- Required follow-up: implement a shared route-loading state for Course Planner workspace transitions.

### G04 - Chapter Studio top layout overlaps and collides

- Evidence: user screenshot `codex-clipboard-852ca27f-6d24-4da6-b419-cde08edc5313.png`.
- Current failure: the product top navigation, Chapter Studio title, left rail title, and top-right status pills visually overlap or collide. The title block appears under the global tab bar instead of below a stable local header.
- Expected: one unified shell with a predictable top app bar, local back/context header, and non-overlapping status placement.
- Requirement source: issue 1, unified product navigation and back context.
- Severity: critical.
- Required follow-up: fix shell stacking and reserve real layout space for the chapter header/status area.

### G05 - Chapter Studio content layout remains visually chaotic

- Evidence: user screenshot `codex-clipboard-852ca27f-6d24-4da6-b419-cde08edc5313.png`.
- Current failure: the left progress rail, main cards, right media cards, and status badges are not visually coordinated. The page reads as patched panels, not a deliberate workflow.
- Expected: locally optimized Chapter Studio layout with consistent gutters, card widths, header hierarchy, and action placement.
- Requirement source: July 6 discussion requested local optimization, not fixed-height or brittle layouts.
- Severity: high.
- Required follow-up: recompose Chapter Studio around the shared shell and use a single spacing/header system.

### G06 - Assembly Editor does not restore the normal reference image

- Evidence: user screenshot `codex-clipboard-56d2c6bc-ab7e-453c-af25-37d8e2fed1cd.png` compared with `docs/assets/course-planner-assembly-editor-normal-reference.png`.
- Current failure: the current editor lacks the reference's balanced three-column composition, asset pool quality, toolbar restraint, right properties/layers density, and visual polish.
- Expected: the normal Assembly screen should visually follow the committed reference, with useful controls only and no unrelated page noise.
- Requirement source: user explicitly required reference restoration and later called out that the current interface does not match it.
- Severity: critical.
- Required follow-up: perform a visual rebuild pass against the reference screenshot, not just feature-by-feature patching.

### G07 - Assembly asset pool is not prioritizing generated pipeline assets in the visible state

- Evidence: user screenshot `codex-clipboard-56d2c6bc-ab7e-453c-af25-37d8e2fed1cd.png`, left panel.
- Current failure: the visible section is `Uploads`, with duplicated unnamed assets and awkward usage badges. It does not present generated chapter assets as the primary import source.
- Expected: any art-pipeline asset that has completed through Codex image generation is importable and should appear in the primary generated asset section. Uploads are secondary.
- Requirement source: user clarified that quality does not matter; completion through Codex image generation makes the image importable.
- Severity: critical.
- Required follow-up: verify the data query and UI grouping so generated assets appear first when available; define the empty-generated-assets state separately.

### G08 - Asset cards contain stray or misleading UI

- Evidence: user screenshot `codex-clipboard-56d2c6bc-ab7e-453c-af25-37d8e2fed1cd.png`, left panel.
- Current failure: asset cards show small `x` text under each item, duplicate `Unnamed asset` labels, and awkward overlay usage badges.
- Expected: cards should show asset thumbnail, stable name, dimensions or generation/source metadata when useful, usage count, and clear add/import affordance.
- Requirement source: assembly reference image and asset pool usability discussion.
- Severity: high.
- Required follow-up: clean card content and remove accidental text/debug artifacts.

### G09 - Assembly toolbar exposes noisy alignment controls in the wrong form

- Evidence: user screenshot `codex-clipboard-56d2c6bc-ab7e-453c-af25-37d8e2fed1cd.png`, top toolbar.
- Current failure: many alignment/distribution-looking icon buttons are shown in the primary toolbar. The user explicitly rejected this as not part of the requested visible UI.
- Expected: mature editor interaction patterns. Basic alignment may exist only where appropriate, but it should not become a row of noisy always-visible controls that were not in the reference.
- Requirement source: issue 39 allowed basic alignment, but current visual treatment conflicts with the user's latest feedback and reference.
- Severity: critical.
- Required follow-up: re-scope alignment UI. Prefer contextual controls, menu actions, keyboard operations, or conditional multi-select tools after explicit confirmation.

### G10 - `Save Assembly` text button violates the icon-button/reference direction

- Evidence: user screenshot `codex-clipboard-56d2c6bc-ab7e-453c-af25-37d8e2fed1cd.png`, top toolbar.
- Current failure: a large disabled-looking text button `Save Assembly` remains in the toolbar.
- Expected: use autosave/status where possible. If a manual save affordance remains, it should be an icon button with tooltip/accessible label, not a large text button inside the canvas toolbar.
- Requirement source: user repeatedly confirmed using icon buttons and rejected this text button.
- Severity: critical.
- Required follow-up: remove or convert the save affordance and keep save state in the status area.

### G11 - Assembly canvas sizing/framing still misses the requested behavior

- Evidence: user screenshot `codex-clipboard-56d2c6bc-ab7e-453c-af25-37d8e2fed1cd.png`.
- Current failure: the canvas/artboard framing is visually off compared with the reference. The editor still reads as a fixed composed box rather than a canvas occupying remaining workspace height.
- Expected: left and right panels can be resized; the center canvas uses the remaining page height and width; artboard fit is stable and responsive.
- Requirement source: user explicitly rejected fixed Assembly height and required the canvas to fill remaining total page height.
- Severity: high.
- Required follow-up: audit actual CSS layout rules and verify desktop/mobile screenshots for remaining-height behavior.

### G12 - Right properties/layers panel does not match the reference interaction quality

- Evidence: user screenshot `codex-clipboard-56d2c6bc-ab7e-453c-af25-37d8e2fed1cd.png`, right panel.
- Current failure: properties and layer rows are sparse, destructive delete buttons are overexposed on layer rows, grouping affordances are not obvious, and the panel does not match the richer reference.
- Expected: mature layer panel with clear drag handles, group rows, visibility/lock affordances, multi-select states, batch/mixed edit behavior, and delete behind confirmation.
- Requirement source: issues 4, 5, 19, 20, 25, 28, 29.
- Severity: high.
- Required follow-up: rebuild the panel against the reference and verify layer ordering, selection, grouping, and delete confirmation flows.

### G13 - Multi-select and grouping need visual/interaction verification

- Evidence: current user screenshots do not demonstrate working canvas shift-click, layer shift-click, or grouping.
- Current failure: even if code exists, the delivered UI has not proven the required multi-select/grouping behaviors in the actual Assembly screen.
- Expected: shift-click multi-select on canvas and layer list, grouped layer rows, group/ungroup command, mixed edit panel, and correct layer selection states.
- Requirement source: issues 4, 5, 20, 28.
- Severity: high.
- Required follow-up: add screenshot and functional verification for multi-select, grouping, reorder, and mixed edit states.

### G14 - Delete confirmation coverage must be re-verified

- Evidence: current UI exposes delete buttons on board/chapter/layer/image surfaces.
- Current failure: visible destructive controls exist across surfaces, but the audit has not verified that every delete path opens a confirmation dialog.
- Expected: every delete operation requires confirmation.
- Requirement source: user explicitly confirmed all deletes need confirmation.
- Severity: high.
- Required follow-up: enumerate each delete path and test it: Scene Pack, Chapter, image, placement/layer, group, uploaded/generated asset where applicable.

### G15 - Button and icon sizing system is inconsistent across the three layers

- Evidence: screenshots 1, 3, and 4.
- Current failure: icons appear at inconsistent visual sizes and target sizes; some actions are tiny, some text buttons remain, and some status/action pills collide.
- Expected: shared icon-button component or size contract reused across Board, Chapter Studio, and Assembly Editor.
- Requirement source: user asked for unified nav/actions and icon-button usage.
- Severity: high.
- Required follow-up: define shared sizes, states, labels, and tooltips; apply consistently.

### G16 - Status badges collide and duplicate

- Evidence: user screenshot `codex-clipboard-852ca27f-6d24-4da6-b419-cde08edc5313.png`, top-right red box.
- Current failure: `Assembly ready` and `Saved` visually overlap/collide. In the loading screenshot, `Loading` appears stranded at the far right.
- Expected: one stable status zone per shell/header level; route status and save status should not overlap.
- Requirement source: unified shell/navigation and autosave/status discussions.
- Severity: critical.
- Required follow-up: centralize status placement for Course Planner routes.

### G17 - Board and Chapter screens still waste large useful areas

- Evidence: screenshots 1 and 2.
- Current failure: large blank regions remain, while actual controls are cramped. This recreates the original complaint about poor effective layout ratio.
- Expected: operational workspace density: important content should use available space without hero-like blank areas.
- Requirement source: original red-box complaint about Scene Pack page effective space usage.
- Severity: high.
- Required follow-up: redesign section sizing and vertical rhythm for data-dense planning work.

### G18 - Generated Chapter Assets drawer reference has not been proven in the real app state

- Evidence: no current user screenshot shows the drawer open; committed reference exists at `docs/assets/course-planner-assembly-generated-assets-drawer-overlay-on-current-reference.png`.
- Current failure: previous verification did not prove that the real drawer opens as a fixed overlay without taking page width, nor that it uses actual generated assets correctly.
- Expected: fixed-position drawer over the current Assembly screen, not a new layout column; useful generated assets only; no unrelated page information.
- Requirement source: user specifically requested the drawer not occupy page width and asked for a reference overlay.
- Severity: high.
- Required follow-up: test and screenshot the drawer-open state against the overlay reference.

### G19 - Drawer reuse requirement needs implementation audit

- Evidence: prior discussion required reusing the system drawer.
- Current failure: this audit has not verified whether the implemented generated-assets picker uses the shared system drawer or a local copy.
- Expected: reuse the existing system drawer component/pattern, including overlay behavior, focus handling, escape/close, and scroll containment.
- Requirement source: user explicitly confirmed system drawer reuse.
- Severity: high.
- Required follow-up: inspect component usage and remove local drawer duplication if present.

### G20 - Visual QA process failed to catch obvious regressions

- Evidence: current screenshots show broken layout despite previous verification and commits.
- Current failure: verification covered structural behavior but did not catch reference fidelity, real transition loading, actual user data states, or screenshot-level polish.
- Expected: verification must include screenshots for Board, Chapter loading, Chapter loaded, Assembly loading, Assembly loaded, generated drawer open, multi-select, grouping, and delete confirmation.
- Requirement source: user required reference restoration and complete coverage of discussed issues.
- Severity: critical.
- Required follow-up: make visual verification a required completion gate before any future "done" claim.

### G21 - Implementation task coverage must be reconciled against every recorded July 6 issue

- Evidence: July 6 issue record contains 42 items; current screenshots prove several were either missed or regressed.
- Current failure: there is no current traceability table showing each issue as implemented, partially implemented, rejected, or unverified.
- Expected: a one-to-one issue coverage table before further coding resumes.
- Requirement source: user warned that every recorded point must be developed with no omissions.
- Severity: critical.
- Required follow-up: create a coverage matrix and block implementation completion until every item has evidence.

## Coverage Matrix Against The 42 Confirmed July 6 Points

This matrix verifies the audit coverage, not implementation completion. `Broken` means current screenshots or known state show the requirement is not satisfied. `Unverified` means the audit cannot prove it from current screenshots or committed evidence and it must be tested before any completion claim.

| ID | Confirmed requirement | Current audit status | Audit gap / note |
|---:|---|---|---|
| 1 | Keep product `TopAppBar` on Board, Chapter Studio, and Assembly; add local back/breadcrumbs | Broken | G03, G04, G16 |
| 2 | Chapter library actions must use drawer/sheet, not inline row disclosure | Unverified in current screenshots | Covered by G19 and must be retested in Chapter Studio |
| 3 | Assembly must reuse/extract main art-pipeline selection/tree protocols | Unverified | G13, G20, G21 |
| 4 | Restore visible grouping as first-class Layer Tree operation | Unverified / visually incomplete | G12, G13 |
| 5 | Asset Pool primary source must be pipeline outputs materialized into chapter-owned assets | Broken in visible Assembly state | G07 |
| 6 | Scene Pack Board must be dense planning workspace | Broken | G01, G02, G17 |
| 7 | Chapter Studio keeps current structure but gets local optimization | Broken | G04, G05 |
| 8 | Assembly keeps three-column editor with corrected side-rail responsibilities | Broken | G06, G07, G11, G12 |
| 9 | Old tests/patches protecting rejected behavior must be deleted or rewritten | Unverified | G20, G21 |
| 10 | ADR 0018 remains architecture reference | Recorded, not visually testable | Must remain source during next implementation pass |
| 11 | Protocol cleanup must precede visual-only work | Unverified / process failure | G20, G21 |
| 12 | Pipeline asset picker only shows current Chapter Complete Image runs first version | Unverified | G18, G19, G21 |
| 13 | Selected pipeline run assets are copied into chapter-owned assets | Unverified | G07, G18 |
| 14 | Default dedupe by source run asset per Chapter | Unverified | Must be covered by backend/API tests before completion |
| 15 | Chapter Asset deletion affects chapter-owned asset and current Assembly refs only | Unverified | G14 |
| 16 | Assembly editor/canvas must not use fixed height; fill remaining viewport | Broken / unproven | G11 |
| 17 | Resized panel widths are local only, not manifest | Unverified | G11, G20 |
| 18 | Canvas auto-fit policy: before user manipulation and after Empty Scene change | Unverified | G11, G20 |
| 19 | Canvas operations follow mature editor conventions | Unverified / visually incomplete | G09, G11, G13 |
| 20 | Layer Tree follows mature layer-panel conventions | Broken / incomplete | G12, G13 |
| 21 | Placement and Group names editable without renaming source asset | Unverified | G12, G13 |
| 22 | Autosave persists manifest facts only | Unverified | G10, G16, G20 |
| 23 | Layer Tree collapsed state stays local, not manifest | Unverified | G12, G13 |
| 24 | Assembly includes baseline mature-editor shortcuts | Unverified | G13, G20 |
| 25 | Every delete operation requires confirmation | Unverified | G14 |
| 26 | Deleting a group deletes group plus child placements; Ungroup is separate | Unverified | G12, G13, G14 |
| 27 | Undo/redo covers only current Assembly manifest edits | Unverified | G09, G20 |
| 28 | Properties rail supports batch editing for multi-selection | Unverified | G12, G13 |
| 29 | Layer Tree top row represents front/topmost canvas layer | Unverified | G12 |
| 30 | New placements use display size separate from raw source image dimensions | Unverified | G11 |
| 31 | Same Chapter Asset can be placed multiple times | Unverified in current UI evidence | G07, G13 |
| 32 | Repeated placements get distinct default names | Unverified | G08, G12 |
| 33 | Drag Asset Pool item to canvas creates placement | Unverified | G07, G13 |
| 34 | Pipeline-derived assets are primary Asset Pool grouping | Broken in visible Assembly state | G07 |
| 35 | Generated asset import workflow lives in Assembly Asset Pool | Unverified | G18, G19 |
| 36 | Any completed Codex-generated image file is importable regardless quality | Unverified | G07, G18 |
| 37 | Unavailable generated outputs show disabled state plus reason | Unverified | G18 |
| 38 | No nested groups in first version | Unverified | G12, G13 |
| 39 | First version includes only scoped basic alignment/nudging; no complex snapping | Needs re-scope because current toolbar was rejected | G09 |
| 40 | Canvas marquee selection included in first version | Unverified | G13 |
| 41 | Empty Scene replacement confirms and preserves relative transforms | Unverified | G14, G20 |
| 42 | Assembly readiness/final lock uses manifest/domain facts only | Unverified | G16, G20 |

## Reference Restoration Requirements

The next implementation pass must treat these as visual acceptance targets, not loose inspiration:

- `docs/assets/course-planner-assembly-editor-normal-reference.png`
  - normal Assembly layout;
  - useful asset pool;
  - restrained icon toolbar;
  - canvas centered in remaining workspace;
  - right properties/layers panel with mature editor controls.

- `docs/assets/course-planner-assembly-generated-assets-drawer-overlay-on-current-reference.png`
  - generated assets drawer as a fixed overlay;
  - no page-width consumption;
  - content limited to import-relevant generated assets;
  - visually connected to the Assembly asset pool import action.

## Before Coding Again

Required non-code steps:

1. Reconcile all 42 July 6 recorded issues into a coverage table.
2. Mark each item as implemented, broken, partial, or unverified.
3. For every broken/partial/unverified item, attach at least one screenshot or functional test requirement.
4. Explicitly decide the alignment-control surface again, because the current toolbar treatment was rejected.
5. Verify whether generated assets are absent because of test data, data query, or UI grouping.
6. Confirm system drawer reuse in code before touching the generated-assets drawer.
7. Add visual QA states before claiming completion again.
