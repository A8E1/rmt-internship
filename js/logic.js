/* ================= REPORT TIMES (auto office arrival) ================= */
function getReportRow(driverId, day){ return reportTimes.find(x=>x.driverId===driverId && x.day===day); }
function getReportTime(driverId, day){ const r = getReportRow(driverId, day); return r ? r.rt : ''; }
async function upsertReportTime(driverId, day, rt, manual){
  const {error} = await sb.from('report_times').upsert({driver_id:driverId, day, rt:rt||'', manual:!!manual, reminded:false});
  syncErr(error);
  await refetch('report_times');
}
function retDriverOf(l){ return l.returnDriverId || l.driverId; }
function stopDriverOf(l){ return l.stopDriverId || l.driverId; } /* middle leg falls to the pickup driver unless assigned */
/* Report-time drive estimate only (NOT driver navigation or billing).
   Tolls are allowed in general (Sam Houston, Hardy, ...) but the SH-288 tolled EXPRESS lanes are
   excluded: ask for alternatives, drop any route whose turn-by-turn steps take express/toll lanes
   on the 288 corridor, and keep the fastest remaining. Highway 288's free main lanes stay in play.
   If every alternative used the express lanes, recompute with tolls off as a fallback. */
function _uses288Express(r){
  for(const leg of (r.legs||[])) for(const st of (leg.steps||[])){
    const t = ((st.navigationInstruction && st.navigationInstruction.instructions) || '');
    if(/((TX|SH)[- ]?288|\b288\b)[^\w]{0,4}(toll|express)/i.test(t)) return true;
    if(/(toll|express)[^\w]{0,6}((TX|SH)[- ]?288\b)/i.test(t)) return true;
    if(/express (toll )?lanes?/i.test(t) && /288/.test(t)) return true;
  }
  return false;
}
async function _routesCall(origin, destination, avoidTolls){
  const point = origin && typeof origin==='object' ? {lat:+origin.lat, lng:+origin.lng} : origin;
  const j = await mapsRequest('duration', {origin:point, destination, avoidTolls});
  return j.routes || [];
}
async function routesDuration(origin, destination){
  if(!OPS.mapsEnabled || !origin || !destination) return null;
  try{
    let ok = (await _routesCall(origin, destination, false)).filter(r=>!_uses288Express(r));
    if(!ok.length) ok = await _routesCall(origin, destination, true);
    const durs = ok.map(r=>parseInt(r.duration)).filter(n=>!isNaN(n));
    if(!durs.length) return null;
    return Math.round(Math.min(...durs) / 60);
  }catch(e){ console.error(e); return null; }
}
async function recomputeReportTime(driverId, day){
  if(!driverId || !day) return;
  const row = getReportRow(driverId, day);
  if(row && row.manual) return; /* admin override wins */
  const dayLeads = leads.filter(l=>l.status==='Confirmed' && l.date===day && l.driverId===driverId && l.pickupTime);
  let rt = '';
  if(dayLeads.length && OPS.mapsEnabled){
    const first = dayLeads.reduce((a,b)=>a.pickupTime<=b.pickupTime?a:b);
    const dur = await routesDuration(OFFICE, first.pickup);
    if(dur != null){
      const durR = Math.round(dur/5)*5;
      const mins = toMin(first.pickupTime) - durR - (+OPS.buffer||10);
      if(mins > 0) rt = String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');
    }
  }
  const old = row ? row.rt : '';
  if(rt === old) return;
  if(!rt && !row) return;
  await upsertReportTime(driverId, day, rt, false);
  const isTomorrow = day===addDays(1), isToday = day===fmtDate(today);
  if(rt && (isToday || isTomorrow)){
    if(row && row.notified && rt !== old){
      const n = {id:Date.now(), driverId, read:false, text:`Your office report time changed to ${fmtTime(rt)}.`};
      notifications.push(n); insertNotif(n);
    } else if(isTomorrow && new Date().getHours() >= opsNum('eveningHour',18) && !(row && row.notified)){
      const n = {id:Date.now(), driverId, read:false, text:`You're on tomorrow — be at the office by ${fmtTime(rt)}.`};
      notifications.push(n); insertNotif(n);
      sb.from('report_times').update({notified:true}).eq('driver_id',driverId).eq('day',day).then(r=>syncErr(r.error));
    }
  }
}
function recomputeAround(l, oldP, oldR, oldDate){
  const pairs = new Set();
  [l.date, oldDate].forEach(day=>{
    if(!day) return;
    [l.driverId, oldP, l.returnDriverId, oldR].forEach(d=>{ if(d) pairs.add(d+'|'+day); });
  });
  pairs.forEach(k=>{ const [d, day] = k.split('|'); recomputeReportTime(d, day); });
}

/* ================= SHIFTS (time clock) ================= */
function shiftHrs(x){ return Math.max(0, ((x.out || Date.now()) - x.in) / 3600000); }
/* PAID time: paid start = the LATER of the scheduled office report time or the actual clock-in.
   Early clock-ins are recorded but unpaid before the report time (unless admin approves early_ok).
   Late clock-ins are paid from actual clock-in. Shift end = actual clock-out (unchanged). */
function paidStartOf(x){
  if(x.earlyOk) return x.in;
  const inD = new Date(x.in);
  const row = getReportRow(x.driverId, fmtDate(inD));
  if(row && row.rt){
    const rtMs = new Date(fmtDate(inD) + 'T' + row.rt + ':00').getTime();
    if(rtMs > x.in) return x.out ? Math.min(rtMs, x.out) : rtMs; /* entirely-early shift pays 0, not full */
  }
  return x.in;
}
function paidHrs(x){ return Math.max(0, ((x.out || Date.now()) - paidStartOf(x)) / 3600000); }
function paidBetween(driverId, s, e){
  return shifts.filter(x=>x.driverId===driverId && fmtDate(new Date(x.in))>=s && fmtDate(new Date(x.in))<=e)
    .reduce((a,x)=>a+paidHrs(x), 0);
}
/* v6.47: payout tracking. "Paid through" = end date of the driver's latest payout.
   Days before the FIRST payout's start are pre-tracking — shown neutral, never "not paid". */
