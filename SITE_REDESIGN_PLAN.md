# Site Redesign - Implementation Plan

## Feature Goal
Redesign the app's visual system and layout so the experience feels cohesive, polished, and intentional across all authenticated routes, with special focus on:

1. Stronger typography and visual hierarchy
2. Cleaner navigation and page shell consistency
3. Better action layout (especially Meal Library header actions)
4. Reusable UI patterns for page headers, controls, cards, and spacing

Scope for this plan is CSS/UI only. No Supabase schema/auth/data behavior changes.

## Milestone Tracker
Status values:
- `Not started`
- `In progress`
- `Blocked`
- `Complete`

| ID | Milestone | Status | Owner | Exit Criteria |
| --- | --- | --- | --- | --- |
| M0 | Planning and tracker setup | `Complete` | Codex | Plan document exists with milestones, acceptance criteria, and rollout sequence. |
| M1 | Design tokens and typography foundation | `Complete` | Codex | Global tokens and typography scale are updated and consistently used by base UI primitives. |
| M2 | App shell and navigation redesign | `Complete` | Codex | Navbar and global layout feel cohesive, responsive, and visually integrated with the new system. |
| M3 | Reusable page header/action rail pattern | `Complete` | Codex | Shared pattern is introduced and used by key pages for consistent title/context/action structure. |
| M4 | Meal Library layout and action cleanup | `Complete` | Codex | Top-level Meal Library actions are re-prioritized and uncluttered with clear primary vs secondary actions. |
| M5 | Cross-route visual alignment | `Complete` | Codex | Calendar, Staples, Groups, Profile, Auth, and Landing align with shared visual language and spacing rules. |
| M6 | QA, accessibility, and polish pass | `Complete` | Codex | Responsive, focus, and contrast checks pass; no major visual regressions in core routes. |

## Progress Log
- 2026-02-08: Created initial redesign plan and milestone tracker in `SITE_REDESIGN_PLAN.md`.
- 2026-02-08: Started M1 by refactoring `app/globals.css` tokens and base typography styles.
- 2026-02-08: Completed M1 by standardizing foundational UI primitives (`Button`, `Card`, `Input`, `Select`, `IconButton`, `Chip`) and validating with `npm run lint`.
- 2026-02-08: Started M2 by refining app shell spacing in `app/layout.tsx` and redesigning navbar structure in `app/components/navbar.tsx`.
- 2026-02-08: Completed M2 with improved desktop active navigation, clearer mobile navigation access, and lint validation.
- 2026-02-08: Started M3 by introducing a shared page header/action rail component in `components/page-header.tsx`.
- 2026-02-08: Completed M3 by applying the shared header pattern to `app/meals/page.tsx` and `app/staples/page.tsx`, then validating with `npm run lint`.
- 2026-02-08: Started M4 by reworking Meal Library action hierarchy in `app/meals/page.tsx`.
- 2026-02-08: Completed M4 by making `Create Meal` the persistent primary CTA, moving `Magic Import` to secondary context controls, and moving `Build Grocery List` into a contextual selection rail with clear/reset behavior.
- 2026-02-08: Started M5 by aligning Calendar, Groups, Group detail, Profile, Auth, Landing, and password-reset route styling with shared page shell patterns.
- 2026-02-08: Completed M5 with shared header treatment rollout and consistent card/spacing/contrast styling across core routes, then validated with `npm run lint`.
- 2026-02-08: Started M6 with a final accessibility/polish pass across navigation focus states and key CTA hierarchy checks.
- 2026-02-08: Completed M6 by validating layout cohesion with `npm run lint`, tightening focus-visible behavior in navbar navigation, and promoting `Magic Import` on `app/meals/page.tsx` with a `Sparkles` icon next to `Create Meal`.

## Design Direction
1. Keep a warm, food-friendly palette but improve contrast and hierarchy.
2. Use one clear typography system and remove conflicting defaults.
3. Create a premium but lightweight shell with stronger page structure.
4. Reduce visual noise by grouping actions and lowering secondary CTA emphasis.
5. Keep controls consistent (`Button`, `Input`, `Select`, cards, chips, icon buttons).

