# CI: lint, tests, and required status checks

## Scope
On ci/github-actions, add ESLint and .github/workflows/ci.yml. Run on every push and
pull_request with independent lint and test jobs, Node 22, npm cache, and npm ci.
The test job runs vitest run via npm test. Preserve all billing evidence commits.

## Boundaries
No billing behavior changes, production deployment, backend access, secrets, proxy,
or broad legacy cleanup. Do not change repository visibility or purchase a GitHub plan.
Do not disable existing branch protections. Do not claim enforcement without readback.

## Acceptance criteria
- npm run lint checks all tracked JavaScript, including legacy scripts; use recommended
  ESLint rules for new modules/tests/tools and document any legacy-specific exceptions.
- npm test passes the 36 current cases. Commit the npm dependency lockfile.
- Both named jobs succeed on GitHub for the current PR revision.
- After successful checks, configure main to require lint and test and verify readback.
  Require a PR, include admins, prohibit force pushes/deletion, and require up-to-date
  checks if repository capabilities permit. Preserve stronger existing settings.
- If GitHub access or plan limitations block protection, document the exact response
  and distinguish a working workflow from enforced status checks; ask the user only
  for an external decision that cannot be completed within the current scope.
- Keep this in one CI PR with reviewer and learning notes. No auto-deployment.

## Prior work
PR #1 merged with its individual commits retained. Pass C scope is archived at
docs/specs/pass-c.md. CI is implemented before the subsequent security refactor.