function payoutsOf(driverId){ return payouts.filter(p=>p.driverId===driverId).sort((a,b)=>(b.end||'').localeCompare(a.end||'')); }
function paidThroughOf(driverId){ const p = payoutsOf(driverId)[0]; return p ? p.end : null; }
function trackStartOf(driverId){ const ps = payoutsOf(driverId); return ps.length ? ps[ps.length-1].start : null; }
function owedSinceOf(driverId){
  const pt = paidThroughOf(driverId); if(!pt) return null;
  const s = addDaysTo(pt, 1);
  const e = fmtDate(today);
  if(s > e) return {s, e, h:0};
  return {s, e, h:paidBetween(driverId, s, e)};
}
function addDaysTo(ds, n){ const d = new Date(ds+'T12:00:00'); d.setDate(d.getDate()+n); return fmtDate(d); }
/* ================= v6.55: DRIVER↔CLIENT EXPERIENCE — needs chips, one-tap texts, place notes ================= */
function needsChips(l){
  const c = [];
  if(l.oxygen) c.push('<span style="background:#e8f1fb;color:#185fa5;font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap">🫁 OXYGEN</span>');
  if(l.escort) c.push('<span style="background:#fdf6e8;color:#8a5a00;font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap">👥 ESCORT</span>');
  if(l.rentWheelchair && (l.tripKind||'Wheelchair')==='Wheelchair') c.push('<span style="background:#f0e4e5;color:#6d1a24;font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap">♿ RENTAL CHAIR</span>');
  return c.length ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 8px">'+c.join('')+'</div>' : '';
}
function placeNoteFor(addr){
  if(!addr || addr.trim().length < 6) return null;
  const k = normAddr(addr);
  return placeNotes.find(p=>p.key===k) || null;
}
function placeNoteBox(addr, canEdit){
  const pn = placeNoteFor(addr);
  if(!pn && !canEdit) return '';
  if(!pn) return `<div style="margin:6px 0"><button type="button" class="btn-mini ghost" style="font-size:11.5px;padding:4px 10px" onclick="savePlaceNote(${JSON.stringify(addr).replace(/"/g,'&quot;')})">+ Add place note (parking, entrance…)</button></div>`;
  return `<div style="background:#fffdf6;border:1.5px solid #c9a856;border-radius:10px;padding:8px 11px;font-size:12px;color:var(--ink);margin:6px 0;line-height:1.55"><b>Place note:</b> ${esc(pn.note)}${canEdit?` <span style="color:var(--blue);cursor:pointer;font-weight:700" onclick="savePlaceNote(${JSON.stringify(addr).replace(/"/g,'&quot;')})">edit</span>`:''}</div>`;
}
async function savePlaceNote(addr){
  const existing = placeNoteFor(addr);
  const note = prompt('Note for this place (parking, entrance, check-in desk):', existing ? existing.note : '');
  if(note === null) return;
  const k = normAddr(addr);
  if(!note.trim()){
    if(existing && currentUser.role==='admin'){
      const {error} = await sb.from('place_notes').delete().eq('addr_key', k);
      if(error){ syncErr(error); toast('Could not remove'); return; }
      placeNotes = placeNotes.filter(p=>p.key!==k); render(); toast('Place note removed');
    }
    return;
  }
  const {data, error} = await sb.from('place_notes').upsert({addr_key:k, address:addr, note:note.trim(), updated_by:currentUser.id, updated_at:new Date().toISOString()}, {onConflict:'addr_key'}).select();
  if(error || !(data||[]).length){ syncErr(error); toast('Did not save — try again'); return; }
  const row = {id:data[0].id, key:k, address:addr, note:note.trim(), at:data[0].updated_at};
  placeNotes = placeNotes.filter(p=>p.key!==k); placeNotes.push(row);
  render(); toast('Place note saved — every driver sees it now');
}
function textablePhone(l){ const ph = (l.phone1 || l.phone2 || '').replace(/\D/g,'').slice(-10); return ph.length===10 ? ph : null; }
async function sendOnMyWay(leadId, leg){
  const l = liveLead(leadId); if(!l) return;
  const ph = textablePhone(l); if(!ph){ toast('No textable phone number on this trip — call them instead'); return; }
  if(l.onmywayAt && !confirm('An on-my-way text was already sent for this trip. Send another?')) return;
  const drv = users.find(u=>u.id===currentUser.id);
  const dName = drv ? drv.name.split(' ')[0] : 'Your driver';
  /* live ETA from this driver's van position when available */
  let etaTxt = '';
  try{
    const van = vehicles.find(v=>v.driverId===currentUser.id && v.active!==false);
    const loc = van ? vehicleLocs.find(x=>x.imei===van.imei) : null;
    const dest = leg==='ret' ? ((hasStop(l) ? l.stopAddr : l.dropoff) || l.pickup) : l.pickup;
    if(loc && loc.lat!=null && OPS.mapsEnabled && dest){
      const sec = await routesDuration({lat:loc.lat, lng:loc.lng}, dest);
      if(sec){ const t = new Date(Date.now() + sec*1000 + (opsNum('buffer',10)*0)); etaTxt = ' and should arrive around ' + t.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}); }
    }
  }catch(e){ console.error(e); }
  const body = 'Hi ' + l.first + ', this is Royalty Medical Transportation. ' + dName + ' is on the way' + etaTxt + '.';
  const {data, error} = await sb.from('sms_queue').insert({kind:'onmyway', lead_id:l.id, client_id:l.clientId||null, to_phone:ph, body, status:'pending', due_at:new Date().toISOString(), cycle:0}).select('id');
  if(error || !(data||[]).length){ syncErr(error); toast('Text did not queue — try again'); return; }
  const ts = new Date().toISOString();
  const {error:e2} = await sb.from('leads').update({onmyway_at:ts}).eq('id', l.id);
  if(!e2) l.onmywayAt = ts;
  render(); toast('On-my-way text queued ✓' + (etaTxt ? ' (with live ETA)' : ''));
}
async function sendArrivedText(leadId){
  const l = liveLead(leadId); if(!l) return;
  const ph = textablePhone(l); if(!ph){ toast('No textable phone number on this trip — call them instead'); return; }
  if(l.arrivedTextAt && !confirm('An arrival text was already sent for this trip. Send another?')) return;
  const body = 'Hi ' + l.first + ', your Royalty Medical Transportation driver has arrived and is waiting outside. See you in a moment!';
  const {data, error} = await sb.from('sms_queue').insert({kind:'arrived', lead_id:l.id, client_id:l.clientId||null, to_phone:ph, body, status:'pending', due_at:new Date().toISOString(), cycle:0}).select('id');
  if(error || !(data||[]).length){ syncErr(error); toast('Text did not queue — try again'); return; }
  const ts = new Date().toISOString();
  const {error:e2} = await sb.from('leads').update({arrived_text_at:ts}).eq('id', l.id);
  if(!e2) l.arrivedTextAt = ts;
  render(); toast('Arrival text queued ✓');
}
/* v6.58: the driver "Office note" button was removed (owner: trip notes cover it — saveNote
   already rings the admin bell). The client-profile pending-note approval bar stays for any
   suggestions that were already submitted. */
function navMapsUrl(addr){ return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addr||''); }
function driverActionRow(l, leg){
  /* v6.58 owner pass: no emojis on buttons; Navigate/Office-note dropped (each address already
     has Navigate + Copy; trip notes cover driver→office messages); Call renamed Call Client. */
  return `
  <div style="display:flex;gap:8px;margin:8px 0">
    <button type="button" class="btn-mini" style="flex:1;background:var(--green);padding:10px 4px" onclick="sendOnMyWay(${l.id}, '${leg||'out'}')">On my way${l.onmywayAt?' ✓':''}</button>
    <button type="button" class="btn-mini" style="flex:1;background:var(--royal);padding:10px 4px" onclick="sendArrivedText(${l.id})">I've arrived${l.arrivedTextAt?' ✓':''}</button>
  </div>
  ${textablePhone(l)?`<div style="display:flex;gap:8px;margin-bottom:8px">
    <a class="btn-mini ghost" style="flex:1;text-align:center;text-decoration:none" href="tel:${esc(phoneFmt(l.phone1||l.phone2))}">Call Client</a>
  </div>`:''}`;
}
/* one add-button for the pair of addresses on a leg card — asks which address when both are noteless */
function placeNotesBlock(from, to){
  const nFrom = placeNoteFor(from), nTo = placeNoteFor(to);
  let html = (nFrom ? placeNoteBox(from, true) : '') + (nTo && to !== from ? placeNoteBox(to, true) : '');
  if(!nFrom || (!nTo && to !== from)){
    html += `<div style="margin:6px 0"><button type="button" class="btn-mini ghost" style="font-size:11.5px;padding:4px 10px" data-f="${esc(from)}" data-t="${esc(to)}" onclick="addPlaceNoteChooser(this.dataset.f, this.dataset.t)">+ Add place note (parking, entrance…)</button></div>`;
  }
  return html;
}
function addPlaceNoteChooser(from, to){
  const nFrom = placeNoteFor(from), nTo = placeNoteFor(to);
  if(nFrom && !nTo) return savePlaceNote(to);
  if(nTo && !nFrom) return savePlaceNote(from);
  if(to === from) return savePlaceNote(from);
  const prev = document.getElementById('pnc-wrap'); if(prev) prev.remove();
  const wrap = document.createElement('div');
  wrap.id = 'pnc-wrap'; wrap.className = 'overlay'; wrap.style.zIndex = '70';
  wrap.innerHTML = '<div class="sheet"><div class="sheet-head"><h3>Add a place note</h3><button class="x" id="pnc-x">✕</button></div><div class="sheet-body">'
    + '<div class="hint" style="margin-bottom:10px">Which address is the note about?</div>'
    + '<button id="pnc-a" class="btn-mini ghost" style="width:100%;margin-bottom:8px;text-align:left;white-space:normal;line-height:1.4">From: ' + esc(from) + '</button>'
    + '<button id="pnc-b" class="btn-mini ghost" style="width:100%;text-align:left;white-space:normal;line-height:1.4">To: ' + esc(to) + '</button>'
    + '</div></div>';
  document.body.appendChild(wrap);
  wrap.addEventListener('click', function(ev){ if(ev.target === wrap) wrap.remove(); });
  document.getElementById('pnc-x').onclick = function(){ wrap.remove(); };
  document.getElementById('pnc-a').onclick = function(){ wrap.remove(); savePlaceNote(from); };
  document.getElementById('pnc-b').onclick = function(){ wrap.remove(); savePlaceNote(to); };
}
/* ===== v6.57: client signatures — one-time service agreement + per-drop-off confirmation ===== */
/* v6.58: waiver status that works for BOTH roles — admins read it off the clients array,
   drivers (who can't see the clients table) read the id→date map loaded at login. */
