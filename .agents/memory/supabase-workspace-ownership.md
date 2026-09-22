---
name: Supabase workspace ownership
description: How CareerGenie scopes anonymous browser workspaces while using the Replit Supabase connector.
---

CareerGenie runtime requests go through the attached Replit Supabase connector. Workspace ownership is enforced by an HTTP-only browser workspace cookie, a server-added `x-career-workspace` header, and Supabase RLS policies that match that header to each row's workspace key.

**Why:** The connector is available to server code without exposing database credentials, while the RLS header prevents the public anon role from reading rows for a different workspace.

**How to apply:** Preserve the workspace header on every Supabase read/write and do not add direct browser access to the CareerGenie tables. Replace the cookie identity with Supabase Auth user IDs when account login is implemented.

Normalized career entities use the same boundary: tables with a direct user_id compare it to x-career-workspace, while child tables authorize through their owned parent row.

**Why:** The normalized schema removes workspace_key from child records without weakening per-user isolation.

**How to apply:** Keep ownership checks in both the server query and the database policy when adding new child entities.
