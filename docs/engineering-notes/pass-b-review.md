# Pass B reviewer explanation

The extracted billing module had no readable regression suite. This change adds
tests/billing.test.js with four describe blocks and 20 literal expected-output cases
using it.each. Tests import only the pure module and use synthetic pricing data.

Coverage includes ordinary one-way, round-trip, and multi-stop quotes; stretcher
rates; 15-minute wait boundaries; rental defaults; combined-stop waiting; and the
precedence of recorded waits over estimates. Three explicitly labeled observations
preserve negative-mileage discounts, string-fee concatenation, and floating-point
residue. These tests describe the current code, not approved billing policy.

package.json adds npm test and test:watch. Vitest 4.1.11 and Vite 6.4.3 are pinned
with package-lock.json, compatible with the installed Node 20.17.0 runtime.
The choice follows the [Vitest 4 requirements](https://v4.vitest.dev/guide/).
Vite is test tooling here; the production app is not migrated to a Vite build.

Validation: npm ci succeeded; npm test passed all 20 cases; npm run verify:extraction
passed 61,720 parity comparisons; git diff --check passed. A diff against Pass A
confirmed that src/, js/, index.html, and _headers are unchanged. No live backend
calls, browser validation, production deployment, or bug fixes were performed.

Next, Pass C must define intended behavior before writing failing regression cases.
If an intentional fix changes a characterization output, update that current-output
expectation explicitly and preserve this Pass B commit as the historical golden master.
The parity verifier is specific to behavior-preserving extraction; do not pretend
it should still match the original after deliberate bug fixes.