function waiverOf(cid){
  if(!cid) return null;
  const c = clients.find(function(x){ return x.id===cid; });
  if(c) return c.waiverAt || null;
  return waiverMap[cid] || null;
}
function sigStampOf(l, leg){ return leg==='ret' ? l.sigRetAt : leg==='mid' ? l.sigMidAt : l.sigOutAt; }
function sigStampPatch(leg, iso){ return leg==='ret' ? {sig_ret_at:iso} : leg==='mid' ? {sig_mid_at:iso} : {sig_out_at:iso}; }
function setSigStampLocal(l, leg, iso){ if(leg==='ret') l.sigRetAt = iso; else if(leg==='mid') l.sigMidAt = iso; else l.sigOutAt = iso; }
function legDest(l, leg){ return leg==='ret' ? (l.returnDropoff || l.pickup) : leg==='mid' ? l.stopAddr : l.dropoff; }
/* the signing sheet: floats on document.body (outside #app, like confirmSheet) so realtime
   re-renders can't kill a half-drawn signature. Resolves {signedBy, dataUrl} or null. */
function sigPadSheet(o){
  return new Promise(function(res){
    const prev = document.getElementById('sig-wrap'); if(prev) prev.remove();
    const wrap = document.createElement('div');
    wrap.id = 'sig-wrap'; wrap.className = 'overlay'; wrap.style.zIndex = '70';
    /* labels stay fixed; long VALUES (hospital addresses) wrap onto extra lines instead of
       overlapping the label (owner caught the overlap on the first live drop-off, Jul 29) */
    const infoRows = (o.info||[]).map(function(p){ return '<div class="drow" style="align-items:flex-start"><span class="k" style="flex-shrink:0;margin-right:10px">'+esc(p[0])+'</span><span class="v" style="text-align:right;white-space:normal;word-break:break-word;min-width:0">'+esc(p[1])+'</span></div>'; }).join('');
    wrap.innerHTML = '<div class="sheet"><div class="sheet-head"><h3>'+esc(o.title)+'</h3><button class="x" id="sig-x">✕</button></div><div class="sheet-body">'
      + (o.intro ? '<div class="hint" style="margin-bottom:10px">'+o.intro+'</div>' : '')
      + (infoRows ? '<div class="detail-grid" style="margin-bottom:10px">'+infoRows+'</div>' : '')
      + '<div style="border:1px solid var(--line);border-radius:10px;padding:10px;max-height:170px;overflow-y:auto;font-size:12px;line-height:1.5;color:var(--muted);margin-bottom:10px;white-space:pre-wrap">'+esc(o.docText||'')+'</div>'
      + '<span class="flabel" style="display:block;margin-bottom:6px">Who is signing?</span>'
      + '<div id="sig-chips" style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">'
      +   ['Client','Family member','Caregiver'].map(function(w,i){ return '<button type="button" class="btn-mini'+(i?' ghost':'')+'" data-w="'+w+'" style="flex:1;padding:8px 4px">'+w+'</button>'; }).join('')
      + '</div>'
      + '<div id="sig-name-wrap" style="display:none;margin-bottom:10px">'
      +   '<span class="flabel" style="display:block;margin-bottom:6px">Printed name of the person signing</span>'
      +   '<input id="sig-name" autocomplete="off" placeholder="Full name" style="width:100%">'
      + '</div>'
      + '<span class="flabel" style="display:block;margin-bottom:6px">Sign with your finger</span>'
      + '<canvas id="sig-canvas" style="width:100%;height:160px;border:2px dashed var(--line);border-radius:10px;background:#fff;touch-action:none;display:block"></canvas>'
      + '<div style="display:flex;gap:8px;margin-top:10px">'
      +   '<button type="button" id="sig-clear" class="btn-mini ghost" style="flex:1">Clear</button>'
      +   '<button type="button" id="sig-save" class="btn-mini" style="flex:2;background:var(--green)">Save signature</button>'
      + '</div>'
      + '</div></div>';
    document.body.appendChild(wrap);
    let signedBy = 'Client', hasInk = false, settled = false;
    const cv = document.getElementById('sig-canvas');
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
    const cx = cv.getContext('2d');
    cx.scale(dpr, dpr); cx.lineWidth = 2.5; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.strokeStyle = '#1a1a2e';
    let drawing = false;
    function pos(ev){ const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
    cv.addEventListener('pointerdown', function(ev){ ev.preventDefault(); drawing = true; hasInk = true; const p = pos(ev); cx.beginPath(); cx.moveTo(p[0], p[1]); cx.lineTo(p[0]+0.1, p[1]+0.1); cx.stroke(); try{ cv.setPointerCapture(ev.pointerId); }catch(e){} });
    cv.addEventListener('pointermove', function(ev){ if(!drawing) return; ev.preventDefault(); const p = pos(ev); cx.lineTo(p[0], p[1]); cx.stroke(); });
    cv.addEventListener('pointerup', function(){ drawing = false; });
    cv.addEventListener('pointercancel', function(){ drawing = false; });
    document.getElementById('sig-chips').addEventListener('click', function(ev){
      const b = ev.target.closest('button'); if(!b) return;
      signedBy = b.dataset.w;
      this.querySelectorAll('button').forEach(function(x){ x.classList.toggle('ghost', x !== b); });
      /* v6.64: a family member or caregiver signing for the client must print their name */
      document.getElementById('sig-name-wrap').style.display = signedBy === 'Client' ? 'none' : 'block';
    });
    document.getElementById('sig-clear').onclick = function(){ cx.clearRect(0, 0, cv.width, cv.height); hasInk = false; };
    function done(v){ if(settled) return; settled = true; wrap.remove(); res(v); }
    document.getElementById('sig-x').onclick = function(){ done(null); };
    document.getElementById('sig-save').onclick = function(){
      if(!hasInk){ toast('Please sign in the box first'); return; }
      const nm = (document.getElementById('sig-name').value || '').trim();
      if(signedBy !== 'Client' && !nm){ toast('Please enter the name of the person signing'); return; }
      done({signedBy: signedBy, signerName: signedBy === 'Client' ? '' : nm, dataUrl: cv.toDataURL('image/png')});
    };
  });
}
/* full drop-off flow: waiver first if this client has never signed one, then the trip confirmation.
   Every write is awaited + verified; a failed save keeps the sheet result and tells the driver. */
/* shared waiver collection (v6.59) — used by the pre-ride "Client's First Trip" banner AND as
   the drop-off safety net. Drivers cannot read the clients table (privacy RLS) — waiverOf falls
   back to the id→date lookup from the client_waivers view, and the stamp is written through the
   locked mark_waiver server function. Returns true when signed + saved. */
async function collectWaiverSig(l){
  const r = await sigPadSheet({
    title: 'Service agreement — first trip',
    intro: 'First trip for <b>'+esc(l.first)+' '+esc(l.last)+'</b> — a one-time agreement covers this and all future trips. Hand the phone to the client to read and sign.',
    info: [['Client', l.first+' '+l.last], ['Date', fmtNice(fmtDate(today))]],
    docText: SIGDOCS.waiver
  });
  if(!r) { toast('Agreement not signed — you can collect it from the trip card anytime'); return false; }
  const ins = await sb.from('signatures').insert({kind:'waiver', client_id:l.clientId, lead_id:l.id, signed_by:r.signedBy, signer_name:r.signerName||null, sig_data:r.dataUrl, doc_text:SIGDOCS.waiver, driver_id:currentUser.id, driver_name:currentUser.name}).select('id');
  if(ins.error || !(ins.data||[]).length){ syncErr(ins.error); toast('Agreement DID NOT SAVE — weak signal? Try again from the trip card.'); return false; }
  const {data:wv, error:we} = await sb.rpc('mark_waiver', {cid:l.clientId});
  const stamp = (!we && wv) ? wv : new Date().toISOString();
  if(we) syncErr(we);
  const c = clients.find(function(x){ return x.id===l.clientId; });
  if(c) c.waiverAt = stamp;
  waiverMap[l.clientId] = stamp;
  adminAlert('✍️ '+l.first+' '+l.last+' signed the service agreement (collected by '+currentUser.name+')');
  /* v6.64: email the signed copy — queued server-side with a 10 minute hold (admin removing a
     mistaken signature inside that window also cancels the email). Runs only after a REAL
     completed signature; a stray tap that gets canceled never reaches this line. The server
     checks: email on file, do-not-email list, and one-per-client. */
  try{
    const {data:qr, error:qe} = await sb.rpc('queue_waiver_email', {cid:l.clientId, lid:l.id});
    if(qe) syncErr(qe);
    if(qr==='queued') toast('Agreement saved ✓ — a signed copy will be emailed to the client');
    else if(qr==='no_email') toast('Agreement saved ✓ — no email on file, so no copy was sent');
    else toast('Agreement saved ✓');
  }catch(e){ toast('Agreement saved ✓'); }
  return true;
}
/* the banner button: waiver only, at the client's door before the ride */
async function collectWaiverOnly(leadId){
  const l = liveLead(leadId); if(!l || !l.clientId || waiverOf(l.clientId)) return;
  await collectWaiverSig(l);
  render();
}
async function collectTripSignature(leadId, leg){
  const l = liveLead(leadId); if(!l) return;
  /* v6.61 (owner rule, via Frankie's ret leg): the waiver is only collected BEFORE a ride
     starts — banner + safety net apply to the pickup leg only. A ret/mid leg completing on an
     unsigned client just takes the drop-off confirmation; the waiver lands on the banner at
     that client's NEXT trip pickup. */
  if((!leg || leg==='out') && l.clientId && !waiverOf(l.clientId)){
    const ok = await collectWaiverSig(l);
    if(!ok) return;
  }
  const already = sigStampOf(l, leg);
  if(already){
    const redo = await confirmSheet({title:'Already signed', body:'<div style="font-size:13px">This drop-off was already signed at '+esc(fmtClock(new Date(already).getTime()))+'. Collect a NEW signature to replace it?</div>', yes:'Collect new signature', no:'Keep the existing one'});
    if(!redo) return;
  }
  const r2 = await sigPadSheet({
    title: 'Drop-off confirmation',
    intro: 'Hand the phone to the client (or the family member or caregiver riding along) to confirm the drop-off and sign.',
    info: [['Client', l.first+' '+l.last], ['Drop-off', legDest(l, leg)], ['Time', fmtClock(Date.now())], ['Driver', currentUser.name]],
    docText: SIGDOCS.dropoff
  });
  if(!r2){ render(); return; }
  const ins2 = await sb.from('signatures').insert({kind:'dropoff', client_id:l.clientId||null, lead_id:l.id, leg:leg||'out', signed_by:r2.signedBy, signer_name:r2.signerName||null, sig_data:r2.dataUrl, doc_text:SIGDOCS.dropoff, driver_id:currentUser.id, driver_name:currentUser.name, dropoff_addr:legDest(l, leg)}).select('id');
  if(ins2.error || !(ins2.data||[]).length){ syncErr(ins2.error); toast('Signature DID NOT SAVE — weak signal? Try again from the trip card.'); return; }
  const iso = new Date().toISOString();
  const prevStamp = sigStampOf(l, leg);
  setSigStampLocal(l, leg, iso);
  const okP = await patchLeadV(l, sigStampPatch(leg, iso));
  if(!okP){ setSigStampLocal(l, leg, prevStamp); render(); return; }
  render(); toast('Drop-off signature saved ✓');
}
/* fetch-on-demand viewer: signatures are never bulk-loaded (images are heavy); the newest
   matching record is fetched when someone taps View. Admin-only Remove inside. */
async function viewSignature(kind, refId, leg){
  let q = sb.from('signatures').select('*').eq('kind', kind);
  q = kind==='waiver' ? q.eq('client_id', refId) : q.eq('lead_id', refId).eq('leg', leg||'out');
  const {data, error} = await q.order('id', {ascending:false}).limit(1);
  if(error){ syncErr(error); toast('Could not load the signature — try again'); return; }
  const s = (data||[])[0];
  if(!s){ toast('No signature found'); return; }
  const prev = document.getElementById('sigv-wrap'); if(prev) prev.remove();
  const wrap = document.createElement('div');
  wrap.id = 'sigv-wrap'; wrap.className = 'overlay'; wrap.style.zIndex = '70';
  const when = s.signed_at ? fmtNice(fmtDate(new Date(s.signed_at)))+' · '+fmtClock(new Date(s.signed_at).getTime()) : '';
  /* v6.62: same wrap recipe as the signing sheet — fixed labels, long values wrap below
     (the viewer had the identical Drop-off-address overlap the pad had; owner caught it) */
  const metaRow = function(k, v){ return '<div class="drow" style="align-items:flex-start"><span class="k" style="flex-shrink:0;margin-right:10px">'+k+'</span><span class="v" style="text-align:right;white-space:normal;word-break:break-word;min-width:0">'+esc(v)+'</span></div>'; };
  wrap.innerHTML = '<div class="sheet"><div class="sheet-head"><h3>'+(kind==='waiver'?'Service Agreement':'Drop-off Confirmation')+'</h3><button class="x" id="sigv-x">✕</button></div><div class="sheet-body">'
    + '<div class="detail-grid" style="margin-bottom:10px">'
    +   metaRow('Signed by', (s.signed_by||'') + (s.signer_name ? ' · ' + s.signer_name : ''))
    +   metaRow('When', when)
    +   (s.driver_name ? metaRow('Collected by', s.driver_name) : '')
    +   (s.dropoff_addr ? metaRow('Drop-off', s.dropoff_addr) : '')
    + '</div>'
    + (/^data:image\//.test(s.sig_data||'') ? '<img src="'+s.sig_data+'" alt="signature" style="width:100%;border:1px solid var(--line);border-radius:10px;background:#fff">' : '<div class="hint">Signature image could not be displayed.</div>')
    + '<details style="margin-top:10px"><summary style="font-size:13px;color:var(--muted);cursor:pointer">Wording agreed to at signing</summary><div style="font-size:12px;line-height:1.5;color:var(--muted);white-space:pre-wrap;margin-top:8px">'+esc(s.doc_text||'')+'</div></details>'
    + (currentUser.role==='admin' ? '<button id="sigv-del" class="btn-mini ghost" style="margin-top:12px;width:100%;color:var(--red);border-color:var(--red)">Remove this signature (admin)</button>' : '')
    + '</div></div>';
  document.body.appendChild(wrap);
  wrap.addEventListener('click', function(ev){ if(ev.target === wrap) wrap.remove(); });
  document.getElementById('sigv-x').onclick = function(){ wrap.remove(); };
  const del = document.getElementById('sigv-del');
  if(del) del.onclick = async function(){
    const ok = await confirmSheet({title:'Remove signature?', body:'<div style="font-size:13px">This permanently removes the signed record. Only do this if it was captured in error.</div>', yes:'Remove it', no:'Keep it', yesStyle:'background:var(--red)'});
    if(!ok) return;
    const {data:dd, error:de} = await sb.from('signatures').delete().eq('id', s.id).select('id');
    if(de || !(dd||[]).length){ syncErr(de); toast('Could not remove — only admins can remove signatures'); return; }
    if(kind==='waiver'){
      const c = clients.find(function(x){ return x.id===s.client_id; });
      const up = await sb.from('clients').update({waiver_at:null}).eq('id', s.client_id).select('id');
      if(!up.error && (up.data||[]).length && c) c.waiverAt = null;
      delete waiverMap[s.client_id];
      /* v6.64: removing a mistaken waiver inside the 10 minute hold also cancels the queued
         signed-copy email so the client never receives a copy of a removed signature */
      const cx = await sb.from('emails').delete().eq('email_type','waiver').eq('client_id', s.client_id).eq('status','pending').select('id');
      if(!cx.error && (cx.data||[]).length) toast('Queued email of the signed copy was canceled too');
    } else {
      const l = liveLead(s.lead_id);
      if(l){ setSigStampLocal(l, s.leg||'out', null); await patchLeadV(l, sigStampPatch(s.leg||'out', null)); }
    }
    wrap.remove(); render(); toast('Signature removed');
  };
}
/* is the signed-in user (driver OR admin) assigned to any leg of this trip? */
function myLeg(l){
  if(!currentUser) return null;
  if(l.driverId===currentUser.id) return 'out';
  if(l.tripType==='Round Trip' && retDriverOf(l)===currentUser.id) return 'ret';
  if(hasStop(l) && stopDriverOf(l)===currentUser.id) return 'mid';
  return null;
}
/* tag for a given day: 'paid' | 'due' | null (pre-tracking or no payouts yet) */
function dayPayTag(driverId, ds){
  const pt = paidThroughOf(driverId); if(!pt) return null;
  const ts = trackStartOf(driverId);
  if(ts && ds < ts) return null;
  return ds <= pt ? 'paid' : 'due';
}
/* v6.41: payroll range result — tappable total that expands a per-day breakdown.
   Rendered into #pay-result and updated IN PLACE on date change (no full re-render →
   no scroll-jump-to-top). window._payBreak holds the expand/collapse state. */
/* v6.47: record a payout. First one uses the typed From date; later ones anchor on the last payout. */
async function markPaidThrough(driverId){
  const u = users.find(x=>x.id===driverId); if(!u) return;
  const dpt = paidThroughOf(driverId);
  const from = dpt ? addDaysTo(dpt,1) : ($('po-from') ? $('po-from').value : '');
  const to = $('po-to') ? $('po-to').value : '';
  const amt = Math.round((+($('po-amt') ? $('po-amt').value : 0))*100)/100;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)){ toast('Pick the dates first'); return; }
  if(from > to){ toast('Paid-through must be on or after ' + fmtNice(from)); return; }
  if(!(amt >= 0)){ toast('Enter the amount paid'); return; }
  const hrs = Math.round(paidBetween(driverId, from, to)*100)/100;
  const ok = await confirmSheet({title:'Record this payout?', body:`<div style="font-size:13.5px;line-height:1.7"><b>${esc(u.name)}</b><br>Covers ${fmtNice(from)} – ${fmtNice(to)}<br>${hrs.toFixed(2)} paid hours · <b>${money(amt)}</b><br><span style="color:var(--muted);font-size:12px">The driver will see these days marked paid.</span></div>`, yes:'Record payout', no:'Cancel'});
  if(!ok) return;
  const {data, error} = await sb.from('payouts').insert({driver_id:driverId, period_start:from, period_end:to, hours:hrs, amount:amt, created_by:currentUser.id}).select();
  if(error || !(data||[]).length){ syncErr(error); toast('Did not save — try again'); return; }
  payouts.push({id:data[0].id, driverId, start:from, end:to, hours:hrs, amount:amt, at:data[0].created_at});
  render(); toast('Payout recorded ✓ — driver sees it now');
}
async function undoLastPayout(driverId){
  const p = payoutsOf(driverId)[0]; if(!p) return;
  const ok = await confirmSheet({title:'Undo the last payout?', body:`<div style="font-size:13px">Removes the record covering ${fmtNice(p.start)} – ${fmtNice(p.end)} (${money(p.amount)}). Those days go back to "not paid yet" on the driver's Pay tab.</div>`, yes:'Undo it', no:'Keep'});
  if(!ok) return;
  const {data, error} = await sb.from('payouts').delete().eq('id', p.id).select('id');
  if(error || !(data||[]).length){ syncErr(error); toast('Could not undo'); return; }
  payouts = payouts.filter(x=>x.id!==p.id);
  render(); toast('Payout removed');
}
function payResultHTML(driverId){
  if(!(adFrom && adTo && adFrom <= adTo))
    return '<div class="hint" style="margin-bottom:14px">Pick two dates to total this driver\'s paid hours and pay — e.g. a payroll period.</div>';
  const rate = +((users.find(z=>z.id===driverId)||{}).hourlyRate||0);
  const rows = shifts.filter(x=>x.driverId===driverId && fmtDate(new Date(x.in))>=adFrom && fmtDate(new Date(x.in))<=adTo).sort((a,b)=>a.in-b.in);
  const ph = rows.reduce((a,x)=>a+paidHrs(x), 0);
  const cnt = rows.length;
  const open = !!window._payBreak;
  const sd = new Date(adFrom+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const ed = new Date(adTo+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  let h = `<div class="detail-grid" style="margin-bottom:${open?'6':'14'}px"><div class="drow" style="cursor:pointer" onclick="window._payBreak=!window._payBreak;renderPayResult('${driverId}')"><span class="k" style="min-width:0;flex-shrink:1">${sd} – ${ed} · ${cnt} shift${cnt===1?'':'s'} <span style="color:var(--blue);white-space:nowrap">${cnt?(open?'▾ hide days':'▸ show days'):''}</span></span><span class="v" style="white-space:nowrap">${ph.toFixed(2)} h · <b>${money(ph*rate)}</b></span></div></div>`;
  if(open && cnt){
    h += '<div class="detail-grid" style="margin-bottom:14px">' + rows.map(x=>{
      const hh = paidHrs(x);
      const d = new Date(x.in).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
      return `<div class="drow"><span class="k" style="min-width:0;flex-shrink:1">${d} · ${shiftLine(x)}</span><span class="v" style="white-space:nowrap">${hh.toFixed(2)} h · ${money(hh*rate)}</span></div>`;
    }).join('') + '</div>';
  }
  return h;
}
function renderPayResult(driverId){
  const el = document.getElementById('pay-result');
  if(el) el.innerHTML = payResultHTML(driverId);
}
function shiftLine(x){
  let base = fmtClock(x.in) + ' – ' + (x.out ? fmtClock(x.out) : 'now');
  const ps = paidStartOf(x);
  if(ps > x.in) base += ' <span style="color:#9a6a00">· paid from ' + fmtClock(ps) + '</span>';
  const mi = shiftMiles(x);
  if(mi!=null) base += ' <span style="color:var(--muted)">· ' + Math.round(mi) + ' mi</span>';
  if(x.wcPhoto || x.damagePhoto) base += ` <a href="#" onclick="event.preventDefault();event.stopPropagation();viewShiftPhotos(${x.id})" style="color:var(--blue)">📷${x.damagePhoto?' damage':''}</a>`;
  return base;
}
async function viewShiftPhotos(id){
  const s = shifts.find(x=>x.id===id); if(!s) return;
  for(const p of [s.wcPhoto, s.damagePhoto]){
    if(!p) continue;
    const {data, error} = await sb.storage.from('shift-photos').createSignedUrl(p, 300);
    if(error || !data){ syncErr(error); toast('Could not open the photo'); continue; }
    window.open(data.signedUrl, '_blank');
  }
}
/* v6.35: admin-side clock-in detail line — van, walk-through result, mileage, photo links — for a driver's shift */
function clockInDetail(x){
  const bits = [];
  if(x.vanImei) bits.push('Van: ' + esc(vanLabelByImei(x.vanImei)));
  if(x.walkOk===true) bits.push('<span style="color:var(--green)">Walk-through: all good</span>');
  else if(x.walkOk===false) bits.push('<span style="color:#9a6a00;font-weight:700">Walk-through: DAMAGE reported</span>');
  if(x.tireOk===false) bits.push('<span style="color:#9a6a00;font-weight:700">Tires: LOW' + (x.tireSpots?' — '+esc(x.tireSpots):'') + (x.tireNote?' ('+esc(x.tireNote)+')':'') + '</span>');
  else if(x.tireOk===true) bits.push('Tires: good');
  if(x.oilNeeded===true) bits.push('<span style="color:#9a6a00;font-weight:700">Oil change: needed' + (x.oilNote?' — '+esc(x.oilNote):'') + '</span>');
  const mi = shiftMiles(x);
  if(mi!=null) bits.push('Miles: ' + x.startMiles.toLocaleString() + ' → ' + x.endMiles.toLocaleString() + ' (' + Math.round(mi).toLocaleString() + ' mi)');
  else if(x.startMiles!=null) bits.push('Start miles: ' + x.startMiles.toLocaleString() + ' (shift open)');
  let photos = '';
  if(x.wcPhoto || x.damagePhoto) photos = ` <a href="#" onclick="event.preventDefault();event.stopPropagation();viewShiftPhotos(${x.id})" style="color:var(--blue);font-weight:700">📷 photos${x.damagePhoto?' (incl. damage)':''}</a>`;
  if(!bits.length && !photos) return '';
  return `<div class="hint" style="margin:-4px 0 12px;line-height:1.7">${bits.join(' · ')}${photos}</div>`;
}
function shiftsOn(driverId, dateStr){ return shifts.filter(x=>x.driverId===driverId && fmtDate(new Date(x.in))===dateStr).sort((a,b)=>a.in-b.in); }
function hoursBetween(driverId, s, e){
  return shifts.filter(x=>x.driverId===driverId && fmtDate(new Date(x.in))>=s && fmtDate(new Date(x.in))<=e)
    .reduce((a,x)=>a+shiftHrs(x), 0);
}
function weekRangeOf(d){ const st=new Date(d); st.setDate(st.getDate()-st.getDay()); const en=new Date(st); en.setDate(en.getDate()+6); return [fmtDate(st), fmtDate(en)]; }
function openShiftOf(driverId){ return shifts.find(x=>x.driverId===driverId && !x.out); }
/* ---- v6.26 batch: clock-in checklist (van confirm, walk-through + damage photo, REQUIRED wheelchair photo, start mileage) ---- */
let ciState = null; /* {van, walkOk, damageB64, wcB64, miles} */
function clockIn(){
  if(openShiftOf(currentUser.id)){ toast('You are already on the clock'); render(); return; }
  const myVan = vehicles.find(v=>v.active!==false && v.driverId===currentUser.id);
  ciState = { van: myVan ? myVan.imei : (vehicles.find(v=>v.active!==false)||{}).imei || '', walk:null, damageB64:null, wcB64:null, miles:'', tire:null, tireSpots:[], tireNote:'', oil:null, oilNote:'' }; /* v6.31 walk unset; v6.36 tire+oil unset */
  modal = {type:'clockInSheet'}; render();
}
function clockInHTML(){
  const s = ciState || {};
  const vanOpts = vehicles.filter(v=>v.active!==false).map(v=>`<option value="${v.imei}" ${s.van===v.imei?'selected':''}>${esc(vanLabel(v))}</option>`).join('');
  return `
    <div class="fgroup"><label>Driving today</label><select id="ci-van" onchange="ciState.van=this.value">${vanOpts}</select></div>
    <div class="fgroup" style="border:1px solid var(--line);border-radius:10px;padding:10px 12px">
      <label style="font-weight:700;display:block;margin-bottom:6px">Van walk-through</label>
      <div class="hint" style="margin-bottom:8px">Walk around the van, then tell us what you found.</div>
      <div style="display:flex;gap:8px">
        <button type="button" class="btn-mini ${s.walk==='ok'?'':'ghost'}" style="flex:1;${s.walk==='ok'?'background:var(--green);color:#fff;border-color:var(--green)':''}" onclick="ciState.walk='ok';ciState.damageB64=null;render()">✓ All good</button>
        <button type="button" class="btn-mini ${s.walk==='damage'?'':'ghost'}" style="flex:1;${s.walk==='damage'?'background:var(--amber);color:#fff;border-color:var(--amber)':''}" onclick="ciState.walk='damage';render()">⚠ Found damage</button>
      </div>
      ${s.walk==='damage' ? `<div style="margin-top:8px">
        <div class="hint" style="margin-bottom:6px">Take a photo so the office knows it was there before your shift.</div>
        <button type="button" class="btn-mini ${s.damageB64?'ghost':''}" onclick="ciPhoto('damage')">${s.damageB64 ? '✓ Damage photo taken — retake' : '📷 Take live damage photo'}</button>
      </div>`:''}
    </div>
    <div class="fgroup" style="border:1px solid var(--line);border-radius:10px;padding:10px 12px">
      <label style="font-weight:700;display:block;margin-bottom:2px">Wheelchair space clean</label>
      <div class="hint" style="margin-bottom:6px">Photo required every shift.</div>
      <button type="button" class="btn-mini ${s.wcB64?'ghost':''}" onclick="ciPhoto('wc')">${s.wcB64 ? '✓ Photo taken — retake' : '📷 Take live photo'}</button>
    </div>
    <div class="fgroup"><label>Start mileage (odometer)</label><input id="ci-miles" type="number" inputmode="numeric" value="${esc(s.miles)}" oninput="ciState.miles=this.value" placeholder="e.g. 87412"></div>
    <div class="fgroup" style="border:1px solid var(--line);border-radius:10px;padding:10px 12px">
      <label style="font-weight:700;display:block;margin-bottom:6px">Tire pressure</label>
      <div style="display:flex;gap:8px">
        <button type="button" class="btn-mini ${s.tire==='good'?'':'ghost'}" style="flex:1;${s.tire==='good'?'background:var(--green);color:#fff;border-color:var(--green)':''}" onclick="ciState.tire='good';ciState.tireSpots=[];ciState.tireNote='';render()">Good</button>
        <button type="button" class="btn-mini ${s.tire==='low'?'':'ghost'}" style="flex:1;${s.tire==='low'?'background:var(--amber);color:#fff;border-color:var(--amber)':''}" onclick="ciState.tire='low';render()">Low</button>
      </div>
      ${s.tire==='low' ? `<div style="margin-top:8px">
        <div class="hint" style="margin-bottom:6px">Which tire? Tap all that apply.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          ${['Front L','Front R','Rear L','Rear R'].map(t=>`<button type="button" class="btn-mini ${(s.tireSpots||[]).includes(t)?'':'ghost'}" style="${(s.tireSpots||[]).includes(t)?'background:var(--amber);color:#fff;border-color:var(--amber)':''}" onclick="ciTireToggle('${t}')">${t}</button>`).join('')}
        </div>
        <button type="button" class="btn-mini ${(s.tireSpots||[]).includes('Not sure')?'':'ghost'}" style="width:100%;margin-top:6px;${(s.tireSpots||[]).includes('Not sure')?'background:var(--amber);color:#fff;border-color:var(--amber)':''}" onclick="ciTireToggle('Not sure')">Not sure / all of them</button>
        <input id="ci-tirenote" value="${esc(s.tireNote||'')}" oninput="ciState.tireNote=this.value" placeholder="Note (optional)" style="margin-top:6px">
      </div>`:''}
    </div>
    <div class="fgroup" style="border:1px solid var(--line);border-radius:10px;padding:10px 12px">
      <label style="font-weight:700;display:block;margin-bottom:6px">Oil change needed?</label>
      <div style="display:flex;gap:8px">
        <button type="button" class="btn-mini ${s.oil==='no'?'':'ghost'}" style="flex:1;${s.oil==='no'?'background:var(--green);color:#fff;border-color:var(--green)':''}" onclick="ciState.oil='no';ciState.oilNote='';render()">No</button>
        <button type="button" class="btn-mini ${s.oil==='yes'?'':'ghost'}" style="flex:1;${s.oil==='yes'?'background:var(--amber);color:#fff;border-color:var(--amber)':''}" onclick="ciState.oil='yes';render()">Yes</button>
      </div>
      ${s.oil==='yes' ? `<input id="ci-oilnote" value="${esc(s.oilNote||'')}" oninput="ciState.oilNote=this.value" placeholder="Note (optional)" style="margin-top:8px">`:''}
    </div>
    <button class="btn-primary" onclick="doClockIn()">Clock in</button>
    <div class="hint" style="margin-top:8px">The wheelchair photo and mileage are needed to start. Photos and mileage go on today's shift record.</div>`;
}
function ciPhoto(kind){
  pickImage(d => { if(kind==='wc') ciState.wcB64 = d; else ciState.damageB64 = d; render(); }, 1024, true); /* v6.30: live camera only — no gallery */
}
function ciTireToggle(t){
  if(!ciState) return;
  ciState.tireSpots = ciState.tireSpots || [];
  if(t==='Not sure'){ ciState.tireSpots = ciState.tireSpots.includes('Not sure') ? [] : ['Not sure']; } /* Not sure is exclusive */
  else { ciState.tireSpots = ciState.tireSpots.filter(x=>x!=='Not sure'); /* a specific tire clears Not sure */
    ciState.tireSpots = ciState.tireSpots.includes(t) ? ciState.tireSpots.filter(x=>x!==t) : ciState.tireSpots.concat(t); }
  render();
}
async function uploadShiftPhoto(b64, name){
  const bin = atob(b64.split(',')[1]);
  const arr = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
  const path = currentUser.id + '/' + fmtDate(new Date()) + '-' + name + '-' + Date.now() + '.jpg';
  const {error} = await sb.storage.from('shift-photos').upload(path, arr.buffer, {contentType:'image/jpeg'});
  if(error){ syncErr(error); return null; }
  return path;
}
async function doClockIn(){
  const s = ciState || {};
  if(!s.walk){ toast('Do the van walk-through — tap All good or Found damage'); return; } /* v6.31: must actively choose */
  if(s.walk==='damage' && !s.damageB64){ toast('Take a photo of the damage first'); return; }
  if(!s.wcB64){ toast('Take the wheelchair-space photo first'); return; }
  if(!s.miles || +s.miles <= 0){ toast('Enter the start mileage'); return; }
  if(!s.tire){ toast('Check the tire pressure — Good or Low'); return; } /* v6.36 */
  if(s.tire==='low' && !(s.tireSpots && s.tireSpots.length)){ toast('Tap which tire is low (or Not sure)'); return; }
  if(!s.oil){ toast('Answer oil change — No or Yes'); return; }
  if(busyGate()){ toast('Working…'); return; }
  toast('Uploading…');
  const wcPath = await uploadShiftPhoto(s.wcB64, 'wheelchair');
  if(!wcPath){ toast('Photo upload failed — check your signal and try again'); return; }
  let dmgPath = null;
  if(s.walk==='damage' && s.damageB64){ dmgPath = await uploadShiftPhoto(s.damageB64, 'damage'); }
  if(openShiftOf(currentUser.id)){ toast('You are already on the clock'); ciState=null; modal=null; render(); return; } /* double-tap during a slow upload must not create two shifts */
  const tireSpots = (s.tireSpots||[]).join(', ');
  const {error} = await sb.from('shifts').insert({driver_id:currentUser.id, clock_in:new Date().toISOString(),
    van_imei:s.van||null, walkthrough_ok:(s.walk==='ok'), start_miles:+s.miles, wheelchair_photo:wcPath, damage_photo:dmgPath,
    tire_ok:(s.tire==='good'), tire_spots:tireSpots, tire_note:s.tireNote||'', oil_needed:(s.oil==='yes'), oil_note:s.oilNote||''});
  if(error){ syncErr(error); toast('DID NOT SAVE — weak signal? Tap Clock in again.'); return; }
  const van = esc(vanLabelByImei(s.van));
  if(s.walk==='damage'){ adminAlert(`⚠ ${currentUser.name} found van damage at clock-in (${van})${dmgPath?' — photo attached to the shift':' — NO photo attached'}`); }
  if(s.tire==='low'){ adminAlert(`🛞 ${currentUser.name} flagged LOW tire — ${van}${tireSpots?' ('+esc(tireSpots)+')':''}${s.tireNote?' · "'+esc(s.tireNote)+'"':''}`); }
  if(s.oil==='yes'){ adminAlert(`🛢️ ${currentUser.name} flagged oil change needed — ${van}${s.oilNote?' · "'+esc(s.oilNote)+'"':''}`); }
  /* v6.32: reflect the driver's van choice on the Fleet map — server-verified (drivers can't write vehicles directly).
     Best-effort: a sync hiccup never blocks the clock-in that already saved above. */
  if(s.van) claimVan(s.van);
  ciState = null;
  await refetch('shifts'); modal=null; render(); toast('Clocked in — have a good shift');
}
function vanLabelByImei(imei){ const v = vehicles.find(x=>x.imei===imei); return v ? vanLabel(v) : 'van'; }
async function claimVan(imei){
  try{
    const {data:{session}} = await sb.auth.getSession();
    if(!session) return;
    const res = await fetch(SB_URL + '/functions/v1/van-claim', {
      method:'POST',
      headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + session.access_token},
      body: JSON.stringify({imei})
    });
    const out = await res.json().catch(()=>({}));
    if(out && out.ok){ await refetch('vehicles'); } /* Fleet map updates for everyone via realtime too */
  }catch(e){ console.error(e); } /* silent — the shift already saved; Fleet sync is a bonus */
}
/* ---- v6.26 batch: clock-out task list (open trips, running timers, end mileage) ---- */
function clockOut(id){
  modal = {type:'clockOutSheet', shiftId:id, endMiles:''}; render();
}
function clockOutOpenItems(){
  const myLeads = leads.filter(l=>l.status==='Confirmed' && l.date===fmtDate(today) && (l.driverId===currentUser.id || (l.tripType==='Round Trip' && retDriverOf(l)===currentUser.id) || (hasStop(l) && stopDriverOf(l)===currentUser.id)));
  const items = [];
  driverLegsFor(currentUser.id, myLeads).forEach(x=>{
    if(!legDone(x)) items.push({kind:'leg', l:x.l, leg:x.leg, label:`${x.l.first} ${x.l.last} — ${x.leg==='ret'?'return':x.leg==='mid'?'stop 2':'pickup'} trip`, sub:'Not marked completed'});
  });
  myLeads.forEach(l=>{
    if(l.arrivedAt && !l.departedAt) items.push({kind:'t1', l, label:`${l.first} ${l.last} — wait timer`, sub:'Still running · started '+fmtClock(l.arrivedAt)});
    if(l.arrived2At && !l.departed2At) items.push({kind:'t2', l, label:`${l.first} ${l.last} — stop 2 wait timer`, sub:'Still running · started '+fmtClock(l.arrived2At)});
  });
  return items;
}
function clockOutHTML(){
  const items = clockOutOpenItems();
  return `
    ${items.length ? `<div class="hint" style="margin-bottom:10px">${items.length} open item${items.length===1?'':'s'} — finish them here or send them to the office.</div>` : '<div class="hint" style="margin-bottom:10px">All trips are wrapped up.</div>'}
    ${items.map(it=>`
      <div style="display:flex;align-items:center;gap:10px;border:1px solid ${it.kind==='leg'?'#e8d5a8':'#e8d5a8'};background:#fdf6e8;border-radius:10px;padding:10px 12px;margin-bottom:8px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px">${esc(it.label)}</div>
          <div class="hint">${esc(it.sub)}</div>
        </div>
        ${it.kind==='leg' ? `<button class="btn-mini" onclick="setLegStatus(${it.l.id},'${it.leg}','yes')">Mark done</button>`
          : it.kind==='t1' ? `<button class="btn-mini" onclick="markDeparted(${it.l.id})">Stop</button>`
          : `<button class="btn-mini" onclick="markDeparted2(${it.l.id})">Stop</button>`}
      </div>`).join('')}
    <div class="fgroup" style="margin-top:6px"><label>End mileage (odometer)</label><input id="co-miles" type="number" inputmode="numeric" value="${esc(modal.endMiles||'')}" oninput="modal.endMiles=this.value" placeholder="e.g. 87506"></div>
    <button class="btn-primary" onclick="doClockOut(false)">Clock out</button>
    ${items.length ? `<button class="btn-mini ghost" style="width:100%;margin-top:8px" onclick="doClockOut(true)">Clock out with open items — notify the office</button>` : ''}`;
}
async function doClockOut(force){
  const items = clockOutOpenItems();
  if(items.length && !force){ toast('Finish the open items, or use the bottom button to notify the office'); render(); return; }
  const em = modal && modal.endMiles ? +modal.endMiles : null;
  if(!em || em <= 0){ toast('Enter the end mileage'); return; }
  const sh = shifts.find(x=>x.id===modal.shiftId);
  if(sh && sh.startMiles!=null && em < sh.startMiles){ toast('End mileage is lower than this morning\'s start ('+sh.startMiles+') — check the number'); return; }
  if(busyGate()){ toast('Working…'); return; }
  const {error} = await sb.from('shifts').update({clock_out:new Date().toISOString(), end_miles:em}).eq('id', modal.shiftId);
  if(error){ syncErr(error); toast('DID NOT SAVE — weak signal? Tap again.'); return; }
  if(items.length && force){ adminAlert(`⚠ ${currentUser.name} clocked out with open items: ${items.map(i=>i.label).join('; ')}`); }
  await refetch('shifts'); modal=null; render(); toast('Clocked out');
}
async function checkLongShift(){
  const s = openShiftOf(currentUser.id);
  if(s && shiftHrs(s) > 12 && !s.flagged){
    s.flagged = true;
    sb.from('shifts').update({flagged:true}).eq('id', s.id).then(r=>syncErr(r.error));
    adminAlert(`⚠ ${currentUser.name} has been clocked in over 12 hours — shift flagged for review`);
    toast('You have been clocked in over 12 hours — forgot to clock out?');
  }
}
function toHM(ts){ const d=new Date(ts); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
function logAudit(action, target, before, after){
  sb.from('audit_log').insert({actor: currentUser?currentUser.id:null, action,
    target:String(target||''), before_val:String(before||''), after_val:String(after||'')})
    .then(r=>{ if(!r.error) refetch('audit_log'); else console.error(r.error); });
}
function shiftDesc(x){ return new Date(x.in).toLocaleDateString('en-US',{month:'short',day:'numeric'})+' '+fmtClock(x.in)+' – '+(x.out?fmtClock(x.out):'open'); }
async function adminFixShift(id, which, hm){
  const x = shifts.find(v=>v.id===id); if(!x || !hm) return;
  const base = new Date(which==='in' ? x.in : (x.out || x.in));
  const [h,m] = hm.split(':').map(Number);
  base.setHours(h, m, 0, 0);
  if(which==='out' && base.getTime() <= x.in) base.setTime(base.getTime() + 24*3600e3); /* overnight shift */
  const patch = which==='in' ? {clock_in:base.toISOString()} : {clock_out:base.toISOString(), flagged:false};
  const beforeTxt = shiftDesc(x);
  const {error} = await sb.from('shifts').update(patch).eq('id', id);
  if(error){ syncErr(error); return; }
  await refetch('shifts');
  const nx = shifts.find(v=>v.id===id);
  logAudit('shift_correct', 'driver:'+x.driverId+' shift:'+id, beforeTxt, nx?shiftDesc(nx):'');
  if(modal && modal.type==='userForm'){ keepDraft(); render(); }
  toast('Shift corrected');
}
async function adminAddShift(driverId){
  const d = $('as-date').value, ti = $('as-in').value, to = $('as-out').value;
  if(!d || !ti || !to){ toast('Fill in date, in and out times'); return; }
  if(busyGate()){ toast('Saving…'); return; }
  if(modal && modal.type==='userForm') keepDraft();
  const cin = new Date(d + 'T' + ti + ':00');
  let cout = new Date(d + 'T' + to + ':00');
  if(cout <= cin) cout = new Date(cout.getTime() + 24*3600e3); /* overnight shift rolls to next day */
  if((cout - cin) / 3600000 > 20){ if(!confirm('That shift is over 20 hours long — add it anyway?')) return; }
  const {error} = await sb.from('shifts').insert({driver_id:driverId, clock_in:cin.toISOString(), clock_out:cout.toISOString()});
  if(error){ syncErr(error); return; }
  await refetch('shifts');
  logAudit('shift_add', 'driver:'+driverId, '', d+' '+ti+' – '+to+' ('+((cout-cin)/3600000).toFixed(2)+' h)');
  render();
  toast('Shift added — ' + ((cout - cin)/3600000).toFixed(2) + ' hours');
}
async function adminToggleEarly(id, val){
  const x = shifts.find(v=>v.id===id); if(!x) return;
  if(modal && modal.type==='userForm') keepDraft();
  const {error} = await sb.from('shifts').update({early_ok:val}).eq('id', id);
  if(error){ syncErr(error); return; }
  await refetch('shifts');
  logAudit(val?'shift_early_approve':'shift_early_revoke', 'driver:'+x.driverId+' shift:'+id, shiftDesc(x),
    val?'early start approved — paid from actual clock-in':'approval removed — paid from report time');
  render(); toast(val ? 'Early start approved — paid from actual clock-in' : 'Early start approval removed');
}
async function adminDelShift(id){
  if(!confirm('Delete this shift entry?')) return;
  if(modal && modal.type==='userForm') keepDraft();
  const x = shifts.find(v=>v.id===id);
  const {error} = await sb.from('shifts').delete().eq('id', id);
  if(error){ syncErr(error); return; }
  await refetch('shifts');
  if(x) logAudit('shift_delete', 'driver:'+x.driverId+' shift:'+id, shiftDesc(x), '');
  render(); toast('Shift deleted');
}

/* ================= HELPERS ================= */
const $ = id => document.getElementById(id);
const esc = s => (s??'').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '$' + (+n).toFixed(2);
function fmtTime(t){ if(!t) return '—'; let [h,m]=t.split(':').map(Number); const ap=h>=12?'PM':'AM'; h=h%12||12; return h+':'+String(m).padStart(2,'0')+' '+ap; }
function fmtNice(ds){ if(!ds) return '—'; const d=new Date(ds+'T00:00:00'); return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}); }
function fmtDur(min){ if(min==null) return '—'; const h=Math.floor(min/60), m=min%60; return (h?h+' hr ':'')+m+' min'; }
function fmtClock(ts){ return ts ? new Date(ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '—'; }
function driverName(id){ const u=users.find(u=>u.id===id); return u?u.name:'Unassigned'; }
/* v6.43: admins are always assignable as trip drivers — no driver profile needed, never paid for trips.
   Drivers listed first, admins after with an "(admin)" tag. */
function assignableUsers(){
  return users.filter(u=>u.active!==false && (u.role==='driver'||u.role==='admin'))
    .sort((a,b)=>((a.role==='admin'?1:0)-(b.role==='admin'?1:0)) || a.name.localeCompare(b.name));
}
function assignLabel(u){ return u.name + (u.role==='admin' ? ' (admin)' : ''); }
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }
function statusClass(s){ return s.toLowerCase().replace(' ',''); }
function isDone(l){ return l.outDone && (l.tripType!=='Round Trip' || (l.retDone && (!hasStop(l) || l.stopDone))); }
function mapsLink(addr){ return 'https://maps.apple.com/?daddr='+encodeURIComponent(addr); }
function copyText(t){
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
    .then(()=>toast('Address copied'))
    .catch(()=>toast('Could not copy on this device'));
}
function unreadFor(uid){ return notifications.filter(n=>n.driverId===uid && !n.read); }
function unreadAdmin(){ return notifications.filter(n=>n.adminAlert && !n.read); }
function markAdminNotifsRead(){
  notifications.forEach(n=>{ if(n.adminAlert) n.read=true; });
  sb.from('notifications').update({read:true}).eq('admin_alert', true).then(r=>syncErr(r.error));
  render();
}
function runningLongWaits(){
  return leads.filter(l=>l.arrivedAt && !l.departedAt && (Date.now()-l.arrivedAt) > 2*60*60*1000);
}
function matchName(first, last, q){ return (first+' '+last).toLowerCase().includes(q.toLowerCase().trim()); }
function renderKeepFocus(id){ render(); const el=$(id); if(el){ el.focus(); const v=el.value; el.setSelectionRange(v.length, v.length); } }
function searchBar(id, key, ph){
  return `<div class="searchbar">🔍<input id="${id}" placeholder="${ph}" autocomplete="off" value="${esc(search[key])}" oninput="search.${key}=this.value;renderKeepFocus('${id}')">${search[key]?`<button class="sx" onclick="search.${key}='';render()">✕</button>`:''}</div>`;
}

