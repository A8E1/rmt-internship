# Pass C execution evidence

Reproduce any red/green state in a separate checkout at the corresponding commit,
run npm ci, then npm test. The commit messages identify each regression and fix.
These are offline replica results, not production incident counts.

## Defect 1: numeric-string loading fees
Red: 2 failed / 19 passed. Expected 130 and 185; received strings "85540" and "100580".
Green: 21 passed after coercing the selected loading fee to a number.
