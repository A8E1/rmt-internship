# RMT engineering replica

An engineering exercise based on an existing medical transport PWA. This repository
does not establish authorship of the original application or production deployment
of the changes. The original source snapshot is preserved in commit 3cf1f508616b901071b04ef24b17e03e6b9c349e.

Current phase: characterization tests (Pass B complete). From the repository root:

- npm ci installs the exact development dependencies from package-lock.json.
- npm test runs 20 Vitest characterization cases once.
- npm run test:watch reruns tests during editing.
- npm run verify:extraction compares the module and adapters with the original code.

Tested on Node 20.17.0 with Vitest 4.1.11 and Vite 6.4.3. See the
[Vitest 4 compatibility requirements](https://v4.vitest.dev/guide/).
The app still uses its original scripts; Vite is only a test-tool dependency.
Characterization captures current outputs, including explicitly labeled quirks.
Pass C will establish expected corrections and document failing tests before fixes.

The imported application still references its original Supabase backend. Do not use
the replica to operate on live records; the verification script does not load the app
or connect to that backend. Configure an isolated backend before interactive testing.

See SPEC.md and docs/engineering-notes for scope, review notes, and pending work.
