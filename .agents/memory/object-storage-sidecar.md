---
name: Object storage sidecar
description: The Replit Object Storage sidecar can sign protected PUT and GET URLs without a cloud SDK dependency.
---

For private user files, the local Replit sidecar can issue short-lived signed URLs for direct browser uploads and authenticated redirects. Store only the normalized object path and searchable metadata in Supabase.

**Why:** Workspace package installation may reject cloud SDK dependencies when a command targets the monorepo root, while the sidecar is already available in the managed runtime.

**How to apply:** Keep upload URL creation and object-path validation on the authenticated API route; never expose storage credentials or send file bytes through the API.

New resume object paths must include the authenticated user ID, and download requests must verify both that scope and a matching owned resume record.

**Why:** A random path alone is not enough: anyone who learns it could otherwise re-associate the path with their own resume metadata and obtain a signed download URL.

**How to apply:** Keep legacy paths readable only through an existing owned resume record, but reject legacy paths when creating new resume metadata.