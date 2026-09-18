# Billing correctness — Pass A completed, suite pending

## What I built
Extracted four billing entry points and their helpers into src/lib/billing.js.
Legacy adapters in js/core.js pass current rates; index.html loads the module before boot.

## The concept
Purity boundary and dependency injection: explicit rate inputs replace mutable global
dependencies. Characterization testing comes next; extraction must preserve quirks.

## The story
The replica coupled billing calculations to application settings and browser startup.
I isolated 4 entry points, preserving the existing arithmetic and combined-wait rule.
An offline comparison against the original commit checks matching outputs and adapters
after pricing changes. This creates a boundary for later regression tests; it does
not yet establish bug fixes or production outcomes.

## Follow-ups they'll ask
- Why Vitest? Planned for native ES modules and table-driven tests; not installed yet.
- What makes this pure? Results depend on arguments, with no I/O or global reads.
- What not to test? Avoid asserting UI layout in billing tests; cover business rules
  and boundary inputs, with separate integration checks for adapters and startup.
