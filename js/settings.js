/* ================= SETTINGS ================= */
function settingsView(){
  const admin = currentUser.role==='admin';
  return `
    <div class="section-head"><h2>Settings</h2></div>
    <div class="card" style="cursor:default">
      <div class="user-card">
        ${avatarHTML(currentUser, true)}
        <div style="flex:1">
          <div class="name">${esc(currentUser.name)}</div>
          <div class="meta"><span>@${esc(currentUser.username)}</span><span class="badge ${admin?'gold':'completed'}">${currentUser.role}</span></div>
          <button class="btn-mini" style="margin-top:8px" onclick="changeMyPhoto()">Change Profile Picture</button>
        </div>
      </div>
    </div>
    ${admin ? `
    <div class="card" style="cursor:default;text-align:center;padding:18px">
      <div style="font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Current Company Logo</div>
      <div style="height:80px;display:flex;align-items:center;justify-content:center">
        ${appLogo ? `<img src="${esc(appLogo)}" style="max-height:80px;max-width:100%;object-fit:contain">` : `<div style="width:80px;height:80px">${EMBLEM}</div>`}
      </div>
      <div class="hint" style="margin-top:8px">Shown on the admin app &amp; login screen. The driver app keeps the standard RMT branding.</div>
    </div>
    <div class="set-list">
      <button class="set-item" onclick="adminTab='users';render()"><span>Users &amp; Drivers</span><span class="arr">›</span></button>
      <button class="set-item" onclick="changeLogo()"><span>Change Company Logo</span><span class="arr">›</span></button>
      ${appLogo?`<button class="set-item" onclick="resetLogo()"><span>Reset Logo to Default</span><span class="arr">›</span></button>`:''}
      <button class="set-item" onclick="modal={type:'pricing'};render()"><span>Pricing Rules</span><span class="arr">›</span></button>
      <button class="set-item" onclick="modal={type:'ops'};render()"><span>Trip Timing &amp; Maps</span><span class="arr">›</span></button>
      <button class="set-item" onclick="modal={type:'square'};render()"><span>Payments (Square)</span><span class="arr">›</span></button>
      <button class="set-item" onclick="modal={type:'sms'};render()"><span>Text Messages (SMS) — <b style="color:${SMSCFG.enabled?'var(--green)':'var(--muted)'}">${SMSCFG.enabled?'ON':'off'}</b></span><span class="arr">›</span></button>
      <button class="set-item" onclick="exportAll()"><span>Export All Data (Backup)</span><span class="arr">›</span></button>
      <button class="set-item" onclick="openHealth()"><span>App Health (error log)</span><span class="arr">›</span></button>
      <button class="set-item" onclick="openDevices()"><span>Signed-In Devices</span><span class="arr">›</span></button>
      <button class="set-item" onclick="modal={type:'fleetMiles'};render()"><span>Fleet Mileage</span><span class="arr">›</span></button>
    </div>
    <div class="hint" style="margin:-8px 4px 16px">The database also snapshots itself automatically every night (kept 14 days). Export weekly for an extra copy on your computer.</div>`:''}
    <div class="set-list">
      <button class="set-item" onclick="openDocuments()"><span>Documents ${(currentUser.role==='admin')?'':(currentUser.licPendAt?'<span class="badge pending">pending approval</span>':(!currentUser.licFront||!currentUser.licBack?'<span class="badge canceled">license needed</span>':''))}</span><span class="arr">›</span></button>
      ${currentUser.role==='admin' ? `<button class="set-item" onclick="modal={type:'placenotes'};render()"><span>Place Notes ${placeNotes.length?`(${placeNotes.length})`:''}</span><span class="arr">›</span></button>` : ''}
      ${currentUser.role==='admin' ? `<button class="set-item" onclick="modal={type:'sigdocs'};render()"><span>Signature Documents (waiver &amp; drop-off)</span><span class="arr">›</span></button>` : ''}
      <button class="set-item" onclick="modal={type:'passwd'};render()"><span>Change Password</span><span class="arr">›</span></button>
      <button class="set-item" onclick="pushEnabled?disablePush():enablePush()"><span>Push Notifications — <b style="color:${pushEnabled?'var(--green)':'var(--muted)'}">${pushEnabled?'ON for this device':'off'}</b></span><span class="arr">›</span></button>
      <button class="set-item" onclick="toast('Coming soon')"><span>Help &amp; Support</span><span class="arr">›</span></button>
    </div>
    <div class="set-list">
      <button class="set-item" style="color:var(--red);font-weight:700" onclick="logout()"><span>Log Out</span></button>
    </div>
    <div class="empty" style="padding:14px;font-size:11.5px" onclick="dbgTap()">Royalty Medical Transportation · ${BUILD}<br>Connected to cloud database — changes sync live to every device.</div>`;
}
/* ================= v6.37: DOCUMENTS — driver license (approval-gated) + insurance ================= */
let docs = [];
async function openDocuments(){
  modal = {type:'documents'}; render();
  const {data, error} = await sb.from('documents').select('*').order('created_at',{ascending:false});
  if(!error) docs = data || [];
  if(modal && modal.type==='documents') render();
}
async function uploadDocFile(dataUrl, name){
  const bin = atob(dataUrl.split(',')[1]);
  const arr = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
  const path = currentUser.id + '/' + name + '-' + Date.now() + '.jpg';
  const {error} = await sb.storage.from('documents').upload(path, arr.buffer, {contentType:'image/jpeg'});
  if(error){ syncErr(error); return null; }
  return path;
}
async function viewDoc(path){
  if(!path) return;
  const {data, error} = await sb.storage.from('documents').createSignedUrl(path, 300);
  if(error || !data){ syncErr(error); toast('Could not open the document'); return; }
  window.open(data.signedUrl, '_blank');
}
function licenseUpload(side){
  pickImage(async d => {
    toast('Uploading…');
    const path = await uploadDocFile(d, 'license-' + side);
    if(!path){ toast('Upload failed — check your signal'); return; }
    const me = currentUser;
    const hasBoth = me.licFront && me.licBack;
    if(!hasBoth){ /* first-time upload goes live directly, no approval */
      const patch = {}; patch[side==='front'?'license_front':'license_back'] = path;
      const {error} = await sb.from('profiles').update(patch).eq('id', me.id);
      if(error){ syncErr(error); toast('Did not save — try again'); return; }
      if(side==='front') me.licFront = path; else me.licBack = path;
    } else { /* license on file → change needs admin approval → pending + bell */
      const patch = {license_pending_at:new Date().toISOString()};
      patch[side==='front'?'license_pending_front':'license_pending_back'] = path;
      const {error} = await sb.from('profiles').update(patch).eq('id', me.id);
      if(error){ syncErr(error); toast('Did not save — try again'); return; }
      if(side==='front') me.licPendFront = path; else me.licPendBack = path;
      me.licPendAt = patch.license_pending_at;
      adminAlert(`🪪 ${me.name} requested a driver-license update — approve it in their profile`);
    }
    render(); toast('Saved');
  }, 1400, false); /* camera OR library */
}
function documentsHTML(){
  const admin = currentUser.role==='admin';
  const me = currentUser;
  const insList = docs.length ? docs.map(d=>`
    <div style="display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px">
      <span style="font-size:20px">📄</span>
      <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700">${esc(d.label||'Insurance document')}</div>
        <div class="hint">Added ${d.created_at?fmtNice(fmtDate(new Date(d.created_at))):''}</div></div>
      <button class="btn-mini ghost" onclick="viewDoc('${esc(d.path)}')">View</button>
      ${admin?`<button class="btn-mini ghost" style="color:var(--red)" onclick="delInsurance(${d.id})">✕</button>`:''}
    </div>`).join('') : '<div class="hint">No insurance documents yet.</div>';
  const insuranceSection = `
    <div class="fsection">Vehicle Insurance</div>
    ${insList}
    ${admin?`<button class="btn-mini" style="margin-top:6px" onclick="addInsurance()">+ Add insurance document</button>`:'<div class="hint" style="margin-top:4px">Uploaded by the office. Tap View to open.</div>'}`;
  if(admin){
    return `<div class="hint" style="margin-bottom:12px">Driver licenses are reviewed in each driver's profile (Users &amp; Drivers → tap a driver). Insurance documents you add here are visible to every driver.</div>${insuranceSection}`;
  }
  const licSlot = (label, cur, pend) => `
    <div style="flex:1;border:1px ${cur?'solid':'dashed'} var(--line);border-radius:10px;padding:12px;text-align:center">
      <div style="font-size:12px;font-weight:700;margin-bottom:6px">${label}</div>
      ${cur?`<button class="btn-mini ghost" onclick="viewDoc('${esc(cur)}')">View</button>`:'<div class="hint">Not uploaded</div>'}
      ${pend?'<div class="hint" style="color:#9a6a00;margin-top:4px">new one pending</div>':''}
    </div>`;
  const canReplace = me.licFront && me.licBack;
  return `
    <div class="fsection">My Driver's License</div>
    ${me.licPendAt?'<div class="notifbar" style="background:#fdf6e8;border-color:#e8d5a8;margin-bottom:10px"><div class="nb-item">Your new license photos are waiting for office approval. Your current ones stay on file until then.</div></div>':''}
    <div style="display:flex;gap:8px;margin-bottom:8px">
      ${licSlot('Front', me.licFront, me.licPendFront)}
      ${licSlot('Back', me.licBack, me.licPendBack)}
    </div>
    <div style="display:flex;gap:8px;margin-bottom:6px">
      <button class="btn-mini" style="flex:1" onclick="licenseUpload('front')">${me.licFront&&canReplace?'Replace front':'Upload front'}</button>
      <button class="btn-mini" style="flex:1" onclick="licenseUpload('back')">${me.licBack&&canReplace?'Replace back':'Upload back'}</button>
    </div>
    <div class="hint" style="margin-bottom:6px">${canReplace?'Your license is on file. Uploading a new photo sends it to the office for approval — your current one stays until they approve.':'Upload the front and back of your license. Camera or photo library both work.'}</div>
    ${insuranceSection}`;
}
async function addInsurance(){
  const label = prompt('Name this document (e.g. Van U249 policy, or Company policy 2026):');
  if(label===null) return;
  pickImage(async d => {
    toast('Uploading…');
    const path = await uploadDocFile(d, 'insurance');
    if(!path){ toast('Upload failed — try again'); return; }
    const {error} = await sb.from('documents').insert({label:(label.trim()||'Insurance document'), path, uploaded_by:currentUser.id});
    if(error){ syncErr(error); toast('Did not save'); return; }
    await openDocuments(); toast('Insurance document added');
  }, 1600, false);
}
async function delInsurance(id){
  const ok = await confirmSheet({title:'Remove this document?', body:'<div style="font-size:13px">It will no longer be visible to drivers.</div>', yes:'Remove', no:'Cancel'});
  if(!ok) return;
  const doc = docs.find(d=>d.id===id);
  const {error} = await sb.from('documents').delete().eq('id', id);
  if(error){ syncErr(error); toast('Could not remove'); return; }
  if(doc && doc.path){ await sb.storage.from('documents').remove([doc.path]); }
  await openDocuments(); toast('Removed');
}
async function approveLicense(driverId){
  const u = users.find(x=>x.id===driverId); if(!u || !u.licPendAt) return;
  const patch = {license_pending_at:null, license_pending_front:null, license_pending_back:null};
  if(u.licPendFront) patch.license_front = u.licPendFront;
  if(u.licPendBack) patch.license_back = u.licPendBack;
  const {error} = await sb.from('profiles').update(patch).eq('id', driverId);
  if(error){ syncErr(error); toast('Could not approve'); return; }
  if(u.licPendFront) u.licFront = u.licPendFront;
  if(u.licPendBack) u.licBack = u.licPendBack;
  u.licPendFront=null; u.licPendBack=null; u.licPendAt=null;
  render(); toast('License update approved');
}
async function rejectLicense(driverId){
  const u = users.find(x=>x.id===driverId); if(!u) return;
  const {error} = await sb.from('profiles').update({license_pending_at:null, license_pending_front:null, license_pending_back:null}).eq('id', driverId);
  if(error){ syncErr(error); toast('Could not reject'); return; }
  u.licPendFront=null; u.licPendBack=null; u.licPendAt=null;
  render(); toast('Pending license discarded');
}
function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }
async function exportAll(){
  toast('Preparing backup…');
  try{
    await ensureAllLeads(); /* the export must cover ALL history, not just the working window */
    if(!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const wb = XLSX.utils.book_new();
    const add = (name, rows) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{note:'(empty)'}]), name);
    add('Leads & Appointments', leads.map(l=>({ID:l.id, Status:l.status, First:l.first, Last:l.last, Date:l.date,
      Pickup_Time:l.pickupTime, Appt_Time:l.apptTime, Return_Time:l.returnTime, Trip_Type:l.tripType, Service:l.tripKind,
      Pickup:l.pickup, Dropoff:l.dropoff, Second_Dropoff:l.stopAddr||'', Return_Dropoff:l.returnDropoff||'', Phone1:phoneFmt(l.phone1), Phone2:phoneFmt(l.phone2), Email:l.email, Contact:l.contactName,
      DOB:l.dob, Weight:l.weight, Office_Miles:l.officeMiles, Trip_Miles:l.tripMiles, Trip_Charge:l.tripCharge,
      Waiting:l.waiting, Actual_Wait_Min:l.actualWaitMin, Actual_Wait_Min_Stop2:l.actualWaitMin2, Wait_Charge:waitChargeOf(l), Total_Charge:totalCharge(l),
      Driver:driverName(l.driverId), Stop2_Driver:l.stopDriverId?driverName(l.stopDriverId):'', Return_Driver:l.returnDriverId?driverName(l.returnDriverId):'',
      Canceled_On:l.cancelDate, Pickup_Done:l.outDone?'Yes':'No', Stop2_Done:hasStop(l)?(l.stopDone?'Yes':'No'):'', Return_Done:l.retDone?'Yes':'No',
      Sig_Pickup:l.sigOutAt?'Yes':'', Sig_Stop2:l.sigMidAt?'Yes':'', Sig_Return:l.sigRetAt?'Yes':'',
      Driver_Notes:l.driverNotes, Created:l.createdAt})));
    add('Clients', clients.map(c=>({ID:c.id, First:c.first, Last:c.last, DOB:c.dob, Weight:c.weight,
      Home_Address:c.homeAddress, Service:c.tripKind, Phone1:phoneFmt(c.phone1), Phone2:phoneFmt(c.phone2), Email:c.email,
      Contact:c.contactName, Notes:c.notes||'', Square_Cards:(c.sqCards||[]).map(x=>(x.brand||'Card')+' ····'+(x.last4||'')).join('; ')})));
    add('Users', users.map(u=>({Name:u.name, Username:u.username, Role:u.role, Phone:phoneFmt(u.phone), Active:u.active!==false?'Yes':'No'})));
    add('Shifts', shifts.map(x=>({Driver:driverName(x.driverId), Clock_In:new Date(x.in).toLocaleString(), Clock_Out:x.out?new Date(x.out).toLocaleString():'(open)', Hours:shiftHrs(x).toFixed(2), Paid_Hours:paidHrs(x).toFixed(2), Early_OK:x.earlyOk?'Yes':'No', Flagged:x.flagged?'Yes':'No'})));
    add('Report Times', reportTimes.filter(r=>r.rt).map(r=>({Driver:driverName(r.driverId), Day:r.day, Report_Time:r.rt, Manual:r.manual?'Yes':'No'})));
    add('Pricing', [PRICES]);
    XLSX.writeFile(wb, 'RMT-Backup-'+fmtDate(new Date())+'.xlsx');
    toast('✓ Backup downloaded — keep it somewhere safe');
  }catch(e){ console.error(e); toast('Backup failed — check your connection'); }
}
function pricingHTML(){
  const p = PRICES;
  const f = (id,label,val) => `<div class="fgroup"><label>${label}</label><input id="${id}" type="number" step="0.01" value="${val}"></div>`;
  const fs = (id,label,val,ph) => `<div class="fgroup"><label>${label}</label><input id="${id}" type="number" step="0.01" value="${val!=null?val:''}" placeholder="${ph} (standard)"></div>`;
  return `
    <div class="hint" style="margin-bottom:14px">Office: ${OFFICE}</div>
    ${f('p-oneway','Loading Fee — One Way ($)',p.oneWayLoad)}
    ${f('p-round','Loading Fee — Round Trip ($)',p.roundLoad)}
    ${f('p-office','Office → Pickup ($ per mile)',p.officePerMile)}
    ${f('p-trip','Pickup → Drop-off ($ per mile, ×2 for round trip)',p.tripPerMile)}
    ${f('p-wait','Waiting ($ per 15 minutes)',p.waitPer15)}
    ${f('p-rent','Wheelchair Rental (flat $)',p.wheelchairRent!=null?p.wheelchairRent:30)}
    <div class="fsection">Stretcher Pricing</div>
    <div class="hint" style="margin-bottom:10px">Stretcher trips use these instead. Leave a box empty to use the standard value above (shown as the placeholder). Ambulatory always uses the standard rates.</div>
    ${fs('p-str-oneway','Stretcher Loading Fee — One Way ($)',p.strOneWayLoad,p.oneWayLoad)}
    ${fs('p-str-round','Stretcher Loading Fee — Round Trip ($)',p.strRoundLoad,p.roundLoad)}
    ${fs('p-str-office','Stretcher Office → Pickup ($ per mile)',p.strOfficePerMile,p.officePerMile)}
    ${fs('p-str-trip','Stretcher Pickup → Drop-off ($ per mile, ×2 for round trip)',p.strTripPerMile,p.tripPerMile)}
    ${fs('p-str-wait','Stretcher Waiting ($ per 15 minutes)',p.strWaitPer15,p.waitPer15)}
    <button class="btn-primary" onclick="savePrices()">Save Pricing</button>
    <button class="btn-danger" style="background:#f2e6e6;color:var(--royal)" onclick="PRICES=Object.assign({},DEFAULT_PRICES);pushSetting('prices',PRICES);render();toast('Pricing reset')">Reset to Defaults</button>`;
}
async function savePrices(){
  const sv = id => { const v = $(id).value; return v === '' ? null : Math.max(0, +v||0); }; /* blank = use standard */
  const prevPrices = PRICES;
  PRICES = {
    oneWayLoad:+$('p-oneway').value||0, roundLoad:+$('p-round').value||0,
    officePerMile:+$('p-office').value||0, tripPerMile:+$('p-trip').value||0,
    waitPer15:+$('p-wait').value||0, wheelchairRent:Math.max(0, +$('p-rent').value||0),
    strOneWayLoad:sv('p-str-oneway'), strRoundLoad:sv('p-str-round'),
    strOfficePerMile:sv('p-str-office'), strTripPerMile:sv('p-str-trip'), strWaitPer15:sv('p-str-wait')
  };
  /* v6.22: awaited + verified — a silently failed price save means THIS device quotes new prices while invoices bill the old ones */
  if(!(await pushSettingV('prices', PRICES))){ PRICES = prevPrices; return; }
  modal=null; render(); toast('Pricing saved');
}
function opsHTML(){
  return `
    <div class="fgroup"><label>Report-Time Buffer (minutes)</label><input id="op-buf" type="number" value="${OPS.buffer}"></div>
    <div class="fgroup"><label>Google Maps API Key</label><input id="op-key" value="${esc(OPS.gkey||'')}" autocomplete="off" placeholder="Paste key with Places (New) + Routes enabled"></div>
    <div class="hint" style="margin-bottom:12px">Powers address autocomplete and automatic office report times (report time = first pickup − drive time − buffer, rounded to 5 min). In Google Cloud, restrict the key to your website address (HTTP referrers) and to the Places API (New) + Routes API only.</div>
    <button class="btn-mini ghost" style="margin-bottom:10px" onclick="testMaps()">Test Maps Connection</button>
    <div class="fsection">Operating Rules</div>
    <div class="hint" style="margin-bottom:10px">These were fixed values until now. Change them only if the day-to-day tells you to.</div>
    <div class="frow">
      <div class="fgroup"><label>Driver clash warning (min apart)</label><input id="op-clash" type="number" min="5" value="${opsNum('clashMin',45)}"></div>
      <div class="fgroup"><label>Suggest conflict window (min)</label><input id="op-conf" type="number" min="10" value="${opsNum('conflictMin',90)}"></div>
    </div>
    <div class="frow">
      <div class="fgroup"><label>Duplicate booking window (min)</label><input id="op-dup" type="number" min="5" value="${opsNum('dupMin',30)}"></div>
      <div class="fgroup"><label>Evening switch hour (0–23)</label><input id="op-eve" type="number" min="0" max="23" value="${opsNum('eveningHour',18)}"></div>
    </div>
    <div class="fgroup"><label>Van position considered stale after (hours)</label><input id="op-stale" type="number" min="1" value="${opsNum('vanStaleHrs',12)}"></div>
    <button class="btn-primary" onclick="saveOps()">Save</button>`;
}
async function saveOps(){
  const prevOps = OPS;
  OPS = {buffer: +$('op-buf').value || 10, gkey: $('op-key').value.trim(),
    clashMin: +$('op-clash').value || 45, conflictMin: +$('op-conf').value || 90,
    dupMin: +$('op-dup').value || 30,
    eveningHour: Math.min(23, Math.max(0, $('op-eve').value === '' ? 18 : +$('op-eve').value)),
    vanStaleHrs: +$('op-stale').value || 12};
  if(!(await pushSettingV('ops', OPS))){ OPS = prevOps; return; } /* v6.22: awaited + verified */
  modal=null; render(); toast('Trip timing settings saved');
}
async function testMaps(){
  const key = $('op-key').value.trim();
  if(!key){ toast('Paste a key first'); return; }
  const saved = OPS.gkey; OPS.gkey = key;
  toast('Testing Maps connection…');
  const d = await routesDuration(OFFICE, '901 Bagby St, Houston, TX 77002');
  OPS.gkey = saved;
  toast(d != null ? `✓ Maps working — office to Houston City Hall: ~${d} min` : 'Test failed — check APIs enabled, billing, and key restrictions');
}
function passwdHTML(){
  return `
    <div class="fgroup"><label>New Password (6+ characters)</label><input id="pw-1" type="password" autocomplete="new-password"></div>
    <div class="fgroup"><label>Confirm New Password</label><input id="pw-2" type="password" autocomplete="new-password"></div>
    <div class="hint" style="margin-bottom:8px">Your password is stored fully encrypted — nobody, including the admin, can see it.</div>
    <button class="btn-primary" onclick="savePassword()">Update Password</button>`;
}
async function savePassword(){
  const a=$('pw-1').value, b=$('pw-2').value;
  if(a.length<6){ toast('Password must be at least 6 characters'); return; }
  if(a!==b){ toast('Passwords do not match'); return; }
  const {error} = await sb.auth.updateUser({password:a});
  if(error){ syncErr(error); return; }
  modal=null; render(); toast('Password updated ✓');
}

