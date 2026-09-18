# Billing suite — Pass B: characterization

## Scope
Add Vitest and a committed npm lockfile. Write literal expected-output cases for
suggestPrice, waitBill, rentFee, and totalCharge in tests/billing.test.js.
Use one describe block per entry point and it.each for table-driven examples.
These tests record existing behavior, including quirks; they do not approve every
observed behavior as a business rule. Pass A's scope is archived in docs/specs/pass-a.md.

## Do not touch
No production JavaScript, HTML, billing fixes, CI, Edge Function, live credentials,
backend calls, or deployment changes. Do not invent mileage tiers or surcharges.
Leave the existing PR in draft. Pass C is a separate session and commit sequence.

## Acceptance criteria
- npm test runs vitest run and all characterization cases pass.
- Cases use explicit expected values, not formulas copied from the implementation.
- Cover ordinary quotes, waiting intervals, rental eligibility, combined-stop waiting,
  recorded-versus-estimated waiting, and representative existing arithmetic quirks.
- Mark quirks as observations, not intended policy; no claim of bugs fixed.
- npm run verify:extraction still passes against the original commit.
- npm ci can reproduce the installed development dependencies from the lockfile.
- Commit this specification before tests and tooling; update learning/reviewer notes.

## Following work
Pass C evaluates adversarial cases against explicit intended behavior, then records
failing tests and fixes for confirmed bugs. CI and security follow in their own PRs.
Key rotation remains a simulation; no production security claim is supported.
