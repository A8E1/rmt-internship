# Billing suite — Pass A

## Scope
Extract suggestPrice, waitBill, rentFee, and totalCharge from js/core.js into
src/lib/billing.js as a pure ES module. Move the helpers they need with them.
Pass the current pricing object explicitly. Keep legacy global function signatures
through thin adapters so existing screens continue to work.

## Do not touch
Preserve behavior exactly, including coercion, defaults, negative inputs, floating
point results, and combining waits before rounding. No bug fixes, new billing
rules, Vitest characterization tests, CI, proxy implementation, or production calls
in this pass. Do not modify the original source snapshot or project sources.
Do not deploy, rotate real keys, or claim production remediation.

## Acceptance criteria
- The module reads no DOM, mutable app state, network, storage, or current clock.
- Rates are function arguments; there is no date-dependent billing in this code.
- Legacy adapters pass the latest PRICES object on every invocation.
- Load the module before boot can invoke billing, preserving classic-script globals.
- Compare extracted results to immutable baseline 3cf1f508616b901071b04ef24b17e03e6b9c349e, including awkward
  inputs, without contacting Supabase or Google. Check syntax and startup ordering.
- Commit this specification before implementation; commit extraction independently.
- Provide reviewer notes and a learning artifact with accurate completion status.

## Later sessions
Pass B adds passing characterization cases. Pass C adds adversarial cases against
documented expectations, retaining failing-test and fix evidence for each confirmed
bug. Do not invent three bugs, a 50-mile tier, or an after-hours surcharge.
After the billing PR: ci/github-actions, then security/edge-function-proxy.
Each bullet gets one PR and a SPEC update before its work begins.

## Scope agreed with the user
This is a replica exercise. Actual key rotation is simulated and documented only.
Live secret installation, deployment, and production verification remain unperformed.
The original snapshot references a live backend; verification must stay offline.
