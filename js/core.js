/* ================= BRAND ================= */
const EMBLEM = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="emg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0d47e"/><stop offset="1" stop-color="#c1922f"/></linearGradient></defs>
  <path d="M40 34 L46 20 L53 28 L60 17 L67 28 L74 20 L80 34 Z" fill="url(#emg)"/>
  <circle cx="46" cy="18.5" r="2.6" fill="url(#emg)"/><circle cx="60" cy="15.5" r="2.6" fill="url(#emg)"/><circle cx="74" cy="18.5" r="2.6" fill="url(#emg)"/>
  <rect x="38.5" y="36" width="43" height="5" rx="2.5" fill="url(#emg)"/>
  <text x="60" y="98" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="62" fill="#8e1c24">R</text>
</svg>`;
/* block pinch-zoom in the installed app */
document.addEventListener('gesturestart', e => e.preventDefault());

/* ===== viewport fit: measure the real visible height with JS and pin the app to it ===== */
const BUILD = 'v6.64 · Jul 30';
function fitApp(){
  const el = document.getElementById('app');
  if(!el) return;
  /* iOS walls off a strip at the bottom of translucent-status-bar web apps (equal to the
     status-bar height) — nothing can render there. We size to the usable viewport and
     color-match that strip (white body background) so it blends with the tab bar. */
  /* while the keyboard is up and someone is TYPING, the visual viewport twitches on every
     keystroke (predictive-text bar, caret scrolls) — re-pinning then makes the form jump.
     Skip those; re-fit once the field blurs and the keyboard settles. */
  const ae = document.activeElement;
  if(ae && (ae.tagName==='INPUT' || ae.tagName==='TEXTAREA')) return;
  const h = Math.round(window.visualViewport ? window.visualViewport.height + window.visualViewport.offsetTop : window.innerHeight);
  el.style.height = h + 'px';
  el.style.bottom = 'auto';
}
window.addEventListener('resize', fitApp);
if(window.visualViewport) window.visualViewport.addEventListener('resize', fitApp);
window.addEventListener('orientationchange', ()=>setTimeout(fitApp, 300));
window.addEventListener('focusout', ()=>setTimeout(fitApp, 80)); /* keyboard closed — re-measure once */
fitApp();

/* hidden diagnostics: triple-tap the version line in Settings */
let dbgTaps = 0, dbgTimer = null;
function dbgTap(){
  dbgTaps++;
  clearTimeout(dbgTimer);
  dbgTimer = setTimeout(()=>{ dbgTaps = 0; }, 900);
  if(dbgTaps >= 3){
    dbgTaps = 0;
    const app = document.getElementById('app');
    const tb = document.querySelector('.tabbar');
    const vv = window.visualViewport;
    const cs = getComputedStyle(document.documentElement);
    alert(
      'DIAGNOSTICS — screenshot this\n' +
      'build: ' + BUILD + '\n' +
      'standalone: ' + (navigator.standalone === true) + '\n' +
      'innerH: ' + window.innerHeight + '  outerH: ' + window.outerHeight + '\n' +
      'screenH: ' + screen.height + '  docH: ' + document.documentElement.clientHeight + '\n' +
      'vv.h: ' + (vv ? Math.round(vv.height) : 'n/a') + '  vv.top: ' + (vv ? Math.round(vv.offsetTop) : 'n/a') + '  vv.scale: ' + (vv ? vv.scale : 'n/a') + '\n' +
      'app rect: ' + (app ? Math.round(app.getBoundingClientRect().top) + ' → ' + Math.round(app.getBoundingClientRect().bottom) : 'n/a') + '\n' +
      'tabbar bottom: ' + (tb ? Math.round(tb.getBoundingClientRect().bottom) : 'n/a') + '\n' +
      'safe top/bottom: ' + cs.getPropertyValue('--sat-dbg') + '/' + cs.getPropertyValue('--sab-dbg')
    );
  }
}

const OFFICE = '11504 Grimes Ave, Pearland, TX 77584';

/* ================= CLOUD DATABASE (Supabase) ================= */
const SB_URL = 'https://zzmyohrxjnhpvzlryvbn.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6bXlvaHJ4am5ocHZ6bHJ5dmJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NTc2MzgsImV4cCI6MjA5ODUzMzYzOH0.R3GRZTRvkfBiN_JYjThZ6jS5i6-uygMZFHnngDlohxQ';
const sb = window.supabase.createClient(SB_URL, SB_KEY, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:false}});

/* ===== SILENT CRASH REPORTER — errors on any signed-in device log to app_errors; admin reads them under Settings → App Health ===== */
window._errCount = 0; window._errSeen = {};
function reportError(msg, stack, src){
  try{
    if(typeof currentUser === 'undefined' || !currentUser) return; /* only after login */
    if(window._errCount >= 5) return;                              /* per-session cap */
    const key = String(msg).slice(0, 80);
    if(window._errSeen[key]) return;                               /* dedupe repeats */
    window._errSeen[key] = true; window._errCount++;
    sb.from('app_errors').insert({
      user_name: currentUser.name || '', role: currentUser.role || '', build: BUILD,
      message: String(msg).slice(0, 300), stack: String(stack || '').slice(0, 900), url: String(src || '').slice(0, 200)
    }).then(()=>{});
  }catch(e){}
}
window.addEventListener('error', e => { reportError(e.message || 'script error', e.error && e.error.stack, (e.filename || '') + ':' + (e.lineno || '')); });
window.addEventListener('unhandledrejection', e => { const r = e.reason || {}; reportError(r.message || String(e.reason || 'promise rejection'), r.stack, 'promise'); });
/* iOS suspends JS timers while the app is backgrounded, so the token auto-refresh never fires
   and the session looked "logged out" after ~1 hour. Fix: pause/resume the refresher with
   visibility, and explicitly refresh an expired session the moment the app comes back. */
sb.auth.onAuthStateChange((event)=>{
  if(event==='SIGNED_OUT' && currentUser){ currentUser=null; modal=null; render(); }
});
const AUTH_DOMAIN = 'rmt.local';
const VAPID_PUBLIC = 'BABrWd83DB6uVJRBH4GxMEceAn2Y0QKyldCb1FMPefxo8iRkyqEnwy95q1AvV7qnUmcbwzH4_ZUyl1Ck7KwMqe0';

/* ================= PUSH NOTIFICATIONS ================= */
let pushEnabled = false;
if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
function pushSupported(){
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && location.protocol.startsWith('http');
}
function ub64(base64){
  const pad = '='.repeat((4 - base64.length % 4) % 4);
  const b = (base64 + pad).replace(/-/g,'+').replace(/_/g,'/');
  const raw = atob(b);
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}
async function getPushSub(){
  try{ const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); }
  catch(e){ return null; }
}
async function checkPushState(){
  if(!pushSupported()){ pushEnabled = false; return; }
  const sub = await getPushSub();
  pushEnabled = !!sub;
  /* shared device: re-bind the device's subscription to the CURRENT login so the
     previous user's notifications never arrive on this phone */
  if(sub && currentUser){
    sb.from('push_subscriptions').upsert({endpoint:sub.endpoint, user_id:currentUser.id, subscription:sub.toJSON()})
      .then(r=>{ if(r.error) console.error(r.error); });
  }
}
async function enablePush(){
  if(!pushSupported()){
    toast('On iPhone: add the app to your Home Screen first, then enable here');
    return;
  }
  try{
    const perm = await Notification.requestPermission();
    if(perm !== 'granted'){ toast('Notifications blocked — allow them in your phone settings'); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub) sub = await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:ub64(VAPID_PUBLIC)});
    const {error} = await sb.from('push_subscriptions').upsert({endpoint:sub.endpoint, user_id:currentUser.id, subscription:sub.toJSON()});
    if(error){ syncErr(error); return; }
    pushEnabled = true; render(); toast('Push notifications ON for this device');
  }catch(e){ console.error(e); toast('Could not enable notifications on this device'); }
}
async function disablePush(){
  try{
    const sub = await getPushSub();
    if(sub){
      await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  }catch(e){}
  pushEnabled = false; render(); toast('Push notifications off for this device');
}
function tmpAuthClient(){
  return window.supabase.createClient(SB_URL, SB_KEY, {auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false, storageKey:'rmt-tmp-auth'}});
}

const dstr = v => v || null;
const numOrNull = v => (v===''||v==null) ? null : +v;

const fromDb = {
  user: r => ({id:r.id, role:r.role, name:r.name, username:r.username, phone:r.phone||'', photo:r.photo||null, active:r.active!==false, hourlyRate:+(r.hourly_rate||0),
    licFront:r.license_front||null, licBack:r.license_back||null, licPendFront:r.license_pending_front||null, licPendBack:r.license_pending_back||null, licPendAt:r.license_pending_at||null}),
  client: r => ({id:r.id, first:r.first_name, last:r.last_name, dob:r.dob||'', weight:r.weight||'',
    homeAddress:r.home_address||'', phone1:r.phone1||'', phone2:r.phone2||'', email:r.email||'',
    contactName:r.contact_name||'', tripKind:r.trip_kind||'Wheelchair',
    notes:r.notes||'', reviewDone:!!r.review_done, pendingNote:r.pending_note||'', waiverAt:r.waiver_at||null, squareCustomerId:r.square_customer_id||null, sqCards:Array.isArray(r.sq_cards)?r.sq_cards:[]}),
  lead: r => ({id:r.id, clientId:r.client_id, driverId:r.driver_id, returnDriverId:r.return_driver_id||null, first:r.first_name, last:r.last_name,
    weight:r.weight||'', dob:r.dob||'', pickup:r.pickup||'', dropoff:r.dropoff||'', date:r.trip_date||'',
    pickupTime:r.pickup_time||'', apptTime:r.appt_time||'', returnTime:r.return_time||'',
    email:r.email||'', contactName:r.contact_name||'', phone1:r.phone1||'', phone2:r.phone2||'',
    tripType:r.trip_type||'One Way', tripKind:r.trip_kind||'Wheelchair', waiting:r.waiting||'No',
    waitH:r.wait_h||0, waitM:r.wait_m||0,
    officeMiles:r.office_miles==null?'':r.office_miles, tripMiles:r.trip_miles==null?'':r.trip_miles,
    tripCharge:+(r.trip_charge||0), status:r.status||'Pending', cancelDate:r.cancel_date||null,
    age:r.age||'', rentWheelchair:!!r.rent_wheelchair, webLead:!!r.web_lead, confirmedAt:r.confirmed_at||null, cancelFee:r.cancel_fee!=null?+r.cancel_fee:null, cancelFeeApplied:r.cancel_fee_applied,
    paidAt:r.paid_at||null, paidAmount:r.paid_amount!=null?+r.paid_amount:null, squarePaymentId:r.square_payment_id||null,
    paidMethod:r.paid_method||null, invoiceId:r.invoice_id||null, invoiceStatus:r.invoice_status||null, invoiceUrl:r.invoice_url||null, invoiceAmount:r.invoice_amount!=null?+r.invoice_amount:null, invoicedAt:r.invoiced_at||null,
    outDone:!!r.out_done, retDone:!!r.ret_done,
    stopAddr:r.stop_addr||'', stopDriverId:r.stop_driver_id||null, stopDone:!!r.stop_done, reviewDone:!!r.review_done, returnDropoff:r.return_dropoff||'',
    oxygen:!!r.oxygen, escort:!!r.escort, onmywayAt:r.onmyway_at||null, arrivedTextAt:r.arrived_text_at||null,
    sigOutAt:r.sig_out_at||null, sigMidAt:r.sig_mid_at||null, sigRetAt:r.sig_ret_at||null,
    arrivedAt:r.arrived_at?new Date(r.arrived_at).getTime():null,
    departedAt:r.departed_at?new Date(r.departed_at).getTime():null,
    arrived2At:r.arrived2_at?new Date(r.arrived2_at).getTime():null,
    departed2At:r.departed2_at?new Date(r.departed2_at).getTime():null,
    actualWaitMin:r.actual_wait_min, actualWaitMin2:r.actual_wait_min2, driverNotes:r.driver_notes||'', adminNotes:r.admin_notes||'', clientNotes:r.client_notes||'', lateTexted:!!r.late_texted_at,
    createdAt:r.created_at?fmtDate(new Date(r.created_at)):null}),
  notif: r => ({id:r.id, driverId:r.driver_id, adminAlert:!!r.admin_alert, text:r.text, read:!!r.read}),
  veh: r => ({imei:r.imei, vin:r.vin||'', label:r.label||'', driverId:r.driver_id||null, serviceKind:r.service_kind||'Wheelchair', active:r.active!==false}),
  vloc: r => ({imei:r.imei, lat:r.lat!=null?+r.lat:null, lng:r.lng!=null?+r.lng:null, speed:r.speed_mph!=null?+r.speed_mph:null, eventType:r.event_type||'', tripActive:!!r.trip_active, updatedAt:r.updated_at}),
};
const toDb = {
  user: u => ({name:u.name, phone:u.phone||'', photo:u.photo||null, hourly_rate:+(u.hourlyRate||0)}),
  client: c => ({first_name:c.first, last_name:c.last, dob:dstr(c.dob), weight:c.weight||'',
    home_address:c.homeAddress||'', phone1:c.phone1||'', phone2:c.phone2||'', email:c.email||'',
    contact_name:c.contactName||'', trip_kind:c.tripKind||'Wheelchair', notes:c.notes||''}),
  lead: l => ({client_id:l.clientId||null, driver_id:l.driverId||null, return_driver_id:l.returnDriverId||null, first_name:l.first, last_name:l.last,
    weight:l.weight||'', dob:dstr(l.dob), pickup:l.pickup||'', dropoff:l.dropoff||'', trip_date:dstr(l.date),
    pickup_time:l.pickupTime||'', appt_time:l.apptTime||'', return_time:l.returnTime||'',
    email:l.email||'', contact_name:l.contactName||'', phone1:l.phone1||'', phone2:l.phone2||'',
    trip_type:l.tripType||'One Way', trip_kind:l.tripKind||'Wheelchair', waiting:l.waiting||'No',
    wait_h:+l.waitH||0, wait_m:+l.waitM||0,
    office_miles:numOrNull(l.officeMiles), trip_miles:numOrNull(l.tripMiles), trip_charge:+l.tripCharge||0,
    status:l.status||'Pending', cancel_date:dstr(l.cancelDate),
    age:l.age||'', rent_wheelchair:!!l.rentWheelchair, web_lead:!!l.webLead, confirmed_at:l.confirmedAt||null, cancel_fee:l.cancelFee!=null?l.cancelFee:null, cancel_fee_applied:l.cancelFeeApplied!=null?l.cancelFeeApplied:null,
    out_done:!!l.outDone, ret_done:!!l.retDone,
    stop_addr:l.stopAddr||'', stop_driver_id:l.stopDriverId||null, stop_done:!!l.stopDone, review_done:!!l.reviewDone, return_dropoff:l.returnDropoff||'',
    oxygen:!!l.oxygen, escort:!!l.escort, onmyway_at:l.onmywayAt||null, arrived_text_at:l.arrivedTextAt||null,
    sig_out_at:l.sigOutAt||null, sig_mid_at:l.sigMidAt||null, sig_ret_at:l.sigRetAt||null,
    arrived_at:l.arrivedAt?new Date(l.arrivedAt).toISOString():null,
    departed_at:l.departedAt?new Date(l.departedAt).toISOString():null,
    arrived2_at:l.arrived2At?new Date(l.arrived2At).toISOString():null,
    departed2_at:l.departed2At?new Date(l.departed2At).toISOString():null,
    actual_wait_min:l.actualWaitMin==null?null:l.actualWaitMin,
    actual_wait_min2:l.actualWaitMin2==null?null:l.actualWaitMin2, driver_notes:l.driverNotes||'', admin_notes:l.adminNotes||'', client_notes:l.clientNotes||''}),
};

function syncErr(e){ if(e){ console.error(e); toast('⚠ Sync error — check your connection'); } }
function pushLead(l){ sb.from('leads').update(toDb.lead(l)).eq('id', l.id).then(r=>syncErr(r.error)); }
/* targeted column update — avoids last-writer-wins clobbering when two people touch the same trip */
function patchLead(l, patch){ sb.from('leads').update(patch).eq('id', l.id).then(r=>syncErr(r.error)); }
/* guard against acting on a trip deleted on another device while this screen was open */
function liveLead(id){
  const l = leads.find(x=>x.id===id);
  if(!l){ toast('This trip no longer exists — it was removed on another device'); modal=null; render(); }
  return l;
}
/* soft double-tap guard for insert actions */
function busyGate(){ const n=Date.now(); if(n < (window._busyUntil||0)) return true; window._busyUntil = n + 1500; return false; }
function delLeadDb(id){ sb.from('leads').delete().eq('id', id).then(r=>syncErr(r.error)); }
function pushUser(u){ sb.from('profiles').update(toDb.user(u)).eq('id', u.id).then(r=>syncErr(r.error)); }
function pushClient(c){ sb.from('clients').update(toDb.client(c)).eq('id', c.id).then(r=>syncErr(r.error)); }
function insertNotif(n){ const tgt = n.driverId ? users.find(u=>u.id===n.driverId) : null; /* v6.43: notifications aimed at an admin-as-driver ring the admin bell (admins don't watch the driver channel) */
  sb.from('notifications').insert({driver_id:n.driverId||null, admin_alert:!!n.adminAlert || !!(tgt && tgt.role==='admin'), text:n.text, read:false}).then(r=>syncErr(r.error)); }
function pushAvailAll(driverId){
  const rows = getAvail(driverId).map((d,i)=>({driver_id:driverId, dow:i, office_time:d.office||'', available:d.avail, avail_from:d.from||'', avail_to:d.to||''}));
  sb.from('availability').upsert(rows).then(r=>syncErr(r.error));
}
function pushSetting(key, value){ sb.from('app_settings').upsert({key, value:{data:value}}).then(r=>syncErr(r.error)); }
/* v6.22: awaited variants for saves where a silent failure costs money or field data.
   Return true on success; on failure they log + toast and the CALLER reverts local state. */
async function pushSettingV(key, value){
  const {error} = await sb.from('app_settings').upsert({key, value:{data:value}});
  if(error){ syncErr(error); toast('SAVE FAILED — nothing stored. Check your connection and try again.'); return false; }
  return true;
}
async function patchLeadV(l, patch){
  const {error} = await sb.from('leads').update(patch).eq('id', l.id);
  if(error){ syncErr(error); toast('DID NOT SAVE — weak signal? Tap it again.'); return false; }
  return true;
}

function applyTable(t, data){
  if(t==='leads') leads = data.map(fromDb.lead);
  else if(t==='profiles'){
    users = data.map(fromDb.user);
    if(currentUser) currentUser = users.find(u=>u.id===currentUser.id) || null;
  }
  else if(t==='clients') clients = data.map(fromDb.client);
  else if(t==='notifications') notifications = data.map(fromDb.notif);
  else if(t==='vehicles') vehicles = data.map(fromDb.veh);
  else if(t==='vehicle_locations') vehicleLocs = data.map(fromDb.vloc);
  else if(t==='shifts'){
    shifts = data.map(r=>({id:r.id, driverId:r.driver_id, in:new Date(r.clock_in).getTime(), out:r.clock_out?new Date(r.clock_out).getTime():null, flagged:!!r.flagged, earlyOk:!!r.early_ok,
      startMiles:r.start_miles!=null?+r.start_miles:null, endMiles:r.end_miles!=null?+r.end_miles:null, vanImei:r.van_imei||null, walkOk:r.walkthrough_ok, damagePhoto:r.damage_photo||null, wcPhoto:r.wheelchair_photo||null,
      tireOk:r.tire_ok, tireSpots:r.tire_spots||'', tireNote:r.tire_note||'', oilNeeded:r.oil_needed, oilNote:r.oil_note||''}));
  }
  else if(t==='report_times'){
    reportTimes = data.map(r=>({driverId:r.driver_id, day:r.day, rt:r.rt||'', manual:!!r.manual, notified:!!r.notified}));
  }
  else if(t==='payouts'){
    payouts = data.map(r=>({id:r.id, driverId:r.driver_id, start:r.period_start, end:r.period_end, hours:+(r.hours||0), amount:+(r.amount||0), at:r.created_at}));
  }
  else if(t==='place_notes'){
    placeNotes = data.map(r=>({id:r.id, key:r.addr_key, address:r.address, note:r.note, at:r.updated_at}));
  }
  else if(t==='emails'){
    emailsQ = data.map(r=>({id:r.id, leadId:r.lead_id, clientId:r.client_id, to:r.to_email, type:r.email_type, status:r.status, dueAt:r.due_at, missing:r.missing||'', subject:r.subject||'', invoiceNo:r.invoice_no||'', sentAt:r.sent_at, error:r.error||'', redeemed:!!r.redeemed}));
  }
  else if(t==='audit_log'){
    auditLog = data.map(r=>({id:r.id, actor:r.actor, action:r.action, target:r.target||'', before:r.before_val||'', after:r.after_val||'', at:r.created_at}));
  }
  else if(t==='availability'){
    availability = {};
    data.forEach(r=>{ const a=getAvail(r.driver_id); a[r.dow]={office:r.office_time||'', avail:r.available!==false, from:r.avail_from||'', to:r.avail_to||''}; });
  }
  else if(t==='app_settings'){
    data.forEach(r=>{
      const v = (r.value && r.value.data!==undefined) ? r.value.data : r.value;
      if(r.key==='prices' && v) PRICES = Object.assign({}, DEFAULT_PRICES, v);
      if(r.key==='ops' && v) OPS = Object.assign({}, DEFAULT_OPS, v);
      if(r.key==='square' && v) SQ = Object.assign({}, DEFAULT_SQ, v);
      if(r.key==='sms' && v){ SMSCFG = Object.assign({}, DEFAULT_SMS, v); SMSCFG.seq = Object.assign({}, DEFAULT_SMS.seq, v.seq||{}); }
      if(r.key==='sigdocs' && v) SIGDOCS = Object.assign({}, DEFAULT_SIGDOCS, v);
      if(r.key==='logo'){
        appLogo = v || null;
        try{ localStorage.setItem('rmt_logo_cache', JSON.stringify(appLogo)); }catch(e){}
      }
    });
  }
}
const ORDER_KEY = { app_settings:'key', report_times:'day', availability:'driver_id', vehicles:'imei', vehicle_locations:'imei' }; /* default: 'id' */

/* ---- v6.12 load-on-demand: leads is the only big table (3,200+ rows, growing forever).
   Login loads a WORKING WINDOW: last 90 days + all future + dateless + unpaid + No Shows —
   everything the day-to-day screens actually show. Older history is fetched on demand
   (client profiles, Sales ranges, board date, exports) and remembered via extraLeadIds so
   every later refetch re-pulls those rows fresh too (no stale copies after edits elsewhere). */
const extraLeadIds = new Set();
let leadsLoadedFrom = null; /* oldest trip_date contiguously loaded; set to the window start at login */
function leadsWindowStart(){ const d = new Date(); d.setDate(d.getDate() - 90); return fmtDate(d); }
function leadsWindowFilter(){ return 'trip_date.gte.' + leadsWindowStart() + ',trip_date.is.null,paid_at.is.null,status.eq."No Show"'; }
let clientTripCounts = null; /* client_id -> lifetime trip count, from the DB view (list badges stay truthful) */
let confirmedTotalCount = null; /* lifetime Confirmed count for the Leads-tab stat (memory only holds the window) */
async function refreshTripCounts(){
  const r = await sb.from('client_trip_counts').select('*');
  if(!r.error && r.data){ clientTripCounts = {}; r.data.forEach(x=>{ clientTripCounts[x.client_id] = x.trips; }); }
  const c = await sb.from('leads').select('id', {count:'exact', head:true}).eq('status','Confirmed');
  if(!c.error && c.count != null) confirmedTotalCount = c.count;
}
function tripCountOf(cid){
  if(clientTripCounts && clientTripCounts[cid] != null) return clientTripCounts[cid];
  return leads.filter(l=>l.clientId===cid).length;
}
async function refetch(t){
  /* PostgREST caps a single select at 1,000 rows — page until we have everything */
  const CH = 1000;
  if(t === 'leads'){
    let all = [], from = 0;
    while(true){
      const {data, error} = await sb.from('leads').select('*').or(leadsWindowFilter()).order('id', {ascending:true}).range(from, from + CH - 1);
      if(error){ syncErr(error); return false; }
      all = all.concat(data || []);
      if(!data || data.length < CH) break;
      from += CH;
    }
    if(!leadsLoadedFrom) leadsLoadedFrom = leadsWindowStart();
    /* rows fetched on demand earlier stay live across refetches */
    const winIds = new Set(all.map(r=>r.id));
    const wanted = [...extraLeadIds].filter(id=>!winIds.has(id));
    for(let i = 0; i < wanted.length; i += 200){
      const r = await sb.from('leads').select('*').in('id', wanted.slice(i, i + 200));
      if(r.error){ syncErr(r.error); return false; }
      all = all.concat(r.data || []);
    }
    applyTable('leads', all);
    refreshTripCounts(); /* fire-and-forget — list badges catch up in a beat */
    return true;
  }
  let all = [], from = 0;
  while(true){
    const {data, error} = await sb.from(t).select('*').order(ORDER_KEY[t] || 'id', {ascending:true}).range(from, from + CH - 1);
    if(error){ syncErr(error); return false; }
    all = all.concat(data || []);
    if(!data || data.length < CH) break;
    from += CH;
  }
  applyTable(t, all);
  return true;
}
function mergeLeadRows(rows){
  (rows || []).forEach(r=>{
    extraLeadIds.add(r.id);
    const m = fromDb.lead(r);
    const i = leads.findIndex(x=>x.id===r.id);
    if(i >= 0) leads[i] = m; else leads.push(m);
  });
}
function refreshAfterMerge(){
  /* re-render only when it can't hurt: no modal, nobody typing (pickerRender waits politely if available) */
  const ae = document.activeElement;
  const typing = ae && (ae.tagName==='TEXTAREA' || ae.tagName==='INPUT' || ae.tagName==='SELECT');
  if(modal) return;
  if(typing){ if(typeof pickerRender === 'function') pickerRender(); return; }
  render();
}
let leadsRangeJob = null;
function ensureLeadsFrom(target){
  /* guarantee every trip from `target` (YYYY-MM-DD) onward is in memory; safe to call every render */
  if(!target || !leadsLoadedFrom || target >= leadsLoadedFrom) return Promise.resolve();
  if(leadsRangeJob){
    if(target < leadsRangeJob.target) leadsRangeJob.target = target;
    return leadsRangeJob.promise;
  }
  const job = { target: target };
  job.promise = (async function(){
    try{
      while(leadsLoadedFrom && job.target < leadsLoadedFrom){
        const from = job.target, to = leadsLoadedFrom;
        let rows = [], off = 0;
        while(true){
          const r = await sb.from('leads').select('*').gte('trip_date', from).lt('trip_date', to).order('id', {ascending:true}).range(off, off + 999);
          if(r.error){ syncErr(r.error); return; }
          rows = rows.concat(r.data || []);
          if(!r.data || r.data.length < 1000) break;
          off += 1000;
        }
        mergeLeadRows(rows);
        leadsLoadedFrom = from;
      }
    } finally {
      leadsRangeJob = null;
      refreshAfterMerge();
    }
  })();
  leadsRangeJob = job;
  return job.promise;
}
function ensureAllLeads(){ return ensureLeadsFrom('2000-01-01'); }
const leadIdFetchTried = new Set();
function ensureLeadIds(ids){
  /* fetch specific out-of-window leads by id (Emails tab references old trips) —
     genuinely deleted ids fetch nothing, and the tried-set stops re-asking */
  const want = (ids || []).filter(id => id && !leadIdFetchTried.has(id) && !leads.some(l=>l.id===id));
  if(!want.length) return;
  want.forEach(id => leadIdFetchTried.add(id));
  (async function(){
    for(let i = 0; i < want.length; i += 200){
      const r = await sb.from('leads').select('*').in('id', want.slice(i, i + 200));
      if(r.error){ syncErr(r.error); return; }
      mergeLeadRows(r.data || []);
    }
    refreshAfterMerge();
  })();
}
const clientHistDone = new Set();
function clientHistLoaded(cid){ return clientHistDone.has(cid); }
function ensureClientHistory(cid){
  /* full trip history for one client — profile totals, trip list, route price memory */
  if(!cid || clientHistDone.has(cid)) return Promise.resolve();
  return (async function(){
    const r = await sb.from('leads').select('*').eq('client_id', cid).order('id', {ascending:true}).range(0, 1999);
    if(r.error){ syncErr(r.error); return; }
    mergeLeadRows(r.data || []);
    clientHistDone.add(cid);
    if(modal && modal.type==='clientForm' && modal.clientId===cid){
      const ae = document.activeElement;
      const typing = ae && (ae.tagName==='TEXTAREA' || ae.tagName==='INPUT' || ae.tagName==='SELECT');
      if(!typing){
        /* fill in the full history without losing any edits already typed into the profile */
        const keep = {};
        document.querySelectorAll('[id^="c-"]').forEach(el=>{ if('value' in el) keep[el.id] = el.value; });
        render();
        Object.keys(keep).forEach(id=>{ const el = document.getElementById(id); if(el && el.value !== keep[id]) el.value = keep[id]; });
      }
    }
  })();
}
const refetchTimers = {};
function scheduleRefetch(t){
  clearTimeout(refetchTimers[t]);
  refetchTimers[t] = setTimeout(async ()=>{
    await refetch(t);
    /* live van positions must NEVER redraw the rest of the app — on Fleet they move markers in place,
       everywhere else the fresh data just sits in memory until Fleet is opened (constant re-renders were
       yanking the Appointments scroll every few seconds while a van drove) */
    if(t==='vehicle_locations' || t==='vehicles'){
      if(currentUser && currentUser.role==='admin' && adminTab==='fleet' && !modal && typeof fleetMap!=='undefined' && fleetMap){
        try{ refreshFleetPositions(); }catch(e){ console.error(e); }
      }
      return;
    }
    const ae = document.activeElement;
    const typing = ae && (ae.tagName==='TEXTAREA' || ae.tagName==='INPUT' || ae.tagName==='SELECT');
    if(!modal && !typing) render();
  }, 400);
}
let rtStarted = false;
function startRealtime(){
  if(rtStarted) return; rtStarted = true;
  sb.channel('rmt-sync')
    .on('postgres_changes', {event:'*', schema:'public'}, p => scheduleRefetch(p.table))
    .subscribe();
}
const ALL_TABLES = ['profiles','clients','leads','notifications','app_settings','shifts','report_times','emails','audit_log','vehicles','vehicle_locations','payouts','place_notes']; /* 'availability' retired in v3.0 — table kept, not loaded; vehicle tables are admin-RLS (drivers just get empty lists); payouts RLS: admin all, drivers read their own */
async function loadAll(){
  const results = await Promise.all(ALL_TABLES.map(t => refetch(t).catch(()=>false)));
  return !results.some(ok => !ok);
}

/* ================= PRICING ================= */
const DEFAULT_PRICES = { oneWayLoad:85, roundLoad:100, officePerMile:1, tripPerMile:4, waitPer15:11.25, wheelchairRent:30,
  /* v6.15: Stretcher runs price differently — every dial has a stretcher twin. Blank/null = use the standard value. Ambulatory always uses standard. */
  strOneWayLoad:null, strRoundLoad:null, strOfficePerMile:null, strTripPerMile:null, strWaitPer15:null };
function priceSet(kind){ return window.RMTBilling.priceSet(kind, PRICES); }
let PRICES = Object.assign({}, DEFAULT_PRICES);
const DEFAULT_OPS = { buffer:10, gkey:'', clashMin:45, conflictMin:90, dupMin:30, eveningHour:18, vanStaleHrs:12 };
function opsNum(k, def){ const v = +OPS[k]; return isFinite(v) && v > 0 ? v : def; }
let OPS = Object.assign({}, DEFAULT_OPS);
const DEFAULT_SQ = { appId:'', locationId:'', env:'production' };
let SQ = Object.assign({}, DEFAULT_SQ);
/* v6.17: SMS follow-up config (templates live server-side; the app edits the switches only and MERGES to preserve tpl) */
const DEFAULT_SMS = { enabled:false, sender:'John', reviewUrl:'', officePhone:'', seq:{drip:true, reminder:true, review:true, rebook:true, cancelrec:true} };
let SMSCFG = JSON.parse(JSON.stringify(DEFAULT_SMS));
let smsQueue = [], smsOptouts = [], emailOptouts = [], smsLoaded = false;
let waiverMap = {}; /* v6.58: clientId → waiver_at for drivers (clients table is admin-only) */
/* v6.57: signature documents — wording is EDITABLE in Settings (app_settings key 'sigdocs')
   so attorney revisions never need a redeploy. Each signed record stores a doc_text SNAPSHOT
   of the exact wording agreed to at signing time. */
const DEFAULT_SIGDOCS = {
  waiver: `TRANSPORTATION SERVICES AGREEMENT AND RELEASE OF LIABILITY