/* ================= APP HEALTH (crash log viewer) ================= */
async function openHealth(){
  modal = {type:'health', rows:null}; render();
  const {data, error} = await sb.from('app_errors').select('*').order('id', {ascending:false}).limit(20);
  if(modal && modal.type==='health'){ modal.rows = error ? [] : (data || []); render(); }
}
/* v6.55: admin list of all place notes — the moderation point for driver-added parking/entrance knowledge */
/* v6.57: attorney-editable wording for the two signature documents. Saved via the verified
   settings path; blank box = reset to the built-in default. Signed records keep their own
   doc_text snapshot, so edits never change what someone already agreed to. */
function sigDocsHTML(){
  return `<div class="hint" style="margin-bottom:10px">This is the exact wording clients read and sign on the driver's phone. Edit it anytime (for example after attorney review) — changes apply to NEW signatures immediately, no app update needed. Already-signed records keep the wording that was on screen when they signed. Clear a box and save to reset it to the built-in default.</div>
  <div class="fgroup"><label>Service Agreement (signed once, first trip)</label><textarea id="sd-waiver" rows="12" style="font-size:12px">${esc(SIGDOCS.waiver)}</textarea></div>
  <div class="fgroup"><label>Drop-off Confirmation (signed at every drop-off)</label><textarea id="sd-dropoff" rows="8" style="font-size:12px">${esc(SIGDOCS.dropoff)}</textarea></div>
  <button class="btn-primary" onclick="saveSigDocs()">Save Wording</button>`;
}
async function saveSigDocs(){
  const w = $('sd-waiver').value.trim() || DEFAULT_SIGDOCS.waiver;
  const d = $('sd-dropoff').value.trim() || DEFAULT_SIGDOCS.dropoff;
  const prev = SIGDOCS;
  SIGDOCS = {waiver:w, dropoff:d};
  const ok = await pushSettingV('sigdocs', {waiver:w, dropoff:d});
  if(!ok){ SIGDOCS = prev; render(); return; }
  closeModal(); toast('Signature wording saved ✓');
}
function placeNotesHTML(){
  if(!placeNotes.length) return '<div class="hint">No place notes yet. Drivers (and you) can add one from any trip — parking spots, entrances, check-in desks. They show on every future trip to that address.</div>';
  const sorted = [...placeNotes].sort((a,b)=>a.address.localeCompare(b.address));
  return `<div class="hint" style="margin-bottom:10px">Notes pinned to addresses — every driver sees them on any trip there. Edit or remove anything stale.</div>` +
    sorted.map(p=>`
    <div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px">
      <div style="font-size:13px;font-weight:700;margin-bottom:3px">📍 ${esc(p.address)}</div>
      <div style="font-size:12.5px;color:var(--ink);line-height:1.5;margin-bottom:8px">${esc(p.note)}</div>
      <div style="display:flex;gap:8px">
        <button class="btn-mini ghost" onclick="savePlaceNote(${JSON.stringify(p.address).replace(/"/g,'&quot;')})">Edit</button>
        <button class="btn-mini ghost" style="color:var(--red)" onclick="delPlaceNote('${esc(p.key)}')">Remove</button>
      </div>
    </div>`).join('');
}
async function delPlaceNote(key){
  const ok = await confirmSheet({title:'Remove this place note?', body:'<div style="font-size:13px">Drivers will no longer see it on trips to this address.</div>', yes:'Remove', no:'Keep'});
  if(!ok) return;
  const {error} = await sb.from('place_notes').delete().eq('addr_key', key);
  if(error){ syncErr(error); toast('Could not remove'); return; }
  placeNotes = placeNotes.filter(p=>p.key!==key);
  render(); toast('Place note removed');
}
async function openDevices(){
  modal = {type:'devices', rows:null}; render();
  /* v6.49: sweep ghosts — phones that got a new identity (iOS storage reset / re-added Home Screen app)
     leave orphan rows behind; anything unseen for 45 days is dead weight, not a session */
  try{ await sb.from('device_sessions').delete().lt('last_seen', new Date(Date.now()-45*86400000).toISOString()); }catch(e){ console.error(e); }
  const {data, error} = await sb.from('device_sessions').select('*').eq('revoked', false).order('last_seen', {ascending:false});
  if(modal && modal.type==='devices'){ modal.rows = error ? [] : (data || []); render(); }
}
function deviceAgo(ts){
  const mins = Math.round((Date.now() - new Date(ts).getTime())/60000);
  if(mins < 2) return 'active now'; if(mins < 60) return mins+' min ago';
  const h = Math.round(mins/60); if(h < 24) return h+' hr ago';
  return Math.round(h/24)+' days ago';
}
function devicesHTML(){
  if(!modal.rows) return '<div class="hint">Checking devices…</div>';
  const thisId = deviceId();
  const nameOf = uid => { const u = users.find(x=>x.id===uid); return u ? u.name : 'Unknown user'; };
  if(!modal.rows.length) return '<div class="hint">No devices on record yet. Every phone or computer that signs in shows up here.</div>';
  return `
    <div class="hint" style="margin-bottom:10px">Everyone signed into the app. "Sign out" ends that device's session — it lands back on the login screen within a few minutes. Use it for a lost phone or someone who has left.</div>
    ${modal.rows.map(r=>{ const staleHrs = (Date.now()-new Date(r.last_seen).getTime())/3600000; return `
    <div style="border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px${staleHrs>24?';opacity:.55':''}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
        <span style="font-size:13px;font-weight:700">${esc(nameOf(r.user_id))}${r.device_id===thisId?' <span style="color:var(--green);font-weight:400">· this device</span>':''}${staleHrs>24?' <span style="color:var(--muted);font-weight:400;font-size:11px">· inactive</span>':''}</span>
        <span style="font-size:10.5px;color:var(--muted);white-space:nowrap">${esc(deviceAgo(r.last_seen))}</span>
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${esc(r.label||'Device')} · app ${esc((r.app_version||'').split(' · ')[0]||'?')}</div>
      ${r.device_id!==thisId?`<button class="btn-mini ghost" style="margin-top:8px;color:var(--red);border-color:#e6b3b3" onclick="signOutDevice('${esc(r.device_id)}')">Sign out this device</button>`:'<div class="hint" style="margin-top:6px">You are using this device now.</div>'}
    </div>`;}).join('')}`;
}
async function signOutDevice(id){
  const ok = await confirmSheet({title:'Sign out this device?', body:'<div style="font-size:13px">That device will be logged out and returned to the sign-in screen within a few minutes. It can log back in with the username and password.</div>', yes:'Sign it out', no:'Cancel'});
  if(!ok) return;
  const {error} = await sb.from('device_sessions').update({revoked:true}).eq('device_id', id);
  if(error){ syncErr(error); toast('Could not sign it out — try again'); return; }
  adminAlert(`🔒 ${currentUser.name} signed a device out of the app`);
  await openDevices(); toast('Signed out — that device drops off within 5 minutes');
}
function healthHTML(){
  if(!modal.rows) return '<div class="hint">Checking all devices…</div>';
  if(!modal.rows.length) return `
    <div style="display:flex;align-items:center;gap:7px;padding:10px 12px;border-radius:10px;background:#e9f6ee;color:#0d5c33;font-size:13px;font-weight:700;margin-bottom:10px">✓ No errors recorded</div>
    <div class="hint">Any crash on any signed-in device (yours or a driver's) logs itself here automatically — up to 5 per device per session, duplicates skipped. If a driver says "the app did something weird," check this first.</div>`;
  return `
    <div class="hint" style="margin-bottom:10px">Most recent first. Screenshot this to your developer when reporting a problem.</div>
    ${modal.rows.map(r=>`
    <div style="border:1px solid #eee3e3;border-radius:10px;padding:9px 11px;margin-bottom:7px">
      <div style="display:flex;justify-content:space-between;gap:8px">
        <span style="font-size:12px;font-weight:700">${esc(r.user_name||'?')} <span style="color:var(--muted);font-weight:400">(${esc(r.role||'')})</span></span>
        <span style="font-size:10.5px;color:var(--muted);white-space:nowrap">${esc(String(r.at||'').slice(0,16).replace('T',' '))} · ${esc(r.build||'')}</span>
      </div>
      <div style="font-size:11.5px;margin-top:3px;word-break:break-word">${esc(r.message||'')}</div>
      ${r.url?`<div style="font-size:10px;color:var(--muted);margin-top:2px;word-break:break-all">${esc(r.url)}</div>`:''}
    </div>`).join('')}
    <button class="btn-mini ghost" style="margin-top:4px" onclick="clearHealthLog()">Clear log</button>`;
}
async function clearHealthLog(){
  if(!confirm('Clear the error log? (Do this after the problems are fixed.)')) return;
  const {error} = await sb.from('app_errors').delete().gt('id', 0);
  if(error){ toast(error.message); return; }
  openHealth();
}

