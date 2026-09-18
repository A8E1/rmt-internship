# Pre-migration map call inventory

Baseline: merged CI commit 81eb183.
- js/admin.js acSuggest: Places autocomplete; pickup/dropoff/stop/return/home inputs.
- js/admin.js routesMiles -> autoMiles: office leg, one-way/round-trip, multiple stops,
  different return address. Keep meters/1609.344 rounded to one decimal and manual overrides.
- js/logic.js _routesCall -> routesDuration: route alternatives, SH-288 express-lane
  exclusion, toll-free fallback, fastest route seconds converted to whole minutes.
- routesDuration callers: recomputeReportTime, sendOnMyWay, fleet driver suggestions,
  settings connection test. Preserve these callers and their existing result units.
- OPS.gkey gates: autocomplete inputs and handler, mileage handler, autoMiles,
  report-time recompute, on-the-way ETA, fleet suggestions, settings edit/save/test.
- js/core.js DEFAULT_OPS and app_settings import can retain old browser-readable keys.

After migration, these paths use mapsRequest and the mapsEnabled setting. Old settings
are loaded by known-key allowlist. Database cleanup is supplied but not executed.
External Google Maps navigation links stay as links; they do not use an API key.
