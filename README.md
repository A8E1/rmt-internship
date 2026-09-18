# RMT engineering replica

An engineering exercise based on an existing medical transport PWA. This repository
does not establish authorship of the original application or production deployment
of the changes. The original source snapshot is preserved in commit 3cf1f508616b901071b04ef24b17e03e6b9c349e.

Current phase: billing extraction (Pass A). Run npm run verify:extraction to compare
the extracted functions and their adapters against the original code offline.
This is extraction verification, not the forthcoming Vitest characterization suite.

The imported application still references its original Supabase backend. Do not use
the replica to operate on live records; the verification script does not load the app
or connect to that backend. Configure an isolated backend before interactive testing.

See SPEC.md and docs/engineering-notes for scope, review notes, and pending work.
