# CareerGenie

CareerGenie is an AI-assisted career workspace that connects job targeting, CV improvement, application tracking, and interview practice.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/career-genie run dev` — run the CareerGenie web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Supabase schema changes are applied through the connected Supabase migration workflow
- Required runtime configuration: attached Supabase connector and `SUPABASE_URL`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: Supabase PostgreSQL via the Replit Supabase connector and PostgREST
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/career-genie/src/App.tsx` — routed CareerGenie experience and demo-safe workspace flows
- `artifacts/career-genie/src/index.css` — warm intelligence theme tokens, typography, and motion
- `artifacts/api-server/src/routes/career.ts` — workspace-scoped CareerGenie API
- `artifacts/api-server/src/lib/career-store.ts` — Supabase persistence, user profiles, seed data, and row mapping
- `artifacts/api-server/src/lib/supabase.ts` — connector-backed Supabase REST access
- `lib/api-spec/openapi.yaml` — source of truth for dashboard, applications, recommendations, and interview contracts
- `lib/api-client-react/src/generated/` — generated React Query client

## Architecture decisions

- Keep `applicationId` as the central context object for match analysis, recommendations, CV output, and interview preparation.
- Use generated OpenAPI hooks on the client, backed by Supabase persistence; the local fallback remains only as a graceful demo state if the API is unavailable.
- Use Supabase Auth-backed accounts with an HTTP-only server session; scope the Supabase workspace header to the authenticated user ID and migrate any anonymous workspace on first sign-in.
- Mirror each authenticated account into the Supabase `public.users` table on sign-up and sign-in; protect profile rows with the same workspace-scoped RLS header.
- Keep recommendation decisions explicit; generated copy is never applied silently.
- Treat the visual language as “warm intelligence”: aubergine workspace surfaces, apricot action accents, and mint proof states.

## Product

- Landing page focused on the promise: from “I want this job” to “I’m ready for the interview.”
- Dashboard with readiness, application momentum, and next best action.
- Application tracker with search, status filters, and manual status updates.
- New application flow with job URL/pasted description and CV selection/upload.
- Per-application workspace with match breakdown, explainable recommendations, tailored CV preview, and role-specific mock interview.
- Profile/preferences surface.

## User preferences

- The product should feel like “Genie”: supportive, optimistic, memorable, and grounded in the candidate’s own story.

## Gotchas

- CareerGenie data is now persisted in Supabase and seeded per browser workspace on first access.
- Authenticated account profiles are persisted in Supabase `public.users`; this table intentionally allows each user to access only their own profile row.
- Signed-out visitors see the public landing/auth flow. CareerGenie routes require a Supabase Auth account, and the legacy anonymous workspace cookie is only used once to migrate pre-account work.
- The app artifact build needs workflow-provided `PORT` and `BASE_PATH`; use the managed workflow for normal runs.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