## Information Architecture and Layout Strategy
### Global shell
1. Refine `app/layout.tsx` container behavior and vertical rhythm.
2. Ensure page spacing is consistent across all authenticated routes.

### Navigation
1. Redesign `app/components/navbar.tsx` with clearer active state and hierarchy.
2. Improve mobile behavior so nav access is predictable and not hidden behind awkward control grouping.

### Page pattern
Adopt one shared page structure:
1. Header block: title + supporting description
2. Context row: group selector / scope control
3. Action rail: one primary CTA + secondary actions
4. Content section(s): cards/grids/lists with consistent spacing

## Meal Library Specific Changes (Priority)
Target file: `app/meals/page.tsx`

Problems to address:
1. Too many same-weight actions in one row
2. Contextual action (`Build Grocery List`) competes with creation actions
3. Header controls become clumsy on small screens

Planned redesign:
1. Keep `Create Meal` as the single persistent primary action.
2. Move `Magic Import` into secondary action placement (outline/ghost or overflow).
3. Make `Build Grocery List` contextual and tied to selected meal count, separated from creation controls.
4. Align group selector and filters into a dedicated controls row.

## Files in Scope
### Foundation
- `app/globals.css`
- `tailwind.config.ts`
- `app/layout.tsx`

### Navigation and shared UI
- `app/components/navbar.tsx`
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/input.tsx`
- `components/ui/select.tsx`
- `components/ui/icon-button.tsx`
- `components/ui/chip.tsx`

### Route-level rollout
- `app/meals/page.tsx`
- `components/meal-filter-rack.tsx`
- `app/calendar/page.tsx`
- `app/staples/page.tsx`
- `app/groups/page.tsx`
- `app/groups/[id]/client-component.tsx`
- `app/profile/page.tsx`
- `app/auth/page.tsx`
- `app/page.tsx`
- `app/update-password/page.tsx`
- `app/auth/update-password/page.tsx`

## Execution Order
### M1: Design tokens and typography foundation
Deliverables:
1. Update color/surface/radius/shadow tokens in `app/globals.css`.
2. Remove conflicting font defaults and standardize typography scale.
3. Ensure base body/text styles are coherent across light/dark themes.

### M2: App shell and navigation redesign
Deliverables:
1. Refine shell spacing and container in `app/layout.tsx`.
2. Redesign navbar states and spacing in `app/components/navbar.tsx`.
3. Improve mobile nav discoverability and consistency.

### M3: Reusable page header/action rail pattern
Deliverables:
1. Introduce shared header/action composition pattern.
2. Apply pattern first to Meals and Staples.
3. Ensure responsive behavior is consistent at mobile and desktop breakpoints.

### M4: Meal Library layout and action cleanup
Deliverables:
1. Rework header control grouping in `app/meals/page.tsx`.
2. Reposition `Create Meal`, `Magic Import`, and `Build Grocery List` based on action priority.
3. Keep selected-meal state visible and actionable without clutter.

### M5: Cross-route visual alignment
Deliverables:
1. Apply same pattern language to Calendar, Groups, Profile, Auth, Landing, and password pages.
2. Normalize card/list spacing, heading hierarchy, and action density.
3. Ensure route-specific views still feel like one product family.

### M6: QA, accessibility, and polish pass
Deliverables:
1. Validate responsive behavior on small and large breakpoints.
2. Verify keyboard focus visibility and interactive states.
3. Verify color contrast and readability in key surfaces.
4. Remove rough edges in spacing, alignment, and hover/active transitions.

## Acceptance Checklist
- [x] Meal Library top actions are uncluttered and clearly prioritized.
- [x] Navigation feels consistent and polished across desktop/mobile.
- [x] Typography and spacing hierarchy are consistent across pages.
- [x] Shared controls have consistent visual language and interaction states.
- [x] No major visual regressions in Calendar, Meals, Staples, Groups, Profile, Auth.

## How to Update This File During Implementation
1. Update milestone `Status` when work starts/completes.
2. Add dated entries to `Progress Log` for each major checkpoint.
3. If blocked, set milestone status to `Blocked` and document the blocker in `Progress Log`.
4. Keep commits and PR notes mapped to milestone IDs (`M1`, `M2`, etc.) when possible.