/* ================= IMAGES ================= */
function pickImage(cb, size, live){
  const inp = document.createElement('input');
  inp.type='file'; inp.accept='image/*';
  /* v6.30: live=true forces the phone's rear camera (no gallery) for accountability shots like the wheelchair space.
     `capture` is honored on phones; desktop ignores it and opens a file picker (drivers are on phones). */
  if(live){ inp.setAttribute('capture','environment'); }
  inp.onchange = () => {
    const f = inp.files[0]; if(!f) return;
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, size / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width*s); c.height = Math.round(img.height*s);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); /* jpeg has no transparency */
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      cb(c.toDataURL('image/jpeg', 0.85)); /* ~10x smaller than PNG for photos */
    };
    img.onerror = () => { URL.revokeObjectURL(img.src); toast('Could not read that image — try a different file'); };
    img.src = URL.createObjectURL(f);
  };
  inp.click();
}
function changeLogo(){ pickImage(d => { appLogo = d; pushSetting('logo', d); render(); toast('Logo updated'); }, 512); }
function resetLogo(){ appLogo = null; pushSetting('logo', null); render(); toast('Logo reset to default'); }
function avatarHTML(u, big){
  const cls = 'avatar' + (u.role==='admin'?' gold':'') + (big?' big':'');
  const inner = u.photo ? `<img src="${esc(u.photo)}">` : esc(u.name.split(' ').map(w=>w[0]).join('').slice(0,2));
  return `<div class="${cls}">${inner}</div>`;
}
function changeMyPhoto(){
  pickImage(d => { currentUser.photo = d; pushUser(currentUser); render(); toast('Profile picture updated'); }, 256);
}

