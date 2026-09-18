# Correctness → security → automation

This arc describes contributions to an existing medical-transport PWA replica.
Execution order was correctness → automated CI → security migration, so verification
was available before the map refactor. It does not claim original app authorship.

- Correctness: extracted four billing entry points, preserved a golden master, and
  corrected three defects against explicit replica rules with red/green commits.
- Automation: separate lint/test jobs run on pushes and PRs. GitHub denied branch
  protection under the private-repo plan; the owner chose privacy over changing visibility.
  Workflow execution is verified; enforced merge gates are not claimed.
- Security: three browser map request paths now share an authenticated Edge Function
  proxy. The server validates identity and staff access; local tests mock external services.
- Simulated/unperformed: real key rotation, secret installation, function deployment,
  SQL cleanup execution, full browser integration, and production verification.

See 01-billing-suite.md, 03-ci.md, and 04-edge-function-proxy.md for the three learning
artifacts, plus 02-key-rotation-simulation.md and the reviewer/evidence notes for limits.
resume-evidence.md provides wording bounded by what was actually implemented.
