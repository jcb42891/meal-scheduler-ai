# AGENTS.md - meal-scheduler-ai

Project snapshot
- App type: Next.js (App Router) + TypeScript + Tailwind; Supabase for auth/data.
- Main entry: `app/layout.tsx` (AuthProvider + Navbar + global layout).
- Auth gate: `middleware.ts` redirects unauthenticated users to `/auth`.

How the app is organized
- Routes live in `app/` (App Router). Each folder with `page.tsx` is a route.
- Shared UI primitives in `components/ui/` (button, card, dialog, etc.).
- Feature helpers live next to their pages (e.g., `app/meals/*`, `app/calendar/*`).
- Data/auth utilities in `lib/` (`lib/supabase.ts`, `lib/contexts/AuthContext.tsx`, `lib/utils.ts`).
- Supabase edge functions + config in `supabase/`.
- Global styles in `app/globals.css`; static assets in `public/` and some page-local assets in `app/`.

Key routes and where to look
- Marketing/landing: `app/page.tsx` (hero landing, link to auth).
- Auth: `app/auth/page.tsx` (sign in/up, forgot password dialog).
- Password reset: `app/auth/update-password/page.tsx` and `app/update-password/page.tsx`.
- Calendar + grocery list: `app/calendar/page.tsx` with modals in `app/calendar/*`.
- Meal library CRUD: `app/meals/page.tsx` with dialogs and helpers in `app/meals/*`.
- Groups: `app/groups/page.tsx` and `app/groups/[id]/page.tsx` (group management).
- Accept invite: `app/groups/accept-invite/page.tsx`.
- Profile: `app/profile/page.tsx`.
- Global navigation: `app/components/navbar.tsx`.

Supabase touchpoints
- Client: `lib/supabase.ts` (`createClientComponentClient`).
- Auth context: `lib/contexts/AuthContext.tsx` (session/user state).
- Edge function: `supabase/functions/send-group-invite/index.ts`.
- Middleware redirects based on session: `middleware.ts`.

UI + styling
- Tailwind config: `tailwind.config.ts`.
- Shared UI components: `components/ui/*`.
- Toasts: `sonner` (used in most pages).

Suggested navigation flow (for future work)
- Start with the route in `app/` you’re touching.
- Check for local components or helpers in the same folder.
- If auth/state issues: inspect `lib/contexts/AuthContext.tsx`, `lib/supabase.ts`, `middleware.ts`.
- If UI primitives or shared styles: check `components/ui/*` and `app/globals.css`.
- If group/meal/calendar data is involved: search for Supabase table names in the feature folder.
