---
name: Career workspace authentication
description: Durable constraints for keeping CareerGenie workspaces private and persistent.
---

CareerGenie workspace records must always be scoped by the authenticated database user ID in the server query, not filtered only after fetching.

**Why:** The workspace contains applications, recommendations, CV versions, and interview history that must not be visible across candidates.

**How to apply:** Keep ownership predicates in every read, update, and delete query, and preserve cookie/session authentication for browser requests.

Authenticated profiles are mirrored into Supabase `public.users`, but the table remains self-scoped by the same workspace header rather than exposing a general user directory.

**Why:** User records contain account identity data and should not become readable by another candidate simply because they are signed in.

**How to apply:** Upsert the authenticated user's own row during account creation or sign-in, always pass that user's ID as the workspace header, and add a separate audited admin path if a user directory is ever needed.

The artifact preview build requires both PORT and BASE_PATH environment variables; the managed workflow supplies them automatically.

**Why:** The Vite config intentionally fails fast when either routing or port configuration is missing.

**How to apply:** Use the managed workflow for preview verification, or provide both variables for standalone production builds.