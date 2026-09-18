# Pass C reviewer explanation

Three defects are corrected against the replica contract documented in SPEC.md.
The original Pass B output expectations remain recoverable at 3850d53.

| Defect and example | Failing-test commit | Passing-fix commit |
| --- | --- | --- |
| String load fee returned "85540" instead of numeric 130 | 882bc73 | d90197f |
| Negative office mileage returned 120 instead of 125 | c662f55 | a2c079c |
| 0.1 + 0.2 returned residue; 1.005 was not cent-rounded | bec9795 | fa70d66 |

suggestPrice now coerces the selected load fee and clamps each distance at zero.
totalCharge rounds trip, combined waiting, and rental components into integer cents
before addition, returning dollars for API compatibility. Decimal exponent shifting
avoids the known 1.005 * 100 rounding trap, and signed ties round away from zero.
The existing rule combining stop waits before charging remains unchanged.

The tolerant mileage policy and component-rounding policy are explicit engineering
decisions for this replica, not verified production tariffs. Supported inputs are
finite monetary amounts whose component cents and total fit safe integers. Earlier
rate/mileage arithmetic still uses JavaScript numbers; this is not a general decimal
arithmetic library or a complete input-validation layer. Preview formatting and live
payment-provider integrations have not been verified in this pass.

tests/billing-adapters.test.js verifies current wrappers, replacement rates, input
immutability, and module-before-boot wiring offline. The historical extraction command
now reads immutable Pass A files and is explicitly named verify:extraction-history;
it does not claim current corrected outputs still match the buggy baseline.

See pass-c-evidence.md for observed red/green counts and reproduction instructions.
No production credentials, data, deployment, CI, or proxy changes are included.
