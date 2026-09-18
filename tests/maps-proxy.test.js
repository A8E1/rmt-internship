import { describe, expect, it, vi } from 'vitest';
import { createHandler } from '../supabase/functions/maps-proxy/handler.js';

const payload = { action: 'mileage', origin: 'Office address', destination: 'Clinic address' };
function fixture({ auth, profile, config = {}, upstream } = {}) {
  const environment = { SUPABASE_URL: 'https://test.invalid', SUPABASE_ANON_KEY: 'test-anon', GOOGLE_MAPS_API_KEY: 'test-server-secret', ALLOWED_ORIGINS: 'http://localhost:5173', ...config };
  const getUser = vi.fn().mockResolvedValue(auth ?? { data: { user: { id: 'staff-1' } }, error: null });
  const maybeSingle = vi.fn().mockResolvedValue(profile ?? { data: { role: 'admin', active: true }, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const createClient = vi.fn(() => ({ auth: { getUser }, from }));
  const fetchImpl = vi.fn().mockResolvedValue(upstream ?? Response.json({ routes: [{ distanceMeters: 1609.344 }] }));
  return { handle: createHandler({ createClient, env: n => environment[n], fetchImpl }), getUser, createClient, from, select, eq, maybeSingle, fetchImpl };
}
function request(body = payload, overrides = {}) {
  return new Request('https://test.invalid/functions/v1/maps-proxy', {
    method: 'POST', headers: { Authorization: 'Bearer test-user-jwt', 'Content-Type': 'application/json', Origin: 'http://localhost:5173', ...overrides.headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('map proxy authentication and authorization', () => {
  it.each(['', 'Basic token', 'Bearer', 'Bearer token extra'])('rejects malformed Authorization %j without Google access', async header => {
    const f = fixture();
    expect((await f.handle(request(payload, { headers: { Authorization: header } }))).status).toBe(401);
    expect(f.getUser).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it.each([
    ['invalid/expired token', { data: { user: null }, error: { message: 'Invalid JWT' } }],
    ['no verified user', { data: { user: null }, error: null }],
    ['anonymous account', { data: { user: { id: 'anon', is_anonymous: true } }, error: null }],
  ])('rejects %s returned by getUser', async (_label, auth) => {
    const f = fixture({ auth });
    expect((await f.handle(request())).status).toBe(401);
    expect(f.getUser).toHaveBeenCalledWith('test-user-jwt');
    expect(f.from).not.toHaveBeenCalled();
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('fails closed when auth throws', async () => {
    const f = fixture(); f.getUser.mockRejectedValue(new Error('private auth detail'));
    const response = await f.handle(request());
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('private');
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it.each([null, { role: 'admin', active: false }, { role: 'customer', active: true }])('denies non-staff/deactivated profile %j', async data => {
    const f = fixture({ profile: { data, error: null } });
    expect((await f.handle(request())).status).toBe(403);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('fails closed on profile lookup error', async () => {
    const f = fixture({ profile: { data: null, error: { message: 'database detail' } } });
    expect((await f.handle(request())).status).toBe(503);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it.each(['admin', 'driver'])('permits verified active %s via a caller-scoped client', async role => {
    const f = fixture({ profile: { data: { role, active: true }, error: null } });
    expect((await f.handle(request())).status).toBe(200);
    expect(f.createClient).toHaveBeenCalledWith('https://test.invalid', 'test-anon', expect.objectContaining({ global: { headers: { Authorization: 'Bearer test-user-jwt' } } }));
    expect(f.from).toHaveBeenCalledWith('profiles');
    expect(f.select).toHaveBeenCalledWith('role,active');
    expect(f.eq).toHaveBeenCalledWith('id', 'staff-1');
  });
});

describe('proxy input, origin, and configuration boundaries', () => {
  it.each([
    null, [], { ...payload, action: 'proxy' }, { ...payload, url: 'https://attacker.invalid' },
    { ...payload, key: 'override' }, { ...payload, origin: '' }, { ...payload, destination: 'x'.repeat(513) },
    { ...payload, origin: { lat: 1, lng: 2 } },
    { ...payload, action: 'duration', origin: { lat: 91, lng: 0 } },
    { ...payload, action: 'duration', origin: { lat: '1', lng: 2 } },
    { ...payload, action: 'duration', avoidTolls: 'false' },
    { action: 'autocomplete', input: 'abc', sessionToken: 'session' },
    { action: 'autocomplete', input: 'Clinic', sessionToken: 'bad token!' },
    '{invalid json',
  ])('rejects invalid payload %j without an upstream call', async body => {
    const f = fixture();
    expect((await f.handle(request(body))).status).toBe(400);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('rejects oversized bodies', async () => {
    const f = fixture();
    expect((await f.handle(request(' '.repeat(8193)))).status).toBe(413);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it.each(['text/plain', 'application/json-invalid'])('requires a JSON media type: %s', async type => {
    const f = fixture();
    expect((await f.handle(request(payload, { headers: { 'Content-Type': type } }))).status).toBe(415);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it.each(['GOOGLE_MAPS_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'])('fails closed without %s', async name => {
    const f = fixture({ config: { [name]: '' } });
    expect((await f.handle(request())).status).toBe(503);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('rejects a disallowed browser origin before auth or Google', async () => {
    const f = fixture();
    const response = await f.handle(request(payload, { headers: { Origin: 'https://attacker.invalid' } }));
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(f.getUser).not.toHaveBeenCalled(); expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('permits CORS preflight without auth or upstream access', async () => {
    const f = fixture();
    const response = await f.handle(new Request('https://test.invalid', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }));
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
    expect(f.getUser).not.toHaveBeenCalled(); expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('does not treat absent Origin as authentication', async () => {
    const f = fixture();
    expect((await f.handle(new Request('https://test.invalid', { method: 'POST' }))).status).toBe(401);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('rejects unsupported HTTP methods', async () => {
    const f = fixture(); expect((await f.handle(new Request('https://test.invalid'))).status).toBe(405);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
});

describe('allowlisted Google operations and response filtering', () => {
  it('sends only server-controlled mileage fields and credentials', async () => {
    const f = fixture({ upstream: Response.json({ routes: [{ distanceMeters: 1609.344, secret: 'discard' }], debug: 'discard' }) });
    const response = await f.handle(request());
    expect(await response.json()).toEqual({ routes: [{ distanceMeters: 1609.344 }] });
    const [url, options] = f.fetchImpl.mock.calls[0];
    expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json', 'X-Goog-Api-Key': 'test-server-secret', 'X-Goog-FieldMask': 'routes.distanceMeters' });
    expect(JSON.parse(options.body)).toEqual({ origin: { address: 'Office address' }, destination: { address: 'Clinic address' }, travelMode: 'DRIVE' });
    expect(options.redirect).toBe('error'); expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it.each([false, true])('preserves alternative/toll selection for duration: avoidTolls=%s', async avoidTolls => {
    const f = fixture({ upstream: Response.json({ routes: [{ duration: '120s', legs: [{ steps: [{ navigationInstruction: { instructions: 'SH-288 express lanes' }, private: 'discard' }] }] }] }) });
    const response = await f.handle(request({ ...payload, action: 'duration', origin: { lat: 29.5, lng: -95.3 }, avoidTolls }));
    const body = JSON.parse(f.fetchImpl.mock.calls[0][1].body);
    expect(body.origin).toEqual({ location: { latLng: { latitude: 29.5, longitude: -95.3 } } });
    expect(body.computeAlternativeRoutes).toBe(!avoidTolls);
    expect(body.routeModifiers).toEqual(avoidTolls ? { avoidTolls: true } : undefined);
    const result = await response.json();
    expect(result.routes[0].legs[0].steps[0]).toEqual({ navigationInstruction: { instructions: 'SH-288 express lanes' } });
  });
  it('keeps autocomplete text and fixes the region/bias server-side', async () => {
    const f = fixture({ upstream: Response.json({ suggestions: [{ placePrediction: { text: { text: 'Clinic address' }, placeId: 'discard' } }] }) });
    const response = await f.handle(request({ action: 'autocomplete', input: 'Clinic', sessionToken: 'session-1' }));
    expect(f.fetchImpl.mock.calls[0][0]).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(JSON.parse(f.fetchImpl.mock.calls[0][1].body)).toMatchObject({ input: 'Clinic', sessionToken: 'session-1', regionCode: 'US', locationBias: { circle: { radius: 50000 } } });
    expect(await response.json()).toEqual({ suggestions: [{ placePrediction: { text: { text: 'Clinic address' } } }] });
  });
  it.each([new Response('secret upstream detail', { status: 403 }), Response.json({ error: 'secret upstream detail' }), new Response('not-json')])('sanitizes upstream failures', async upstream => {
    const f = fixture({ upstream }); const response = await f.handle(request());
    expect(response.status).toBe(502); expect(await response.json()).toEqual({ error: 'Map provider unavailable' });
  });
  it('handles timeout/network errors without leaking details', async () => {
    const f = fixture(); f.fetchImpl.mockRejectedValue(new Error('secret upstream detail'));
    const response = await f.handle(request());
    expect(response.status).toBe(502); expect(await response.text()).not.toContain('secret');
  });
});
