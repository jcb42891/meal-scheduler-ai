# Productionize + Monetization Backlog

Created: February 8, 2026  
Last Updated: February 11, 2026 (M3 complete)  
Primary Goal: productionize Pantry Planner and ship a sustainable monetization model, starting with Magic Import.

## Status Legend
- `Not started`: work has not begun.
- `In progress`: currently being implemented.
- `Blocked`: cannot proceed without resolving a dependency.
- `Complete`: done and verified against acceptance criteria.
- `Deferred`: intentionally postponed.

## Priority Legend
- `P0`: launch blocker or direct revenue blocker.
- `P1`: high-impact improvements needed soon after launch.
- `P2`: strategic enhancements and growth bets.

## Operating Rules
1. Update `Last Updated` whenever this file changes.
2. Change item status immediately when work starts/completes.
3. Add a dated note in `Progress Log` for every status change.
4. Keep at most 3 items `In progress` at one time.
5. Do not mark `Complete` without validating acceptance criteria.

## Milestone Tracker
| ID | Milestone | Priority | Status | Target Window | Exit Criteria |
| --- | --- | --- | --- | --- | --- |
| M0 | Backlog governance and tracking setup | P0 | Complete | February 2026 | This backlog exists, with status rules, milestones, and progress log. |
| M1 | Security and data access hardening | P0 | Complete | February 2026 | RLS/policy gaps are closed and validated with access tests. |
| M2 | Auth, routing, and invite flow reliability | P0 | Complete | February 2026 | Protected routes are fully gated and invite flow is robust/reliable. |
| M3 | Durable usage metering and rate limiting | P0 | Complete | February to March 2026 | Import quotas and limits are persistent and enforceable across instances. |
| M4 | Billing + entitlement system for Magic Import | P0 | Not started | March 2026 | Paid plans, webhooks, entitlements, and paywall are live end to end. |
| M5 | Magic Import quality + margin optimization | P1 | Not started | March to April 2026 | URL deterministic parsing, model usage optimization, and parse quality metrics are in place. |
| M6 | Core product UX/data model upgrades | P1 | Not started | April 2026 | Structured recipe data and improved grocery output are shipped. |
| M7 | Observability, analytics, and experimentation | P1 | Not started | April 2026 | Monitoring + product funnel events + cost dashboards are live. |
| M8 | Automated test coverage and release pipeline | P1 | Not started | April to May 2026 | CI runs lint/type/tests and release checklist is formalized. |
| M9 | Premium growth features | P2 | Not started | May 2026+ | New premium differentiators materially improve conversion/retention. |

## Backlog Items

### M1: Security and Data Access Hardening
| ID | Priority | Status | Item | Dependencies | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- |
| SEC-001 | P0 | Complete | Tighten permissive RLS policies in `groups`, `meals`, `meal_calendar`, `staple_ingredients`, `group_members`, and related tables. | None | Unauthorized users cannot read/update/delete outside their memberships; policy tests pass. |
| SEC-002 | P0 | Complete | Add stricter DB constraints for invitations and membership integrity (status constraints, expiry behavior, uniqueness rules). | SEC-001 | Invalid invitation/membership states cannot be inserted. |
| SEC-003 | P0 | Complete | Remove sensitive debug logging from auth/invite flows (`app/auth/page.tsx`, `app/groups/accept-invite/page.tsx`, etc.). | None | No user/session/invite PII in client logs. |
| SEC-004 | P1 | Complete | Add server-side validation tests for group ownership/membership checks around critical mutations. | SEC-001 | Critical mutations fail for unauthorized users in automated tests. |

### M2: Auth, Routing, and Invite Flow Reliability
| ID | Priority | Status | Item | Dependencies | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- |
| APP-001 | P0 | Complete | Expand middleware protection to all authenticated app routes (`/meals`, `/staples`, `/profile`, relevant APIs). | None | Unauthenticated users cannot access protected routes directly. |
| APP-002 | P0 | Complete | Replace current invite link logic with signed/expiring invite tokens; avoid plain `groupId`/`inviteId` query pairs. | SEC-002 | Invite links expire and cannot be forged/replayed. |
| APP-003 | P0 | Complete | Replace TinyURL dependency in group invite flow with first-party link handling and optional server-side short links. | APP-002 | Invite links work without third-party URL shortener dependency. |
| APP-004 | P0 | Complete | Fix invite/member validation bugs in `app/groups/[id]/client-component.tsx` (incorrect member checks and column usage). | SEC-001 | Invite creation behaves correctly for existing members and pending invites. |
| APP-005 | P1 | Complete | Make invitation sending real (email provider integration for `supabase/functions/send-group-invite/index.ts`). | APP-002 | Invites are delivered via transactional email and tracked. |

