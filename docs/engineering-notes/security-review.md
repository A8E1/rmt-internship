# Security reviewer explanation

Previously, autocomplete, mileage, and duration requests called Google directly using
OPS.gkey. This change routes all three through mapsRequest and the ES-module wrapper
in src/lib/maps-client.js. The wrapper sends the current session JWT explicitly.

The function validates the token with supabase.auth.getUser, rejects anonymous users,
and reads the caller's profiles row with the caller-scoped client. Only admin/driver
roles whose active field is not false are accepted, matching the legacy active flag
semantics. Missing profiles and lookup failures fail closed. No service-role key is used.

Only mileage, duration, and autocomplete operations are accepted. The server sets
Google URLs, masks, region/bias, travel mode, and API key. Input shapes, coordinates,
lengths, JSON content type, and an 8 KiB body cap are enforced. Requests have an
eight-second upstream timeout and cannot follow redirects. Only expected response
fields are returned; provider errors are replaced with generic messages. Browser
origins must match ALLOWED_ORIGINS. Preflight is unauthenticated; paid operations are not.

The UI has a maps-enabled checkbox instead of a key field. It defaults off because
there is no deployed proxy. The app imports only known nonsecret ops settings.
The unapplied migration removes nested and flat old gkey values from app_settings.
Until actually applied, an existing key may still arrive in app_settings responses;
client filtering is not database remediation. Original source/history are unchanged.

Mileage rounding, duration minutes, SH-288 exclusion/toll fallback, multi-stop totals,
and manual mileage overrides are tested through the current legacy functions. The
billing module itself is unchanged. Auth, profile reads, and Google are mocked; tests
verify call order and denial paths, not real token issuance or deployed gateway behavior.
The Deno entrypoint/SDK import and SQL migration have not been run against a test project.

Production prerequisites remain: secure profile RLS and role assignment; an isolated
backend smoke test; provider API restrictions and suitable egress controls; revocation
of any exposed key; clearing old settings/backups where appropriate; and quotas/rate
limits. No cache is added, avoiding unverified savings and retention assumptions.
CI runs but required checks remain unavailable on the current private-repo plan.

Local validation: ESLint and all 103 Vitest tests passed (36 billing/adapter tests, 46 proxy tests, and 21 map-client/integration tests). git diff --check passed. Client scans found no direct Google API endpoints, Google key headers, or old key fields; the billing module is unchanged from main.

Pre-existing follow-up found during review: sendOnMyWay names the routesDuration result sec and multiplies it by 1000 even though routesDuration returns minutes. This security refactor preserves that caller; correcting the ETA unit mismatch requires a separate regression and fix. Do not claim all ETA behavior is correct.
