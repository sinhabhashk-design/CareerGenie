---
name: Server-side document extraction
description: Runtime packaging and ownership constraints for extracting uploaded PDF and DOCX files.
---

Document parsing belongs on the authenticated API after the storage upload, using an object path that has already been checked against the current user.

**Why:** Browser metadata and client-side placeholders cannot produce trustworthy searchable resume text, and parsing server-side keeps the stored representation consistent across devices.

**How to apply:** Download through the protected object-storage sidecar, parse PDF/DOCX/TXT bytes, and persist only normalized text and structured metadata in the owned resume row.

The current PDF parser relies on a Node canvas runtime that must be directly available to the API package when the server bundle is executed.

**Why:** Bundling the parser without a direct canvas dependency can compile successfully but fail during API startup while initializing PDF support.

**How to apply:** Treat parser runtime dependencies as API production dependencies and verify both a bundled import and a real PDF extraction before delivery.