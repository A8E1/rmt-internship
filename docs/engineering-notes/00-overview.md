# Correctness → security → automation

This narrative describes a replica exercise, not completed production remediation.
Execution order is correctness → CI enforcement → security migration.

- Done in Pass A: preserve the original source in Git, specify scope, extract pure
  billing logic, and verify equivalence offline.
- Done in Pass B: 20 passing Vitest characterization cases and a reproducible npm lockfile.
- Next: adversarial tests and confirmed fixes, with separate failure/fix evidence.
- Pending: push/PR lint and test jobs; verify required status checks actually enforce
  merges. A workflow alone is not a merge gate and does not gate every push.
- Pending: authenticated Edge Function and one client wrapper for Google API access.
- Simulated only: real Google key rotation. No claim of revoking a key, changing
  production secrets, protecting live quota, or deploying a production proxy.

The current code has no 50-mile pricing tier or after-hours billing surcharge.
Do not invent those requirements to produce a bug count. Resume language should
describe contribution to an existing PWA and only outcomes supported by evidence.