This Transportation Services Agreement and Release of Liability ("Agreement") is between Royalty Medical Transportation ("the Company") and the client named below, or the client's authorized representative signing on the client's behalf ("Client"). By signing, the Client accepts these terms for the transportation service provided on the date signed and for all future services provided by the Company, until the Client revokes this Agreement in writing.

NATURE OF SERVICES. The Company provides non-emergency wheelchair and ambulatory transportation. The Company is a transportation provider only. It is not a medical provider, does not render medical care, treatment, supervision, or monitoring, and its drivers are not medical personnel. No medical care of any kind will be provided during transport.

CLIENTS WHO REQUIRE SUPERVISION OR CARE DURING TRANSPORT. If the Client requires medical attention, supervision, or assistance beyond ordinary transportation help during the trip, the Client or the Client's representative is solely responsible for arranging a qualified attendant, caregiver, or family member to accompany the Client. The Company welcomes accompanying attendants at no additional charge. The Company is not responsible for the consequences of a Client traveling without an attendant the Client's condition requires.

CLIENT RESPONSIBILITIES. The Client (or representative) agrees to provide accurate information about the Client's mobility needs, weight, equipment, and any condition that affects safe transport; to follow the driver's safety instructions during boarding, transport, and exiting; to remain seated with the seatbelt and all securement devices fastened while the vehicle is in motion; to keep personal property, including mobility equipment, medications, and personal items, accounted for at drop-off; and to tell the driver immediately about any concern during the trip. The Company is not liable for injuries resulting from a Client's refusal to follow safety instructions or use of securement devices.

