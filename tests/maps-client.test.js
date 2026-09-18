import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { requestMaps } from '../src/lib/maps-client.js';

function client(session = { access_token: 'user-jwt' }) {
  return { auth: { getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }) },
    functions: { invoke: vi.fn().mockResolvedValue({ data: { routes: [] }, error: null }) } };
}
describe('single authenticated client wrapper', () => {
  it.each(['mileage', 'duration', 'autocomplete'])('sends %s with the session JWT', async action => {
    const sb = client();
    expect(await requestMaps(sb, action, { input: 'Clinic', action: 'untrusted' })).toEqual({ routes: [] });
    expect(sb.functions.invoke).toHaveBeenCalledWith('maps-proxy', { body: { input: 'Clinic', action }, headers: { Authorization: 'Bearer user-jwt' } });
  });
  it('does not invoke the function without a session', async () => {
    const sb = client(null);
    await expect(requestMaps(sb, 'mileage', {})).rejects.toThrow('Sign in');
    expect(sb.functions.invoke).not.toHaveBeenCalled();
  });
  it('does not invoke after a session error', async () => {
    const sb = client(); sb.auth.getSession.mockResolvedValue({ data: {}, error: new Error('expired') });
    await expect(requestMaps(sb, 'mileage', {})).rejects.toThrow('Sign in');
    expect(sb.functions.invoke).not.toHaveBeenCalled();
  });
  it.each([{ data: null, error: new Error('provider detail') }, { data: { error: 'provider detail' }, error: null }, { data: null, error: null }])('rejects function errors without exposing provider detail', async response => {
    const sb = client(); sb.functions.invoke.mockResolvedValue(response);
    await expect(requestMaps(sb, 'mileage', {})).rejects.toThrow('Maps are unavailable');
  });
});

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const admin = read('js/admin.js'), logic = read('js/logic.js');
function slice(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  if (a < 0 || b <= a) throw new Error('Missing legacy function');
  return source.slice(a, b);
}
function legacy(mapsRequest, extra = {}) {
  const ctx = vm.createContext({ mapsRequest, OPS: { mapsEnabled: true }, console: { error: vi.fn() }, ...extra });
  vm.runInContext(slice(admin, 'async function routesMiles(', 'let milesReq'), ctx);
  vm.runInContext(slice(logic, 'function _uses288Express(', 'async function recomputeReportTime('), ctx);
  return ctx;
}
describe('legacy route calculations through the proxy', () => {
  it('converts meters to miles rounded to one decimal', async () => {
    const invoke = vi.fn().mockResolvedValue({ routes: [{ distanceMeters: 1986.379776 }] });
    expect(await legacy(invoke).routesMiles('Office', 'Clinic')).toBe(1.2);
    expect(invoke).toHaveBeenCalledWith('mileage', { origin: 'Office', destination: 'Clinic' });
  });
  it.each([{}, { routes: [] }, { routes: [{ distanceMeters: 0 }] }])('retains missing/zero distance behavior for %j', async result => {
    expect(await legacy(vi.fn().mockResolvedValue(result)).routesMiles('Office', 'Clinic')).toBeNull();
  });
  it('selects the fastest eligible route and returns minutes', async () => {
    const invoke = vi.fn().mockResolvedValue({ routes: [
      { duration: '60s', legs: [{ steps: [{ navigationInstruction: { instructions: 'SH-288 express lanes' } }] }] },
      { duration: '240s' }, { duration: '150s' },
    ] });
    expect(await legacy(invoke).routesDuration('Office', 'Clinic')).toBe(3);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('falls back to toll avoidance if every candidate uses SH-288 express lanes', async () => {
    const invoke = vi.fn().mockResolvedValueOnce({ routes: [{ duration: '60s', legs: [{ steps: [{ navigationInstruction: { instructions: 'SH-288 toll' } }] }] }] })
      .mockResolvedValueOnce({ routes: [{ duration: '300s' }] });
    expect(await legacy(invoke).routesDuration('Office', 'Clinic')).toBe(5);
    expect(invoke.mock.calls.map(call => call[1].avoidTolls)).toEqual([false, true]);
  });
  it('normalizes database coordinate strings as the old route code did', async () => {
    const invoke = vi.fn().mockResolvedValue({ routes: [{ duration: '60s' }] });
    expect(await legacy(invoke).routesDuration({ lat: '29.5', lng: '-95.3' }, 'Clinic')).toBe(1);
    expect(invoke).toHaveBeenCalledWith('duration', { origin: { lat: 29.5, lng: -95.3 }, destination: 'Clinic', avoidTolls: false });
  });
  it('disabling maps prevents both route operations', async () => {
    const invoke = vi.fn(), ctx = legacy(invoke, { OPS: { mapsEnabled: false } });
    expect(await ctx.routesMiles('Office', 'Clinic')).toBeNull();
    expect(await ctx.routesDuration('Office', 'Clinic')).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
  it('upstream failures retain null fallback for callers', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('unavailable')), ctx = legacy(invoke);
    expect(await ctx.routesMiles('Office', 'Clinic')).toBeNull();
    expect(await ctx.routesDuration('Office', 'Clinic')).toBeNull();
  });
  it('preserves the full multi-stop path and manual mileage overrides', async () => {
    const elements = Object.fromEntries(Object.entries({ 'f-officemiles': '', 'f-tripmiles': '', 'f-pickup': 'Pickup address', 'f-dropoff': 'Dropoff address', 'f-stop': 'Second destination', 'f-triptype': 'Round Trip', 'f-retdrop': '', 'miles-hint': '' }).map(([key, value]) => [key, { value, dataset: {} }]));
    const invoke = vi.fn();
    for (const miles of [5, 10, 20, 30]) invoke.mockResolvedValueOnce({ routes: [{ distanceMeters: miles * 1609.344 }] });
    const calcPrice = vi.fn();
    const ctx = legacy(invoke, { $: id => elements[id], OFFICE: 'Office address', calcPrice });
    vm.runInContext(slice(admin, 'let milesReq', 'function addrChanged('), ctx);
    await ctx.autoMiles();
    expect(elements['f-officemiles'].value).toBe(5);
    expect(elements['f-tripmiles'].value).toBe(60);
    expect(calcPrice).toHaveBeenCalledTimes(1);
    elements['f-officemiles'].dataset.man = '1';
    await ctx.autoMiles();
    expect(invoke).toHaveBeenCalledTimes(4);
  });
});

describe('browser migration boundaries', () => {
  it('contains no direct Google API endpoints or old key fields in client assets', () => {
    const files = [...readdirSync(new URL('../js/', import.meta.url)).map(f => 'js/' + f), 'src/lib/maps-client.js', 'src/lib/billing.js', 'index.html'];
    for (const file of files) expect(read(file)).not.toMatch(/googleapis\.com|X-Goog-Api-Key|OPS\.gkey|op-key|GOOGLE_MAPS_API_KEY/);
    expect(admin).toContain("mapsRequest('autocomplete'");
  });
  it('the legacy adapter routes through the single session wrapper', async () => {
    const core = read('js/core.js'), sb = client(), module = { requestMaps };
    const ctx = vm.createContext({ sb, window: { RMTMaps: module } });
    vm.runInContext(core.slice(core.indexOf('function mapsRequest(')), ctx);
    await ctx.mapsRequest('mileage', { origin: 'Office', destination: 'Clinic' });
    expect(sb.functions.invoke).toHaveBeenCalledTimes(1);
  });
  it('ignores unknown old settings fields rather than importing them', () => {
    const core = read('js/core.js');
    const start = core.indexOf("if(r.key==='ops' && v){"), end = core.indexOf("if(r.key==='square'", start);
    const ctx = vm.createContext({ r: { key: 'ops' }, v: { buffer: 15, gkey: 'old-test-secret', mapsEnabled: true }, DEFAULT_OPS: { buffer: 10, mapsEnabled: false }, OPS: {} });
    vm.runInContext(core.slice(start, end), ctx);
    expect({ ...ctx.OPS }).toEqual({ buffer: 15, mapsEnabled: true });
  });
});
