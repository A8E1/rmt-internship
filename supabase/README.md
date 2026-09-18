# Map proxy setup — documentation only, not deployed

The current exercise uses mocked authentication and Google responses. No real key
was rotated, secret installed, function deployed, database migrated, or production
project contacted. The placeholder is deliberately rejected by the handler.

## Isolated test prerequisites

Use a separate Supabase project. Configure the browser's Supabase URL/public key in
js/core.js for that project before opening the app; the imported constants still
reference the original backend. This repo does not contain a complete backend schema.
The test database needs profiles(id matching auth user ID, role, active) and
app_settings(key, value) compatible with the source application.

Verify RLS permits the signed-in user to read their own profile and cannot allow
them to assign their own role or reactivate themselves. Provision admin/driver users
through a trusted administrator. A valid Auth user without an eligible profile is denied.

## Secret and deployment example

Copy .env.example to an ignored .env.local and configure a separate test key and exact
ALLOWED_ORIGINS (comma-separated full origins, including scheme and port). Never commit
the local file. Supabase supplies SUPABASE_URL and SUPABASE_ANON_KEY automatically.
The function uses its pinned Supabase SDK and custom JavaScript entrypoint.

From the repository root, with the Supabase CLI authenticated to the test project:

```sh
supabase secrets set --env-file supabase/.env.local --project-ref YOUR_TEST_PROJECT_REF
supabase functions deploy maps-proxy --project-ref YOUR_TEST_PROJECT_REF
```

Keep verify_jwt = true. The handler independently calls auth.getUser on Authorization;
never remove that check to resolve a gateway configuration problem. Consult current
Supabase JWT compatibility guidance if the isolated project uses newer signing keys.

Review and apply migrations/20260918000000_remove_browser_maps_key.sql in the isolated
database only after confirming the app_settings schema. It removes both old JSON
shapes; it does not revoke a key. Old rows otherwise remain downloadable despite
client-side allowlisting. Then test the connection and enable map lookups in Settings.
Keep maps disabled if the function is unavailable; manual mileage entry remains.

## Deployment validation still required

Using only synthetic addresses, verify: missing/expired/anonymous JWTs are denied;
inactive and non-staff profiles are denied; active admin/driver accounts can request
all three operations; Google errors remain generic; disallowed origins are rejected;
and saved ops responses no longer contain the old credential. Confirm the browser
never receives the new key. Test the app's full workflows against the isolated backend.

A separate real rotation would create a properly restricted server credential,
verify service operation, revoke the old key, and confirm old-key requests fail.
Use API restrictions for Routes and Places (New). Website referrer restrictions
are for browser use; server-side IP restrictions require a suitable stable egress
arrangement. Do not claim that CORS is a substitute for either auth or provider restrictions.
Authentication does not prevent an authorized staff account from exhausting quotas;
configure provider quotas/alerts and suitable production rate limiting before rollout.

References: [getUser](https://supabase.com/docs/reference/javascript/auth-getuser),
[function secrets](https://supabase.com/docs/guides/functions/secrets),
[JavaScript entrypoints](https://supabase.com/docs/guides/functions/function-configuration),
[Google key guidance](https://developers.google.com/maps/api-security-best-practices).
