# Pass A reviewer explanation

Billing previously read the mutable PRICES global directly. This change moves the
four entry points and their calculation helpers to an ES module accepting pricing
as an argument. Existing screens retain their function signatures through adapters
that supply the latest settings on every call.

No billing arithmetic, rounding, coercion, rental defaults, or combined-stop waiting
rules change. The page now imports the module before calling boot; all existing
classic scripts and inline handlers retain their global scope. Cache headers cover
the new module path just as they cover existing scripts.

Validation: scripts/verify-billing-extraction.mjs compares outputs against the pinned
original Git commit, exercises adapters before and after rate replacement, and checks
startup wiring. No backend requests are made. An interactive browser check against
an isolated backend remains pending; this pass does not claim full UI verification.

Keep this PR open through Pass B and Pass C. Do not merge extraction alone as evidence
of a finished regression suite, three bug fixes, CI enforcement, or production security.

Recorded validation: 61,720 output comparisons passed; input immutability, current-rate adapters, startup wiring, JavaScript syntax checks, and git diff --check passed. These are parity checks, not 61,720 independently designed business tests.
