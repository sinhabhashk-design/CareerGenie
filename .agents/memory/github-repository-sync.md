---
name: GitHub repository sync
description: Durable guidance for syncing this workspace to the attached GitHub repository.
---

When the configured GitHub remote rejects local Git credentials, use the attached GitHub connector's authenticated Git Data API rather than requesting or handling credentials manually.

**Why:** The workspace remote may not have a usable Git credential even though the Replit GitHub connection is active, and the connector can safely authenticate repository reads and writes.

**How to apply:** Before writing, inspect the remote branch head and preserve it as the new commit's parent. Build the commit tree from the current tracked workspace, remove remote-only files when the goal is an exact snapshot, and update the branch without force unless the user explicitly requests history replacement.