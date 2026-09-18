# Key rotation — simulation only

## What I built
Documented the rotation exercise without changing any actual credential.
The future server secret will use GOOGLE_MAPS_API_KEY with a placeholder in examples.

## The concept
Secret management and credential revocation. Moving a key out of browser code does
not revoke previously exposed copies. Browser and server keys need restrictions
appropriate to their execution environments; do not reuse a referrer-bound browser
key as the server credential.

## The story
Inspection found Google requests using OPS.gkey, populated through app settings.
The snapshot contains no hardcoded Google key and has no original Git history.
At the user's request, this exercise performs 0 production credential changes.
A real rollout would create an appropriately restricted server key, install it as
a Supabase secret, validate the proxy, revoke the exposed credential, and verify rejection.

## Follow-ups they'll ask
- Was the old key revoked? No; this is a documented simulation.
- Why not just hide it? Previously obtained copies could still work until revoked.
- What proves rotation? Provider-side revocation evidence and rejected old-key requests;
  neither has been collected here.
