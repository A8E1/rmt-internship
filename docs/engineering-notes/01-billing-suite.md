# Billing correctness — Passes A, B, and C

## What I built
Extracted four billing entry points into src/lib/billing.js with explicit rates.
Added characterization and adversarial tests in tests/billing.test.js, plus current
UI-adapter checks in tests/billing-adapters.test.js.

## The concept
Characterization testing records the starting behavior; regression tests specify
corrections. Dependency injection isolates rates. Integer-cents aggregation avoids
adding fractional dollar components directly.

## The story
An existing PWA replica lacked billing tests. I preserved its behavior, added 20
characterization cases, then reproduced 3 defects against explicit replica rules:
string fees, negative mileage, and fractional-cent totals. Each has a failing-test
commit followed by a verified fix. The original golden master remains in Git;
these results establish local regression evidence, not production incident resolution.

## Follow-ups they'll ask
- Why Vitest? ES-module support and it.each suit these pure calculations.
- Why purity? Rates are arguments, so tests need neither browser nor backend.
- What not to test? Keep external services and layout separate; test business
  boundaries and adapter wiring. No claim of full browser or production validation.
