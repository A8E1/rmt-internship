# Billing suite — Pass C: adversarial regressions

## Scope and intended behavior
Investigate and correct three concrete replica defects with failing tests before
each fix. This is not a claim about production incidents or an owner-approved tariff.
1. Numeric load-fee strings must produce the same numeric quote as numbers.
2. Negative office or loaded mileage is treated as zero, not a discount. Existing
   zero/null handling remains. This is a tolerant replica input policy, not a new fee.
3. totalCharge adds integer cents for trip, combined waiting, and rental components.
   Round each monetary component to nearest cent, ties away from zero, then sum.
   Rates/mileage calculations retain precision until a billed component is formed.
   Dollar numbers remain the public return type. Signed monetary adjustments remain.
   Supported money inputs are finite amounts whose cents and sum are safe integers.

## Boundaries
No invented 50-mile tier or after-hours tariff. Preserve the existing combined-stop
wait rule and the minutes/hours conversion. No CI, proxy, backend calls, key changes,
deployment, or unrelated UI refactor. Do not alter source snapshots outside this repo.

## Acceptance criteria
- Commit this spec before tests. For each defect: commit a failing regression,
  record the failure, then fix and commit with a passing result.
- Keep the Pass B golden master at commit 3850d53; update only affected current
  expectations and clearly identify intentional behavior changes.
- Keep a historical extraction command checking the immutable Pass A snapshot;
  do not compare intentionally corrected code against buggy outputs and call it parity.
- Run the full Vitest suite after each fix. Test current adapters and rounding cases.
- Maintain four entry-point describe blocks and table-driven boundary inputs.
- Update learning notes and reviewer explanation with commit and test evidence.
- Leave PR #1 unmerged. UI/backend integration remains outside the verified claims.

## Follow-on work
After billing review: CI and required checks, then authenticated Google API proxy.
Real key rotation remains simulated only. Production remediation is not claimed.
