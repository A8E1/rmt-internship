# Authenticated Google API proxy

## Scope
Replace direct browser Google Places/Routes requests with one mapsRequest adapter
and one ES-module client wrapper calling the maps-proxy Supabase Edge Function.
Support autocomplete, billing mileage, and drive-time route alternatives.

## Security contract
- Validate Authorization with supabase.auth.getUser(token); reject missing, invalid,
  expired, or anonymous users before any Google request.
- Require an active admin/driver profile from the existing profiles table via the
  caller-scoped client. RLS/role-management integrity must be verified before deployment.
- Fix upstream URLs, field masks, travel mode, and autocomplete bias on the server.
  Validate action, sizes, address/coordinate types, and optional toll flag.
- Use GOOGLE_MAPS_API_KEY from the function environment only. No service-role key.
  Fail closed on missing configuration, auth/profile failures, and invalid requests.
- Restrict browser origins, allow CORS preflight without auth, and do not forward
  auth headers or raw upstream errors/responses. Bound request size and upstream timeout.
- Remove browser key editing and persistence. Load only known nonsecret settings.
  Supply an unapplied SQL cleanup for previously stored ops keys.

## Behavior and boundaries
Preserve mileage conversion, route selection/toll fallback, duration units, address
suggestions, manual mileage overrides, and billing calculations. Maps defaults off
until a test deployment is configured. Keep the existing non-map app functionality.
No production calls, real key rotation, deployment, database migration execution,
or new caching/data-retention feature. No quota-savings or production-remediation claim.
CI remains automatic but unenforced due to the agreed private-repo plan limitation.

## Acceptance criteria
- Inventory all direct calls and gating references before edits, and verify none
  remain in browser code afterward.
- Mocked tests prove unauthorized/disabled-user/invalid-input requests cannot reach
  Google and cover allowed requests, upstream failures, CORS, wrapper auth, and
  mileage/time conversion plus existing route-selection behavior.
- npm run lint and npm test pass locally and both jobs pass on the PR revision.
- Document placeholder setup, required profile permissions, unapplied cleanup,
  simulated rotation, security limitations, and exact validation scope.
- Keep changes in one PR with reviewer explanation and a learning artifact.