WHEELCHAIR SECUREMENT, TRANSFERS, AND ASSISTANCE. The Client consents to the driver securing the Client's wheelchair and person using the vehicle's securement systems, and to the driver providing reasonable, non-medical physical assistance with boarding, exiting, and transfers, such as steadying, guiding, and pushing the wheelchair. The Client acknowledges that boarding, exiting, transfers, and road travel carry inherent risks, including shifting, jolts, and sudden stops, that cannot be eliminated even with reasonable care. The Client confirms that any wheelchair or mobility equipment provided by the Client is in safe working condition; the Company is not responsible for injuries or damage caused by defects in Client-provided equipment.

WHERE THE COMPANY'S RESPONSIBILITY BEGINS AND ENDS. The Company's responsibility for the Client begins when the driver receives the Client at the pickup location and ends when the Client is delivered to the entrance of the destination or into the care of facility staff, family, or caregiver at the drop-off location. The Company is not responsible for the Client's supervision, safety, or wellbeing before pickup or after drop-off, including inside any facility, residence, or premises.

SCHEDULING AND DELAYS. The Company makes every reasonable effort to arrive on time. The Client understands that traffic, weather, road conditions, and prior trips can cause delays beyond the Company's control, and agrees the Company is not liable for consequences of late arrival, including missed appointments.

