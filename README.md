## Pantry Planner
This is a simple web app that lets you plan / schedule meals and generate grocery lists.

## Local database + ORM
- Copy `.env.example` to `.env.local` and set `DATABASE_URL`.
- Introspect the local database with `npm run db:introspect`.

## Invite flow env vars
- App server (`.env.local`): `INVITE_TOKEN_SECRET`, `INVITE_FUNCTION_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Supabase Edge Function (`send-group-invite`): `RESEND_API_KEY`, `INVITE_FROM_EMAIL`, optional `INVITE_REPLY_TO_EMAIL`, and matching `INVITE_FUNCTION_SECRET`.
