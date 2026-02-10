## Pantry Planner
This is a web app that lets you plan / schedule meals and generate grocery lists.

## Local database + ORM
- Copy `.env.example` to `.env.local` and set `DATABASE_URL`.
- Introspect the local database with `npm run db:introspect`.

## Invite flow env vars
- App server (`.env.local`): `INVITE_TOKEN_SECRET`, `INVITE_FUNCTION_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Optional: `INVITE_APP_ORIGIN` (set to your deployed app origin for non-local environments).
- Local behavior: when request origin is `localhost`/`127.0.0.1`, invite links now default to that local origin even if `INVITE_APP_ORIGIN` is set. Set `INVITE_APP_ORIGIN_ALLOW_DEV_OVERRIDE=true` only if you want to force override in local/dev.
- Supabase Edge Function (`send-group-invite`): `RESEND_API_KEY`, `INVITE_FROM_EMAIL`, optional `INVITE_REPLY_TO_EMAIL`, and matching `INVITE_FUNCTION_SECRET`.

## Auth email redirect env vars
- Optional: `NEXT_PUBLIC_APP_ORIGIN` to force auth email redirect links (signup confirmation + password reset) to your deployed app origin.
- Local behavior: when app runtime origin is `localhost`/`127.0.0.1`, redirects default to local origin unless `NEXT_PUBLIC_APP_ORIGIN_ALLOW_DEV_OVERRIDE=true`.