RIGHT TO REFUSE OR DISCONTINUE TRANSPORT. The Company may decline or discontinue transport if, in the driver's reasonable judgment, the transport cannot be performed safely, including when a Client's condition exceeds the service the Company safely provides, when securement is not possible, or when conduct endangers the driver or others. Where possible, the Company will help arrange alternative transportation.

ILLNESS. The Client agrees not to book transport while having a known contagious illness that poses a serious risk to the driver or other passengers without informing the office in advance, so appropriate precautions can be arranged.

HEALTH CONDITIONS AND PRE-EXISTING CONDITIONS. The Client acknowledges that ordinary vehicle motion, braking, turns, and transfers may aggravate pre-existing medical conditions, including fragile skin, osteoporosis, prior injuries, and circulatory or cardiac conditions, and the Client knowingly accepts that risk. The Client is responsible for disclosing any condition that requires special handling before transport.

ASSUMPTION OF RISK. THE CLIENT KNOWINGLY AND VOLUNTARILY ASSUMES ALL RISKS ORDINARILY ASSOCIATED WITH NON-EMERGENCY TRANSPORTATION, INCLUDING BOARDING AND EXITING THE VEHICLE, WHEELCHAIR SECUREMENT, TRANSFERS, ROAD TRAVEL, AND AGGRAVATION OF PRE-EXISTING CONDITIONS.