/* ================= MODAL SHELL ================= */
function renderModal(){
  let title='', body='';
  if(modal.type==='leadForm'){
    const l=modal.leadId?leads.find(x=>x.id===modal.leadId):null;
    if(modal.leadId && !l){ modal=null; setTimeout(()=>{ toast('This lead no longer exists'); render(); },0); return ''; }
    title=l?(l.status==='Pending'?'Edit Lead':'Edit Appointment'):(modal.dupFromId?'Duplicate Booking':modal.asAppt?'New Appointment':'Add New Lead'); body=leadFormHTML(l); }
  else if(modal.type==='apptDetail'){
    const l=leads.find(x=>x.id===modal.leadId);
    if(!l){ modal=null; setTimeout(()=>{ toast('This appointment no longer exists'); render(); },0); return ''; }
    title='Appointment Details'; body=apptDetailHTML(l); }
  else if(modal.type==='userForm'){ const u=modal.userId?users.find(x=>x.id===modal.userId):null; title=u?('Edit '+(u.role==='admin'?'Admin':'Driver')):'Add User'; body=userFormHTML(u); }
  else if(modal.type==='clientForm'){ const c=modal.clientId?clients.find(x=>x.id===modal.clientId):null; title=c?'Client Profile':'New Client Profile'; body=clientFormHTML(c); }
  else if(modal.type==='pricing'){ title='Pricing Rules'; body=pricingHTML(); }
  else if(modal.type==='passwd'){ title='Change Password'; body=passwdHTML(); }
  else if(modal.type==='range'){ title='Custom Date Range'; body=rangeHTML(); }
  else if(modal.type==='ops'){ title='Trip Timing & Maps'; body=opsHTML(); }
  else if(modal.type==='sms'){ title='Text Messages (SMS)'; body=smsHTML(); }
  else if(modal.type==='square'){ title='Payments (Square)'; body=squareHTML(); }
  else if(modal.type==='uncollected'){ title='Outstanding Payments'; body=uncollectedHTML(); }
  else if(modal.type==='vanSheet'){ const v=vehicles.find(x=>x.imei===modal.imei); title=v?vanLabel(v):'Van'; body=vanSheetHTML(modal.imei); }
  else if(modal.type==='clockInSheet'){ title='Before you start'; body=clockInHTML(); }
  else if(modal.type==='clockOutSheet'){ title='End of day'; body=clockOutHTML(); }
  else if(modal.type==='fleetMiles'){ title='Fleet Mileage'; body=fleetMilesHTML(); }
  else if(modal.type==='fleetMilesVan'){ title=vanLabelByImei(modal.imei); body=fleetVanHTML(modal.imei); }
  else if(modal.type==='suggest'){ title='Suggest a Driver'; body=suggestHTML(); }
  else if(modal.type==='health'){ title='App Health'; body=healthHTML(); }
  else if(modal.type==='devices'){ title='Signed-In Devices'; body=devicesHTML(); }
  else if(modal.type==='documents'){ title='Documents'; body=documentsHTML(); }
  else if(modal.type==='placenotes'){ title='Place Notes'; body=placeNotesHTML(); }
  else if(modal.type==='sigdocs'){ title='Signature Documents'; body=sigDocsHTML(); }
  else if(modal.type==='paySheet'){ title=modal.mode==='charge'?'Charge Card':'Zelle Payment'; body=paySheetHTML(); }
  /* v6.18: forms people TYPE into never close from a stray tap on the dimmed backdrop —
     an accidental touch (keyboard dismiss, scroll bounce) was throwing away typed work.
     They close only from the ✕. Read-only sheets keep the convenient tap-outside-to-close. */
  const typedForm = modal.type==='leadForm' || modal.type==='clientForm' || modal.type==='userForm' || modal.type==='clockInSheet' || modal.type==='clockOutSheet';
  return `<div class="overlay" ${typedForm ? '' : 'onclick="if(event.target===this){closeModal()}"'}>
    <div class="sheet">
      <div class="sheet-head"><h3>${title}</h3><button class="x" onclick="closeModal()">✕</button></div>
      <div class="sheet-body">${body}</div>
    </div>
  </div>`;
}
/* closing a trip opened from a client profile returns to that profile instead of dumping back to the Clients list */
function closeModal(){
  if(modal && modal.backTo==='client' && modal.backClientId){
    modal = {type:'clientForm', clientId:modal.backClientId, showAllTrips:!!modal.backShowAll};
  } else {
    modal = null;
  }
  render();
}

