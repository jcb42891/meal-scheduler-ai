# Magic Recipe Import Tool - Implementation Plan

## Feature Goal
Create a new **Magic Recipe Import Tool** that lets users import a recipe from:

1. A screenshot/image
2. A recipe URL
3. Raw pasted text

Then convert it into a meal in the existing Meal Library (`meals` + `meal_ingredients`).

## Milestone Tracker
Status values:
- `Not started`
- `In progress`
- `Blocked`
- `Complete`

| ID | Milestone | Status | Owner | Exit Criteria |
| --- | --- | --- | --- | --- |
| M0 | Planning + milestone definition | `Complete` | Codex | Plan doc exists with milestone tracker and acceptance criteria. |
| M1 | Backend parse foundation | `Complete` | Codex | Parse API can accept `image/url/text`, authorize group membership, call LLM, and return validated normalized JSON. |
| M2 | Meal Library UI integration | `Complete` | Codex | Users can parse content in a new dialog, review/edit fields, and save into `meals` + `meal_ingredients`. |
| M3 | Hardening and safeguards | `Not started` | Codex | URL/file validation, timeout handling, parse error UX, and rate-limit strategy are implemented. |
| M4 | QA + rollout readiness | `Not started` | Codex | Manual test matrix passes for all import types and key edge cases; env/config/docs are updated. |
| M5 | Optional schema enhancement (V2) | `Not started` | Codex | Optional migration for structured recipe metadata is shipped and used by UI where needed. |

## Progress Log
- 2026-02-08: Created initial feature plan and milestone tracker in `MAGIC_RECIPE_IMPORT_PLAN.md`.
- 2026-02-08: Added explicit milestone statuses, owners, and exit criteria for ongoing tracking.
- 2026-02-08: Started M1 implementation (backend parse foundation).
- 2026-02-08: Completed M1 implementation with parse route, auth/group access checks, OpenAI integration, schema validation, normalization, and env updates.
- 2026-02-08: Started M2 implementation (Meal Library UI integration).
- 2026-02-08: Completed M2 implementation with `Magic Import` dialog, parse/review flow, and save-to-library wiring.

## Product Flow
1. User opens `Meal Library`.
2. User clicks a new `Magic Import` button.
3. User chooses import type: `Screenshot`, `URL`, or `Text`.
4. App sends the input to a secure server parse endpoint.
5. LLM returns structured recipe JSON.
6. User reviews/edits parsed data in a confirmation step.
7. User saves.
8. App writes to Supabase `meals`, `ingredients`, `meal_ingredients`.
9. Meal list refreshes and shows success toast.

## Where It Fits in the Existing App
1. `app/meals/page.tsx`
   - Add `Magic Import` button next to `Create Meal`.
   - Add modal state and callbacks.
2. `app/meals/magic-recipe-import-dialog.tsx` (new)
   - Multi-step import UI and review/edit form.
3. `app/api/recipe-import/parse/route.ts` (new)
   - Secure server-side parse endpoint.
4. `app/meals/create-meal-dialog.tsx` and/or shared helper
   - Reuse or extract meal save logic so manual create and import share persistence behavior.
5. `lib/recipe-import/*` (new helpers)
   - Prompting, schema validation, normalization, unit mapping, category mapping.

## Backend Architecture
### Endpoint
- `POST /api/recipe-import/parse`

### Input Contract
- `groupId` (required)
- `sourceType` = `image | url | text`
- One payload:
  - `image` file (multipart)
  - `url` string
  - `text` string

### Auth + Authorization
1. Validate authenticated user from Supabase auth cookie.
2. Validate user is in target group (`groups` owner or `group_members` row) before any LLM call.

### Parse Pipeline by Source Type
1. **Image**
   - Accept image bytes directly to a multimodal model.
   - No separate OCR dependency required for V1.
2. **URL**
   - Server-fetch page HTML.
   - Try structured recipe data (JSON-LD).
   - Fallback to cleaned text extraction.
3. **Text**
   - Use raw text directly.

### LLM Output Contract
Require strict JSON output:
- `name`
- `description`
- `category`
- `weeknightFriendly`
- `ingredients[]` with `{ name, quantity, unit }`
- `instructions[]` or instruction text
- optional `warnings[]`
- optional `confidence`

### Normalization Layer
Normalize parsed content to current app constraints:
1. Category mapped to existing categories in `app/meals/meal-utils.ts`:
   - `Poultry`, `Beef`, `Pork`, `Fish`, `Vegetarian`
2. Unit mapped to supported units used by meal dialogs:
   - `unit`, `oz`, `g`, `kg`, `ml`, `l`, `tbsp`, `tsp`, `cup`
3. Missing/ambiguous quantity defaults safely (for example `1 unit`) and records warnings.

## Client UX Design
### `MagicRecipeImportDialog` (new)
### Step 1: Source Input
- Tabs: `Screenshot`, `URL`, `Text`
- Screenshot tab: file chooser (image only, size cap)
- URL tab: text input + basic URL validation
- Text tab: large textarea
- `Parse Recipe` button

### Step 2: Review & Edit
- Editable fields:
  - Meal name
  - Category chips
  - Weeknight-friendly toggle
  - Description
  - Ingredient rows (name, quantity, unit, remove/add)
  - Instructions text (for V1, may be appended to description)
- Show parse warnings and low-confidence notes.