RELEASE, WAIVER OF LIABILITY, AND COVENANT NOT TO SUE. IN CONSIDERATION OF THE SERVICES PROVIDED, THE CLIENT, FOR THE CLIENT AND THE CLIENT'S HEIRS, ESTATE, WRONGFUL DEATH BENEFICIARIES, REPRESENTATIVES, AND ASSIGNS, RELEASES, WAIVES, AND DISCHARGES ROYALTY MEDICAL TRANSPORTATION, ITS OWNERS, EMPLOYEES, DRIVERS, AND AGENTS (THE "RELEASED PARTIES") FROM ANY AND ALL CLAIMS, DEMANDS, OR CAUSES OF ACTION ARISING OUT OF OR RELATED TO THE TRANSPORTATION SERVICES, INCLUDING CLAIMS ARISING FROM THE ORDINARY NEGLIGENCE OF THE RELEASED PARTIES, AND COVENANTS NOT TO SUE THE RELEASED PARTIES ON ANY RELEASED CLAIM. THIS RELEASE DOES NOT APPLY TO GROSS NEGLIGENCE, RECKLESSNESS, OR INTENTIONAL MISCONDUCT, WHICH CANNOT BE WAIVED UNDER TEXAS LAW.

IF ANY PART OF THE RELEASE IS HELD UNENFORCEABLE. IF AND TO THE EXTENT THE RELEASE ABOVE IS HELD UNENFORCEABLE AS TO ANY CLAIM, THE CLIENT AGREES THAT THE TOTAL LIABILITY OF THE RELEASED PARTIES FOR THAT CLAIM SHALL BE LIMITED TO THE MAXIMUM EXTENT PERMITTED BY LAW AND SHALL NOT EXCEED THE PROCEEDS ACTUALLY PAYABLE UNDER THE COMPANY'S APPLICABLE LIABILITY INSURANCE. THE REMAINDER OF THIS AGREEMENT REMAINS IN FULL EFFECT.

