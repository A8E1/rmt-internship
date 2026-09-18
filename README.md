# RMT engineering replica

An engineering exercise based on an existing medical transport PWA. This repository
does not establish authorship of the original app or production deployment of these
changes. Original import: 3cf1f50; pure extraction: 6fdb96a; golden master: 3850d53.

## Verification

- npm ci installs the exact development dependencies.
- npm test runs current billing and adapter regression tests offline.
- npm run test:watch reruns tests during editing.
- npm run verify:extraction-history checks the immutable Pass A snapshot against the
  original import. This proves historical extraction parity, not current correctness.
  It requires these commits in the local Git history.

Tested on Node 20.17.0 with Vitest 4.1.11 and Vite 6.4.3. Vite is a test dependency;
the app still uses its original scripts. Billing tests use synthetic data only.

Pass C intentionally fixes numeric-string loading fees, negative-distance discounts,
and cent aggregation under the replica rules in SPEC.md. See docs/engineering-notes/
for learning artifacts, review explanations, and failing-test/fix commit evidence.
CI and the authenticated Google API proxy are subsequent work. Rotation is simulated.

The imported app still references its original Supabase backend. Configure an isolated
backend before interactive use. No browser/live-data validation or deployment is claimed.