const icons = {
  leads:'<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',
  appts:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  users:'<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  gear:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  road:'<svg viewBox="0 0 24 24"><path d="M4 21 9 3"/><path d="m20 21-5-18"/><path d="M12 7v2"/><path d="M12 13v2"/><path d="M12 19v2"/></svg>',
  clients:'<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><circle cx="8.5" cy="10.5" r="2.5"/><path d="M4.5 18c.5-2 2-3 4-3s3.5 1 4 3"/><line x1="15" y1="9" x2="20" y2="9"/><line x1="15" y1="13" x2="20" y2="13"/></svg>',
  clock:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  sales:'<svg viewBox="0 0 24 24"><line x1="3" y1="21" x2="21" y2="21"/><rect x="5" y="12" width="3.5" height="9"/><rect x="10.5" y="6" width="3.5" height="15"/><rect x="16" y="15" width="3.5" height="6"/></svg>',
  pay:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 6v12"/><path d="M15 9.2c-.5-1-1.6-1.7-3-1.7-1.7 0-3 1-3 2.2s1.1 1.8 3 2.2 3 1 3 2.3-1.3 2.3-3 2.3c-1.4 0-2.5-.7-3-1.7"/></svg>',
  fleet:'<svg viewBox="0 0 24 24"><path d="M3 17V7a2 2 0 0 1 2-2h8l6 5v7"/><path d="M13 5v5h6"/><circle cx="7.5" cy="17.5" r="2"/><circle cx="16.5" cy="17.5" r="2"/><path d="M9.5 17.5h5"/></svg>',
};

