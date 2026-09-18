const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const PLACES_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const MAX_BODY_BYTES = 8192;

function address(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 512) throw new Error('input');
  return { address: value.trim() };
}

function origin(value, allowCoordinates) {
  if (typeof value === 'string') return address(value);
  if (!allowCoordinates || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('input');
  if (Object.keys(value).some(k => !['lat', 'lng'].includes(k))) throw new Error('input');
  const { lat, lng } = value;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('input');
  return { location: { latLng: { latitude: lat, longitude: lng } } };
}

function googleRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('input');
  const { action } = input;
  if (!['mileage', 'duration', 'autocomplete'].includes(action)) throw new Error('input');
  const allowed = action === 'autocomplete' ? ['action', 'input', 'sessionToken'] : ['action', 'origin', 'destination', ...(action === 'duration' ? ['avoidTolls'] : [])];
  if (Object.keys(input).some(k => !allowed.includes(k))) throw new Error('input');
  if (action === 'autocomplete') {
    if (typeof input.input !== 'string' || input.input.trim().length < 4 || input.input.length > 256) throw new Error('input');
    if (typeof input.sessionToken !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(input.sessionToken)) throw new Error('input');
    return { action, url: PLACES_URL, body: {
      input: input.input.trim(), sessionToken: input.sessionToken, regionCode: 'US',
      locationBias: { circle: { center: { latitude: 29.55, longitude: -95.32 }, radius: 50000 } },
    } };
  }
  if (input.avoidTolls !== undefined && typeof input.avoidTolls !== 'boolean') throw new Error('input');
  const body = { origin: origin(input.origin, action === 'duration'), destination: address(input.destination), travelMode: 'DRIVE' };
  if (action === 'duration') {
    body.computeAlternativeRoutes = !input.avoidTolls;
    if (input.avoidTolls) body.routeModifiers = { avoidTolls: true };
  }
  return { action, url: ROUTES_URL, body, mask: action === 'mileage' ? 'routes.distanceMeters' : 'routes.duration,routes.legs.steps.navigationInstruction' };
}

async function readBody(request) {
  if (!request.body) throw new Error('input');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('size'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function publicResult(action, data) {
  if (action === 'autocomplete') {
    return { suggestions: (Array.isArray(data.suggestions) ? data.suggestions : [])
      .map(s => s?.placePrediction?.text?.text)
      .filter(t => typeof t === 'string' && t.length <= 1000)
      .slice(0, 5).map(text => ({ placePrediction: { text: { text } } })) };
  }
  const routes = Array.isArray(data.routes) ? data.routes : [];
  if (action === 'mileage') return { routes: routes.slice(0, 1)
    .filter(r => typeof r?.distanceMeters === 'number' && Number.isFinite(r.distanceMeters) && r.distanceMeters >= 0)
    .map(r => ({ distanceMeters: r.distanceMeters })) };
  return { routes: routes.slice(0, 10).filter(r => typeof r?.duration === 'string' && /^\d+(\.\d+)?s$/.test(r.duration)).map(r => ({
    duration: r.duration,
    legs: (Array.isArray(r.legs) ? r.legs : []).map(leg => ({
      steps: (Array.isArray(leg?.steps) ? leg.steps : []).map(step => ({
        navigationInstruction: { instructions: typeof step?.navigationInstruction?.instructions === 'string' ? step.navigationInstruction.instructions : '' },
      })),
    })),
  })) };
}

export function createHandler({ createClient, env, fetchImpl = fetch }) {
  return async function handle(request) {
    const requestOrigin = request.headers.get('Origin');
    const origins = (env('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
    const allowedOrigin = !requestOrigin || origins.includes(requestOrigin);
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (requestOrigin && allowedOrigin) headers['Access-Control-Allow-Origin'] = requestOrigin;
    const respond = (status, error) => new Response(JSON.stringify({ error }), { status, headers });
    if (!allowedOrigin) return respond(403, 'Origin not allowed');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      ...headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
    } });
    if (request.method !== 'POST') return respond(405, 'Method not allowed');
    const authorization = request.headers.get('Authorization') || '';
    const bearer = authorization.match(/^Bearer\s+(\S+)$/i);
    if (!bearer) return respond(401, 'Authentication required');
    const supabaseUrl = env('SUPABASE_URL'), anonKey = env('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anonKey) return respond(503, 'Service unavailable');
    let supabase, user;
    try {
      supabase = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase.auth.getUser(bearer[1]);
      if (error || !data?.user?.id || data.user.is_anonymous) return respond(401, 'Authentication required');
      user = data.user;
    } catch { return respond(401, 'Authentication required'); }
    try {
      const { data: profile, error } = await supabase.from('profiles').select('role,active').eq('id', user.id).maybeSingle();
      if (error) return respond(503, 'Service unavailable');
      if (!profile || profile.active === false || !['admin', 'driver'].includes(profile.role)) return respond(403, 'Staff access required');
    } catch { return respond(503, 'Service unavailable'); }
    if ((request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') return respond(415, 'JSON required');
    let upstream;
    try { upstream = googleRequest(await readBody(request)); }
    catch (error) { return respond(error.message === 'size' ? 413 : 400, 'Invalid request'); }
    const key = env('GOOGLE_MAPS_API_KEY');
    if (!key || key === 'replace-with-test-key') return respond(503, 'Service unavailable');
    const googleHeaders = { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key };
    if (upstream.mask) googleHeaders['X-Goog-FieldMask'] = upstream.mask;
    try {
      const response = await fetchImpl(upstream.url, {
        method: 'POST', headers: googleHeaders, body: JSON.stringify(upstream.body),
        redirect: 'error', signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return respond(502, 'Map provider unavailable');
      const data = await response.json();
      if (!data || typeof data !== 'object' || data.error) return respond(502, 'Map provider unavailable');
      return new Response(JSON.stringify(publicResult(upstream.action, data)), { status: 200, headers });
    } catch { return respond(502, 'Map provider unavailable'); }
  };
}