/* ================= BOOT ================= */
async function boot(){
  document.body.style.background = 'var(--royal-light)';
  $('app').innerHTML = `
    <div class="login-wrap" style="justify-content:center;text-align:center">
      ${appLogo
        ? `<div class="login-logo wide" style="margin:0 auto 18px"><img src="${esc(appLogo)}" alt="logo"></div>`
        : `<div class="login-logo">${EMBLEM}</div><h2>Royalty Medical Transportation</h2>`}
      <div class="tag">☁️ Connecting…</div>
    </div>`;
  try{
    const {data:{session}} = await sb.auth.getSession();
    if(session){ await enterApp(session); return; }
  }catch(e){ console.error(e); }
  render(); /* no session → login screen; no data is fetched before login */
}
/* auto-refresh when the app returns to the foreground (phone unlocked, app switched back) */
document.addEventListener('visibilitychange', async ()=>{
  if(document.visibilityState==='visible'){
    try{ sb.auth.startAutoRefresh(); }catch(e){}
    if(currentUser){
      try{
        let {data:{session}} = await sb.auth.getSession();
        if(session && session.expires_at && session.expires_at*1000 - Date.now() < 60000){
          const r = await sb.auth.refreshSession();
          session = r.data ? r.data.session : null;
          if(!session && r.error && !/invalid|not.?found|revoked/i.test(String(r.error.message||''))){
            /* transient network failure at wake — retry once after the radio settles */
            await new Promise(rs=>setTimeout(rs, 4000));
            const r2 = await sb.auth.refreshSession();
            session = r2.data ? r2.data.session : null;
            if(!session && r2.error && !/invalid|not.?found|revoked/i.test(String(r2.error.message||''))) return; /* keep session; next foreground retries */
          }
        }
        if(!session){ currentUser=null; modal=null; render(); return; }
      }catch(e){ console.error(e); return; /* network hiccup — don't log out over it */ }
      if(window._reloading) return;
      window._reloading = true;
      try{ await loadAll(); } finally { window._reloading = false; }
      deviceHeartbeat(); /* v6.27: on wake, catch a remote sign-out fast + refresh last-seen */
      const ae = document.activeElement;
      const typing = ae && (ae.tagName==='TEXTAREA' || ae.tagName==='INPUT' || ae.tagName==='SELECT');
      if(!modal && !typing) render();
    }
  } else {
    try{ sb.auth.stopAutoRefresh(); }catch(e){}
  }
});

boot();

