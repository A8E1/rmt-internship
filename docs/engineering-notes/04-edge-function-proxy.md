# Authenticated map proxy

## What I built
Implemented supabase/functions/maps-proxy with a verified-user and staff-profile
check before Google requests. src/lib/maps-client.js is the single session-bearing
client wrapper for autocomplete, mileage, and drive-time lookups.

## The concept
Secret management and least privilege: the Google credential stays in server
environment variables, while identity is verified with auth.getUser. CORS restricts
browser origins but is not authentication; fixed operations prevent an arbitrary proxy.

## The story
The replica called 2 Google APIs from 3 request paths using a browser-readable key.
I centralized those paths behind verified authentication and active staff checks,
removed key editing, and tested rejection before upstream access. Existing route
conversions and toll rules remain covered. This is implemented and mock-tested code;
deployment, stored-key cleanup, and real rotation were not performed.

## Follow-ups they'll ask
- Why aren't key restrictions enough? They do not revoke exposed copies or authorize app users.
- Can someone call the function directly? Yes; direct calls still require a verified
  user and active staff profile. Origin checks alone are bypassable outside browsers.
- Is quota abuse impossible? No. Staff requests still need production quotas/rate
  limits; this exercise claims no measured spending reduction.