INDEMNIFICATION. THE CLIENT AGREES TO INDEMNIFY AND HOLD HARMLESS THE RELEASED PARTIES FROM CLAIMS, DAMAGES, AND REASONABLE COSTS, INCLUDING ATTORNEY'S FEES, ARISING FROM THE CLIENT'S OWN ACTS OR OMISSIONS, FROM INACCURATE OR INCOMPLETE INFORMATION PROVIDED TO THE COMPANY, OR FROM CLAIMS BROUGHT BY OTHERS ON THE CLIENT'S BEHALF THAT ARE WITHIN THE SCOPE OF THE RELEASE ABOVE.

PROMPT NOTICE OF CLAIMS. The Client agrees to give the Company written notice of any claimed injury or loss arising from a trip as soon as reasonably possible, and in any event within thirty days of the trip, so the Company can investigate while evidence is fresh. This paragraph does not shorten any statutory limitations period.

PERSONAL PROPERTY. The Company is not responsible for personal property left in the vehicle or lost or damaged during transport, except where caused by the Company's gross negligence. Found items will be held and reasonable efforts made to return them. The per-trip drop-off confirmation includes the Client's acknowledgment that belongings and equipment were received.

MEDICAL EMERGENCIES. If a medical emergency occurs during transport, the Client authorizes the Company to call 911 and cooperate with emergency responders, and authorizes emergency medical treatment where the Client cannot consent. The Client is responsible for any resulting emergency medical costs. The Client consents to the Company documenting any incident, including photographs of the scene, for safety and insurance purposes.

DROP-OFF CONFIRMATIONS AND ELECTRONIC SIGNATURES. At each drop-off, the Client or the Client's representative will be asked to sign a brief electronic confirmation on the driver's device stating that the trip was completed, the Client arrived without incident, and belongings were received. That confirmation is set out in the Company's separate Drop-Off Confirmation document, which is incorporated into this Agreement by reference. Under the Texas Uniform Electronic Transactions Act, the Client agrees that electronic signatures captured on the driver's device have the same force and effect as ink signatures.

PRIVACY. The Company keeps the Client's personal, scheduling, and signature information confidential, uses it only to provide and document transportation services, and does not sell Client information.

CAPACITY AND AUTHORITY TO SIGN. The person signing certifies that they are at least 18 years old and competent to sign this Agreement. A representative signing on the Client's behalf further certifies that they hold legal authority to act for the Client (such as power of attorney, guardianship, or the Client's express authorization) and agrees that, if that certification is untrue, the representative accepts the obligations of this Agreement personally and will indemnify the Company against claims resulting from the lack of authority.

GENERAL TERMS. This Agreement is governed by the laws of the State of Texas, and venue for any dispute lies in Harris County, Texas. If any provision is held unenforceable, the remaining provisions stay in full effect. In any action in which the Company successfully enforces this Agreement against a released claim, the Company is entitled to recover its reasonable attorney's fees and costs to the extent permitted by law. This is the entire agreement between the parties regarding liability for transportation services and remains effective for all trips until revoked by the Client in writing. The Client acknowledges reading this Agreement, having the opportunity to ask questions, understanding it, and signing voluntarily.

By signing, the Client or representative confirms the certifications in the Capacity and Authority to Sign section and accepts every term of this Agreement, including the conspicuous Assumption of Risk, Release, and Indemnification provisions above.`,
  dropoff: `DROP-OFF CONFIRMATION

By signing below, I confirm each of the following for the trip identified above:

1. The trip was completed today, and the Client arrived safely at the drop-off location shown above.

2. No incident, injury, fall, or complaint of injury occurred during boarding, transport, or exiting, and none was reported to the driver.

3. The seatbelt and, where applicable, wheelchair securement devices were fastened while the vehicle was in motion.

4. All personal belongings, medications, and mobility equipment brought on the trip were accounted for and received at drop-off.

5. The Client was received at the destination entrance or into the care of staff, family, or caregiver, completing the Company's responsibility for this trip.

