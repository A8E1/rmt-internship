# Claims supported by this replica

- Added a Vitest billing regression suite to an existing medical-transport PWA replica,
  using characterization tests and separate failing-test/fix commits for three
  documented replica billing defects.
- Implemented and mock-tested a Supabase Edge Function proxy for Google Places/Routes,
  verifying user identity and staff access while removing API-key handling from client code.
- Automated ESLint and Vitest checks on GitHub pushes and pull requests with separate
  jobs, locked dependencies, and npm caching.

Do not describe this as original authorship of the PWA, a NASA project, deployed
production remediation, actual key rotation, measured quota savings, or enforced
merge checks. Those outcomes are not established by this exercise.

Interview evidence: PR #1 contains the billing history; PR #2 contains CI and its
successful runs; the security PR contains the proxy, tests, and unapplied setup plan.
Read each reviewer explanation alongside its diff before using these claims.
