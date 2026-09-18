# RMT engineering replica

An engineering exercise based on an existing medical transport PWA. This repository
does not establish authorship of the original app or production deployment of these
changes. Original import: 3cf1f50; pure extraction: 6fdb96a; golden master: 3850d53.

## Verification

Use Node 22.13+ or 24+; .nvmrc selects Node 22.

- npm ci installs the exact development dependencies.
- npm run lint checks JavaScript with ESLint.
- npm test runs billing, adapter, proxy-security, and map-client tests offline.
- npm run test:watch reruns tests during editing.
- npm run verify:extraction-history checks the immutable Pass A snapshot against the
  original import. This proves historical extraction parity, not current correctness.
  It requires these commits in the local Git history.

Vitest 4.1.11 and Vite 6.4.3 remain pinned. Vite is a test dependency;
the app still uses its original scripts. Billing tests use synthetic data only.

Pass C intentionally fixes numeric-string loading fees, negative-distance discounts,
and cent aggregation under the replica rules in SPEC.md. See docs/engineering-notes/
for learning artifacts, review explanations, and failing-test/fix commit evidence.
CI runs lint and tests on push and pull_request. Required-check enforcement is
unavailable on the current private-repository plan; see docs/engineering-notes/ci-review.md.
The authenticated Google API proxy is implemented with mocked verification. See
supabase/README.md for the unapplied deployment/cleanup plan. Rotation is simulated.

The imported app still references its original Supabase backend. Configure an isolated
backend before interactive use. No browser/live-data validation or deployment is claimed.