### M3: Durable Usage Metering and Rate Limiting
| ID | Priority | Status | Item | Dependencies | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- |
| USG-001 | P0 | Complete | Replace in-memory import limiter in `lib/recipe-import/rate-limit.ts` with persistent distributed limiter (Redis or DB-backed). | None | Limits remain enforced across restarts and multi-instance deployments. |
| USG-002 | P0 | Complete | Create `import_usage_events` ledger table to record each parse attempt/success/failure with source type and cost metadata. | USG-001 | Every parse call records an auditable usage event. |
| USG-003 | P0 | Complete | Add monthly credit accounting tables/functions for entitlement checks. | USG-002 | User/group remaining credits are queryable and accurate. |
| USG-004 | P1 | Complete | Add admin/reporting queries for usage and overage analysis. | USG-003 | Team can view usage by day, source type, and plan tier. |

### M4: Billing + Entitlements for Magic Import
| ID | Priority | Status | Item | Dependencies | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- |
| BILL-001 | P0 | Not started | Add billing schema (`plans`, `subscriptions`, `entitlements`, `credit_purchases`). | USG-003 | Billing state is represented in DB with clear ownership and status. |
| BILL-002 | P0 | Not started | Integrate payment provider checkout + customer portal + webhook processing. | BILL-001 | Subscription lifecycle changes are reflected in DB automatically. |
| BILL-003 | P0 | Not started | Enforce entitlements in `app/api/recipe-import/parse/route.ts` before parsing. | BILL-001, USG-003 | Parse route blocks over-quota users with clear error responses. |
| BILL-004 | P0 | Not started | Add Magic Import paywall and quota UX in `app/meals/magic-recipe-import-dialog.tsx`. | BILL-003 | User sees remaining credits and upgrade path before parse attempt. |
| BILL-005 | P1 | Not started | Implement source-type weighted credit costs (image > URL > text). | BILL-003 | Credit decrement logic matches pricing strategy and is tested. |
| BILL-006 | P1 | Not started | Add grace/fallback handling for delayed webhooks and temporary billing sync issues. | BILL-002 | Entitlements remain safe and consistent during webhook delay/failure scenarios. |

### M5: Magic Import Quality + Margin Optimization
| ID | Priority | Status | Item | Dependencies | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- |
| IMP-001 | P1 | Not started | Expand deterministic URL extraction path in `lib/recipe-import/url.ts`; call LLM only when needed. | None | AI usage is reduced without lowering successful import rate. |
| IMP-002 | P1 | Not started | Capture parse quality telemetry (confidence, warnings, save rate, manual edits). | USG-002 | Quality dashboard shows quality trends by source type. |
| IMP-003 | P1 | Not started | Add import history UI and retry/reparse flow. | USG-002 | Users can view prior imports and rerun failed/low-confidence imports. |
| IMP-004 | P2 | Not started | Add batch import mode for multiple URLs/screenshots in one session. | BILL-004 | User can import multiple recipes in one flow with clear credit usage. |
| IMP-005 | P2 | Not started | Add parser prompt/model versioning for controlled rollouts and A/B testing. | M7 | Parser changes can be compared safely with measurable outcomes. |

### M6: Core Product UX/Data Model Upgrades
| ID | Priority | Status | Item | Dependencies | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- |
| UX-001 | P1 | Not started | Add structured recipe fields (instructions, source URL, import source, optional servings) via migration. | None | Data is stored in dedicated fields, not merged into description. |
| UX-002 | P1 | Not started | Update meal create/edit/view/import UI to support structured recipe fields. | UX-001 | Instructions and source metadata are editable and displayed consistently. |
| UX-003 | P1 | Not started | Fix grocery list rendering to show units consistently and improve item clarity. | None | Final list always includes quantity + unit where available. |
| UX-004 | P1 | Not started | Add unit harmonization and smarter dedupe in grocery list builder. | UX-003 | Common equivalent units are normalized and duplicates reduced. |
| UX-005 | P2 | Not started | Add aisle/category grouping and store-friendly grocery output formats. | UX-003 | Grocery output can be sorted/grouped for shopping flow. |
| UX-006 | P2 | Not started | Add smarter auto-planning constraints (avoid repeats, weeknight mix, category balance). | M5 | Calendar auto-plan quality measurably improves. |

### M7: Observability, Analytics, and Experimentation
| ID | Priority | Status | Item | Dependencies | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- |
| OBS-001 | P1 | Not started | Add error monitoring and alerting (API route failures, invite failures, billing webhook failures). | None | Critical errors generate actionable alerts. |
| OBS-002 | P1 | Not started | Instrument product events for funnel analysis (`import_started`, `import_saved`, `quota_blocked`, `upgrade_clicked`, etc.). | None | Product funnel is visible in analytics with low event loss. |
| OBS-003 | P1 | Not started | Build dashboards for activation, conversion, retention, and Magic Import cost per successful save. | OBS-002, USG-002 | Team can review conversion and margin weekly from dashboards. |
| OBS-004 | P2 | Not started | Add experiment framework for pricing/paywall variants. | OBS-002 | A/B tests can run safely with attribution and guardrails. |