### Step 3: Save
- Create meal in selected group
- Resolve ingredient IDs:
  - Match existing by case-insensitive name
  - Create missing ingredients
- Insert `meal_ingredients`
- Close dialog, refresh meals, toast success/failure

## Data Model Strategy
### V1 (Recommended for first release)
- No schema changes.
- Store recipe instructions inside `meals.description` (formatted with section breaks).
- Fastest path with minimal migration risk.

### V2 (Optional enhancement)
Add migration for richer recipe data:
- `meals.instructions` (text)
- `meals.source_url` (text)
- `meals.import_source` (text enum-like)
- optional `meals.servings` (numeric/int)

Roll V2 after V1 proves value.

## Dependencies
### Required
1. `openai` - official SDK for LLM parsing calls

### Recommended
1. `zod` - schema validation for LLM output

### Optional
1. `cheerio` - robust HTML extraction for URL imports

## Security, Reliability, and Cost Controls
1. Never expose provider API key to client; all LLM calls server-side only.
2. Enforce allowed URL schemes (`http/https`) and block local/private network targets.
3. File validation:
   - MIME allowlist (`image/png`, `image/jpeg`, `image/webp`)
   - max file size
4. Add per-user or per-group rate limiting on parse endpoint.
5. Set network and parse timeouts with clear UI error states.
6. Add user disclosure that imported content is sent to external AI provider.

## Environment Variables
Add to `.env.example` (no secrets committed):
- `OPENAI_API_KEY=`

If provider/model config is needed:
- `RECIPE_IMPORT_MODEL=` (optional override)

## Testing and Validation Plan
1. **Manual UI validation**
   - Screenshot parse with clean text and noisy text.
   - URL parse across multiple recipe sites.
   - Raw text parse for simple and complex recipes.
2. **Edge cases**
   - Missing quantities
   - Non-standard units
   - Duplicate ingredients
   - Very long recipes
   - Invalid URLs and oversized images
3. **Authorization checks**
   - User cannot parse/import into unauthorized group.
4. **Persistence checks**
   - Meal inserted correctly
   - Ingredients reused when existing
   - `meal_ingredients` quantities/units saved correctly

## Milestones in Execution Order
### M0: Planning + Milestone Definition
- Status: `Complete`
- Deliverables:
  - Feature architecture documented.
  - Milestone tracker and progress log established.
- Exit criteria:
  - Team can track implementation by milestone with clear status and completion conditions.

### M1: Backend Parse Foundation
- Status: `Complete`
- Deliverables:
  - Add `app/api/recipe-import/parse/route.ts`.
  - Add provider integration for LLM parse calls.
  - Add schema validation for model responses.
  - Add normalization helpers for category, unit, and ingredient values.
  - Add env variable docs (`OPENAI_API_KEY`, optional model override).
- Exit criteria:
  - Endpoint successfully parses all source types (`image`, `url`, `text`) and returns normalized payload.
  - Unauthorized users cannot parse for groups they do not belong to.

### M2: Meal Library UI Integration
- Status: `Complete`
- Deliverables:
  - Add `Magic Import` button to `app/meals/page.tsx`.
  - Build `app/meals/magic-recipe-import-dialog.tsx`.
  - Implement parse -> review/edit -> save workflow.
  - Reuse/extract meal persistence logic to keep behavior consistent with manual create/edit flows.
- Exit criteria:
  - User can import from screenshot/URL/text and save a meal successfully in the selected group.
  - Imported meal appears in meal list immediately after save.

### M3: Hardening and Safeguards
- Status: `Not started`
- Deliverables:
  - URL protocol and host safety checks.
  - File type/size validation for image uploads.
  - Timeout and error handling for fetch/parse operations.
  - Rate-limit strategy for parse endpoint.
  - User-facing warning/disclosure around external AI processing.
- Exit criteria:
  - Invalid/unsafe inputs are rejected with clear errors.
  - Endpoint has guardrails for abuse and runaway costs.

### M4: QA + Rollout Readiness
- Status: `Not started`
- Deliverables:
  - Execute manual test matrix across all 3 import modes.
  - Validate edge cases: missing quantities, odd units, duplicates, long recipes, bad URLs, oversized images.
  - Confirm persistence correctness in `meals`, `ingredients`, and `meal_ingredients`.
  - Confirm docs/config updates are complete.
- Exit criteria:
  - No blocking issues in core import flow.
  - Feature is stable for release behind current auth/group boundaries.

### M5: Optional Schema Enhancement (V2)
- Status: `Not started`
- Deliverables:
  - Optional migration for structured recipe fields:
    - `meals.instructions`
    - `meals.source_url`
    - `meals.import_source`
    - optional `meals.servings`
  - UI updates to display/use structured fields.
- Exit criteria:
  - V2 schema migration applied successfully and UI consumes new fields without regressions.

## How Progress Updates Should Be Recorded
1. Update `Status` in the milestone table when work starts/completes.
2. Add a dated line to `Progress Log` every time a milestone status changes.
3. If blocked, set status to `Blocked` and add blocker details in `Progress Log`.
4. Keep implementation commits mapped to milestone IDs (`M1`, `M2`, etc.) when possible.

## Notes on Existing Constraints
1. There are currently no existing Next.js API routes, so this feature introduces the first route-handler pattern.
2. Current meal schema supports this feature immediately (V1) without DB changes.
3. Current ingredient unit options should remain authoritative in normalization logic.