This confirmation is signed under, and incorporates the terms of, the Transportation Services Agreement and Release of Liability on file for the Client, including its release and electronic-signature provisions.`
};
let SIGDOCS = Object.assign({}, DEFAULT_SIGDOCS);

/* multi-stop (v6.14): Round Trips may carry a second drop-off. For those, trip miles are the
   WHOLE loop (pickup → drop 1 → drop 2 → back to pickup), so the round-trip ×2 must NOT apply. */
function hasStop(l){ return l.tripType==='Round Trip' && !!String(l.stopAddr||'').trim(); }
/* Legacy UI adapters: read current settings at call time, never snapshot them. */
function suggestPrice(tripType, officeMiles, tripMiles, stopTrip, kind){
  return window.RMTBilling.suggestPrice(tripType, officeMiles, tripMiles, stopTrip, kind, PRICES);
}
function waitBill(mins, kind){ return window.RMTBilling.waitBill(mins, kind, PRICES); }
function estWaitMins(l){ return window.RMTBilling.estWaitMins(l); }
function waitChargeOf(l){ return window.RMTBilling.waitChargeOf(l, PRICES); }
function rentFee(l){ return window.RMTBilling.rentFee(l, PRICES); }
function totalCharge(l){ return window.RMTBilling.totalCharge(l, PRICES); }
function payMethodLabel(m){
  return m==='card' ? 'card charge' : m==='invoice' ? 'Square invoice' : m==='zelle' ? 'Zelle' : m==='historical' ? 'history (pre-app)' : (m||'recorded');
}
function hasOpenInvoice(l){
  return !!(l.invoiceId && !l.paidAt && l.invoiceStatus!=='CANCELED' && l.invoiceStatus!=='FAILED' && l.invoiceStatus!=='PAID');
}
/* is money due on this trip right now? (billed, in the past or fee applied, not yet collected) */
function dueNow(l){
  if(l.paidAt) return false;
  if(revenueOf(l) <= 0) return false; /* No Show returns 0 → never collectible */
  if(l.status==='Canceled') return l.cancelFeeApplied === true || (!l.cancelFeeApplied && l.cancelFeeApplied !== false && l.cancelDate && l.cancelDate===l.date);
  if(l.status==='Confirmed') return !!l.date && l.date <= fmtDate(today);
  return false;
}
function uncollectedList(){ return leads.filter(l => dueNow(l) && !hasOpenInvoice(l)).sort((a,b)=>(a.date||'').localeCompare(b.date||'')); }
function invoicedOpenList(){ return leads.filter(l => hasOpenInvoice(l)).sort((a,b)=>(a.date||'').localeCompare(b.date||'')); }
function ageDays(l){ return l.date ? Math.max(0, Math.floor((today - new Date(l.date+'T00:00:00'))/864e5)) : 0; }
function ageBadge(l){
  const d = ageDays(l);
  const bg = d>=60 ? '#ffc9c9' : d>=30 ? '#ffdfc2' : d>=7 ? '#f3ecc2' : '#e9e4e4';
  const tc = d>=60 ? '#7c1414' : d>=30 ? '#8a4b00' : d>=7 ? '#6d5f00' : '#5f5a5a';
  return `<span style="background:${bg};color:${tc};font-size:10px;font-weight:800;padding:2px 8px;border-radius:10px;white-space:nowrap">${d}d</span>`;
}
function paidLabel(l){
  if(l.paidAt) return '<span style="color:var(--green)">✓ Paid</span> — ' + money(l.paidAmount!=null?l.paidAmount:0) + ' · ' + payMethodLabel(l.paidMethod) + ' · ' + fmtNice(fmtDate(new Date(l.paidAt)));
  if(hasOpenInvoice(l)) return '<span style="color:var(--blue);font-weight:700">Invoiced — awaiting payment</span>';
  if(l.status==='Canceled'){
    if(l.cancelFeeApplied === false) return 'No charge (fee waived)';
    if(l.cancelFeeApplied === true) return '<span style="color:#a04b00;font-weight:700">Fee due — not collected</span>';
    return (l.cancelDate && l.cancelDate===l.date) ? '<span style="color:#a04b00;font-weight:700">Same-day cancel — not collected</span>' : 'No charge (free cancel)';
  }
  if(l.status==='No Show') return 'Quoted ' + money(totalCharge(l)) + ' — not billed (no-show lead)';
  if(l.status==='Confirmed') return (l.date && l.date <= fmtDate(today)) ? '<span style="color:#a04b00;font-weight:700">Not collected</span>' : 'Due day of transport';
  return '—';
}
function revenueOf(l){
  if(l.status==='Canceled'){
    if(l.cancelFeeApplied === true) return l.cancelFee != null ? l.cancelFee : totalCharge(l);
    if(l.cancelFeeApplied === false) return 0;
    return (l.cancelDate && l.cancelDate===l.date) ? totalCharge(l) : 0; /* legacy rows */
  }
  if(l.status==='No Show') return 0; /* dead lead — the charge is only the QUOTE, never billed (owner rule Jul 15) */
  if(l.status==='Confirmed') return totalCharge(l);
  return 0;
}

/* ================= DATA ================= */
const fmtDate = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); /* LOCAL date — toISOString() was UTC and rolled to the next day after 7 PM Central */
const today = new Date(); today.setHours(0,0,0,0);
const addDays = n => { const d=new Date(today); d.setDate(d.getDate()+n); return fmtDate(d); };

let users = [];

function seedLeads(){
  return [
    {id:1, first:'Dorothy', last:'Mills', weight:'145', dob:'1948-03-12',
     pickup:'2214 Broadway St, Pearland, TX', dropoff:'Memorial Hermann Pearland Hospital, 16100 South Fwy',
     date:addDays(0), pickupTime:'08:30', apptTime:'09:15', returnTime:'11:30',
     email:'dmills@email.com', contactName:'Sarah Mills (daughter)', phone1:'(713) 555-0142', phone2:'(713) 555-0198',
     tripType:'Round Trip', waiting:'Yes', waitH:1, waitM:30, officeMiles:4, tripMiles:6,
     tripCharge:152, status:'Confirmed', driverId:2, outDone:false, retDone:false,
     cancelDate:null, arrivedAt:null, departedAt:null, actualWaitMin:null, driverNotes:''},
    {id:2, first:'Harold', last:'Greene', weight:'210', dob:'1952-11-02',
     pickup:'9330 Broadway St, Pearland, TX', dropoff:'HCA Houston Healthcare Pearland, 11100 Shadow Creek Pkwy',
     date:addDays(0), pickupTime:'13:00', apptTime:'13:45', returnTime:'',
     email:'', contactName:'Harold Greene', phone1:'(713) 555-0177', phone2:'',
     tripType:'One Way', waiting:'No', waitH:0, waitM:0, officeMiles:6, tripMiles:5,
     tripCharge:111, status:'Confirmed', driverId:2, outDone:false, retDone:false,
     cancelDate:null, arrivedAt:null, departedAt:null, actualWaitMin:null, driverNotes:''},
    {id:3, first:'Betty', last:'Alvarez', weight:'132', dob:'1945-07-19',
     pickup:'2805 Cullen Blvd, Pearland, TX', dropoff:'Kelsey-Seybold Clinic Pearland, 2515 Business Center Dr',
     date:addDays(1), pickupTime:'10:00', apptTime:'10:45', returnTime:'13:00',
     email:'balvarez@email.com', contactName:'Luis Alvarez (son)', phone1:'(281) 555-0123', phone2:'',
     tripType:'Round Trip', waiting:'Yes', waitH:0, waitM:45, officeMiles:3, tripMiles:4,
     tripCharge:135, status:'Confirmed', driverId:3, outDone:false, retDone:false,
     cancelDate:null, arrivedAt:null, departedAt:null, actualWaitMin:null, driverNotes:''},
    {id:4, first:'Walter', last:'Simmons', weight:'188', dob:'1950-01-28',
     pickup:'1919 N Main St, Pearland, TX', dropoff:'Houston Methodist Hospital, 6565 Fannin St, Houston',
     date:addDays(-1), pickupTime:'09:00', apptTime:'09:40', returnTime:'12:00',
     email:'', contactName:'Walter Simmons', phone1:'(281) 555-0155', phone2:'',
     tripType:'Round Trip', tripKind:'Stretcher', waiting:'No', waitH:0, waitM:0, officeMiles:5, tripMiles:16,
     tripCharge:233, status:'Confirmed', driverId:3, outDone:true, retDone:true,
     cancelDate:null, arrivedAt:null, departedAt:null, actualWaitMin:null,
     driverNotes:'Client uses stretcher, needed 2nd person assist.'},
    {id:5, first:'Gloria', last:'Whitfield', weight:'156', dob:'1957-09-05',
     pickup:'3312 Yost Blvd, Pearland, TX', dropoff:'US Renal Care Pearland, 6516 Broadway St',
     date:addDays(3), pickupTime:'07:15', apptTime:'08:00', returnTime:'',
     email:'gwhit@email.com', contactName:'Gloria Whitfield', phone1:'(713) 555-0134', phone2:'(713) 555-0190',
     tripType:'One Way', tripKind:'Ambulatory', waiting:'No', waitH:0, waitM:0, officeMiles:4, tripMiles:3,
     tripCharge:101, status:'Pending', driverId:null, outDone:false, retDone:false,
     cancelDate:null, arrivedAt:null, departedAt:null, actualWaitMin:null, driverNotes:''},
  ];
}
function seedClients(){
  return [
    {id:1, first:'Dorothy', last:'Mills', dob:'1948-03-12', weight:'145',
     homeAddress:'2214 Broadway St, Pearland, TX',
     phone1:'(713) 555-0142', phone2:'(713) 555-0198', email:'dmills@email.com', contactName:'Sarah Mills (daughter)',
     tripKind:'Wheelchair'},
    {id:2, first:'Gloria', last:'Whitfield', dob:'1957-09-05', weight:'156',
     homeAddress:'3312 Yost Blvd, Pearland, TX',
     phone1:'(713) 555-0134', phone2:'(713) 555-0190', email:'gwhit@email.com', contactName:'Gloria Whitfield',
     tripKind:'Ambulatory'},
  ];
}
let leads = [];
let clients = [];
let notifications = [];
let vehicles = [];
let vehicleLocs = [];
let appLogo = null;
let shifts = [];
let payouts = []; /* v6.47: driver pay settlements — admin sees all, drivers see their own */
let placeNotes = []; /* v6.55: shared notes pinned to ADDRESSES — parking, entrances, check-in desks */
let reportTimes = [];
let emailsQ = [];
let auditLog = [];
try{ appLogo = JSON.parse(localStorage.getItem('rmt_logo_cache')) || null; }catch(e){}
const KIND_ICON = {Wheelchair:'♿', Ambulatory:'🚶', Stretcher:'🛏️'};
function kindIcon(k){ return KIND_ICON[k] || '♿'; }
const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function adminAlert(text){
  const n = {id:Date.now(), adminAlert:true, read:false, text};
  notifications.push(n); insertNotif(n);
}

/* ================= STATE ================= */
let currentUser = null;
let adminTab = 'leads';
let driverTab = 'schedule';
let apptFilter = 'today';
let modal = null;
let repDates = new Set();
let repCal = null;
const search = {leads:'', appts:'', clients:''};
let leadAttn = false;
let leadTab = 'active';
let payFrom = '', payTo = '';
let adFrom = '', adTo = '';
let apptView = 'list';
let boardDate = fmtDate(today);
function toMin(t){ if(!t) return null; const [h,m]=t.split(':').map(Number); return h*60+m; }
function driverLegsFor(driverId, list){
  const out = [];
  list.forEach(l=>{
    if(l.driverId===driverId) out.push({l, leg:'out', time:l.pickupTime||'', sort:l.pickupTime||''});
    if(hasStop(l) && stopDriverOf(l)===driverId){
      /* middle leg (drop 1 → drop 2) has no clock time — it follows the first stop ('!' sorts it between the outbound and an untimed return) */
      out.push({l, leg:'mid', time:'', sort:(l.pickupTime||'') + '!'});
    }
    if(l.tripType==='Round Trip' && retDriverOf(l)===driverId){
      /* round trips ALWAYS get a return leg — even when the return time isn't set yet */
      out.push({l, leg:'ret', time:l.returnTime||'', sort:l.returnTime || ((l.pickupTime||'')+'+')});
    }
  });
  out.sort((a,b)=>a.sort.localeCompare(b.sort));
  return out;
}
function legDone(x){ return x.leg==='ret' ? !!x.l.retDone : x.leg==='mid' ? !!x.l.stopDone : !!x.l.outDone; }
/* driver schedule: active trips stay on top in time order; completed sink to the bottom */
function sortCompletedLast(legs){
  return [...legs.filter(x=>!legDone(x)), ...legs.filter(legDone)];
}
function driverLegs(driverId, date){
  const ls = driverLegsFor(driverId, leads.filter(l=>l.status==='Confirmed' && l.date===date && (l.driverId===driverId || (l.tripType==='Round Trip' && retDriverOf(l)===driverId) || (hasStop(l) && stopDriverOf(l)===driverId))));
  for(let i=1;i<ls.length;i++){
    const a=toMin(ls[i-1].time), b=toMin(ls[i].time);
    if(a!=null && b!=null && b-a<45){ ls[i-1].conflict=true; ls[i].conflict=true; }
  }
  return ls;
}
function shiftBoard(n){ const d=new Date(boardDate+'T00:00:00'); d.setDate(d.getDate()+n); boardDate=fmtDate(d); render(); }
function needsAttention(l){
  if(l.status!=='Pending') return false;
  if(l.date){
    const days = Math.round((new Date(l.date+'T00:00:00') - today)/86400000);
    return days < 3;
  }
  const age = Math.round((today - new Date((l.createdAt||fmtDate(today))+'T00:00:00'))/86400000);
  return age >= 4;
}

/* ---- client identity: normalized phone number is the unique key ---- */
function normPhone(p){
  let d = ('' + (p || '')).replace(/\D/g, '');
  if(d.length === 11 && d[0] === '1') d = d.slice(1);
  return d;
}
/* v6.38: every phone box displays as 012-345-6789. Strips to digits, drops a leading US 1,
   caps at 10, formats progressively so it looks right mid-type and when a raw number is pasted.
   Stored value is the formatted string — safe everywhere (normPhone + the SMS/opt-out paths all
   strip non-digits before matching or sending). */
function phoneFmt(v){
  let d = ('' + (v || '')).replace(/\D/g, '');
  if(d.length === 11 && d[0] === '1') d = d.slice(1);
  d = d.slice(0, 10);
  if(d.length > 6) return d.slice(0,3) + '-' + d.slice(3,6) + '-' + d.slice(6);
  if(d.length > 3) return d.slice(0,3) + '-' + d.slice(3);
  return d;
}
function findClientByPhone(...phones){
  const keys = phones.map(normPhone).filter(x => x.length >= 7);
  if(!keys.length) return null;
  return clients.find(c => [normPhone(c.phone1), normPhone(c.phone2)].some(k => k && keys.includes(k))) || null;
}
function findClientByName(first, last){
  return clients.find(c =>
    c.first.trim().toLowerCase() === (first||'').trim().toLowerCase() &&
    c.last.trim().toLowerCase() === (last||'').trim().toLowerCase()) || null;
}
/* find-or-create a client profile for lead data; returns the client id */
async function ensureClientForLead(d){
  const match = findClientByPhone(d.phone1, d.phone2) || findClientByName(d.first, d.last);
  if(match) return match.id;
  const c = {first:d.first, last:d.last, dob:d.dob, weight:d.weight, homeAddress:d.pickup,
    phone1:d.phone1, phone2:d.phone2, email:d.email, contactName:d.contactName,
    tripKind:d.tripKind||'Wheelchair'};
  const {data, error} = await sb.from('clients').insert(toDb.client(c)).select('id').single();
  if(error || !data){ syncErr(error); return null; }
  await refetch('clients');
  return data.id;
}

/* ================= AVAILABILITY ================= */
let availability = {};
function getAvail(id){
  if(!availability[id]) availability[id] = Array.from({length:7},()=>({office:'', avail:true, from:'', to:''}));
  return availability[id];
}