### M8: Automated Testing and Release Pipeline
| ID | Priority | Status | Item | Dependencies | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- |
| QA-001 | P1 | Not started | Add unit tests for import normalization/fallback/url validation modules in `lib/recipe-import/*`. | None | Core import helpers are covered with passing tests. |
| QA-002 | P1 | Not started | Add integration tests for parse route auth/access/rate-limit/entitlement behavior. | M1, M3, M4 | Route-level critical behavior is automatically verified. |
| QA-003 | P1 | Not started | Add end-to-end smoke tests for auth -> import -> save -> calendar -> grocery flow. | QA-001, QA-002 | Happy-path E2E passes reliably in CI. |
| QA-004 | P1 | Not started | Add CI workflow for lint, typecheck, and tests on every PR. | QA-001 | PRs fail fast when regressions are introduced. |
| QA-005 | P1 | Not started | Create staging release checklist and rollback runbook. | OBS-001 | Releases follow a repeatable preflight + rollback process. |

### M9: Premium Growth Features
| ID | Priority | Status | Item | Dependencies | Acceptance Criteria |
| --- | --- | --- | --- | --- | --- |
| GRW-001 | P2 | Not started | Add pricing/plan page and in-app upgrade surfaces outside Magic Import (navbar/profile/settings). | BILL-004 | Upgrade paths are visible across the app. |
| GRW-002 | P2 | Not started | Add referral or invite-led growth loop with attribution. | OBS-002 | Referral-driven signups/conversions are measurable. |
| GRW-003 | P2 | Not started | Build browser extension/bookmarklet for one-click recipe import. | M5 | Import from external sites becomes a low-friction premium feature. |
| GRW-004 | P2 | Not started | Add family/team billing controls (seat limits, owner-managed plan). | BILL-002 | Group owner can manage plan/seat behavior predictably. |

## Recommended Execution Order (Current)
1. M1: Security and data access hardening.
2. M2: Auth/routing/invite reliability.
3. M3: Durable usage metering and persistent rate limiting.
4. M4: Billing + entitlement gating for Magic Import.
5. M5: Import quality and margin optimization.
6. M7: Observability and analytics.
7. M8: Test coverage and CI hardening.
8. M6: Structured recipe/grocery UX upgrades.
9. M9: Premium growth features.

## Progress Log
- 2026-02-08: Created `PRODUCTIONIZE_BACKLOG.md` with milestone tracker, itemized backlog, and operating rules.
- 2026-02-08: SEC-001 moved to `Complete` after adding `drizzle/0003_m1_security_data_access_hardening.sql` with tightened RLS policies across group-scoped tables and related meal ingredient access.
- 2026-02-08: SEC-002 moved to `Complete` after adding invitation/membership integrity hardening (status/expiry checks, pending invite uniqueness, email normalization trigger, owner-role membership trigger).
- 2026-02-08: SEC-003 moved to `Complete` after removing sensitive auth/invite debug logging in client and invite function paths.
- 2026-02-08: SEC-004 moved to `Complete` after adding `scripts/test-m1-security.mjs` and `npm run test:security:m1` to validate unauthorized mutation failures.
- 2026-02-08: M1 moved to `Complete` after validating policy/constraint hardening and automated access tests.
- 2026-02-08: APP-001 moved to `Complete` after expanding `middleware.ts` route/API matchers and auth redirects for `/meals`, `/staples`, `/profile`, and invite/import APIs.
- 2026-02-08: APP-002 moved to `Complete` after adding signed, expiring invite tokens and server-side token verification in `app/api/groups/invitations/*`.
- 2026-02-08: APP-003 moved to `Complete` after removing TinyURL usage and switching invite-link generation to first-party API routes.
- 2026-02-08: APP-004 moved to `Complete` after moving invite/member validation into server routes and fixing member relation usage in `app/groups/[id]/client-component.tsx`.
- 2026-02-08: APP-005 moved to `Complete` after implementing transactional invite email delivery in `supabase/functions/send-group-invite/index.ts` and tracking delivery metadata on invitations.
- 2026-02-08: M2 moved to `Complete` after validating protected route behavior, invite-link signing/expiry, first-party invite sharing, and TypeScript/lint checks.
- 2026-02-11: USG-001 moved to `Complete` after replacing in-memory import throttling with DB-backed `consume_recipe_import_rate_limit` enforcement.
- 2026-02-11: USG-002 moved to `Complete` after adding `import_usage_events` and route-level attempt/success/failure event recording for every authenticated parse request.
- 2026-02-11: USG-003 moved to `Complete` after adding monthly credit account/ledger tables and RPC functions for credit consumption and remaining-balance checks.
- 2026-02-11: USG-004 moved to `Complete` after adding admin reporting views/functions for daily usage and monthly overage analysis by source type and plan tier.
- 2026-02-11: M3 moved to `Complete` after validating persistent rate limiting, durable usage metering, credit accounting, and reporting query availability.
- 2026-02-11: Added follow-up migration `drizzle/0006_m3_credit_function_ambiguity_fix.sql` to resolve credit-function column ambiguity and revalidated rate-limit/quota RPC behavior.
