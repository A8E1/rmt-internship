import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as billing from '../src/lib/billing.js';

const rates = Object.freeze({ oneWayLoad: 85, roundLoad: 100, officePerMile: 1,
  tripPerMile: 4, waitPer15: 11.25, wheelchairRent: 30 });
const core = readFileSync(new URL('../js/core.js', import.meta.url), 'utf8');
const adapterSource = core.slice(core.indexOf('function suggestPrice('), core.indexOf('function payMethodLabel('));
function context(prices) {
  const ctx = vm.createContext({ window: { RMTBilling: billing }, rates: prices });
  vm.runInContext('let PRICES = rates;\n' + adapterSource, ctx);
  return ctx;
}

describe('current legacy billing adapters', () => {
  it.each([
    ['numeric fee strings', 'suggestPrice', ['One Way', 5, 10, false, 'Wheelchair'], { oneWayLoad: '85' }, 130],
    ['negative distances', 'suggestPrice', ['Round Trip', 5, -10, false, 'Wheelchair'], {}, 105],
    ['cent-denominated totals', 'totalCharge', [{ tripCharge: 0.1, rentWheelchair: true }], { wheelchairRent: 0.2 }, 0.3],
  ])('UI adapter receives the corrected result for %s', (_label, name, args, overrides, expected) => {
    expect(context({ ...rates, ...overrides })[name](...args)).toBe(expected);
  });

  it('uses newly replaced rates on subsequent calls', () => {
    const ctx = context(rates);
    expect(ctx.suggestPrice('One Way', 5, 10, false, 'Wheelchair')).toBe(130);
    ctx.nextRates = { ...rates, oneWayLoad: '100' };
    vm.runInContext('PRICES = nextRates', ctx);
    expect(ctx.suggestPrice('One Way', 5, 10, false, 'Wheelchair')).toBe(145);
  });

  it('does not mutate frozen lead or rate inputs', () => {
    const lead = Object.freeze({ tripCharge: 1.005, rentWheelchair: true });
    expect(billing.totalCharge(lead, rates)).toBe(31.01);
    expect(lead.tripCharge).toBe(1.005);
    expect(rates.wheelchairRent).toBe(30);
  });

  it('publishes billing before invoking boot once', () => {
    const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const startup = index.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
    expect(startup).toBeTruthy();
    expect(startup).toContain("import * as billing from '/src/lib/billing.js';");
    expect(index.indexOf('src="/js/settings.js"')).toBeLessThan(index.indexOf('<script type="module">'));
    let boots = 0;
    const ctx = { billing, maps: {}, window: {}, boot() { expect(ctx.window.RMTBilling).toBe(billing); expect(ctx.window.RMTMaps).toBe(ctx.maps); boots++; } };
    vm.runInNewContext(startup.replace(/^import .*;\s*$/gm, ''), ctx);
    expect(boots).toBe(1);
    expect(readFileSync(new URL('../js/settings.js', import.meta.url), 'utf8')).not.toMatch(/^boot\(\);/m);
  });
});
