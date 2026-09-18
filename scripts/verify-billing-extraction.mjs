import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as billing from '../src/lib/billing.js';

// Immutable import commit, deliberately independent of the moving main branch.
const original = execFileSync('git', ['show', '3cf1f50:js/core.js'], { encoding: 'utf8' });
const current = readFileSync('js/core.js', 'utf8');
const section = (source, start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'Expected function boundaries');
  return source.slice(a, b);
};
const baseline = vm.createContext({});
vm.runInContext(section(original, 'const DEFAULT_PRICES =', 'const DEFAULT_OPS =') +
  section(original, 'function suggestPrice(', 'function payMethodLabel('), baseline);
const adapters = vm.createContext({ window: { RMTBilling: billing } });
vm.runInContext(section(current, 'const DEFAULT_PRICES =', 'const DEFAULT_OPS =') +
  section(current, 'function suggestPrice(', 'function payMethodLabel('), adapters);
const defaults = vm.runInContext('({...DEFAULT_PRICES})', baseline);
const priceCases = [
  { ...defaults },
  { ...defaults, oneWayLoad: '85', roundLoad: '100', waitPer15: '11.25', wheelchairRent: '30' },
  { ...defaults, oneWayLoad: 0.1, roundLoad: 0.2, tripPerMile: 0.1, officePerMile: 0.2, waitPer15: 0.1, wheelchairRent: 0.2 },
  { ...defaults, strOneWayLoad: 125, strRoundLoad: 150, strOfficePerMile: 2, strTripPerMile: 6, strWaitPer15: 15, wheelchairRent: null },
  { ...defaults, strOneWayLoad: '', strRoundLoad: -1, strOfficePerMile: '2', strTripPerMile: null, strWaitPer15: 0, wheelchairRent: 0 },
];
const values = [undefined, null, '', '10', 'invalid', 0, -1, 0.1, 0.2, 49.99, 50, 50.01, Infinity, NaN];
const kinds = [undefined, 'Wheelchair', 'Ambulatory', 'Stretcher'];
let comparisons = 0;
function check(name, args, prices) {
  baseline.args = args;
  adapters.args = args;
  const expected = vm.runInContext(`${name}(...args)`, baseline);
  const actual = name === 'estWaitMins' ? billing[name](...args) : billing[name](...args, prices);
  const adapted = vm.runInContext(`${name}(...args)`, adapters);
  for (const result of [actual, adapted]) {
    if (expected && typeof expected === 'object') {
      assert.deepEqual(structuredClone(result), structuredClone(expected));
    } else {
      assert.ok(Object.is(result, expected), `${name}: expected ${expected}, received ${result}`);
    }
    comparisons++;
  }
}
for (const prices of priceCases) {
  // Replacing settings between batches checks that adapters do not capture stale rates.
  baseline.nextPrices = prices;
  adapters.nextPrices = prices;
  vm.runInContext('PRICES = nextPrices', baseline);
  vm.runInContext('PRICES = nextPrices', adapters);
  for (const kind of kinds) {
    check('priceSet', [kind], prices);
    for (const miles of values) {
      check('waitBill', [miles, kind], prices);
      for (const tripMiles of values) {
        for (const tripType of ['One Way', 'Round Trip', undefined]) {
          for (const stop of [false, true]) check('suggestPrice', [tripType, miles, tripMiles, stop, kind], prices);
        }
      }
    }
    const leads = [
      {}, { tripCharge: 0 }, { tripCharge: '10' },
      { waiting: 'Yes', waitH: 1, waitM: 1 },
      { waiting: 'Yes', waitH: '1', waitM: '15', tripCharge: '85' },
      { waiting: 'Yes', waitH: 2, actualWaitMin: 0 },
      { actualWaitMin: 8, actualWaitMin2: 8 },
      { actualWaitMin: null, actualWaitMin2: 16 },
      ...values.map(v => ({ tripCharge: v, actualWaitMin: v, actualWaitMin2: 15 })),
    ];
    for (const lead of leads) {
      for (const rent of [undefined, false, true, 'false']) {
        const input = { ...lead, tripKind: kind, rentWheelchair: rent };
        const before = structuredClone(input);
        for (const name of ['estWaitMins', 'waitChargeOf', 'rentFee', 'totalCharge']) check(name, [input], prices);
        assert.deepEqual(input, before, 'Billing must not mutate the lead');
      }
    }
  }
}

const moduleSource = readFileSync('src/lib/billing.js', 'utf8');
assert.doesNotMatch(moduleSource, /\b(fetch|window|document|localStorage|supabase|PRICES)\b|new Date\(/);
const index = readFileSync('index.html', 'utf8');
const startup = index.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(startup, 'Module startup exists');
assert.match(startup, /import \* as billing from '\/src\/lib\/billing\.js';/);
assert.ok(index.indexOf('src="/js/settings.js"') < index.indexOf('<script type="module">'));
assert.doesNotMatch(readFileSync('js/settings.js', 'utf8'), /^boot\(\);/m);
let boots = 0;
const startupContext = { billing, window: {}, boot() {
  assert.equal(startupContext.window.RMTBilling, billing, 'Billing is ready before boot');
  boots++;
} };
vm.runInNewContext(startup.replace(/^import .*;\s*$/m, ''), startupContext);
assert.equal(boots, 1);
assert.match(readFileSync('_headers', 'utf8'), /\/src\/lib\/\*/);
console.log(`PASS: ${comparisons} baseline/module/adapter comparisons, input immutability, rate replacement, and startup wiring. No network calls.`);
