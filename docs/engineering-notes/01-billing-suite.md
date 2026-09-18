# Billing correctness — Passes A and B completed

## What I built
Extracted four billing entry points into src/lib/billing.js with explicit rates.
Added 20 table-driven characterization cases in tests/billing.test.js, plus a locked
Vitest setup; npm test runs them without loading the application or contacting its backend.

## The concept
Characterization testing captures observed behavior before changes. Dependency
injection supplies rates explicitly; the purity boundary removes browser and global
state dependencies. A passing characterization test does not make a quirk correct.

## The story
The replica lacked a billing regression suite. After preserving its calculations,
I added 20 cases covering quotes, wait intervals, rental eligibility, and totals.
All pass after a clean dependency install, alongside the original parity checks.
Three cases document arithmetic quirks for investigation; no fixes or production
outcomes are claimed yet.

## Follow-ups they'll ask
- Why Vitest over Jest? Native ES-module support and concise table-driven tests fit
  this module; no application build migration was needed.
- Why pure functions? Explicit inputs make cases repeatable without browser setup.
- What not to test? Keep UI layout and external services out of billing unit tests;
  verify adapters separately and prioritize business rules over implementation details.
