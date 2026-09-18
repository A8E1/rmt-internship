# CI reviewer explanation

The existing billing suite only ran locally. .github/workflows/ci.yml now runs on
push and pull_request with independent lint and test jobs on Node 22. Both use
actions/setup-node npm caching and npm ci. Jobs have ten-minute limits, read-only
contents permission, and checkout does not retain credentials. No deploy step exists.

ESLint recommended rules apply to modules, tests, and tools. Legacy classic scripts
are also linted, with explicit exceptions for shared globals/HTML handlers
(no-undef, no-unused-vars), intentionally empty catches, and redundant escapes.
The app's reportError declaration is not treated as the browser built-in. The
service worker gets its own environment. These exceptions do not affect new modules.
One dead initialization in js/shell.js is removed: every following branch sets body
before use. No billing calculations change.

The supported ESLint toolchain requires Node 22.13+ (or 24+), recorded in engines;
.nvmrc selects Node 22. Local verification uses the bundled Node 24 runtime without
altering the machine's system installation. Dependencies are pinned in the lockfile.

## Required-check limitation
On 2026-09-18, GET /repos/A8E1/rmt-internship/branches/main/protection returned HTTP 403:
"Upgrade to GitHub Pro or make this repository public to enable this feature."
The user explicitly chose to keep the repository private and document the limitation.
No visibility, subscription, or branch-protection changes were made. Do not describe
this workflow as gating merges or every push.

If the account later supports protection, require lint and test, require an up-to-date
branch and PR, enforce for admins, and prohibit force pushes and branch deletion.
Verify those settings by readback before claiming enforcement.

## Verification
GitHub PR run 35317806017 completed successfully for commit f040355: both lint and test passed, including npm ci in each job. Evidence: https://github.com/A8E1/rmt-internship/actions/runs/35317806017 . Local clean install, lint, 36 tests, and diff checks also passed. Current application behavior
is covered by the existing 36 tests; no browser or live-backend verification is claimed.
