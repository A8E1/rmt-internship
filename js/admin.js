/* ================= ADMIN: LEADS ================= */
function leadsView(){
  const pend = leads.filter(l=>l.status==='Pending').length; /* all Pending rows are always in the window */
  const conf = confirmedTotalCount != null ? confirmedTotalCount : leads.filter(l=>l.status==='Confirmed').length; /* lifetime, from a server count */
  const q = search.leads.trim();
  const pendingLeads = leads.filter(l=>l.status==='Pending');
  const isNoShow = l => l.date && Math.round((today - new Date(l.date+'T00:00:00'))/86400000) >= 7;
  const activeLeads = pendingLeads.filter(l=>!isNoShow(l));
  const attn = activeLeads.filter(needsAttention);
  const noshowLeads = [...pendingLeads.filter(isNoShow), ...leads.filter(l=>l.status==='No Show')]
    .sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  let shown = q ? [...pendingLeads, ...leads.filter(l=>l.status==='No Show')].filter(l=>matchName(l.first,l.last,q))
              : (leadTab==='noshow' ? noshowLeads : activeLeads);
  if(leadAttn && leadTab!=='noshow' && !q) shown = shown.filter(needsAttention);
  const items = [...shown].sort((a,b)=> (b.date+b.pickupTime).localeCompare(a.date+a.pickupTime)).slice(0, 250)
    .map(l=>{
      let border='', ageTag='';
      if(l.status==='Pending'){
        let col, label;
        if(l.date){
          const days = Math.round((new Date(l.date+'T00:00:00') - today)/86400000);
          col = days>=7 ? 'var(--green)' : days>=3 ? 'var(--amber)' : 'var(--red)';
          label = days<0?'Date passed':days===0?'⚠ Trip is TODAY':days===1?'⚠ Trip tomorrow':days+' days out';
        } else {
          const age = Math.round((today - new Date((l.createdAt||fmtDate(today))+'T00:00:00'))/86400000);
          col = age<2 ? 'var(--green)' : age<4 ? 'var(--amber)' : 'var(--red)';
          label = age>=4 ? '⚠ No date · '+age+' days old — follow up!' : 'No date · added '+(age===0?'today':age+'d ago');
        }
        border = `border-left:4px solid ${col};`;
        ageTag = `<span style="color:${col};font-weight:700">${label}</span>`;
      }
      const ns = isNoShow(l);
      return `
    <div class="card" style="${border}" onclick="openLeadForm(${l.id})">
      <div class="row1">
        <div class="name">${esc(l.first)} ${esc(l.last)}</div>
        <span class="badge ${ns?'noshow':statusClass(l.status)}">${ns?'No Show':l.status}</span>
      </div>
      <div class="meta">
        <span>${fmtNice(l.date)}</span><span>${fmtTime(l.pickupTime)}</span>
        <span>${l.tripType}</span>
        <span>${esc(l.tripKind||'Wheelchair')}</span>
        <span>${l.status==='No Show' ? 'Quoted '+money(totalCharge(l)) : money(totalCharge(l))}</span>
        ${l.clientId?'<span>Profile</span>':''}
        ${ageTag}
      </div>
    </div>`;}).join('');
  return `
    <div class="section-head">
      <div><h2>Leads</h2><div class="count">Pending only — confirmed leads move to Appointments</div></div>
      <button class="fab" onclick="openLeadForm(null)">+</button>
    </div>
    ${attn.length && leadTab!=='noshow' ? `
    <div class="notifbar" style="background:#fdecec;border-color:#f0b9b9;cursor:pointer" onclick="leadAttn=!leadAttn;render()">
      <div class="nb-item" style="font-weight:700;color:var(--red)">⚠ ${attn.length} lead${attn.length===1?'':'s'} need${attn.length===1?'s':''} attention — ${leadAttn?'tap to show all leads':'tap to view'}</div>
    </div>`:''}
    ${searchBar('search-leads','leads','Search leads by name…')}
    ${q?'':`<div class="pills" style="margin-bottom:10px">
      <button class="${leadTab==='active'?'active':''}" onclick="leadTab='active';render()">Active (${activeLeads.length})</button>
      <button class="${leadTab==='noshow'?'active':''}" onclick="leadTab='noshow';render()">No Show (${noshowLeads.length})</button>
    </div>`}
    ${q?'':leadTab==='noshow'?`<div class="hint" style="margin-bottom:10px">Leads marked No Show, plus pending leads whose date passed 7+ days ago without booking. The price shown is the QUOTE — nothing is billed. Any of them can still be booked: open one and confirm it as usual.</div>`:`<div class="stat">
      <div><div class="n">${leads.length}</div><div class="l">Total Leads</div></div>
      <div class="divider"></div>
      <div><div class="n">${pend}</div><div class="l">Pending</div></div>
      <div class="divider"></div>
      <div><div class="n">${conf}</div><div class="l">Confirmed</div></div>
    </div>`}
    ${q?`<div class="count" style="margin-bottom:10px">${shown.length} match${shown.length===1?'':'es'} for “${esc(q)}”</div>`:''}
    ${items || (q?'<div class="empty"><div class="big">🔍</div>No pending leads match that name.</div>':leadTab==='noshow'?'<div class="empty">No no-show leads — nothing has gone stale.</div>':'<div class="empty">No pending leads.<br>Tap + to add one — confirmed leads live in Appointments.</div>')}`;
}

/* ================= LEAD FORM ================= */
function openLeadForm(id, clientId, asAppt){
  repDates = new Set(); repCal = null; modal={type:'leadForm', leadId:id, clientId:clientId||null, asAppt:!!asAppt};
  const l0 = id ? leads.find(x=>x.id===id) : null;
  const cid = clientId || (l0 ? l0.clientId : null);
  if(cid) ensureClientHistory(cid); /* route price memory needs the client's old trips in memory */
  render();
}

function addressOptions(){
  const set = new Set([OFFICE]);
  leads.forEach(l=>{ if(l.pickup) set.add(l.pickup); if(l.dropoff) set.add(l.dropoff); });
  return [...set].map(a=>`<option value="${esc(a)}">`).join('');
}

function leadFormHTML(l){
  const isNew = !l;
  l = l || {first:'',last:'',weight:'',dob:'',pickup:'',dropoff:'',date:fmtDate(today),pickupTime:'',apptTime:'',returnTime:'',email:'',contactName:'',phone1:'',phone2:'',tripType:'One Way',tripKind:'Wheelchair',waiting:'No',waitH:0,waitM:0,officeMiles:'',tripMiles:'',tripCharge:'',status:'Pending',driverId:null,age:'',returnDropoff:''};
  let fromClient = null;
  if(isNew && modal.clientId){
    fromClient = clients.find(x=>x.id===modal.clientId);
    if(fromClient) l = Object.assign({}, l, {
      first:fromClient.first, last:fromClient.last, weight:fromClient.weight, dob:fromClient.dob,
      pickup:fromClient.homeAddress, email:fromClient.email, contactName:fromClient.contactName,
      phone1:fromClient.phone1, phone2:fromClient.phone2, tripKind:fromClient.tripKind});
  }
  let dupSrc = null;
  if(isNew && modal.dupFromId){
    dupSrc = leads.find(x=>x.id===modal.dupFromId);
    if(dupSrc) l = Object.assign({}, dupSrc, {date:''});
  }
  if(isNew && modal.asAppt) l.status = 'Confirmed';
  const linkedClient = !isNew && l.clientId ? clients.find(x=>x.id===l.clientId) : null;
  const hourOpts = Array.from({length:9},(_,i)=>`<option value="${i}" ${l.waitH==i?'selected':''}>${i} hr</option>`).join('');
  const minOpts  = Array.from({length:60},(_,i)=>`<option value="${i}" ${l.waitM==i?'selected':''}>${i} min</option>`).join('');
  return `
    ${dupSrc ? `<div class="notifbar" style="margin-bottom:14px"><div class="nb-item">Duplicating <b>${esc(dupSrc.first)} ${esc(dupSrc.last)}</b>'s booking from ${fmtNice(dupSrc.date)} — change anything you need, pick the new date, then confirm.</div></div>`:''}
    ${fromClient && !dupSrc ? `<div class="notifbar" style="margin-bottom:14px"><div class="nb-item">Prefilled from <b>${esc(fromClient.first)} ${esc(fromClient.last)}</b>'s profile — this lead will be linked to it.</div></div>`:''}
    ${linkedClient ? `<div class="notifbar" style="margin-bottom:14px"><div class="nb-item">Linked to client profile: <b>${esc(linkedClient.first)} ${esc(linkedClient.last)}</b></div></div>`:''}
    <div class="fsection">Client Information</div>
    <div class="frow">
      <div class="fgroup"><label>First Name</label><input id="f-first" value="${esc(l.first)}"></div>
      <div class="fgroup"><label>Last Name</label><input id="f-last" value="${esc(l.last)}"></div>
    </div>
    <div class="frow">
      <div class="fgroup"><label>Weight (lbs)</label><input id="f-weight" type="number" value="${esc(l.weight)}"></div>
      <div class="fgroup"><label>Date of Birth</label><input id="f-dob" type="date" value="${esc(l.dob)}"></div>
    </div>
    <div class="fgroup"><label>Email</label><input id="f-email" type="email" value="${esc(l.email)}"></div>
    <div class="fgroup"><label>Contact Name</label><input id="f-contact" value="${esc(l.contactName)}"></div>
    <div class="frow">
      <div class="fgroup"><label>Phone Number 1</label><input id="f-phone1" inputmode="tel" value="${esc(phoneFmt(l.phone1))}" oninput="this.value=phoneFmt(this.value)"></div>
      <div class="fgroup"><label>Phone Number 2</label><input id="f-phone2" inputmode="tel" value="${esc(phoneFmt(l.phone2))}" oninput="this.value=phoneFmt(this.value)"></div>
    </div>
    ${(l.status||'Pending')==='Pending' ? `
    <div class="fgroup">
      <label>How did this lead come in?</label>
      <select id="f-weblead">
        <option value="No" ${!l.webLead?'selected':''}>We spoke on the phone</option>
        <option value="Yes" ${l.webLead?'selected':''}>Website form — not spoken to yet</option>
      </select>
    </div>`:''}

    <div class="fsection">Trip Details</div>
    <datalist id="addr-list">${addressOptions()}</datalist>
    <div class="fgroup"><label>Pickup Address</label><input id="f-pickup" ${OPS.mapsEnabled?'':'list="addr-list"'} oninput="acSuggest(this)" onchange="addrChanged()" autocomplete="off" value="${esc(l.pickup)}"></div>
    <div class="fgroup"><label>Drop-off Address</label><input id="f-dropoff" ${OPS.mapsEnabled?'':'list="addr-list"'} oninput="acSuggest(this)" onchange="addrChanged()" autocomplete="off" value="${esc(l.dropoff)}"></div>
    <div id="stop-area" style="display:${l.tripType==='Round Trip'?'block':'none'}">
      <div class="fgroup"><label>Second Drop-off (optional — adds a third leg)</label><input id="f-stop" ${OPS.mapsEnabled?'':'list="addr-list"'} oninput="acSuggest(this)" onchange="addrChanged()" autocomplete="off" value="${esc(l.stopAddr||'')}"></div>
      <div class="fgroup"><label>Return to a different address (optional)</label><input id="f-retdrop" ${OPS.mapsEnabled?'':'list="addr-list"'} oninput="acSuggest(this)" onchange="addrChanged()" autocomplete="off" value="${esc(l.returnDropoff||'')}"></div>
    </div>
    <div style="display:flex;gap:8px;margin:-4px 0 13px">
      <button type="button" class="btn-mini ghost" onclick="seeTrip('office')">Office → Pickup</button>
      <button type="button" class="btn-mini ghost" onclick="seeTrip('trip')">See Trip</button>
    </div>
    <div class="fgroup"><label>Date</label><input id="f-date" type="date" value="${esc(l.date)}"></div>
    <div class="frow">
      <div class="fgroup"><label>Pickup Time</label><input id="f-ptime" type="time" value="${esc(l.pickupTime)}"></div>
      <div class="fgroup"><label>Appointment Time</label><input id="f-atime" type="time" value="${esc(l.apptTime)}"></div>
    </div>
    <div class="frow">
      <div class="fgroup"><label>Return Time</label><input id="f-rtime" type="time" value="${esc(l.returnTime)}"></div>
      <div class="fgroup"><label>Trip Type</label>
        <select id="f-triptype" onchange="tripTypeToggle()">
          <option ${l.tripType==='One Way'?'selected':''}>One Way</option>
          <option ${l.tripType==='Round Trip'?'selected':''}>Round Trip</option>
        </select></div>
    </div>
    <div class="fgroup"><label>Service Type</label>
      <select id="f-tripkind" onchange="kindToggle()">
        ${['Wheelchair','Ambulatory','Stretcher'].map(k=>`<option ${l.tripKind===k?'selected':''}>${k}</option>`).join('')}
      </select></div>
    <div id="rent-area" style="display:${(l.tripKind||'Wheelchair')==='Wheelchair'?'block':'none'}">
      <div class="fgroup"><label>Rent a wheelchair? (+${money(PRICES.wheelchairRent!=null?PRICES.wheelchairRent:30)})</label>
        <select id="f-rent" onchange="calcCharges()">
          <option value="No" ${!l.rentWheelchair?'selected':''}>No — client has their own</option>
          <option value="Yes" ${l.rentWheelchair?'selected':''}>Yes — add rental fee</option>
        </select></div>
    </div>
    <div class="frow">
      <div class="fgroup"><label>Oxygen on board?</label>
        <select id="f-oxygen"><option value="No" ${!l.oxygen?'selected':''}>No</option><option value="Yes" ${l.oxygen?'selected':''}>Yes — flag for the driver</option></select></div>
      <div class="fgroup"><label>Escort riding along?</label>
        <select id="f-escort"><option value="No" ${!l.escort?'selected':''}>No</option><option value="Yes" ${l.escort?'selected':''}>Yes — rides free</option></select></div>
    </div>

    ${isNew?`
    <div class="fsection">Recurring Trip</div>
    <div class="fgroup"><label>Recurring trip?</label>
      <select id="f-recur" onchange="recToggle(this.value)">
        <option>No</option><option>Yes</option>
      </select></div>
    <div id="rep-area" style="display:none">
      <div class="fgroup"><label>Pick the dates <span id="rep-count" style="color:var(--royal)"></span></label>
        <div id="rep-cal"></div>
        <div class="hint">Tap every date this trip should run. One identical trip is created per selected date — only the date changes. Perfect for dialysis clients.</div>
      </div>
    </div>`:''}

    <div class="fsection">Charges</div>
    <div class="frow">
      <div class="fgroup"><label>Miles: Office → Pickup</label><input id="f-officemiles" type="number" min="0" step="0.1" value="${esc(l.officeMiles)}" data-man="${l.officeMiles!==''&&l.officeMiles!=null?'1':''}" oninput="this.dataset.man='1';calcPrice()"></div>
      <div class="fgroup"><label>Miles: Pickup → Drop-off</label><input id="f-tripmiles" type="number" min="0" step="0.1" value="${esc(l.tripMiles)}" data-man="${l.tripMiles!==''&&l.tripMiles!=null?'1':''}" oninput="this.dataset.man='1';calcPrice()"></div>
    </div>
    <div class="hint" id="miles-hint" style="margin:-6px 0 10px"></div>
    <div class="hint" style="margin:-6px 0 12px">Auto-price: $${PRICES.oneWayLoad} one-way / $${PRICES.roundLoad} round-trip loading fee + $${PRICES.officePerMile}/mi office→pickup + $${PRICES.tripPerMile}/mi loaded (×2 for round trip; with a second stop the miles are the full loop, no ×2). Stretcher trips use their own rates from Settings → Pricing Rules. Office: ${OFFICE}.</div>
    <div class="fgroup"><label>Trip Charge ($) — auto-calculated, edit to override</label><input id="f-tripcharge" type="number" min="0" step="0.01" value="${esc(l.tripCharge)}" data-man="${(+l.tripCharge||0) > 0 ? '1' : ''}" oninput="this.dataset.man='1';calcCharges()">
    <div class="hint" id="price-hint" style="margin-top:4px"></div></div>
    <div class="fgroup"><label>Waiting Time?</label>
      <select id="f-waiting" onchange="waitToggle()">
        <option ${l.waiting==='No'?'selected':''}>No</option>
        <option ${l.waiting==='Yes'?'selected':''}>Yes</option>
      </select></div>
    <div id="wait-area" style="display:${l.waiting==='Yes'?'block':'none'}">
      <div class="frow">
        <div class="fgroup"><label>Wait Hours</label><select id="f-waith" onchange="calcCharges()">${hourOpts}</select></div>
        <div class="fgroup"><label>Wait Minutes</label><select id="f-waitm" onchange="calcCharges()">${minOpts}</select></div>
      </div>
      <div class="hint" style="margin:-6px 0 12px">Billed in 15-min blocks — $${PRICES.waitPer15} each standard${PRICES.strWaitPer15!=null&&PRICES.strWaitPer15!==''?', $'+PRICES.strWaitPer15+' each on stretcher trips':''}. Rounds up — e.g. 27 min bills as 30 min. The driver's live wait timer replaces this estimate when used.</div>
    </div>
    <div class="charge-box">
      <div class="cr"><span>Waiting Charge (est.)</span><span id="c-wait">$0.00</span></div>
      <div class="cr"><span>Trip Charge</span><span id="c-trip">$0.00</span></div>
      <div class="cr" id="c-rent-row" style="display:none"><span>Wheelchair Rental</span><span id="c-rent">$0.00</span></div>
      <div class="cr total"><span>Total Charge</span><span id="c-total">$0.00</span></div>
    </div>

    <div class="fsection">Notes for the Driver</div>
    <div class="fgroup">
      <textarea id="f-adminnotes" rows="2" placeholder="Gate code, oxygen, back entrance, wheelchair from the garage...">${esc(l.adminNotes||'')}</textarea>
      <div class="hint" style="margin-top:4px">Shows on the driver's trip card for every leg of this trip. Not sent to the client.</div>
    </div>

    <div class="fsection">Status</div>
    <div class="fgroup"><label>Status</label>
      <select id="f-status">
        ${['Pending','Confirmed','Canceled','No Show'].map(s=>`<option ${l.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
      <div class="hint">Confirmed leads appear in Appointments &amp; on the assigned driver's schedule. Canceling on the day of the trip bills the full charge; earlier is free.</div>
    </div>
    <button class="btn-primary" onclick="saveLead(${isNew?'null':l.id})">${isNew?(modal.dupFromId?'Confirm Duplicate Booking':modal.asAppt?'Create Appointment':'Add Lead'):'Save Changes'}</button>
    ${!isNew && l.status==='Pending' ? `<button class="btn-primary" style="background:var(--green);margin-top:10px" onclick="$('f-status').value='Confirmed';saveLead(${l.id})">✓ Confirm — Create Appointment</button>`:''}
    ${!isNew && linkedClient ? `<button class="btn-danger" style="background:#f2e6e6;color:var(--royal)" onclick="openClientForm(${linkedClient.id})">View / Edit Client Profile</button>` : ''}
    ${!isNew && !linkedClient ? `<button class="btn-danger" style="background:#f2e6e6;color:var(--royal)" onclick="createProfileFromLead(${l.id})">Create Client Profile from this Lead</button>` : ''}
    ${isNew?'':`<button class="btn-danger" onclick="deleteLead(${l.id})">${l.status==='Confirmed'?'Delete Appointment':'Delete Lead'}</button>`}`;
}
function recToggle(v){
  const area = $('rep-area');
  if(!area) return;
  area.style.display = v==='Yes' ? 'block' : 'none';
  if(v==='Yes'){
    const base = $('f-date').value ? new Date($('f-date').value+'T00:00:00') : new Date();
    repCal = {y: base.getFullYear(), m: base.getMonth()};
    drawRepCal();
  }
}
function shiftRepMonth(n){
  let m = repCal.m + n, y = repCal.y;
  if(m < 0){ m = 11; y--; }
  if(m > 11){ m = 0; y++; }
  repCal = {y, m};
  drawRepCal();
}
function drawRepCal(){
  const el = $('rep-cal');
  if(!el || !repCal) return;
  const {y, m} = repCal;
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysIn = new Date(y, m+1, 0).getDate();
  let cells = '';
  for(let i=0; i<startDow; i++) cells += '<span></span>';
  const todayStr = fmtDate(today);
  for(let d=1; d<=daysIn; d++){
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cells += ds < todayStr
      ? `<button type="button" class="rc-d" disabled style="opacity:.3">${d}</button>`
      : `<button type="button" class="rc-d${repDates.has(ds)?' on':''}" onclick="toggleRepDate('${ds}',this)">${d}</button>`;
  }
  el.innerHTML = `
    <div class="rc-head">
      <button type="button" class="btn-mini ghost" onclick="shiftRepMonth(-1)">‹</button>
      <b>${first.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</b>
      <button type="button" class="btn-mini ghost" onclick="shiftRepMonth(1)">›</button>
    </div>
    <div class="rc-grid">${['S','M','T','W','T','F','S'].map(d=>`<span class="rc-w">${d}</span>`).join('')}${cells}</div>`;
  updRepCount();
}
function toggleRepDate(ds, el){
  repDates.has(ds) ? repDates.delete(ds) : repDates.add(ds);
  el.classList.toggle('on');
  updRepCount();
}
function updRepCount(){
  const c = $('rep-count');
  if(c) c.textContent = repDates.size ? `· ${repDates.size} date${repDates.size===1?'':'s'} selected` : '';
}
let acToken = null, acTimer = null;
function acNewToken(){ acToken = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); }
function acSuggest(inp){
  if(!OPS.mapsEnabled) return;
  if(!inp._acBlur){
    inp._acBlur = true;
    inp.addEventListener('blur', ()=>setTimeout(()=>{ const b = inp.parentElement.querySelector('.ac-list'); if(b) b.remove(); }, 250));
  }
  clearTimeout(acTimer);
  const q = inp.value.trim();
  const oldBox = inp.parentElement.querySelector('.ac-list');
  if(q.length < 4){ if(oldBox) oldBox.remove(); return; }
  acTimer = setTimeout(async ()=>{
    if(!acToken) acNewToken();
    try{
      const j = await mapsRequest('autocomplete', {input:q, sessionToken:acToken});
      const sugg = (j.suggestions||[])
        .map(x=>x.placePrediction && x.placePrediction.text && x.placePrediction.text.text)
        .filter(Boolean).slice(0,5);
      let b = inp.parentElement.querySelector('.ac-list');
      if(!sugg.length){ if(b) b.remove(); return; }
      if(!b){ b = document.createElement('div'); b.className='ac-list'; inp.parentElement.appendChild(b); }
      b.innerHTML = sugg.map(t=>`<div class="ac-i">${esc(t)}</div>`).join('');
      [...b.children].forEach((el,i)=>{
        el.onclick = ()=>{ inp.value = sugg[i]; b.remove(); acNewToken(); if(inp.id==='f-pickup' || inp.id==='f-dropoff') addrChanged(); };
      });
    }catch(e){ console.error(e); }
  }, 280);
}
function seeTrip(which){
  const pu = $('f-pickup').value.trim(), dof = $('f-dropoff').value.trim();
  const o = which==='office' ? OFFICE : pu;
  const d = which==='office' ? pu : dof;
  if(!o || !d){ toast('Enter the address first'); return; }
  window.open('https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(o)+'&destination='+encodeURIComponent(d), '_blank');
}
function waitToggle(){ $('wait-area').style.display = $('f-waiting').value==='Yes'?'block':'none'; calcCharges(); }

/* ===== MILEAGE AUTOFILL (billing miles come from Google's preferred route) ===== */
async function routesMiles(origin, destination){
  if(!OPS.mapsEnabled || !origin || !destination) return null;
  try{
    const j = await mapsRequest('mileage', {origin, destination});
    const m = j.routes && j.routes[0] && j.routes[0].distanceMeters;
    if(!m) return null;
    return Math.round(m/1609.344*10)/10;
  }catch(e){ console.error(e); return null; }
}
let milesReq = 0;
async function autoMiles(){
  const om = $('f-officemiles'), tm = $('f-tripmiles');
  const p = $('f-pickup') ? $('f-pickup').value.trim() : '', d = $('f-dropoff') ? $('f-dropoff').value.trim() : '';
  if(!om || !tm || !OPS.mapsEnabled || p.length < 8 || d.length < 8) return;
  if(om.dataset.man==='1' || tm.dataset.man==='1') return; /* admin typed miles — respect it */
  const st = ($('f-stop') && $('f-triptype') && $('f-triptype').value==='Round Trip') ? $('f-stop').value.trim() : '';
  /* v6.52: optional different return address — the last leg ends there instead of back at the pickup */
  const rd = ($('f-retdrop') && $('f-triptype') && $('f-triptype').value==='Round Trip') ? $('f-retdrop').value.trim() : '';
  const retTo = rd.length >= 8 ? rd : p;
  const req = ++milesReq;
  const hint = $('miles-hint'); if(hint) hint.textContent = 'Calculating miles from Google…';
  if(st.length >= 8){
    /* multi-stop path: pickup → drop 1 → drop 2 → return destination (trip miles = the whole path, price does NOT double it) */
    const [a, b1, b2, b3] = await Promise.all([routesMiles(OFFICE, p), routesMiles(p, d), routesMiles(d, st), routesMiles(st, retTo)]);
    if(req !== milesReq || $('f-officemiles') !== om) return;
    if(a != null) om.value = a;
    if(b1 != null && b2 != null && b3 != null) tm.value = Math.round((b1 + b2 + b3) * 10) / 10;
    if(a != null || b1 != null){ calcPrice(); if(hint) hint.textContent = 'Miles auto-filled from Google ✓ — trip miles are the FULL path (pickup → both stops → ' + (rd.length>=8?'return address':'back') + ').'; }
    else if(hint) hint.textContent = 'Could not calculate miles — check the addresses or enter miles manually.';
    return;
  }
  if(rd.length >= 8){
    /* different-return round trip: pickup → drop-off → return address (full path, no ×2) */
    const [a, b1, b2] = await Promise.all([routesMiles(OFFICE, p), routesMiles(p, d), routesMiles(d, rd)]);
    if(req !== milesReq || $('f-officemiles') !== om) return;
    if(a != null) om.value = a;
    if(b1 != null && b2 != null) tm.value = Math.round((b1 + b2) * 10) / 10;
    if(a != null || b1 != null){ calcPrice(); if(hint) hint.textContent = 'Miles auto-filled from Google ✓ — trip miles are the FULL path (pickup → drop-off → return address).'; }
    else if(hint) hint.textContent = 'Could not calculate miles — check the addresses or enter miles manually.';
    return;
  }
  const [a, b] = await Promise.all([routesMiles(OFFICE, p), routesMiles(p, d)]);
  if(req !== milesReq || $('f-officemiles') !== om) return; /* form changed/closed while we fetched */
  if(a != null) om.value = a;
  if(b != null) tm.value = b;
  if(a != null || b != null){ calcPrice(); if(hint) hint.textContent = 'Miles auto-filled from Google ✓ — edit either field to override.'; }
  else if(hint) hint.textContent = 'Could not calculate miles — check the addresses or enter miles manually.';
}
function addrChanged(){
  const om = $('f-officemiles'), tm = $('f-tripmiles');
  if(om) om.dataset.man=''; if(tm) tm.dataset.man=''; /* address changed → stale manual miles recalc */
  autoMiles();
}
function normAddr(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
/* what did THIS client pay the last time they rode THIS exact route (same trip type)? */
function routeHistoryPrice(){
  const p = normAddr($('f-pickup') ? $('f-pickup').value : ''), d = normAddr($('f-dropoff') ? $('f-dropoff').value : '');
  if(p.length < 6 || d.length < 6) return null;
  const tt = $('f-triptype') ? $('f-triptype').value : '';
  let cid = modal && modal.clientId || null;
  if(!cid && modal && modal.leadId){ const l0 = leads.find(x=>x.id===modal.leadId); cid = l0 ? l0.clientId : null; }
  if(!cid && modal && modal.dupFromId){ const l0 = leads.find(x=>x.id===modal.dupFromId); cid = l0 ? l0.clientId : null; }
  const nf = ($('f-first') ? $('f-first').value : '').trim().toLowerCase();
  const nl = ($('f-last') ? $('f-last').value : '').trim().toLowerCase();
  const cands = leads.filter(l=>{
    if(modal && modal.leadId && l.id === modal.leadId) return false;
    if(l.status !== 'Confirmed' || !(+l.tripCharge > 0)) return false;
    if(tt && l.tripType !== tt) return false;
    const sameClient = cid ? l.clientId === cid : (nf && (l.first||'').trim().toLowerCase() === nf && (l.last||'').trim().toLowerCase() === nl);
    if(!sameClient) return false;
    const lp = normAddr(l.pickup), ld = normAddr(l.dropoff);
    if(lp.length < 6 || ld.length < 6) return false;
    const pm = lp === p || lp.indexOf(p) === 0 || p.indexOf(lp) === 0;
    const dm = ld === d || ld.indexOf(d) === 0 || d.indexOf(ld) === 0;
    /* a trip with a second stop is a DIFFERENT route than the plain round trip — both must match */
    const st = normAddr(formHasStop() ? $('f-stop').value : '');
    const ls = normAddr(l.stopAddr||'');
    const sm = (!st && !ls) || (st.length >= 6 && ls.length >= 6 && (ls === st || ls.indexOf(st) === 0 || st.indexOf(ls) === 0));
    /* v6.52: same rule for a different return address — it changes the route and the price */
    const rt = normAddr(formHasDiffReturn() ? $('f-retdrop').value : '');
    const lrt = normAddr(l.returnDropoff||'');
    const rm = (!rt && !lrt) || (rt.length >= 6 && lrt.length >= 6 && (lrt === rt || lrt.indexOf(rt) === 0 || rt.indexOf(lrt) === 0));
    if(!rm) return false;
    return pm && dm && sm;
  }).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  return cands.length ? {price:+cands[0].tripCharge, date:cands[0].date} : null;
}
function calcPrice(){
  const om=$('f-officemiles').value, tm=$('f-tripmiles').value;
  const tc = $('f-tripcharge');
  if(om!=='' || tm!==''){
    const sug = suggestPrice($('f-triptype').value, om, tm, formHasStop() || formHasDiffReturn(), $('f-tripkind') ? $('f-tripkind').value : '').toFixed(2);
    const ph = $('price-hint');
    if(tc.dataset.man === '1'){
      /* the price on this booking was set by a person — NEVER silently overwrite it (Jan-Ake $300 → $122 bug) */
      if(ph && Math.abs(+tc.value - +sug) > 0.005) ph.innerHTML = 'Suggested from miles: <b>$' + sug + '</b> — <span style="color:var(--blue);font-weight:700;cursor:pointer" onclick="applySuggestedPrice(' + sug + ')">tap to use</span> (keeping your $' + (+tc.value).toFixed(2) + ')';
      else if(ph) ph.textContent = '';
    } else {
      const h = routeHistoryPrice();
      if(h){
        /* the client has ridden this exact route before — their established price wins over the mileage math */
        tc.value = h.price.toFixed(2);
        tc.dataset.man = '1';
        if(ph) ph.innerHTML = 'Same route for this client (' + fmtNice(h.date) + ') — using their price <b>$' + h.price.toFixed(2) + '</b>.' + (Math.abs(h.price - +sug) > 0.005 ? ' Mileage suggests $' + sug + ' — <span style="color:var(--blue);font-weight:700;cursor:pointer" onclick="applySuggestedPrice(' + sug + ')">tap to use</span>' : '');
      } else {
        tc.value = sug;
        if(ph) ph.textContent = '';
      }
    }
  }
  calcCharges();
}
function applySuggestedPrice(v){
  const tc = $('f-tripcharge'); if(!tc) return;
  tc.value = (+v).toFixed(2);
  tc.dataset.man = '1';
  const ph = $('price-hint'); if(ph) ph.textContent = '';
  calcCharges();
}
function calcCharges(){
  const w = $('f-waiting').value==='Yes' ? waitBill((+$('f-waith').value)*60 + (+$('f-waitm').value), $('f-tripkind') ? $('f-tripkind').value : '') : 0;
  const t = +($('f-tripcharge').value||0);
  const rentOn = $('f-rent') && $('f-tripkind') && $('f-tripkind').value==='Wheelchair' && $('f-rent').value==='Yes';
  const r = rentOn ? +(PRICES.wheelchairRent!=null?PRICES.wheelchairRent:30) : 0;
  $('c-wait').textContent = money(w);
  $('c-trip').textContent = money(t);
  if($('c-rent-row')){ $('c-rent-row').style.display = rentOn ? 'flex' : 'none'; $('c-rent').textContent = money(r); }
  $('c-total').textContent = money(w+t+r);
}
function kindToggle(){
  const wc = $('f-tripkind').value==='Wheelchair';
  if($('rent-area')) $('rent-area').style.display = wc ? 'block' : 'none';
  if(!wc && $('f-rent')) $('f-rent').value = 'No'; /* switching away clears the rental */
  calcPrice(); /* v6.15: Stretcher has its own rates — service change re-prices (manual prices stay protected) */
}
function tripTypeToggle(){
  const rt = $('f-triptype').value==='Round Trip';
  if($('stop-area')) $('stop-area').style.display = rt ? 'block' : 'none';
  /* a typed second stop OR different return changes what the trip miles MEAN (full path vs one-way) — recalc from Google */
  if(($('f-stop') && $('f-stop').value.trim()) || ($('f-retdrop') && $('f-retdrop').value.trim())) addrChanged(); else calcPrice();
}
function formHasStop(){
  return !!($('f-stop') && $('f-triptype') && $('f-triptype').value==='Round Trip' && $('f-stop').value.trim().length >= 6);
}
/* v6.52: a different return address means trip miles are the full path — the round-trip ×2 must not apply */
function formHasDiffReturn(){
  return !!($('f-retdrop') && $('f-triptype') && $('f-triptype').value==='Round Trip' && $('f-retdrop').value.trim().length >= 6);
}
async function revokeConfirmation(leadId){
  const {error} = await sb.from('emails').delete().eq('lead_id', leadId).eq('email_type','confirmation').in('status',['pending','failed']);
  if(!error) refetch('emails'); else syncErr(error);
}
async function saveLead(id){
  const get = i => $(i).value;
  if(!get('f-first').trim() || !get('f-last').trim()){ toast('First and last name are required'); return; }
  { const orig = id ? leads.find(x=>x.id===id) : null;
    const dateless_ok = orig && orig.status===get('f-status') && !orig.date; /* legacy row, status unchanged */
    if(get('f-status')!=='Pending' && !get('f-date') && !dateless_ok){ toast(get('f-status')+' bookings need a date — pick the trip date first'); return; } }
  if(busyGate()){ toast('Saving…'); return; }
  const prevLead = id ? leads.find(x=>x.id===id) : null; /* the web-lead picker only renders on Pending forms — keep the stored flag when it is absent */
  const data = {
    webLead: $('f-weblead') ? get('f-weblead')==='Yes' : (prevLead ? !!prevLead.webLead : false),
    adminNotes: $('f-adminnotes') ? $('f-adminnotes').value : (prevLead ? prevLead.adminNotes : ''),
    first:get('f-first').trim(), last:get('f-last').trim(), weight:get('f-weight'), dob:get('f-dob'),
    /* Age input removed (owner, Jul 15) — stored ages on old imported records are preserved:
       edits omit the key (Object.assign keeps the existing value), duplicates carry it below */
    rentWheelchair: $('f-rent') ? (get('f-tripkind')==='Wheelchair' && get('f-rent')==='Yes') : false,
    oxygen: $('f-oxygen') ? get('f-oxygen')==='Yes' : false, escort: $('f-escort') ? get('f-escort')==='Yes' : false,
    email:get('f-email'), contactName:get('f-contact'), phone1:get('f-phone1'), phone2:get('f-phone2'),
    pickup:get('f-pickup'), dropoff:get('f-dropoff'), date:get('f-date'),
    stopAddr: ($('f-stop') && get('f-triptype')==='Round Trip') ? get('f-stop').trim() : '',
    pickupTime:get('f-ptime'), apptTime:get('f-atime'), returnTime:get('f-rtime'),
    tripType:get('f-triptype'), tripKind:get('f-tripkind'), waiting:get('f-waiting'),
    waitH:+get('f-waith')||0, waitM:+get('f-waitm')||0,
    returnDropoff: get('f-triptype')==='Round Trip' && $('f-retdrop') ? get('f-retdrop').trim() : '', /* v6.52: only meaningful on round trips */
    officeMiles:get('f-officemiles'), tripMiles:get('f-tripmiles'),
    tripCharge:Math.max(0, +get('f-tripcharge')||0), status:get('f-status'),
  };
  if(!data.stopAddr){
    /* stop removed (or trip became One Way): the third leg and its wait state go with it */
    data.stopDriverId = null; data.stopDone = false;
    data.arrived2At = null; data.departed2At = null; data.actualWaitMin2 = null;
  }
  if(id){
    /* fee question comes FIRST (async sheet) — the lead is re-grabbed after the wait in
       case another device changed or deleted it while the sheet was open */
    let fee = null;
    { const pre = liveLead(id); if(!pre) return;
      if(data.status==='Canceled' && pre.status!=='Canceled'){
        fee = await cancelFeeSheet(Object.assign({}, pre, data));
        if(!fee) return; /* backed out — nothing saved, form still open with everything typed */
      } }
    const l = liveLead(id); if(!l){ toast('This booking was deleted on another device'); return; }
    const prevSnap = Object.assign({}, l); /* v6.54: rollback snapshot — a failed save must not leave the screen showing unsaved data */
    const oldP = l.driverId, oldR = l.tripType==='Round Trip' ? retDriverOf(l) : null, oldDate = l.date;
    const oldS = hasStop(l) ? l.stopDriverId : null; /* explicitly-assigned stop-leg driver (fallback = oldP, already notified) */
    if(data.status==='Confirmed' && l.status!=='Confirmed') data.confirmedAt = new Date().toISOString();
    if(data.status==='Canceled' && l.status!=='Canceled'){
      data.cancelDate = fmtDate(new Date());
      if(fee){ data.cancelFeeApplied = fee.applied; data.cancelFee = fee.amount; }
      /* pull the trip off the assigned drivers' schedules and TELL them — a silently vanishing trip is how no-shows happen */
      data.driverId = null; data.returnDriverId = null; data.stopDriverId = null;
      const cxMsg = 'CANCELED: ' + data.first + ' ' + data.last + ' on ' + fmtNice(data.date || l.date) + ' — this trip was canceled and removed from your schedule.';
      if(oldP) insertNotif({driverId:oldP, text:cxMsg});
      if(oldR && oldR !== oldP) insertNotif({driverId:oldR, text:cxMsg});
      if(oldS && oldS !== oldP && oldS !== oldR) insertNotif({driverId:oldS, text:cxMsg});
    }
    if(data.status!=='Canceled'){ data.cancelDate = null; data.cancelFeeApplied = null; data.cancelFee = null; }
    Object.assign(l, data);
    if(l.status==='Confirmed' && !l.clientId){
      const cid = await ensureClientForLead(l);
      if(cid) l.clientId = cid;
    }
    /* v6.22: edits are now AWAITED and verified — a silent write failure used to leave the screen
       claiming success while the database kept the old data (Sandra Clarke address incident) */
    toast('Saving…');
    const {error:upErr} = await sb.from('leads').update(toDb.lead(l)).eq('id', l.id);
    if(upErr){ Object.assign(l, prevSnap); syncErr(upErr); toast('SAVE FAILED — nothing stored. Check your connection and tap Save again.'); render(); return; }
    await refetch('leads');
    toast(l.status==='Pending' ? 'Lead updated' : 'Appointment updated');
    if(l.status==='Confirmed') queueConfirmation(l); else revokeConfirmation(l.id);
    recomputeAround(l, oldP, oldR, oldDate);
    modal=null; render();
  } else {
    if(data.status==='Canceled'){
      const fee = await cancelFeeSheet(data);
      if(!fee) return; /* backed out — form still open with everything typed */
      data.cancelDate = fmtDate(new Date());
      data.cancelFeeApplied = fee.applied; data.cancelFee = fee.amount;
    }
    if(data.status==='Confirmed') data.confirmedAt = new Date().toISOString();
    let dates = [data.date];
    const recSel = $('f-recur');
    if(recSel && recSel.value==='Yes' && repDates.size){
      dates = [...new Set([data.date, ...repDates])].filter(Boolean).sort();
    }
    /* duplicate-booking guard: same person, same date, near-same pickup time already on the books
       (catches re-entry from a second device, "did that save?" double entry, and Duplicate saved without changing the date) */
    const nf = data.first.trim().toLowerCase(), nl = data.last.trim().toLowerCase();
    const tNew = toMin(data.pickupTime);
    const dupHit = leads.find(x =>
      x.status !== 'Canceled' &&
      dates.indexOf(x.date) >= 0 &&
      (x.first||'').trim().toLowerCase() === nf && (x.last||'').trim().toLowerCase() === nl &&
      (tNew == null || toMin(x.pickupTime) == null || Math.abs(toMin(x.pickupTime) - tNew) <= opsNum('dupMin',30))
    );
    if(dupHit){
      const ok = await confirmSheet({
        title: '⚠ Possible Duplicate',
        body: '<div style="margin-bottom:12px"><div style="font-weight:800;font-size:14px">' + esc(data.first) + ' ' + esc(data.last) + '</div>'
          + '<div class="hint" style="margin:4px 0 0">already has a ' + esc(dupHit.status) + ' booking on ' + fmtNice(dupHit.date) + (dupHit.pickupTime ? ' at ' + fmtTime(dupHit.pickupTime) : '') + ' for ' + money(dupHit.tripCharge||0) + '.</div></div>',
        yes: 'Create anyway', yesStyle: 'background:#a04b00', no: 'Go back'
      });
      if(!ok) return; /* form still open with everything typed */
    }
    const dupSrc = modal.dupFromId ? leads.find(x=>x.id===modal.dupFromId) : null;
    const carryDriver = dupSrc ? dupSrc.driverId : null;
    let cid = modal.clientId || null;
    if(!cid && data.status==='Confirmed'){
      cid = await ensureClientForLead(data);
    }
    const rows = dates.map(dt => toDb.lead(Object.assign({}, data, {
      clientNotes: cid ? ((clients.find(c=>c.id===cid)||{}).notes||'') : '', /* v6.26: profile notes ride onto the trip for the driver */
      date:dt, driverId:carryDriver, clientId:cid, outDone:false, retDone:false,
      reviewDone: !!(cid && (clients.find(c=>c.id===cid)||{}).reviewDone), /* v6.44: reviewed clients never get review texts on new bookings */
      age: (dupSrc && dupSrc.age) ? dupSrc.age : '', /* age box is gone — duplicates keep the source trip's age so old age-only clients still pass the confirmation check */
      cancelDate:data.cancelDate||null, arrivedAt:null, departedAt:null, actualWaitMin:null, driverNotes:''
    })));
    toast('Saving…');
    const {data:ins, error} = await sb.from('leads').insert(rows).select('id');
    if(error){ syncErr(error); return; }
    if(carryDriver && data.status==='Confirmed'){
      insertNotif({driverId:carryDriver,
        text:`New trip assigned: ${data.first} ${data.last} — ${fmtNice(dates[0])}, pickup ${fmtTime(data.pickupTime)}`});
    }
    await refetch('leads');
    if(data.status==='Confirmed' && ins) ins.forEach(r=>{ const nl = leads.find(x=>x.id===r.id); if(nl) queueConfirmation(nl); }); /* owner decision: every date gets its own confirmation */
    if(carryDriver && data.status==='Confirmed') dates.forEach(dt => recomputeReportTime(carryDriver, dt));
    toast(dates.length>1 ? dates.length+' recurring trips created' : (dupSrc?'Booking duplicated':modal.asAppt?'Appointment created':'Lead added'));
    modal=null; render();
  }
}
/* v6.51: one-tap cancel from the trip detail — no trip through the edit form. Runs the IDENTICAL
   path as canceling via Edit: the cancellation-fee sheet (same-day = full charge preselected,
   earlier = free), driver unassign + CANCELED notifications, verified save, confirmation revoke. */
async function cancelAppointment(id){
  const pre = liveLead(id); if(!pre) return;
  if(pre.status==='Canceled'){ toast('Already canceled'); return; }
  const fee = await cancelFeeSheet(pre);
  if(!fee) return; /* backed out — nothing changes */
  const l = liveLead(id); if(!l){ toast('This booking was deleted on another device'); return; }
  const oldP = l.driverId, oldR = l.tripType==='Round Trip' ? retDriverOf(l) : null, oldDate = l.date;
  const oldS = hasStop(l) ? l.stopDriverId : null;
  l.status = 'Canceled'; l.cancelDate = fmtDate(new Date());
  l.cancelFeeApplied = fee.applied; l.cancelFee = fee.amount;
  l.driverId = null; l.returnDriverId = null; l.stopDriverId = null;
  const cxMsg = 'CANCELED: ' + l.first + ' ' + l.last + ' on ' + fmtNice(l.date) + ' — this trip was canceled and removed from your schedule.';
  if(oldP) insertNotif({driverId:oldP, text:cxMsg});
  if(oldR && oldR !== oldP) insertNotif({driverId:oldR, text:cxMsg});
  if(oldS && oldS !== oldP && oldS !== oldR) insertNotif({driverId:oldS, text:cxMsg});
  toast('Saving…');
  const {error:upErr} = await sb.from('leads').update(toDb.lead(l)).eq('id', l.id);
  if(upErr){ syncErr(upErr); await refetch('leads'); toast('CANCEL FAILED — nothing stored. Check your connection and try again.'); render(); return; }
  await refetch('leads');
  revokeConfirmation(l.id);
  recomputeAround(l, oldP, oldR, oldDate);
  render();
  toast('Appointment canceled' + (fee.applied ? ' — ' + money(fee.amount) + ' fee applies' : ' — no charge'));
}
function deleteLead(id){
  const l = leads.find(x=>x.id===id);
  const word = l && l.status==='Confirmed' ? 'appointment' : 'lead'; /* v6.50: same record, honest label */
  if(!confirm('Delete this ' + word + '? This removes the trip completely — it will not appear anywhere, including Sales.')) return;
  revokeConfirmation(id);
  const p = l ? l.driverId : null, r = l && l.tripType==='Round Trip' ? retDriverOf(l) : null, day = l ? l.date : null;
  leads = leads.filter(x=>x.id!==id);
  delLeadDb(id);
  if(day){ if(p) recomputeReportTime(p, day); if(r && r!==p) recomputeReportTime(r, day); }
  modal=null; render(); toast(word==='appointment' ? 'Appointment deleted' : 'Lead deleted');
}

/* ================= SQUARE PAYMENTS (cards live in Square's vault, never here) ================= */
async function payFn(action, payload){
  try{
    const {data:{session}} = await sb.auth.getSession();
    if(!session) return {error:'not logged in'};
    const res = await fetch(SB_URL + '/functions/v1/payments', {
      method:'POST',
      headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + session.access_token},
      body: JSON.stringify(Object.assign({action:action}, payload||{}))
    });
    return await res.json();
  }catch(e){ console.error(e); return {error:'connection problem — try again'}; }
}
let sqSdkP = null, sqCardEl = null;
function loadSquareSdk(){
  if(window.Square) return Promise.resolve();
  if(sqSdkP) return sqSdkP;
  sqSdkP = new Promise((res, rej)=>{
    const sc = document.createElement('script');
    sc.src = SQ.env==='sandbox' ? 'https://sandbox.web.squarecdn.com/v1/square.js' : 'https://web.squarecdn.com/v1/square.js';
    sc.onload = res;
    sc.onerror = ()=>{ sqSdkP = null; rej(new Error('sdk load failed')); };
    document.head.appendChild(sc);
  });
  return sqSdkP;
}
async function sqStartAdd(clientId){
  modal.sqAdding = true; render();
  try{
    await loadSquareSdk();
    const payments = window.Square.payments(SQ.appId, SQ.locationId || undefined);
    sqCardEl = await payments.card();
    await sqCardEl.attach('#sq-card');
  }catch(e){ console.error(e); toast('Could not load the Square card form — check Settings → Payments (Square)'); modal.sqAdding = false; sqCardEl = null; render(); }
}
function sqCancelAdd(){ modal.sqAdding = false; sqCardEl = null; render(); }
async function sqSaveCard(clientId){
  if(!sqCardEl){ toast('Card form is still loading — one second'); return; }
  if(busyGate()){ toast('Saving…'); return; }
  toast('Saving card to Square…');
  try{
    const r = await sqCardEl.tokenize();
    if(r.status !== 'OK'){ toast('Card not accepted — check the number, expiry and CVV'); return; }
    const primary = $('sq-primary') ? $('sq-primary').checked : true;
    const out = await payFn('save-card', {clientId:clientId, token:r.token, primary:primary});
    if(out.error){ toast(out.error); return; }
    modal.sqAdding = false; sqCardEl = null;
    await refetch('clients'); render(); toast('Card saved ✓');
  }catch(e){ console.error(e); toast('Could not save the card — try again'); }
}
async function sqSetPrimary(clientId, cardId){
  const out = await payFn('set-primary', {clientId:clientId, cardId:cardId});
  if(out.error){ toast(out.error); return; }
  await refetch('clients'); render(); toast('Primary card updated');
}
async function sqDeleteCard(clientId, cardId){
  if(!confirm('Remove this card from Square? This cannot be undone.')) return;
  const out = await payFn('delete-card', {clientId:clientId, cardId:cardId});
  if(out.error){ toast(out.error); return; }
  await refetch('clients'); render(); toast('Card removed');
}
function chargeCard(leadId){
  const l = liveLead(leadId); if(!l) return;
  const c = l.clientId ? clients.find(x=>x.id===l.clientId) : null;
  if(!((c && c.sqCards) || []).length){ toast('No Square card on file for this client'); return; }
  modal = {type:'paySheet', mode:'charge', leadId:leadId};
  render();
}
async function doChargeCard(){
  const l = liveLead(modal.leadId); if(!l) return;
  const c = l.clientId ? clients.find(x=>x.id===l.clientId) : null;
  const cards = (c && c.sqCards) || [];
  const card = cards.find(x=>x.primary) || cards[0];
  if(!card){ toast('No card on file'); return; }
  const amt = Math.round((+$('ps-amount').value)*100)/100;
  if(!(amt > 0)){ toast('Enter a valid amount'); return; }
  if(busyGate()){ toast('Working…'); return; }
  const btn = $('ps-go'); if(btn){ btn.disabled = true; btn.textContent = 'Charging…'; }
  const out = await payFn('charge', {leadId:l.id, amount:amt, cardId:card.id});
  if(out.error){ toast('Charge failed: ' + out.error); if(btn){ btn.disabled=false; btn.textContent='Charge card'; } return; }
  await refetch('leads');
  modal = null; render(); toast('Charged ' + money(out.amount) + ' to ' + out.card + ' ✓');
}
function invoiceDesc(l){
  return (l.tripKind||'Wheelchair') + ' Transportation — ' + (l.tripType==='Round Trip'?'Roundtrip':'One Way') + ' — ' + fmtNice(l.date);
}
async function sendInvoice(leadId){
  const l = liveLead(leadId); if(!l) return;
  if(!l.clientId){ toast('Link this trip to a client profile first'); return; }
  const c = clients.find(x=>x.id===l.clientId); if(!c) { toast('Client profile not found'); return; }
  if(!c.email && l.email){
    /* trip has an email the profile lacks — save it up so Square can deliver */
    await sb.from('clients').update({email:l.email}).eq('id', c.id);
    await refetch('clients');
  }
  const cc = clients.find(x=>x.id===l.clientId);
  if(!cc.email){ toast('Client needs an email on file — add one to the profile'); return; }
  const amt = l.status==='Canceled' ? revenueOf(l) : totalCharge(l);
  if(!(amt > 0)){ toast('Nothing to invoice on this trip'); return; }
  const ok = await confirmSheet({
    title: 'Send Square Invoice',
    body: '<div style="margin-bottom:12px"><div style="font-weight:800;font-size:14px">' + money(amt) + ' to ' + esc(cc.email) + '</div>'
      + '<div class="hint" style="margin:4px 0 0">Square emails a secure pay-online link. The trip marks itself paid when they pay.</div></div>',
    yes: 'Send invoice', no: 'Go back'
  });
  if(!ok) return;
  if(busyGate()){ toast('Working…'); return; }
  toast('Creating invoice…');
  const out = await payFn('invoice-create', {clientId:cc.id, lines:[{leadId:l.id, amount:amt, desc:invoiceDesc(l)}]});
  if(out.error){ toast('Invoice failed: ' + out.error); render(); return; }
  await refetch('leads');
  render(); toast('Invoice sent ✓' + (out.number ? ' #' + out.number : ''));
}
async function invoiceClientUnpaid(clientId){
  const c = clients.find(x=>x.id===clientId); if(!c) return;
  if(!c.email){ toast('Add an email to this profile first'); return; }
  const due = leads.filter(l=>l.clientId===clientId && dueNow(l) && !hasOpenInvoice(l));
  if(!due.length){ toast('No unpaid trips for this client'); return; }
  const lines = due.map(l=>({leadId:l.id, amount:(l.status==='Canceled'?revenueOf(l):totalCharge(l)), desc:invoiceDesc(l)}));
  const total = lines.reduce((a,x)=>a+x.amount, 0);
  const ok = await confirmSheet({
    title: 'Send One Invoice',
    body: '<div style="margin-bottom:12px"><div style="font-weight:800;font-size:14px">' + lines.length + ' unpaid trip' + (lines.length>1?'s':'') + ' — ' + money(total) + '</div>'
      + '<div class="hint" style="margin:4px 0 0">One Square invoice to ' + esc(c.email) + '</div></div>'
      + '<div class="detail-grid" style="margin-bottom:12px">' + due.map(l=>'<div class="drow"><span class="k">' + fmtNice(l.date) + '</span><span class="v"><b>' + money(l.status==='Canceled'?revenueOf(l):totalCharge(l)) + '</b></span></div>').join('') + '</div>',
    yes: 'Send invoice', no: 'Go back'
  });
  if(!ok) return;
  if(busyGate()){ toast('Working…'); return; }
  toast('Creating invoice…');
  const out = await payFn('invoice-create', {clientId:clientId, lines:lines, dueDays:7});
  if(out.error){ toast('Invoice failed: ' + out.error); render(); return; }
  await refetch('leads');
  render(); toast('Invoice sent ✓' + (out.number ? ' #' + out.number : '') + ' — ' + money(total));
}
function markPaidZelle(leadId){
  const l = liveLead(leadId); if(!l) return;
  if(l.paidAt){ toast('Already marked paid'); return; }
  modal = {type:'paySheet', mode:'zelle', leadId:leadId};
  render();
}
async function doMarkZelle(){
  const l = liveLead(modal.leadId); if(!l) return;
  if(l.paidAt){ toast('Already marked paid'); modal=null; render(); return; }
  const amt = Math.round((+$('ps-amount').value)*100)/100;
  if(!(amt > 0)){ toast('Enter a valid amount'); return; }
  const dStr = $('ps-date').value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dStr) || isNaN(new Date(dStr+'T12:00:00'))){ toast('Pick the date received'); return; }
  if(busyGate()){ toast('Working…'); return; }
  const {data, error} = await sb.from('leads').update({paid_at:new Date(dStr+'T12:00:00').toISOString(), paid_amount:amt, paid_method:'zelle'}).eq('id', l.id).is('paid_at', null).select('id');
  if(error){ toast('Could not save: ' + error.message); return; }
  await refetch('leads');
  modal = null; render();
  if(!data || !data.length){ toast('This trip was already marked paid on another device'); return; }
  toast('Marked paid — Zelle ' + money(amt) + ' ✓');
}
function paySheetHTML(){
  const l = leads.find(x=>x.id===modal.leadId);
  if(!l) return '<div class="hint">This trip no longer exists.</div>';
  const def = (l.status==='Canceled' ? revenueOf(l) : totalCharge(l)).toFixed(2);
  const c = l.clientId ? clients.find(x=>x.id===l.clientId) : null;
  const card = c ? ((c.sqCards||[]).find(x=>x.primary) || (c.sqCards||[])[0]) : null;
  const head = `<div style="margin-bottom:14px"><div style="font-weight:800;font-size:14px">${esc(l.first)} ${esc(l.last)} — ${fmtNice(l.date)}</div>
    <div class="hint" style="margin:2px 0 0">Trip total: <b>${money(l.status==='Canceled'?revenueOf(l):totalCharge(l))}</b></div></div>`;
  if(modal.mode==='charge'){
    return head + `
    <div class="fgroup"><label>Amount to charge ($)</label><input id="ps-amount" type="number" min="0.01" step="0.01" value="${def}"></div>
    <div class="hint" style="margin-bottom:12px">Charging ${card ? esc(card.brand||'card') + ' ····' + esc(card.last4||'') : 'the card on file'} in Square. The client gets their receipt by email automatically.</div>
    <button id="ps-go" class="btn-primary" style="background:var(--green)" onclick="doChargeCard()">Charge card</button>
    <button class="btn-mini ghost" style="margin-top:10px" onclick="closeModal()">Cancel</button>`;
  }
  return head + `
    <div class="fgroup"><label>Zelle amount received ($)</label><input id="ps-amount" type="number" min="0.01" step="0.01" value="${def}"></div>
    <div class="fgroup"><label>Date received</label><input id="ps-date" type="date" value="${fmtDate(new Date())}"></div>
    <button id="ps-go" class="btn-primary" onclick="doMarkZelle()">Mark paid — Zelle</button>
    <button class="btn-mini ghost" style="margin-top:10px" onclick="closeModal()">Cancel</button>`;
}
async function checkInvoices(quiet){
  const open = leads.some(l=>hasOpenInvoice(l));
  if(!open){ if(!quiet) toast('No open invoices to check'); return; }
  if(!quiet) toast('Checking with Square…');
  const out = await payFn('invoice-status', {});
  if(out.error){ if(!quiet) toast(out.error); return; }
  await refetch('leads');
  const paid = (out.checked||[]).filter(x=>x.status==='PAID').length;
  if(!quiet || paid){ render(); }
  if(!quiet) toast(paid ? paid + ' invoice' + (paid>1?'s':'') + ' paid ✓' : 'No new payments yet');
  else if(paid) toast(paid + ' invoice' + (paid>1?'s':'') + ' paid since last check ✓');
}
async function cancelInvoice(leadId){
  if(!confirm('Cancel this Square invoice? The client will no longer be able to pay it, and the trip goes back to Not collected.')) return;
  if(busyGate()){ toast('Working…'); return; }
  const out = await payFn('invoice-cancel', {leadId:leadId});
  if(out.error){ toast(out.error); return; }
  await refetch('leads');
  render(); toast('Invoice canceled');
}
function squareHTML(){
  return `
    <div class="fsection">Square Connection</div>
    <div class="hint" style="margin-bottom:12px">Cards live in Square's vault — never in this app. Get these two IDs at <b>developer.squareup.com</b> → your application. The <b>Access Token</b> from the same page goes into Supabase → Edge Functions → Secrets as <b>SQUARE_ACCESS_TOKEN</b> — never paste it here or in chat.</div>
    <div class="fgroup"><label>Application ID</label><input id="sq-appid" value="${esc(SQ.appId)}" autocomplete="off"></div>
    <div class="fgroup"><label>Location ID</label><input id="sq-locid" value="${esc(SQ.locationId)}" autocomplete="off"></div>
    <div class="fgroup"><label>Environment</label>
      <select id="sq-env">
        <option value="production" ${SQ.env!=='sandbox'?'selected':''}>Production — real charges</option>
        <option value="sandbox" ${SQ.env==='sandbox'?'selected':''}>Sandbox — testing only</option>
      </select></div>
    <button class="btn-primary" onclick="saveSquare()">Save</button>
    <button class="btn-mini ghost" style="margin-top:10px" onclick="testSquare()">Test connection</button>
    <div class="hint" id="sq-test" style="margin-top:8px"></div>`;
}
/* ---- v6.26 batch: Fleet Mileage (Settings) — per-van daily miles from driver clock entries ---- */
function shiftMiles(s){ return (s.startMiles!=null && s.endMiles!=null && s.endMiles >= s.startMiles) ? s.endMiles - s.startMiles : null; }
function fleetMilesHTML(){
  const [ws] = weekRangeOf(today);
  const rows = vehicles.filter(v=>v.active!==false).map(v=>{
    const vs = shifts.filter(s=>s.vanImei===v.imei);
    const withEnd = vs.filter(s=>s.endMiles!=null).sort((a,b)=>b.in-a.in);
    const odo = withEnd.length ? withEnd[0].endMiles : null;
    const wk = vs.filter(s=>fmtDate(new Date(s.in))>=ws).reduce((a,s)=>a+(shiftMiles(s)||0),0);
    return `<button class="set-item" onclick="modal={type:'fleetMilesVan',imei:'${v.imei}',fmYear:${new Date().getFullYear()},fmFrom:'',fmTo:''};render()">
      <span>${esc(vanLabel(v))}<br><span class="hint">${odo!=null?'Odometer '+odo.toLocaleString():'No mileage logged yet'} · ${Math.round(wk).toLocaleString()} mi this week</span></span><span class="arr">›</span></button>`;
  }).join('');
  return `${rows || '<div class="empty">No active vans. Vans come from the Fleet tab.</div>'}
    <div class="hint" style="margin-top:10px">Numbers come from drivers' clock-in and clock-out mileage entries.</div>`;
}
function fleetVanHTML(imei){
  const m = modal;
  const all = shifts.filter(s=>s.vanImei===imei && shiftMiles(s)!=null).sort((a,b)=>b.in-a.in);
  const years = [...new Set(all.map(s=>new Date(s.in).getFullYear()))].sort((a,b)=>b-a);
  const ranged = (m.fmFrom && m.fmTo && m.fmFrom <= m.fmTo);
  const list = ranged
    ? all.filter(s=>{ const d=fmtDate(new Date(s.in)); return d>=m.fmFrom && d<=m.fmTo; })
    : all.filter(s=>new Date(s.in).getFullYear()===m.fmYear);
  const total = list.reduce((a,s)=>a+shiftMiles(s),0);
  const header = ranged ? `${fmtNice(m.fmFrom)} – ${fmtNice(m.fmTo)}` : String(m.fmYear);
  return `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
      <select style="width:auto" onchange="modal.fmYear=+this.value;modal.fmFrom='';modal.fmTo='';render()">${(years.length?years:[new Date().getFullYear()]).map(y=>`<option ${!ranged&&m.fmYear===y?'selected':''}>${y}</option>`).join('')}</select>
      <span class="hint" style="font-weight:700">${header} · ${Math.round(total).toLocaleString()} mi</span>
    </div>
    <div class="detail-grid">
      ${list.map(s=>`<div class="drow"><span class="k">${fmtNice(fmtDate(new Date(s.in)))}<br><span class="hint">${esc(driverName(s.driverId))}</span></span>
        <span class="v">${Math.round(shiftMiles(s)).toLocaleString()} mi <span class="hint">(${s.startMiles.toLocaleString()} → ${s.endMiles.toLocaleString()})</span></span></div>`).join('') || '<div class="empty">No mileage entries for this period.</div>'}
    </div>
    <div class="fsection">Pick a range</div>
    <div class="frow">
      <div class="fgroup"><label>From</label><input type="date" value="${m.fmFrom||''}" onchange="modal.fmFrom=this.value;pickerRender()"></div>
      <div class="fgroup"><label>To</label><input type="date" value="${m.fmTo||''}" onchange="modal.fmTo=this.value;pickerRender()"></div>
    </div>`;
}
async function saveSquare(){
  const prevSQ = SQ;
  SQ = {appId:$('sq-appid').value.trim(), locationId:$('sq-locid').value.trim(), env:$('sq-env').value};
  if(!(await pushSettingV('square', SQ))){ SQ = prevSQ; return; } /* v6.22: awaited + verified */
  modal=null; render(); toast('Square settings saved');
}
async function testSquare(){
  const el = $('sq-test'); if(el) el.textContent = 'Testing…';
  const out = await payFn('test', {env:$('sq-env')?$('sq-env').value:''});
  if(el) el.textContent = out.ok
    ? ('Connected ✓ — locations: ' + (out.locations||[]).map(x=>x.name+' ('+x.id+')').join(', '))
    : ('Not connected: ' + (out.error || 'unknown error'));
}

/* ================= CANCEL FEE & CONFIRMATION EMAILS ================= */
/* Generic confirm sheet — replaces browser confirm() popups. Same overlay mechanics as the
   cancel-fee sheet (floats on document.body above any open form, promise-based answer):
   resolves true = proceed, false = backed out (X, backdrop, or the Go back button). */
function confirmSheet(o){
  return new Promise(function(res){
    const prev = document.getElementById('csh-wrap'); if(prev) prev.remove();
    const wrap = document.createElement('div');
    wrap.id = 'csh-wrap'; wrap.className = 'overlay'; wrap.style.zIndex = '60';
    wrap.innerHTML = '<div class="sheet"><div class="sheet-head"><h3>' + (o.title || 'Please confirm') + '</h3><button class="x" id="csh-x">✕</button></div><div class="sheet-body">'
      + (o.body || '')
      + '<button id="csh-yes" class="btn-primary"' + (o.yesStyle ? ' style="' + o.yesStyle + '"' : '') + '>' + (o.yes || 'Confirm') + '</button>'
      + '<button id="csh-no" class="btn-mini ghost" style="margin-top:10px;width:100%">' + (o.no || 'Go back') + '</button>'
      + '</div></div>';
    let settled = false;
    function done(v){ if(settled) return; settled = true; wrap.remove(); res(v); }
    wrap.addEventListener('click', function(ev){ if(ev.target === wrap) done(false); });
    document.body.appendChild(wrap);
    document.getElementById('csh-x').onclick = function(){ done(false); };
    document.getElementById('csh-no').onclick = function(){ done(false); };
    document.getElementById('csh-yes').onclick = function(){ done(true); };
  });
}
/* Cancel-fee sheet — replaces the old browser confirm/prompt pair. Renders as an
   independent overlay ABOVE the open booking form (the form and everything typed in it
   stay untouched underneath — this floats on document.body, outside #app, so realtime
   re-renders can't kill it) and hands the answer back to saveLead as a promise:
   {applied,amount} = save continues · null = user backed out, booking stays as it was. */
function cancelFeeSheet(l){
  return new Promise(function(res){
    const prev = document.getElementById('cfee-wrap'); if(prev) prev.remove(); /* never two at once */
    const sameDay = l.date && l.date === fmtDate(new Date());
    const full = totalCharge(l);
    const wrap = document.createElement('div');
    wrap.id = 'cfee-wrap';
    wrap.className = 'overlay';
    wrap.style.zIndex = '60';
    wrap.innerHTML = `
    <div class="sheet">
      <div class="sheet-head"><h3>Cancellation Fee</h3><button class="x" id="cfee-x">✕</button></div>
      <div class="sheet-body">
        <div style="margin-bottom:14px"><div style="font-weight:800;font-size:14px">${esc(l.first||'')} ${esc(l.last||'')} — ${l.date ? fmtNice(l.date) : 'no date'}</div>
        <div class="hint" style="margin:2px 0 0">${sameDay ? 'Same-day cancellation — the full trip total may be charged.' : 'Canceling before the trip day is normally free.'}</div></div>
        <div class="fgroup"><label>Fee amount ($)</label><input id="cfee-amount" type="number" min="0" step="0.01" value="${full.toFixed(2)}"></div>
        <div class="hint" style="margin-bottom:12px">Trip total is ${money(full)}. Change the amount to override.</div>
        <button id="cfee-yes" class="btn-primary">Charge the fee</button>
        <button id="cfee-no" class="btn-primary" style="background:#6b7280">Cancel trip — no fee</button>
        <button id="cfee-back" class="btn-mini ghost" style="margin-top:10px;width:100%">Go back — keep this booking</button>
      </div>
    </div>`;
    let settled = false;
    function done(v){ if(settled) return; settled = true; wrap.remove(); res(v); }
    wrap.addEventListener('click', function(ev){ if(ev.target === wrap) done(null); });
    document.body.appendChild(wrap);
    document.getElementById('cfee-x').onclick = function(){ done(null); };
    document.getElementById('cfee-back').onclick = function(){ done(null); };
    document.getElementById('cfee-no').onclick = function(){ done({applied:false, amount:0}); };
    document.getElementById('cfee-yes').onclick = function(){
      const s = String(document.getElementById('cfee-amount').value).trim();
      const v = +s;
      if(s === '' || isNaN(v) || v < 0){ toast('Enter a valid amount'); return; } /* +'' is 0, not NaN — an emptied field must not slip through as a $0 fee */
      done({applied:true, amount:Math.max(0, Math.round(v*100)/100)});
    };
  });
}
function confMissing(l, toEmail){
  const m = [];
  if(!l.pickupTime) m.push('pickup time');
  if(!l.pickup) m.push('pickup address');
  if(!l.dropoff) m.push('drop-off address');
  if(!l.dob && !l.age) m.push('DOB'); /* stored ages on old records still satisfy this; the form only offers DOB now */
  if(!l.weight) m.push('weight');
  if(!(l.first||'').trim() || !(l.last||'').trim()) m.push('client name');
  if(!(l.contactName||'').trim()) m.push('contact name');
  if(!l.phone1 && !l.phone2) m.push('phone number');
  if(!(toEmail||'').trim()) m.push('email address');
  if(!(totalCharge(l) > 0)) m.push('trip charge');
  return m;
}
/* Queue (or re-queue) the client confirmation email. Every edit resets the 15-minute
   quiet period; the mailer re-verifies completeness right before sending. */
async function queueConfirmation(l){
  if(!currentUser || currentUser.role!=='admin') return;      /* emails table is admin-only */
  if(!l || l.status!=='Confirmed' || !l.id) return;
  if(emailsQ.find(e=>e.leadId===l.id && e.type==='confirmation' && e.status==='sent')) return; /* send once */
  const c = l.clientId ? clients.find(x=>x.id===l.clientId) : null;
  const to = ((c && c.email) || l.email || '').trim();
  const missing = confMissing(l, to);
  const due = new Date(Date.now() + 15*60000).toISOString();
  const row = {to_email:to, client_id:l.clientId||null, due_at: missing.length?null:due, missing: missing.join(', ')};
  /* re-check on the SERVER, not just memory — the mailer may have just sent it */
  const {data:srv} = await sb.from('emails').select('id,status').eq('lead_id', l.id).eq('email_type','confirmation');
  if((srv||[]).some(e=>e.status==='sent')) { refetch('emails'); return; } /* send once, ever */
  const ex = (srv||[]).find(e=>e.status==='pending' || e.status==='failed');
  let error;
  if(ex) ({error} = await sb.from('emails').update(Object.assign(row,{status:'pending',error:''})).eq('id', ex.id).in('status',['pending','failed']));
  else ({error} = await sb.from('emails').insert(Object.assign(row,{lead_id:l.id, email_type:'confirmation', status:'pending'})));
  if(error) syncErr(error); else refetch('emails');
}
/* confirmations for trips whose date already passed will never send and shouldn't haunt the Pending list */
async function voidStaleConfirmations(){
  const td = fmtDate(today);
  const stale = emailsQ.filter(e=>{
    if(e.type!=='confirmation' || e.status!=='pending') return false;
    const l = leads.find(x=>x.id===e.leadId);
    if(!l) return true;               /* booking deleted — orphaned row */
    return !!(l.date && l.date < td); /* trip already happened */
  });
  if(!stale.length) return;
  const {error} = await sb.from('emails').delete().in('id', stale.map(e=>e.id)).eq('status','pending');
  if(!error){ await refetch('emails'); }
}
async function sendManualReceipt(leadId){
  const l = liveLead(leadId); if(!l) return;
  const c = l.clientId ? clients.find(x=>x.id===l.clientId) : null;
  const def = ((c && c.email) || l.email || '').trim();
  const to = prompt('Email this receipt to:', def);
  if(to === null) return;
  if(!to.includes('@')){ toast('That is not an email address'); return; }
  if(busyGate()){ toast('Sending…'); return; }
  const {error} = await sb.from('emails').insert({email_type:'receipt', lead_id:l.id, client_id:l.clientId||null, to_email:to.trim(), status:'pending', due_at:new Date().toISOString()});
  if(error){ syncErr(error); return; }
  await refetch('emails'); render();
  toast('Receipt queued to ' + to.trim() + ' — sends within a minute');
}
async function sendTestEmail(){
  const to = prompt('Send a test email to:', GMAIL_FROM);
  if(to === null) return;
  if(!to.includes('@')){ toast('That is not an email address'); return; }
  if(busyGate()){ toast('Sending…'); return; }
  const {error} = await sb.from('emails').insert({email_type:'test', to_email:to.trim(), status:'pending', due_at:new Date().toISOString()});
  if(error){ syncErr(error); return; }
  await refetch('emails'); render();
  toast('Test email queued — it sends within about a minute');
}
const GMAIL_FROM = 'royaltymedicaltrans@gmail.com';

/* ================= ADMIN: APPOINTMENTS ================= */
function inFilter(ds){
  const d = new Date(ds+'T00:00:00');
  const y = new Date(today); y.setDate(y.getDate()-1);
  if(apptFilter==='today') return ds===fmtDate(today);
  if(apptFilter==='yesterday') return ds===fmtDate(y);
  if(apptFilter==='week'){ const s=new Date(today); s.setDate(s.getDate()-s.getDay()); const e=new Date(s); e.setDate(e.getDate()+6); return d>=s && d<=e; }
  if(apptFilter==='month') return d.getMonth()===today.getMonth() && d.getFullYear()===today.getFullYear();
  return d.getFullYear()===today.getFullYear();
}
function apptBadge(l){
  if(l.status==='Canceled') return '<span class="badge canceled">Canceled</span>';
  if(l.status==='No Show') return '<span class="badge noshow">No Show</span>';
  if(isDone(l)) return '<span class="badge completed">Completed</span>';
  return `<span class="badge gold">${fmtTime(l.pickupTime)}</span>`;
}
function apptsView(){
  const q = search.appts.trim();
  if(q) ensureAllLeads(); /* a name search must cover ALL history, not just the window */
  else if(apptFilter==='year') ensureLeadsFrom(today.getFullYear() + '-01-01'); /* Year pill reaches past the window */
  /* v6.29: Year (and any long/searched view) sorts NEWEST first so the 300-row display cap keeps
     the recent + upcoming trips — the old ascending sort kept the OLDEST 300, so a busy year
     chopped off the current months entirely (471 trips → Jan–mid-May shown, Jun–Aug hidden). */
  const newestFirst = apptFilter==='year' || !!q;
  const items = leads.filter(l=>['Confirmed','Canceled'].includes(l.status) /* No Show lives in Leads → No Show */
      && (q ? matchName(l.first,l.last,q) : inFilter(l.date)))
    .sort((a,b)=> newestFirst
      ? (b.date+b.pickupTime).localeCompare(a.date+a.pickupTime)
      : (a.date+a.pickupTime).localeCompare(b.date+b.pickupTime));
  const revenue = items.reduce((s,l)=>s+revenueOf(l), 0);
  const apCap = 300, apTotal = items.length, apOver = apTotal > apCap;
  if(apOver) items.length = apCap; /* revenue above already counted every trip; cap now keeps the most recent */
  const pills = [['today','Today'],['yesterday','Yesterday'],['week','Week'],['month','Month'],['year','Year']]
    .map(([k,lb])=>`<button class="${apptFilter===k?'active':''}" onclick="apptFilter='${k}';render()">${lb}</button>`).join('');
  const grouped = q || (apptFilter!=='today' && apptFilter!=='yesterday');
  let list='', lastDate='';
  items.forEach(l=>{
    if(l.date!==lastDate && grouped){ list+=`<div class="date-group">${fmtNice(l.date)}${q && l.date>=fmtDate(today)?'':''}</div>`; lastDate=l.date; }
    list += `
    <div class="card" onclick="modal={type:'apptDetail',leadId:${l.id}};render()">
      <div class="row1">
        <div class="name">${esc(l.first)} ${esc(l.last)}</div>
        ${apptBadge(l)}
      </div>
      <div class="meta"><span>Pickup ${fmtTime(l.pickupTime)}</span><span>${esc(driverName(l.driverId))}</span></div>
    </div>`;
  });
  const alerts = unreadAdmin();
  const running = runningLongWaits();
  const alertHTML = (alerts.length || running.length) ? `
    <div class="notifbar">
      <div class="nb-title">🔔 Driver Updates &amp; Alerts</div>
      ${running.map(l=>`<div class="nb-item" style="color:var(--red)">• <b>${esc(l.first)} ${esc(l.last)}</b> — wait timer still running, over 2 hours (started ${fmtClock(l.arrivedAt)}, ${esc(driverName(l.driverId))})</div>`).join('')}
      ${alerts.map(n=>`<div class="nb-item">• ${esc(n.text)}</div>`).join('')}
      ${alerts.length?`<button class="btn-mini" style="margin-top:8px" onclick="markAdminNotifsRead()">Dismiss All</button>`:''}
    </div>`:'';
  const pendEmails = emailsQ.filter(e=>e.status==='pending' || e.status==='failed').length;
  const viewToggle = `
    <div class="pills" style="margin-bottom:10px">
      <button class="${apptView==='list'?'active':''}" onclick="apptView='list';render()">List</button>
      <button class="${apptView==='board'?'active':''}" onclick="apptView='board';render()">Day Board</button>
      <button class="${apptView==='emails'?'active':''}" onclick="apptView='emails';render()">Emails${pendEmails?' ('+pendEmails+')':''}</button>
      <button class="${apptView==='texts'?'active':''}" onclick="apptView='texts';ensureTexts();render()">Texts</button>
    </div>`;
  if(apptView==='emails'){
    return `
    <div class="section-head"><div><h2>Appointments</h2><div class="count">Client emails — confirmations &amp; daily receipts</div></div></div>
    ${alertHTML}
    ${viewToggle}
    ${emailsHTML()}`;
  }
  if(apptView==='texts'){
    return `
    <div class="section-head"><div><h2>Appointments</h2><div class="count">Text messages — follow-up automation</div></div></div>
    ${alertHTML}
    ${viewToggle}
    ${textsHTML()}`;
  }
  if(apptView==='board'){
    return `
    <div class="section-head"><div><h2>Appointments</h2><div class="count">Dispatch board — one column per driver</div></div></div>
    ${alertHTML}
    ${viewToggle}
    ${boardHTML()}`;
  }
  return `
    <div class="section-head"><div><h2>Appointments</h2><div class="count">${items.length} trips in view · Revenue ${money(revenue)}</div></div></div>
    ${alertHTML}
    ${viewToggle}
    ${searchBar('search-appts','appts','Search all appointments by client name…')}
    ${q ? `<div class="count" style="margin-bottom:10px">Showing every past &amp; future appointment for “${esc(q)}”</div>` : `<div class="pills">${pills}</div>`}
    ${apOver ? `<div class="hint" style="margin-bottom:8px">Showing the ${newestFirst?'most recent':'first'} ${300} of ${apTotal} trips in this range — revenue above counts them all. Narrow the range or search a name for the rest.</div>` : ''}
    ${list || (q?'<div class="empty">No appointments found for that name.</div>':'<div class="empty">No appointments in this range.</div>')}`;
}

function emailRow(e){
  const l = e.leadId ? leads.find(x=>x.id===e.leadId) : null;
  const bc = (!l && e.type==='birthday' && e.clientId) ? clients.find(x=>x.id===e.clientId) : null;
  const who = l ? esc(l.first)+' '+esc(l.last) : bc ? esc(bc.first)+' '+esc(bc.last) : (e.type==='receipt' ? 'Daily receipt' : e.type==='confirmation' ? 'Deleted booking' : e.type==='birthday' ? 'Birthday' : 'Test email');
  const open = l ? `onclick="modal={type:'apptDetail',leadId:${l.id}};render()"` : (bc ? `onclick="openClientForm(${bc.id})"` : '');
  const typeTag = e.type==='confirmation' ? 'Confirmation' : e.type==='receipt' ? 'Receipt' : e.type==='review' ? 'Review link' : e.type==='birthday' ? (e.redeemed ? '🎂 Birthday · gift used' : '🎂 Birthday') : 'Test';
  let line;
  if(e.status==='sent') line = `<span style="color:var(--green)">✓ Sent ${e.sentAt?fmtClock(e.sentAt)+' · '+fmtNice(fmtDate(new Date(e.sentAt))):''}</span>`;
  else if(e.status==='failed') line = `<span style="color:var(--red)">✕ Failed — ${esc(e.error||'unknown error')} · retries automatically</span>`;
  else if(e.missing) line = `<span style="color:var(--red)">Waiting on: <b>${esc(e.missing)}</b>${l?' — tap to complete':''}</span>`;
  else if(e.dueAt) line = `<span style="color:var(--amber-dk,#9a6a00)">Sends ${fmtClock(e.dueAt)} (15-min quiet period — any edit restarts it)</span>`;
  else line = '<span>Queued</span>';
  return `
    <div class="card" ${open} style="${l?'':'cursor:default'}">
      <div class="row1">
        <div class="name">${who}</div>
        <span class="badge ${e.status==='sent'?'completed':e.status==='failed'?'canceled':'pending'}">${typeTag}</span>
      </div>
      <div class="meta"><span>${esc(e.to||'no email address')}</span>${e.invoiceNo?`<span>${esc(e.invoiceNo)}</span>`:''}</div>
      <div class="meta" style="margin-top:4px">${line}</div>
      ${e.type==='birthday' && e.status==='sent' ? `<button class="btn-mini ${e.redeemed?'ghost':''}" style="margin-top:8px" onclick="event.stopPropagation();markBdayRedeemed(${e.id}, ${e.redeemed?'false':'true'})">${e.redeemed ? 'Undo gift used' : 'Mark 10% gift used'}</button>` : ''}
      ${l && (e.type==='confirmation'||e.type==='receipt') && (e.status==='sent'||e.status==='failed') ? `<button class="btn-mini ghost" style="margin-top:8px" onclick="event.stopPropagation();resendEmail(${e.id})">Resend / send to another email</button>` : ''}
    </div>`;
}
async function resendEmail(emailId){
  const e = emailsQ.find(x=>x.id===emailId); if(!e || !e.leadId) return;
  const to = prompt('Send this ' + (e.type==='confirmation'?'confirmation':e.type==='review'?'review email':'receipt') + ' to:', e.to||'');
  if(to === null) return;
  if(!to.includes('@')){ toast('That is not an email address'); return; }
  if(busyGate()){ toast('Sending…'); return; }
  const {error} = await sb.from('emails').insert({email_type:e.type, lead_id:e.leadId, client_id:e.clientId||null, to_email:to.trim(), status:'pending', due_at:new Date().toISOString(), missing:'manual-resend'});
  if(error){ syncErr(error); return; }
  await refetch('emails'); render(); toast('Queued — sends within a minute');
}
async function markBdayRedeemed(emailId, val){
  const {error} = await sb.from('emails').update({redeemed: val}).eq('id', emailId);
  if(error){ toast(error.message); return; }
  await refetch('emails');
  render(); toast(val ? 'Marked: birthday gift used ✓' : 'Undone');
}
function emailsHTML(){
  ensureLeadIds(emailsQ.map(e=>e.leadId)); /* old trips referenced by emails may be outside the window — fetch them so rows never mislabel as "Deleted booking" */
  const pend = emailsQ.filter(e=>e.status==='pending' || e.status==='failed')
    .sort((a,b)=>(a.dueAt||'9999').localeCompare(b.dueAt||'9999'));
  const sent = emailsQ.filter(e=>e.status==='sent')
    .sort((a,b)=>(b.sentAt||'').localeCompare(a.sentAt||'')).slice(0,60);
  return `
    <button class="btn-mini" style="margin-bottom:12px" onclick="sendTestEmail()">Send a test email</button>
    <div class="hint" style="margin-bottom:12px">Confirmations go out 15 minutes after a booking is confirmed — only when every required field is filled (pickup time &amp; addresses, DOB, weight, name, contact, phone, email, charge). Receipts go out at 6:00 PM only for trips that have been CHARGED, and only when the charged amount matches the bill — mismatches hold the receipt and ring the bell. All are sent from ${GMAIL_FROM}.</div>
    <div class="fsection">Do not email${emailOptouts.length?' ('+emailOptouts.length+')':''}</div>
    <button type="button" class="btn-mini ghost" style="margin-bottom:8px" onclick="addOptoutEmail()">+ Add an address to the do-not-email list</button>
    ${emailOptouts.length?`<div class="detail-grid" style="margin-bottom:12px">${emailOptouts.slice(0,40).map(o=>`<div class="drow"><span class="k" style="min-width:0;flex-shrink:1">${esc(o.email)}</span><span class="v" style="white-space:nowrap">${o.at?fmtNice(fmtDate(new Date(o.at))):''} <button class="btn-mini ghost" style="padding:2px 8px;font-size:11px" onclick="removeOptoutEmail('${esc(o.email)}')">✕</button></span></div>`).join('')}</div>`:'<div class="hint" style="margin-bottom:12px">Nobody on the list. Blocked addresses get NO automated emails — anything queued to them is held as "optout".</div>'}
    <div class="fsection">Pending${pend.length?' ('+pend.length+')':''}</div>
    ${pend.map(emailRow).join('') || '<div class="empty">Nothing waiting to send.</div>'}
    <div class="fsection">Sent</div>
    ${sent.map(emailRow).join('') || '<div class="empty">No emails sent yet.</div>'}`;
}
/* ---- v6.17: SMS follow-up monitoring (data is admin-RLS; fetched on demand when the Texts view opens) ---- */
async function ensureTexts(){
  const q = await sb.from('sms_queue').select('*').order('id',{ascending:false}).limit(120);
  if(!q.error) smsQueue = q.data||[];
  const o = await sb.from('sms_optouts').select('*').order('at',{ascending:false}).limit(200);
  if(!o.error) smsOptouts = o.data||[];
  const eo = await sb.from('email_optouts').select('*').order('at',{ascending:false}).limit(200);
  if(!eo.error) emailOptouts = eo.data||[];
  smsLoaded = true;
  if(adminTab==='appts' && apptView==='texts' && !modal) render();
}
/* v6.56: do-not-contact controls — admin puts people on the no-text / no-email lists by hand */
function clientNoText(c){
  const ks = [normPhone(c.phone1), normPhone(c.phone2)].filter(p=>p.length===10);
  return ks.length ? ks.some(p=>smsOptouts.some(o=>o.phone===p)) : false;
}
function clientNoEmail(c){
  return !!(c.email && emailOptouts.some(o=>o.email.toLowerCase()===c.email.trim().toLowerCase()));
}
async function toggleDoNotText(clientId){
  const c = clients.find(x=>x.id===clientId); if(!c) return;
  const phones = [normPhone(c.phone1), normPhone(c.phone2)].filter(p=>p.length===10);
  if(!phones.length){ toast('No phone number on this profile'); return; }
  if(clientNoText(c)){
    const stopRows = smsOptouts.filter(o=>phones.includes(o.phone) && o.source!=='manual');
    if(stopRows.length && !confirm('This person texted STOP themselves. Removing them means automated texts can reach them again. Only do this if they asked for it. Continue?')) return;
    const {error} = await sb.from('sms_optouts').delete().in('phone', phones);
    if(error){ syncErr(error); toast('Could not update — try again'); return; }
    smsOptouts = smsOptouts.filter(o=>!phones.includes(o.phone));
    render(); toast('Texts allowed again for ' + c.first);
  } else {
    const rows = phones.map(p=>({phone:p, source:'manual', at:new Date().toISOString()}));
    const {data, error} = await sb.from('sms_optouts').upsert(rows, {onConflict:'phone'}).select();
    if(error || !(data||[]).length){ syncErr(error); toast('Could not save — try again'); return; }
    phones.forEach(p=>{ if(!smsOptouts.some(o=>o.phone===p)) smsOptouts.push({phone:p, source:'manual', at:new Date().toISOString()}); });
    render(); toast('On the do-not-text list — no automated texts will reach ' + c.first);
  }
}
async function toggleDoNotEmail(clientId){
  const c = clients.find(x=>x.id===clientId); if(!c) return;
  const em = (c.email||'').trim().toLowerCase();
  if(!em){ toast('No email on this profile'); return; }
  if(clientNoEmail(c)){
    const {error} = await sb.from('email_optouts').delete().eq('email', em);
    if(error){ syncErr(error); toast('Could not update — try again'); return; }
    emailOptouts = emailOptouts.filter(o=>o.email.toLowerCase()!==em);
    render(); toast('Emails allowed again for ' + c.first);
  } else {
    const {data, error} = await sb.from('email_optouts').upsert({email:em, source:'manual'}, {onConflict:'email'}).select();
    if(error || !(data||[]).length){ syncErr(error); toast('Could not save — try again'); return; }
    emailOptouts.push({email:em, source:'manual', at:new Date().toISOString()});
    /* anything already queued to them gets held too */
    await sb.from('emails').update({status:'optout'}).eq('status','pending').ilike('to_email', em);
    render(); toast('On the do-not-email list — queued and future emails are held for ' + c.first);
  }
}
async function addOptoutNumber(){
  const raw = prompt('Phone number to put on the do-not-text list:');
  if(raw === null) return;
  const p = normPhone(raw);
  if(p.length !== 10){ toast('That is not a full 10 digit number'); return; }
  const {data, error} = await sb.from('sms_optouts').upsert({phone:p, source:'manual', at:new Date().toISOString()}, {onConflict:'phone'}).select();
  if(error || !(data||[]).length){ syncErr(error); toast('Could not save — try again'); return; }
  if(!smsOptouts.some(o=>o.phone===p)) smsOptouts.unshift({phone:p, source:'manual', at:new Date().toISOString()});
  render(); toast('Number added — no automated texts will go there');
}
async function removeOptoutNumber(p){
  const row = smsOptouts.find(o=>o.phone===p);
  const stop = row && row.source!=='manual';
  if(!confirm(stop ? 'This number texted STOP themselves. Removing it means automated texts can reach them again. Continue?' : 'Allow automated texts to this number again?')) return;
  const {error} = await sb.from('sms_optouts').delete().eq('phone', p);
  if(error){ syncErr(error); toast('Could not remove'); return; }
  smsOptouts = smsOptouts.filter(o=>o.phone!==p);
  render(); toast('Removed from the do-not-text list');
}
async function addOptoutEmail(){
  const raw = prompt('Email address to put on the do-not-email list:');
  if(raw === null) return;
  const em = raw.trim().toLowerCase();
  if(!em.includes('@')){ toast('That is not an email address'); return; }
  const {data, error} = await sb.from('email_optouts').upsert({email:em, source:'manual'}, {onConflict:'email'}).select();
  if(error || !(data||[]).length){ syncErr(error); toast('Could not save — try again'); return; }
  if(!emailOptouts.some(o=>o.email===em)) emailOptouts.unshift({email:em, source:'manual', at:new Date().toISOString()});
  await sb.from('emails').update({status:'optout'}).eq('status','pending').ilike('to_email', em);
  render(); toast('Address added — queued and future emails are held');
}
async function removeOptoutEmail(em){
  if(!confirm('Allow emails to ' + em + ' again?')) return;
  const {error} = await sb.from('email_optouts').delete().eq('email', em);
  if(error){ syncErr(error); toast('Could not remove'); return; }
  emailOptouts = emailOptouts.filter(o=>o.email!==em);
  render(); toast('Removed from the do-not-email list');
}
const SMS_KIND_LABEL = { drip:'Lead follow-up', reminder1:'Reminder (day before)', reminder2:'Reminder (morning of)', review:'Review request', review_email:'Review email fallback', rebook:'Rebooking nudge', cancelrec:'Cancel recovery', late:'Driver running late', onmyway:'Driver on the way', arrived:'Driver arrived', admin:'Office alert', test:'Test' };
function smsRow(s){
  const stCol = s.status==='sent'?'var(--green)':s.status==='failed'?'var(--red)':s.status==='skipped'?'var(--muted)':'var(--amber-dk,#9a6a00)';
  const when = s.sent_at ? 'Sent '+fmtNice(fmtDate(new Date(s.sent_at)))+' '+fmtClock(s.sent_at) : s.due_at ? 'Due '+fmtNice(fmtDate(new Date(s.due_at))) : '';
  return `<div class="card" style="cursor:default">
    <div class="row1"><div class="name" style="font-size:14px">${esc(SMS_KIND_LABEL[s.kind]||s.kind)}</div>
      <span class="badge ${s.status==='sent'?'completed':s.status==='failed'?'canceled':'pending'}">${esc(s.status)}</span></div>
    <div class="meta"><span>${esc(phoneFmt(s.to_phone))}</span>${when?`<span>${when}</span>`:''}${s.error?`<span style="color:var(--red)">${esc(s.error)}</span>`:''}</div>
    <div class="hint" style="margin-top:6px">${esc((s.body||'').slice(0,140))}${(s.body||'').length>140?'…':''}</div>
  </div>`;
}
function textsHTML(){
  if(!smsLoaded) return '<div class="hint">Loading texts…</div>';
  const master = SMSCFG.enabled;
  const pend = smsQueue.filter(s=>s.status==='pending').sort((a,b)=>(a.due_at||'').localeCompare(b.due_at||''));
  const done = smsQueue.filter(s=>s.status!=='pending').slice(0,60);
  const banner = master
    ? `<div class="card" style="border-left:4px solid var(--green);cursor:default"><div class="name" style="color:#0d5c33">✓ Text automation is ON</div><div class="hint" style="margin-top:4px">Sends between 9 AM and 7 PM. Manage sequences in Settings → Text Messages.</div></div>`
    : `<div class="card" style="border-left:4px solid var(--amber);cursor:default"><div class="name" style="color:#8a4b00">Text automation is OFF</div><div class="hint" style="margin-top:4px">Nothing sends yet. Turn it on in Settings → Text Messages once your carrier registration is approved.</div></div>`;
  return `
    ${banner}
    <button class="btn-mini ghost" style="margin:10px 0" onclick="ensureTexts()">Refresh</button>
    <div class="fsection">Do not text</div>
    <button type="button" class="btn-mini ghost" style="margin-bottom:8px" onclick="addOptoutNumber()">+ Add a number to the do-not-text list</button>
    ${smsOptouts.length?`<div class="fsection" style="border:none;margin-top:0">Opted out (${smsOptouts.length})</div>
    <div class="hint" style="margin-bottom:8px">These numbers replied STOP and will never be texted. This is automatic.</div>
    <div class="detail-grid" style="margin-bottom:6px">${smsOptouts.slice(0,40).map(o=>`<div class="drow"><span class="k">${esc(phoneFmt(o.phone))} ${o.source==='manual'?'<span style="font-size:10.5px;color:var(--muted)">· added by office</span>':'<span style="font-size:10.5px;color:#a04b00">· texted STOP</span>'}</span><span class="v" style="white-space:nowrap">${o.at?fmtNice(fmtDate(new Date(o.at))):''} <button class="btn-mini ghost" style="padding:2px 8px;font-size:11px" onclick="removeOptoutNumber('${esc(o.phone)}')">✕</button></span></div>`).join('')}</div>`:''}
    <div class="fsection">Waiting to send${pend.length?' ('+pend.length+')':''}</div>
    ${pend.map(smsRow).join('') || '<div class="empty">Nothing waiting.</div>'}
    <div class="fsection">Recent</div>
    ${done.map(smsRow).join('') || '<div class="empty">No texts yet.</div>'}`;
}
function smsHTML(){
  const c = SMSCFG;
  const seqRow = (k,label,desc)=>`<label class="drow" style="align-items:flex-start;cursor:pointer;padding:8px 0">
    <span class="k" style="flex:1"><b>${label}</b><br><span class="hint">${desc}</span></span>
    <span class="v"><input type="checkbox" id="sms-seq-${k}" ${c.seq[k]!==false?'checked':''} style="width:auto;transform:scale(1.3)"></span></label>`;
  return `
    <label class="drow" style="cursor:pointer;padding:10px 0;border-bottom:1px solid var(--line);margin-bottom:12px">
      <span class="k" style="flex:1"><b style="font-size:15px">Text automation</b><br><span class="hint">Master switch. When off, nothing sends no matter the settings below.</span></span>
      <span class="v"><input type="checkbox" id="sms-enabled" ${c.enabled?'checked':''} style="width:auto;transform:scale(1.5)"></span></label>
    <div class="hint" style="margin-bottom:12px;color:${c.enabled?'#0d5c33':'#8a4b00'}">${c.enabled?'ON — texts are sending (8 AM to 9 PM). Nobody gets two texts within 4 hours.':'OFF — nothing sends, no matter the settings below.'}</div>
    <div class="fgroup"><label>Sender name (used in the messages)</label><input id="sms-sender" value="${esc(c.sender||'John')}"></div>
    <div class="fgroup"><label>Google review link</label><input id="sms-review" value="${esc(c.reviewUrl||'')}" placeholder="https://g.page/r/..."></div>
    <div class="fsection">Which sequences run</div>
    ${seqRow('drip','Lead follow-up','3 texts max: right after you add the lead, then timed off the trip date, and one the day after it passes.')}
    ${seqRow('reminder','Trip reminders','7 PM the night before. Morning-of only for pickups at 10 AM or later, never for same-day bookings.')}
    ${seqRow('review','Review requests','24 hours after a completed trip, then an email 4 days out if no review. Skipped for clients riding again within 3 days, anyone who already reviewed, and more than once every 90 days.')}
    ${seqRow('rebook','Rebooking nudges','45 days after the last ride, then 100 days with 15% off. Regular clients only.')}
    ${seqRow('cancelrec','Cancel recovery','2 days after a cancellation. Skipped if they already have another trip booked.')}
    <button class="btn-primary" style="margin-top:16px" onclick="saveSms()">Save</button>
    <div class="hint" style="margin-top:10px">The exact wording of each message is set on the server. Ask to change any message any time.</div>`;
}
async function saveSms(){
  const prevCfg = SMSCFG;
  const next = Object.assign({}, SMSCFG);
  next.enabled = $('sms-enabled').checked;
  next.sender = $('sms-sender').value.trim() || 'John';
  next.reviewUrl = $('sms-review').value.trim();
  next.seq = Object.assign({}, SMSCFG.seq);
  ['drip','reminder','review','rebook','cancelrec'].forEach(k=>{ const el=$('sms-seq-'+k); if(el) next.seq[k]=el.checked; });
  SMSCFG = next;
  /* v6.22: awaited + verified — a silently failed toggle here would leave texts running/stopped against the owner's intent */
  if(!(await pushSettingV('sms', next))){ SMSCFG = prevCfg; return; } /* preserves server-side tpl: only these keys are in the object */
  modal=null; render(); toast(next.enabled ? 'Text automation ON — saved' : 'Saved — automation OFF');
}
function boardHTML(){
  const date = boardDate;
  ensureLeadsFrom(date); /* browsing the board back past the window pulls that history in */
  const dow = new Date(date+'T00:00:00').getDay();
  const rowHTML = x => {
    const t = x.l;
    const done = x.leg==='ret' ? t.retDone : t.outDone;
    return `<div class="brow ${x.conflict?'conf':''}" onclick="modal={type:'apptDetail',leadId:${t.id}};render()">
      <span class="btime">${fmtTime(x.time)}</span>
      <span class="legtag ${x.leg==='ret'?'ret':''}">${x.leg==='ret'?'RET':'PU'}</span>
      <span class="bname">${esc(t.first)} ${esc(t.last)}${t.oxygen?' 🫁':''}${t.escort?' 👥':''}${t.rentWheelchair?' ♿':''}</span>
      ${x.conflict?'<span class="bconf">⚠ TIGHT</span>':''}
      ${done?'<span class="badge completed">✓</span>':''}
    </div>`;
  };
  const unassigned = leads.filter(l=>l.status==='Confirmed' && !l.driverId && l.date===date)
    .sort((a,b)=>(a.pickupTime||'').localeCompare(b.pickupTime||''));
  const unassignedHTML = unassigned.length ? `
    <div class="card" style="cursor:default;padding:0;overflow:hidden;border:1.5px solid var(--amber)">
      <div class="bsec" style="background:#fdf6e8"><b style="font-size:13.5px">⚠️ Unassigned (${unassigned.length})</b><span style="font-size:11.5px;color:var(--muted)">— tap a trip to assign a driver</span></div>
      ${unassigned.map(l=>rowHTML({l, leg:'out', time:l.pickupTime||''})).join('')}
    </div>`:'';
  const driverCols = users.filter(u=>u.active!==false && (u.role==='driver' || (u.role==='admin' && driverLegs(u.id, date).length))).map(u=>{
    const legs = driverLegs(u.id, date);
    const brt = getReportTime(u.id, date);
    const conflicts = legs.filter(x=>x.conflict).length;
    return `
    <div class="card" style="cursor:default;padding:0;overflow:hidden">
      <div class="bsec">
        ${avatarHTML(u)}
        <div style="flex:1">
          <div class="name" style="font-size:14px">${esc(u.name)}${u.role==='admin'?' <span style="font-size:10.5px;color:var(--muted);font-weight:600">(admin)</span>':''}</div>
          <div class="meta" style="margin-top:2px">
            <span>${legs.length} trip${legs.length===1?'':'s'}</span>
            ${brt?`<span>Office ${fmtTime(brt)}</span>`:''}
            ${conflicts?`<span style="color:var(--red);font-weight:700">⚠ ${conflicts} tight</span>`:''}
          </div>
        </div>
      </div>
      ${legs.map(rowHTML).join('') || '<div class="empty" style="padding:14px;font-size:12.5px">No trips this day</div>'}
    </div>`;
  }).join('');
  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <button class="btn-mini ghost" onclick="shiftBoard(-1)">‹</button>
      <input type="date" value="${date}" onchange="boardDate=this.value;pickerRender()" style="flex:1;padding:10px 12px;border:1.5px solid var(--line);border-radius:11px;font-size:14px;background:#fff">
      <button class="btn-mini ghost" onclick="shiftBoard(1)">›</button>
      <button class="btn-mini" onclick="boardDate='${fmtDate(today)}';render()">Today</button>
    </div>
    <div class="hint" style="margin-bottom:12px">⚠ TIGHT = two trips less than 45 minutes apart for the same driver.</div>
    ${unassignedHTML}
    ${driverCols}`;
}

function apptDetailHTML(l){
  const driverOpts = assignableUsers()
    .map(u=>`<option value="${u.id}" ${l.driverId===u.id?'selected':''}>${esc(assignLabel(u))}</option>`).join('');
  const stp = hasStop(l);
  const sameSel = !(l.returnDriverId && l.returnDriverId !== l.driverId) && !(stp && l.stopDriverId && l.stopDriverId !== l.driverId);
  const retSel = retDriverOf(l);
  const driverOptsRet = assignableUsers()
    .map(u=>`<option value="${u.id}" ${retSel===u.id?'selected':''}>${esc(assignLabel(u))}</option>`).join('');
  const stopSel = stopDriverOf(l);
  const driverOptsStop = assignableUsers()
    .map(u=>`<option value="${u.id}" ${stopSel===u.id?'selected':''}>${esc(assignLabel(u))}</option>`).join('');
  const row = (k,v)=>`<div class="drow"><span class="k">${k}</span><span class="v">${v||'—'}</span></div>`;
  const isRound = l.tripType==='Round Trip';
  return `
    ${needsChips(l)}
    <div class="fsection">Client</div>
    <div class="detail-grid">
      ${row('Name', esc(l.first)+' '+esc(l.last))}
      ${row('Weight', l.weight ? esc(l.weight)+' lbs' : '')}
      ${row('Contact Name', esc(l.contactName))}
      ${row('Phone 1', esc(phoneFmt(l.phone1)))}
      ${row('Phone 2', esc(phoneFmt(l.phone2)))}
      ${row('Email', esc(l.email))}
    </div>
    <div class="fsection">Trip</div>
    <div class="detail-grid">
      ${row('Status', l.status + (l.status==='Canceled' && l.cancelDate ? ' ('+fmtNice(l.cancelDate)+')' : ''))}
      ${row('Date', fmtNice(l.date))}
      ${row('Pickup Time', fmtTime(l.pickupTime))}
      ${row('Appointment Time', fmtTime(l.apptTime))}
      ${row('Return Time', fmtTime(l.returnTime))}
      ${row('Trip Type', l.tripType)}
      ${row('Service Type', esc(l.tripKind||'Wheelchair'))}
      ${row('Pickup Address', esc(l.pickup))}
      ${row('Drop-off Address', esc(l.dropoff))}
      ${stp ? row('Second Drop-off', esc(l.stopAddr)) : ''}
      ${isRound && l.returnDropoff ? row('Return Drop-off (different from pickup)', esc(l.returnDropoff)) : ''}
      ${row('Miles: Office → Pickup', l.officeMiles!=='' && l.officeMiles!=null ? l.officeMiles+' mi' : '')}
      ${row(stp || (isRound && l.returnDropoff) ? 'Miles: Full Path (all legs)' : 'Miles: Pickup → Drop-off', l.tripMiles!=='' && l.tripMiles!=null ? l.tripMiles+' mi' : '')}
    </div>
    <div class="fsection">Charges</div>
    <div class="detail-grid">
      ${row('Waiting Time (est.)', l.waiting==='Yes' ? `${l.waitH} hr ${l.waitM} min` : 'No')}
      ${l.actualWaitMin!=null ? row(stp ? 'Actual Wait — stop 1' : 'Actual Wait (driver timer)', fmtDur(l.actualWaitMin) + (stp ? '' : ' → billed '+fmtDur(Math.ceil(l.actualWaitMin/15)*15))) : ''}
      ${stp && l.actualWaitMin2!=null ? row('Actual Wait — stop 2', fmtDur(l.actualWaitMin2)) : ''}
      ${stp && (l.actualWaitMin!=null || l.actualWaitMin2!=null) ? row('Combined Wait (billed as one)', fmtDur((+l.actualWaitMin||0)+(+l.actualWaitMin2||0))+' → billed '+fmtDur(Math.ceil(((+l.actualWaitMin||0)+(+l.actualWaitMin2||0))/15)*15)) : ''}
      ${row('Waiting Charge', money(waitChargeOf(l)))}
      ${row('Trip Charge', money(l.tripCharge))}
      ${rentFee(l) > 0 ? row('Wheelchair Rental', money(rentFee(l))) : ''}
      ${row('<b>Total Charge</b>', '<b style="color:var(--royal)">'+money(totalCharge(l))+'</b>')}
      ${row('Payment', paidLabel(l))}
      ${l.invoiceId && !l.paidAt ? row('Invoice', (l.invoiceStatus||'') + (l.invoicedAt ? ' · sent '+fmtNice(fmtDate(new Date(l.invoicedAt))) : '') + (l.invoiceUrl && hasOpenInvoice(l) ? ` · <a href="${esc(l.invoiceUrl)}" target="_blank" rel="noopener" style="color:var(--blue)">view</a>` : '')) : ''}
      ${l.status==='Canceled' ? row('Billed (cancel policy)', money(revenueOf(l)) + (l.cancelFeeApplied===true?' — cancellation fee charged':l.cancelFeeApplied===false?' — fee waived':revenueOf(l)>0?' — same-day cancel':' — free cancel')) : ''}
      ${l.status==='No Show' ? row('Quoted (No Show — not billed)', money(totalCharge(l))) : ''}
    </div>
    <div class="fsection">Driver Status</div>
    <div class="detail-grid">
      ${row('Pickup Trip', (l.outDone ? 'Completed ✓' : 'Not completed') + ' · ' + esc(driverName(l.driverId)))}
      ${stp ? row('Stop 2 (second drop-off)', (l.stopDone ? 'Completed ✓' : 'Not completed') + ' · ' + esc(driverName(stopDriverOf(l)))) : ''}
      ${isRound ? row('Return Trip', (l.retDone ? 'Completed ✓' : 'Not completed') + ' · ' + esc(driverName(retDriverOf(l)))) : ''}
      ${row(stp ? 'Wait Timer — stop 1' : 'Wait Timer', l.arrivedAt ? 'Arrived '+fmtClock(l.arrivedAt)+(l.departedAt?' · Departed '+fmtClock(l.departedAt):' · running') : 'Not used')}
      ${stp ? row('Wait Timer — stop 2', l.arrived2At ? 'Arrived '+fmtClock(l.arrived2At)+(l.departed2At?' · Departed '+fmtClock(l.departed2At):' · running') : 'Not used') : ''}
      ${row('Driver Notes', esc(l.driverNotes))}
      ${row('Office Notes (driver sees these)', esc(l.adminNotes||'') || '— none — add them via Edit Appointment')}
    </div>
    <div class="fsection">Signatures</div>
    <div class="detail-grid">
      ${(()=>{ const c = l.clientId ? clients.find(x=>x.id===l.clientId) : null;
        return row('Service Agreement', c
          ? (c.waiverAt ? `On file · ${fmtNice(fmtDate(new Date(c.waiverAt)))} · <button class="btn-mini ghost" onclick="viewSignature('waiver',${c.id})">View</button>` : 'Not signed yet — collected at the next drop-off')
          : '— no client profile linked'); })()}
      ${row(isRound?'Pickup Drop-off':'Drop-off', l.sigOutAt ? `Signed ${fmtClock(new Date(l.sigOutAt).getTime())} · <button class="btn-mini ghost" onclick="viewSignature('dropoff',${l.id},'out')">View</button>` : (l.outDone ? '⚠ Not signed' : '— pending trip'))}
      ${stp ? row('Stop 2 Drop-off', l.sigMidAt ? `Signed ${fmtClock(new Date(l.sigMidAt).getTime())} · <button class="btn-mini ghost" onclick="viewSignature('dropoff',${l.id},'mid')">View</button>` : (l.stopDone ? '⚠ Not signed' : '— pending trip')) : ''}
      ${isRound ? row('Return Drop-off', l.sigRetAt ? `Signed ${fmtClock(new Date(l.sigRetAt).getTime())} · <button class="btn-mini ghost" onclick="viewSignature('dropoff',${l.id},'ret')">View</button>` : (l.retDone ? '⚠ Not signed' : '— pending trip')) : ''}
    </div>
    <div class="fsection">Adjust Waiting Time (Admin Override)</div>
    <div class="frow" style="align-items:flex-end">
      <div class="fgroup" style="flex:1"><label>Actual Wait (minutes)</label><input id="adj-wait" type="number" min="0" value="${l.actualWaitMin!=null?l.actualWaitMin:''}" placeholder="e.g. 45"></div>
      <div class="fgroup" style="flex:0 0 auto"><button class="btn-mini" onclick="adjustWait(${l.id})">Update</button>
      ${l.actualWaitMin!=null?`<button class="btn-mini ghost" style="margin-left:6px" onclick="clearWait(${l.id})">Clear</button>`:''}</div>
    </div>


    ${l.status==='Confirmed' ? `
    <div class="fsection">Mark Completed</div>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn-mini ${l.outDone?'':'ghost'}" onclick="adminToggleLeg(${l.id},'out')">${isRound?'Pickup trip':'Trip'}: ${l.outDone?'Completed ✓':'Not completed'}</button>
      ${stp?`<button class="btn-mini ${l.stopDone?'':'ghost'}" onclick="adminToggleLeg(${l.id},'mid')">Stop 2: ${l.stopDone?'Completed ✓':'Not completed'}</button>`:''}
      ${isRound?`<button class="btn-mini ${l.retDone?'':'ghost'}" onclick="adminToggleLeg(${l.id},'ret')">Return trip: ${l.retDone?'Completed ✓':'Not completed'}</button>`:''}
    </div>
    <div class="hint" style="margin:-8px 0 14px">Tap to toggle — same status the driver sets, fully reversible.</div>
    ${(l.onmywayAt || l.arrivedTextAt) ? `<div class="hint" style="margin:-6px 0 10px">📱 Client updates: ${l.onmywayAt?'on-my-way sent '+fmtClock(new Date(l.onmywayAt).getTime()):''}${l.onmywayAt&&l.arrivedTextAt?' · ':''}${l.arrivedTextAt?'arrived sent '+fmtClock(new Date(l.arrivedTextAt).getTime()):''}</div>` : ''}
    ${placeNoteBox(l.pickup, currentUser.role==='admin')}
    ${placeNoteBox(l.dropoff, currentUser.role==='admin')}
    ${myLeg(l) ? `
    <div class="fsection">Your Trip — Driver Actions</div>
    ${driverActionRow(l, myLeg(l))}` : ''}
    ${l.clientId ? `<div class="hint" style="margin-bottom:14px">Left a Google review? Mark it on the client profile — it covers all their trips.</div>` : ''}` : `
    <div class="hint" style="margin-bottom:14px">This trip is ${esc(l.status)} — completion and driver assignment are hidden. Reopen it (Edit Appointment → status Confirmed) to use them.</div>`}

    ${!l.paidAt && !hasOpenInvoice(l) && (l.status==='Confirmed' || dueNow(l)) && revenueOf(l) > 0 ? (()=>{
      const c = l.clientId ? clients.find(x=>x.id===l.clientId) : null;
      const hasCard = !!(SQ.appId && c && (c.sqCards||[]).length);
      const invEmail = c ? (c.email || l.email) : l.email;
      const due = l.status==='Canceled' ? revenueOf(l) : totalCharge(l);
      return `
    <div class="fsection">Collect Payment — ${money(due)}</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
      ${hasCard ? `<button class="btn-primary" style="background:var(--green)" onclick="chargeCard(${l.id})">Charge Card on File — ${money(due)}</button>` : ''}
      ${c && invEmail ? `<button class="btn-primary" style="background:var(--blue)" onclick="sendInvoice(${l.id})">Send Square Invoice (email pay link)</button>` : ''}
      <button class="btn-mini ghost" onclick="markPaidZelle(${l.id})">Mark Paid — Zelle received</button>
      ${!c ? '<div class="hint">Link this trip to a client profile to charge a saved card or send an invoice.</div>' : !invEmail ? '<div class="hint">Add an email to the client profile to send a Square invoice.</div>' : ''}
    </div>`;})() : ''}
    ${l.paidAt ? `
    <div class="fsection">Receipt</div>
    <button class="btn-mini" style="margin-bottom:14px" onclick="sendManualReceipt(${l.id})">Email receipt for this trip</button>` : ''}
    ${hasOpenInvoice(l) ? `
    <div class="fsection">Invoice — Awaiting Payment</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
      <button class="btn-mini" onclick="checkInvoices()">Check for payment now</button>
      <button class="btn-mini ghost" onclick="cancelInvoice(${l.id})">Cancel this invoice</button>
      <div class="hint">Marks itself paid automatically once the client pays Square's emailed link. Checked on every app open.</div>
    </div>` : ''}
    <div class="fsection">Duplicate Booking</div>
    <button class="btn-primary" style="background:var(--blue)" onclick="duplicateBooking(${l.id})">Duplicate This Booking</button>
    ${l.status==='Confirmed' ? `
    <div class="fsection">Assign Driver${isRound?'s':''}</div>
    ${isRound?`
    <div class="fgroup"><label>Same driver for ${stp?'all legs':'both legs'}</label>
      <select id="same-driver" onchange="const off=this.value==='No';['assign-driver-ret','assign-driver-stop'].forEach(id=>{const r=$(id);if(r){r.disabled=!off;r.style.opacity=off?'1':'.45';}})">
        <option ${sameSel?'selected':''}>Yes</option><option ${!sameSel?'selected':''}>No</option>
      </select></div>`:''}
    <div class="fgroup"><label>${isRound?'Pickup Trip Driver':'Driver'}</label>
      <select id="assign-driver">
        <option value="">— Unassigned —</option>${driverOpts}
      </select>
    </div>
    ${stp?`
    <div class="fgroup"><label>Stop 2 Driver (drop-off 1 → drop-off 2)</label>
      <select id="assign-driver-stop" ${sameSel?'disabled style="opacity:.45"':''}>
        <option value="">— Unassigned —</option>${driverOptsStop}
      </select>
    </div>`:''}
    ${isRound?`
    <div class="fgroup"><label>Return Trip Driver</label>
      <select id="assign-driver-ret" ${sameSel?'disabled style="opacity:.45"':''}>
        <option value="">— Unassigned —</option>${driverOptsRet}
      </select>
    </div>`:''}
    <div class="hint" style="margin:-4px 0 10px">Each assigned driver gets a notification for their leg. For live-position suggestions, use the Fleet tab.</div>
    <button class="btn-primary" onclick="assignDriver(${l.id})">Save Assignment</button>` : ''}
    <button class="btn-danger" style="background:#f2e6e6;color:var(--royal)" onclick="openLeadForm(${l.id})">Edit Appointment</button>
    ${l.status==='Confirmed' ? `<button class="btn-danger" onclick="cancelAppointment(${l.id})">Cancel Appointment</button>` : ''}
    ${l.clientId && clients.find(c=>c.id===l.clientId) ? `<button class="btn-danger" style="background:#f2e6e6;color:var(--royal)" onclick="openClientForm(${l.clientId})">View Client Profile</button>` : ''}`;
}
function markReviewed(id, val){ /* v6.44: superseded by markClientReviewed on the client profile; kept for any stale session */
  const l = liveLead(id); if(!l) return;
  l.reviewDone = val; patchLead(l, {review_done: val}); render();
  toast(val ? 'Marked reviewed — follow-ups stopped ✓' : 'Undone — review follow-ups can resume');
}
function adminToggleLeg(id, leg){
  const l = liveLead(id); if(!l) return;
  if(leg==='ret') l.retDone = !l.retDone; else if(leg==='mid') l.stopDone = !l.stopDone; else l.outDone = !l.outDone;
  patchLead(l, leg==='ret' ? {ret_done:l.retDone} : leg==='mid' ? {stop_done:l.stopDone} : {out_done:l.outDone}); render();
  const nm = leg==='ret'?'Return trip':leg==='mid'?'Stop 2':'Pickup trip';
  toast(nm+' marked '+((leg==='ret'?l.retDone:leg==='mid'?l.stopDone:l.outDone)?'completed ✓':'not completed'));
  /* v6.57: an admin DOING the trip (assigned to this leg) gets the signing sheet just like a
     driver would. Desk-side corrections (admin not assigned) never pop the pad. */
  const nowDone = leg==='ret'?l.retDone:leg==='mid'?l.stopDone:l.outDone;
  if(nowDone && myLeg(l)===leg && !sigStampOf(l, leg)) collectTripSignature(id, leg);
}
function adjustWait(id){
  const l = liveLead(id); if(!l) return;
  const v = $('adj-wait').value;
  if(v===''){ toast('Enter minutes, or use Clear'); return; }
  l.actualWaitMin = Math.max(0, Math.round(+v));
  const patch = {actual_wait_min:l.actualWaitMin};
  if(hasStop(l)){ l.actualWaitMin2 = null; patch.actual_wait_min2 = null; } /* admin override = the TOTAL for the whole trip */
  patchLead(l, patch); if(l.status==='Confirmed') queueConfirmation(l); render();
  toast('Wait set to '+fmtDur(l.actualWaitMin)+' — charge '+money(waitBill(l.actualWaitMin, l.tripKind)));
}
function clearWait(id){
  const l = liveLead(id); if(!l) return;
  l.actualWaitMin = null; l.arrivedAt = null; l.departedAt = null;
  l.actualWaitMin2 = null; l.arrived2At = null; l.departed2At = null;
  patchLead(l, {actual_wait_min:null, arrived_at:null, departed_at:null, actual_wait_min2:null, arrived2_at:null, departed2_at:null}); if(l.status==='Confirmed') queueConfirmation(l); render(); toast('Reverted to estimated wait');
}
function duplicateBooking(id){
  const src = liveLead(id); if(!src) return;
  repDates = new Set(); repCal = null;
  modal = {type:'leadForm', leadId:null, clientId:src.clientId||null, asAppt:true, dupFromId:id};
  if(src.clientId) ensureClientHistory(src.clientId); /* duplicate needs route price memory too */
  render();
}
function assignDriver(id){
  const l = liveLead(id); if(!l) return;
  const isRound = l.tripType==='Round Trip';
  const stp = hasStop(l);
  const pd = $('assign-driver').value || null;
  let rd = pd, sd = pd;
  if(isRound){
    const sameEl = $('same-driver');
    const same = !sameEl || sameEl.value==='Yes';
    rd = same ? pd : (($('assign-driver-ret') && $('assign-driver-ret').value) || null);
    sd = same ? pd : ((stp && $('assign-driver-stop') && $('assign-driver-stop').value) || null);
    if(!same && pd && !rd){ toast('Pick a return driver, or set "Same driver" to Yes'); return; }
    if(!same && stp && pd && !sd){ toast('Pick a Stop 2 driver, or set "Same driver" to Yes'); return; }
  }
  if(pd){
    const newTimes = [toMin(l.pickupTime)];
    if(isRound && l.returnTime && rd===pd) newTimes.push(toMin(l.returnTime));
    const existing = driverLegs(pd, l.date).filter(x=>x.l.id!==l.id).map(x=>toMin(x.time));
    const clash = newTimes.some(t=>t!=null && existing.some(e=>e!=null && Math.abs(e-t) < opsNum('clashMin',45)));
    if(clash && !confirm('⚠ '+driverName(pd)+' already has a trip within '+opsNum('clashMin',45)+' minutes of this one on '+fmtNice(l.date)+'. Assign anyway?')) return;
  }
  const oldP = l.driverId, oldR = isRound ? retDriverOf(l) : null, oldS = stp ? stopDriverOf(l) : null, oldDate = l.date;
  l.driverId = pd;
  l.returnDriverId = (isRound && rd && rd !== pd) ? rd : null;
  l.stopDriverId = (stp && sd && sd !== pd) ? sd : null;
  patchLead(l, {driver_id:l.driverId, return_driver_id:l.returnDriverId, stop_driver_id:l.stopDriverId});
  if(pd && pd !== oldP){
    const n = {id:Date.now(), driverId:pd, read:false,
      text:`New trip assigned: ${l.first} ${l.last} — ${fmtNice(l.date)}, pickup ${fmtTime(l.pickupTime)}`};
    notifications.push(n); insertNotif(n);
  }
  if(stp && sd && sd !== pd && sd !== oldS){
    const n = {id:Date.now()+2, driverId:sd, read:false,
      text:`New trip assigned: ${l.first} ${l.last} — ${fmtNice(l.date)}, STOP 2 leg (${l.dropoff} → ${l.stopAddr}), after the first drop-off`};
    notifications.push(n); insertNotif(n);
  }
  if(isRound && rd && rd !== pd && rd !== oldR){
    const n = {id:Date.now()+1, driverId:rd, read:false,
      text:`New trip assigned: ${l.first} ${l.last} — ${fmtNice(l.date)}, return leg ${l.returnTime?fmtTime(l.returnTime):'(time TBD)'}`};
    notifications.push(n); insertNotif(n);
  }
  if(l.status==='Confirmed') queueConfirmation(l);
  recomputeAround(l, oldP, oldR, oldDate);
  modal=null; render(); toast(pd||rd||sd ? 'Assignment saved & drivers notified' : 'Assignment cleared');
}

/* ================= ADMIN: CLIENTS ================= */
function clientsView(){
  const q = search.clients.trim();
  const shown = q ? clients.filter(c=>matchName(c.first,c.last,q)) : clients;
  const CAP = 150;
  const overCap = shown.length > CAP;
  const items = [...shown].sort((a,b)=>(a.last+a.first).localeCompare(b.last+b.first)).slice(0, CAP).map(c=>{
    const tripCount = tripCountOf(c.id); /* lifetime count from the DB view — memory only holds the working window */
    const sqc = (c.sqCards||[]).find(x=>x.primary) || (c.sqCards||[])[0];
    const last4 = sqc ? String(sqc.last4||'') : '';
    return `
    <div class="card" onclick="openClientForm(${c.id})">
      <div class="row1">
        <div class="user-card" style="flex:1">
          <div class="avatar">${esc((c.first[0]||'')+(c.last[0]||''))}</div>
          <div style="flex:1">
            <div class="name">${esc(c.first)} ${esc(c.last)}</div>
            <div class="meta">
              <span>${esc(c.tripKind)}</span>
              <span>${esc(phoneFmt(c.phone1)||'—')}</span>
              ${last4?`<span>Card ····${last4}</span>`:''}
              <span>${tripCount} trip${tripCount===1?'':'s'}</span>
            </div>
          </div>
        </div>
        <button class="btn-mini" onclick="event.stopPropagation();openLeadForm(null,${c.id},true)">+ Appt</button>
      </div>
    </div>`;
  }).join('');
  return `
    <div class="section-head">
      <div><h2>Clients</h2><div class="count">${clients.length} profiles${overCap ? ` · showing ${Math.min(150, shown.length)} — search finds anyone instantly` : ' · tap to view or edit'}</div></div>
      <button class="fab" onclick="openClientForm(null)">+</button>
    </div>
    ${searchBar('search-clients','clients','Search client profiles by name…')}
    ${q?`<div class="count" style="margin-bottom:10px">${shown.length} match${shown.length===1?'':'es'} for “${esc(q)}”</div>`:''}
    ${items || (q?'<div class="empty"><div class="big">🔍</div>No client profiles match that name.</div>':'<div class="empty">No client profiles yet.<br>Tap + to add one, or create a profile from any lead.</div>')}`;
}
function openClientForm(id){ modal={type:'clientForm', clientId:id}; if(id) ensureClientHistory(id); if(!smsLoaded) ensureTexts(); /* v6.56: contact-preference toggles need the optout lists */ render(); }
function clientFormHTML(c){
  const isNew = !c;
  c = c || {first:'',last:'',dob:'',weight:'',homeAddress:'',phone1:'',phone2:'',email:'',contactName:'',tripKind:'Wheelchair',notes:''};
  const trips = isNew ? [] : leads.filter(l=>l.clientId===c.id)
    .sort((a,b)=>((b.date||'')+(b.pickupTime||'')).localeCompare((a.date||'')+(a.pickupTime||'')));
  return `
    <div class="fsection">Client Information</div>
    <div class="frow">
      <div class="fgroup"><label>First Name</label><input id="c-first" value="${esc(c.first)}"></div>
      <div class="fgroup"><label>Last Name</label><input id="c-last" value="${esc(c.last)}"></div>
    </div>
    <div class="frow">
      <div class="fgroup"><label>Date of Birth</label><input id="c-dob" type="date" value="${esc(c.dob)}"></div>
      <div class="fgroup"><label>Weight (lbs)</label><input id="c-weight" type="number" value="${esc(c.weight)}"></div>
    </div>
    <div class="fgroup"><label>Home Address</label><input id="c-home" ${OPS.mapsEnabled?'':'list="addr-list"'} oninput="acSuggest(this)" autocomplete="off" value="${esc(c.homeAddress)}"></div>
    <datalist id="addr-list">${addressOptions()}</datalist>
    <div class="fgroup"><label>Type of Trip</label>
      <select id="c-kind">
        ${['Wheelchair','Ambulatory','Stretcher'].map(k=>`<option ${c.tripKind===k?'selected':''}>${k}</option>`).join('')}
      </select></div>
    <div class="fgroup"><label>Contact Name</label><input id="c-contact" value="${esc(c.contactName)}"></div>
    <div class="frow">
      <div class="fgroup"><label>Phone Number 1</label><input id="c-phone1" inputmode="tel" value="${esc(phoneFmt(c.phone1))}" oninput="this.value=phoneFmt(this.value)"></div>
      <div class="fgroup"><label>Phone Number 2</label><input id="c-phone2" inputmode="tel" value="${esc(phoneFmt(c.phone2))}" oninput="this.value=phoneFmt(this.value)"></div>
    </div>
    <div class="fgroup"><label>Email</label><input id="c-email" type="email" value="${esc(c.email)}"></div>
    ${!isNew && c.pendingNote ? `<div class="notifbar" style="background:#fdf6e8;border-color:#e8d5a8;margin-bottom:10px"><div class="nb-item"><b>📝 Driver suggestion:</b> ${esc(c.pendingNote)}<div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="btn-mini" style="background:var(--green)" onclick="approvePendingNote(${c.id})">Add to notes</button><button type="button" class="btn-mini ghost" onclick="dismissPendingNote(${c.id})">Dismiss</button></div></div></div>` : ''}
    <div class="fgroup"><label>Notes (gate codes, equipment, preferences — office only)</label><textarea id="c-notes" rows="3">${esc(c.notes||'')}</textarea></div>

    ${isNew ? '' : `<div class="fsection">Service Agreement (liability waiver)</div>
    ${c.waiverAt
      ? `<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px"><span class="badge completed">On file</span><span style="font-size:13px">Signed ${fmtNice(fmtDate(new Date(c.waiverAt)))}</span><button type="button" class="btn-mini ghost" onclick="viewSignature('waiver',${c.id})">View</button></div>`
      : `<div class="hint" style="margin-bottom:14px">Not signed yet — the one-time agreement is collected automatically on the phone at this client's next drop-off.</div>`}
    <div id="rev-sec">${reviewSectionHTML(c)}</div>
    <div class="fsection">Contact Preferences</div>
    <div style="display:flex;gap:8px;margin-bottom:6px">
      <button type="button" class="btn-mini ${clientNoText(c)?'':'ghost'}" style="flex:1${clientNoText(c)?';background:var(--red)':''}" onclick="toggleDoNotText(${c.id})">${clientNoText(c)?'🚫 Do NOT text ✓':'Texts allowed — tap to block'}</button>
      <button type="button" class="btn-mini ${clientNoEmail(c)?'':'ghost'}" style="flex:1${clientNoEmail(c)?';background:var(--red)':''}" onclick="toggleDoNotEmail(${c.id})">${clientNoEmail(c)?'🚫 Do NOT email ✓':'Emails allowed — tap to block'}</button>
    </div>
    <div class="hint" style="margin-bottom:14px">Blocking stops every automated text or email to this person — follow-ups, reminders, reviews, confirmations, receipts. It does not affect phone calls.</div>`}

    <div class="fsection">Payment — Cards (Square)</div>
    ${SQ.appId ? (isNew ? `<div class="hint" style="margin-bottom:12px">Save the profile first, then add a card.</div>` : `
    ${(c.sqCards||[]).length ? `<div class="detail-grid" style="margin-bottom:10px">
      ${(c.sqCards||[]).map(cd=>`<div class="drow"><span class="k">${esc(cd.brand||'Card')} ····${esc(cd.last4||'')} · ${esc(String(cd.expMonth||''))}/${esc(String(cd.expYear||''))} ${cd.primary?'<span class="badge gold">Primary</span>':''}</span>
        <span class="v">${cd.primary?'':`<button class="btn-mini ghost" onclick="sqSetPrimary(${c.id},'${esc(cd.id)}')">Make primary</button> `}<button class="btn-mini ghost" onclick="sqDeleteCard(${c.id},'${esc(cd.id)}')">✕</button></span></div>`).join('')}
    </div>` : '<div class="hint" style="margin-bottom:10px">No cards on file yet.</div>'}
    ${modal.sqAdding ? `
      <div id="sq-card" style="margin-bottom:10px"></div>
      <label style="display:flex;gap:8px;align-items:center;font-size:13.5px;margin-bottom:10px"><input type="checkbox" id="sq-primary" ${!(c.sqCards||[]).length?'checked disabled':''} style="width:auto"> Make this the primary card</label>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button type="button" class="btn-mini" onclick="sqSaveCard(${c.id})">Save Card</button>
        <button type="button" class="btn-mini ghost" onclick="sqCancelAdd()">Cancel</button>
      </div>` : `
      <button type="button" class="btn-mini" style="margin-bottom:12px" onclick="sqStartAdd(${c.id})">+ Add ${(c.sqCards||[]).length?'a second':'a'} card</button>`}
    <div class="hint" style="margin-bottom:12px">The number is typed into Square's secure field and stored in Square's vault — this app only keeps the last 4 digits.</div>`)
    : `<div class="hint" style="margin-bottom:12px">Square isn't connected — Settings → Payments (Square). Cards are only ever stored in Square's vault, never in this app.</div>`}

    ${!isNew ? (()=>{
      const lifeRevenue = trips.reduce((a,t)=>a+revenueOf(t), 0);
      const showAll = !!modal.showAllTrips;
      const shownTrips = showAll ? trips : trips.slice(0, 5);
      return `
    <div class="fsection">Trips</div>
    ${clientHistLoaded(c.id) ? '' : '<div class="hint" style="margin-bottom:8px">Loading full trip history…</div>'}
    ${trips.length ? `<div class="card" style="padding:12px 14px;margin-bottom:10px" onclick="modal.showAllTrips=!modal.showAllTrips;render()">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span><b>Lifetime trips:</b> ${trips.length} &nbsp;·&nbsp; <b>Total billed:</b> ${money(lifeRevenue)}</span>
        <span style="color:var(--royal);font-weight:700;font-size:12.5px">${showAll ? 'Show recent' : 'Show all'}</span>
      </div>
    </div>
    ${(()=>{
      const due = trips.filter(t=>dueNow(t) && !hasOpenInvoice(t));
      const dueTotal = due.reduce((a,t)=>a + revenueOf(t), 0);
      return due.length ? `<button type="button" class="btn-mini" style="margin-bottom:10px;background:#fff3e6;color:#8a4b00;border:1px solid #eecfa8" onclick="invoiceClientUnpaid(${c.id})">Send one invoice for ${due.length} unpaid trip${due.length>1?'s':''} — ${money(dueTotal)}</button>` : '';
    })()}
    ${!showAll && trips.length>5 ? `<div class="hint" style="margin-bottom:6px">5 most recent — tap the box above for all ${trips.length}. Tap a trip for details, editing and duplicating.</div>` : '<div class="hint" style="margin-bottom:6px">Tap a trip for details, editing and duplicating.</div>'}
    <div class="detail-grid">
      ${shownTrips.map(t=>{
        const stCol = t.status==='Canceled' ? '#a04b00' : t.status==='Confirmed' ? '#0d5c33' : 'var(--muted)';
        return `<div class="drow" style="align-items:center;cursor:pointer" onclick="modal={type:'apptDetail',leadId:${t.id},backTo:'client',backClientId:${c.id},backShowAll:${showAll}};render()">
          <span class="k" style="color:var(--ink)"><b>${fmtNice(t.date)}</b><br>
            <span style="font-size:11.5px;color:var(--muted)">${fmtTime(t.pickupTime)}${t.pickupTime?' · ':''}<span style="color:${stCol}">${t.status}</span></span></span>
          <span class="v" style="flex-shrink:0;display:flex;align-items:center;gap:8px;justify-content:flex-end">
            <span style="font-size:13px;font-weight:700">${money(totalCharge(t))}</span>
            <span style="color:var(--muted);font-size:17px;line-height:1">›</span>
          </span>
        </div>`;
      }).join('')}
    </div>
    ${showAll && trips.length > 5 ? `<button type="button" class="btn-mini ghost" style="margin:8px 0 12px" onclick="modal.showAllTrips=false;render()">Show recent only</button>` : ''}` : '<div class="hint" style="margin-bottom:12px">No trips linked to this profile yet.</div>'}`;})():''}

    <button class="btn-primary" onclick="saveClient(${isNew?'null':c.id})">${isNew?'Create Client Profile':'Save Profile'}</button>
    ${isNew?'':`
    <button class="btn-primary" style="background:var(--green);margin-top:10px" onclick="openLeadForm(null,${c.id},true)">Create Appointment for ${esc(c.first)}</button>
    <button class="btn-danger" onclick="deleteClient(${c.id})">Delete Profile</button>`}`;
}
/* v6.44: review marking moved from the trip to the client profile — one tap covers ALL their trips.
   Sets clients.review_done, sweeps every lead (past + future bookings already created), cancels any
   pending review texts, and new bookings for a reviewed client are flagged at creation.
   v6.45: the button updates ONLY its own section in place — a full render() rebuilt the modal and
   threw the admin back to the top of the profile (same scroll-jump class as the payroll date fix). */
function reviewSectionHTML(c){
  return `<div class="fsection">Google Review</div>
    <button type="button" class="btn-mini ${c.reviewDone?'':'ghost'}" style="margin-bottom:8px" onclick="markClientReviewed(${c.id}, ${c.reviewDone?'false':'true'})">${c.reviewDone ? 'Client left a review ✓ (tap to undo)' : 'Mark: client left a review'}</button>
    <div class="hint" style="margin-bottom:14px">${c.reviewDone ? 'Marked — no review request texts or emails go to this client, for any trip, past or future.' : 'Mark this once the client (or their family) leaves a Google review. It stops review follow-ups for all their trips, including future bookings.'}</div>`;
}
async function markClientReviewed(id, val){
  const c = clients.find(x=>x.id===id); if(!c) return;
  const prev = c.reviewDone;
  c.reviewDone = val;
  const r1 = await sb.from('clients').update({review_done:val}).eq('id', id).select('id');
  if(r1.error || !(r1.data||[]).length){ c.reviewDone = prev; syncErr(r1.error); toast('Did not save — try again'); return; }
  const r2 = await sb.from('leads').update({review_done:val}).eq('client_id', id).select('id');
  if(r2.error) syncErr(r2.error);
  leads.forEach(l=>{ if(l.clientId===id) l.reviewDone = val; });
  if(val){
    const r3 = await sb.from('sms_queue').update({status:'canceled'}).eq('client_id', id).eq('kind','review').eq('status','pending').select('id');
    if(r3.error) syncErr(r3.error);
  }
  const sec = document.getElementById('rev-sec');
  if(sec) sec.innerHTML = reviewSectionHTML(c); else render(); /* in-place — no modal rebuild, no scroll jump */
  toast(val ? 'Marked ✓ — review follow-ups stop for this client' : 'Unmarked — review follow-ups can send again');
}
/* v6.55: driver suggestions land here — nothing touches the profile without an admin tap */
async function approvePendingNote(id){
  const c = clients.find(x=>x.id===id); if(!c || !c.pendingNote) return;
  const merged = ((c.notes||'').trim() ? c.notes.trim() + '\n' : '') + c.pendingNote.trim();
  const {data, error} = await sb.from('clients').update({notes:merged, pending_note:null}).eq('id', id).select('id');
  if(error || !(data||[]).length){ syncErr(error); toast('Did not save — try again'); return; }
  c.notes = merged; c.pendingNote = '';
  render(); toast('Added to the client notes ✓ — it now rides on every future trip');
}
async function dismissPendingNote(id){
  const c = clients.find(x=>x.id===id); if(!c) return;
  const {data, error} = await sb.from('clients').update({pending_note:null}).eq('id', id).select('id');
  if(error || !(data||[]).length){ syncErr(error); toast('Could not dismiss'); return; }
  c.pendingNote = '';
  render(); toast('Suggestion dismissed');
}
async function saveClient(id){
  const g = i => $(i).value;
  if(!g('c-first').trim() || !g('c-last').trim()){ toast('First and last name are required'); return; }
  if(busyGate()){ toast('Saving…'); return; }
  const prev = id ? (clients.find(x=>x.id===id) || {}) : {};
  const cc = (i, k) => $(i) ? $(i).value : (prev[k] || '');
  const data = {
    first:g('c-first').trim(), last:g('c-last').trim(), dob:g('c-dob'), weight:g('c-weight'),
    homeAddress:g('c-home'), tripKind:g('c-kind'), contactName:g('c-contact'),
    phone1:g('c-phone1'), phone2:g('c-phone2'), email:g('c-email'),
    notes: $('c-notes') ? $('c-notes').value : (prev.notes||''),
  };
  if(id){
    const c = clients.find(x=>x.id===id);
    const prevC = Object.assign({}, c); /* v6.54: rollback snapshot — the screen must never claim a save the DB refused */
    Object.assign(c, data);
    /* v6.22: awaited + verified (was fire-and-forget; Sandra Clarke stale-address incident) */
    toast('Saving…');
    const {error:cErr} = await sb.from('clients').update(toDb.client(c)).eq('id', c.id);
    if(cErr){ Object.assign(c, prevC); syncErr(cErr); toast('SAVE FAILED — nothing stored. Check your connection and tap Save again.'); render(); return; }
    await refetch('clients');
    /* v6.54: sync to upcoming trips is now ONE verified write (was fire-and-forget per lead — the
       silent-failure path behind "I saved the profile but the trip still shows the old data") */
    const {data:rows, error:lErr} = await sb.from('leads')
      .update({first_name:data.first, last_name:data.last, dob:data.dob||null, weight:data.weight,
        contact_name:data.contactName, phone1:data.phone1, phone2:data.phone2, email:data.email, trip_kind:data.tripKind, client_notes:data.notes||''})
      .eq('client_id', id).gte('trip_date', fmtDate(today)).select('id');
    if(lErr){ syncErr(lErr); await refetch('leads'); toast('Profile saved, but updating the upcoming trips FAILED — tap Save again to retry.'); render(); return; }
    const ids = new Set((rows||[]).map(r=>r.id));
    let synced = 0;
    leads.forEach(l=>{
      if(ids.has(l.id)){
        Object.assign(l, {first:data.first,last:data.last,dob:data.dob,weight:data.weight,
          contactName:data.contactName,phone1:data.phone1,phone2:data.phone2,email:data.email,tripKind:data.tripKind,clientNotes:data.notes});
        if(l.status==='Confirmed') queueConfirmation(l);
        synced++;
      }
    });
    toast(synced ? `Profile saved · ${synced} upcoming trip${synced===1?'':'s'} updated` : 'Profile saved');
  } else {
    toast('Saving…');
    const {error} = await sb.from('clients').insert(toDb.client(data));
    if(error){ syncErr(error); return; }
    await refetch('clients');
    toast('Client profile created');
  }
  modal=null; render();
}
function deleteClient(id){
  if(confirm('Delete this client profile? Their existing leads are kept but unlinked.')){
    clients = clients.filter(c=>c.id!==id);
    leads.forEach(l=>{ if(l.clientId===id) l.clientId=null; });
    sb.from('leads').update({client_id:null}).eq('client_id', id).then(r=>syncErr(r.error));
    sb.from('clients').delete().eq('id', id).then(r=>syncErr(r.error));
    modal=null; render(); toast('Client profile deleted');
  }
}
async function createProfileFromLead(leadId){
  const l = liveLead(leadId); if(!l) return;
  if(busyGate()){ toast('Saving…'); return; }
  const existing = findClientByPhone(l.phone1, l.phone2) || findClientByName(l.first, l.last);
  if(existing){
    l.clientId = existing.id;
    pushLead(l);
    toast('This client already has a profile — linked to it instead');
    openClientForm(existing.id);
    return;
  }
  const c = {first:l.first, last:l.last, dob:l.dob, weight:l.weight,
    homeAddress:l.pickup, phone1:l.phone1, phone2:l.phone2, email:l.email, contactName:l.contactName,
    tripKind:l.tripKind||'Wheelchair'};
  toast('Creating profile…');
  const {data, error} = await sb.from('clients').insert(toDb.client(c)).select('id').single();
  if(error || !data){ syncErr(error); return; }
  await refetch('clients');
  l.clientId = data.id;
  pushLead(l);
  toast('Profile created — add card details');
  openClientForm(data.id);
}

/* ================= ADMIN: SALES ================= */
let salesPeriod = 'day';
let salesFrom = null, salesTo = null;
function periodRange(p){
  const t = new Date(today);
  if(p==='day'){ const s = fmtDate(t); return [s, s]; }
  if(p==='week'){ const st = new Date(t); st.setDate(st.getDate()-st.getDay()); const en = new Date(st); en.setDate(en.getDate()+6); return [fmtDate(st), fmtDate(en)]; }
  if(p==='month'){ return [fmtDate(new Date(t.getFullYear(), t.getMonth(), 1)), fmtDate(new Date(t.getFullYear(), t.getMonth()+1, 0))]; }
  return [salesFrom || fmtDate(t), salesTo || fmtDate(t)];
}
function prevRange(s, e){
  const sd = new Date(s+'T00:00:00'), ed = new Date(e+'T00:00:00');
  const days = Math.round((ed - sd)/864e5) + 1;
  const ps = new Date(sd); ps.setDate(ps.getDate() - days);
  const pe = new Date(sd); pe.setDate(pe.getDate() - 1);
  return [fmtDate(ps), fmtDate(pe)];
}
function salesStats(s, e){
  const list = leads.filter(l => ['Confirmed','Canceled'].includes(l.status) && l.date && l.date >= s && l.date <= e);
  const rev = list.reduce((a,l) => a + revenueOf(l), 0);
  return {rev, trips: list.length, avg: list.length ? rev/list.length : 0};
}
function pctChip(cur, prev){
  let txt, dir;
  if(prev <= 0 && cur <= 0){ txt='—'; dir=0; }
  else if(prev <= 0){ txt='new'; dir=1; }
  else {
    const pd = ((cur - prev)/prev)*100;
    txt = (pd >= 0 ? '+' : '') + pd.toFixed(1) + '%';
    dir = pd > 0.05 ? 1 : pd < -0.05 ? -1 : 0;
  }
  const bg = dir>0 ? '#bff3d6' : dir<0 ? '#ffc9c9' : '#e9e4e4';
  const tc = dir>0 ? '#0d5c33' : dir<0 ? '#7c1414' : '#5f5a5a';
  return `<span style="background:${bg};color:${tc};font-size:10px;font-weight:800;padding:2px 8px;border-radius:10px;white-space:nowrap">${txt} vs prev</span>`;
}
let salesDriver = null;
function driverRevenueMap(s, e){
  const map = {};
  const add = (k, v) => { map[k] = (map[k]||0) + v; };
  leads.filter(l=>['Confirmed','Canceled'].includes(l.status) && l.date && l.date>=s && l.date<=e).forEach(l=>{
    const total = revenueOf(l);
    const rd = l.tripType==='Round Trip' ? retDriverOf(l) : l.driverId;
    if(l.tripType==='Round Trip' && rd !== l.driverId){
      const h1 = Math.floor(total*100/2)/100;
      const h2 = +(total - h1).toFixed(2);
      add(l.driverId || 'un', h1);
      add(rd || 'un', h2);
    } else {
      add(l.driverId || 'un', total);
    }
  });
  return map;
}
function driverPayBetween(id, s, e){
  const u = users.find(x=>x.id===id);
  return paidBetween(id, s, e) * (u ? +(u.hourlyRate||0) : 0);
}
function salesView(){
  if(salesDriver){
    /* driver drill-down looks back 12 months + YTD — pull that history in if needed */
    ensureLeadsFrom(fmtDate(new Date(today.getFullYear(), today.getMonth() - 11, 1)));
    ensureLeadsFrom(today.getFullYear() + '-01-01');
    return salesDriverView();
  }
  const [s, e] = periodRange(salesPeriod);
  const [ps, pe] = prevRange(s, e);
  ensureLeadsFrom(ps < s ? ps : s); /* older ranges load on demand, view refreshes when they land */
  const cur = salesStats(s, e), prev = salesStats(ps, pe);
  const label = s===e ? fmtNice(s) : `${fmtNice(s)} – ${fmtNice(e)}`;
  const prevLabel = salesPeriod==='day' ? 'previous day' : salesPeriod==='week' ? 'previous week' : salesPeriod==='month' ? 'previous month' : 'previous period of same length';
  const pills = [['day','Day'],['week','Week'],['month','Month']]
    .map(([k,lb])=>`<button class="${salesPeriod===k?'active':''}" onclick="salesPeriod='${k}';render()">${lb}</button>`).join('')
    + `<button class="${salesPeriod==='custom'?'active':''}" onclick="modal={type:'range'};render()">Custom range</button>`;
  const metric = (lb, val, chip) => `<div style="flex:1"><div class="n">${val}</div><div class="l">${lb}</div><div style="margin-top:4px">${chip}</div></div>`;
  /* last-7-days trend */
  const trend = [];
  for(let i=6; i>=0; i--){
    const d = new Date(today); d.setDate(d.getDate()-i);
    const ds = fmtDate(d);
    trend.push({ds, rev: salesStats(ds, ds).rev, lab: d.toLocaleDateString('en-US',{weekday:'narrow'})});
  }
  const tMax = Math.max(...trend.map(t=>t.rev), 1);
  /* per-driver revenue vs pay */
  const revMap = driverRevenueMap(s, e);
  const rows = users.filter(u=>u.role==='driver' && u.active!==false).map(u=>({id:u.id, name:u.name, u, rev:revMap[u.id]||0, pay:driverPayBetween(u.id, s, e)}));
  /* v6.43: admins who drove trips this period appear with their revenue — but are never paid for trips */
  users.filter(u=>u.role==='admin' && u.active!==false && revMap[u.id]).forEach(u=>rows.push({id:u.id, name:u.name, u, rev:revMap[u.id], pay:0, isAdmin:true}));
  if(revMap['un']) rows.push({id:'un', name:'Unassigned', u:null, rev:revMap['un'], pay:0});
  const dMax = Math.max(...rows.map(r=>Math.max(r.rev, r.pay)), 1);
  /* trip list */
  const trips = leads.filter(l=>['Confirmed','Canceled'].includes(l.status) && l.date && l.date>=s && l.date<=e)
    .sort((a,b)=>((b.date||'')+(b.pickupTime||'')).localeCompare((a.date||'')+(a.pickupTime||''))).slice(0,50);
  return `
    <div class="section-head"><div><h2>Sales</h2><div class="count">Revenue = billed trip charges for the period</div></div></div>
    <div class="card" style="text-align:center" onclick="modal={type:'range'};render()">
      <div style="font-size:15px;font-weight:800;color:var(--ink)">${label}</div>
      <div class="hint">vs ${prevLabel} · tap to pick a custom range</div>
    </div>
    <div class="pills">${pills}</div>
    <div class="stat">
      ${metric('Revenue', money(cur.rev), pctChip(cur.rev, prev.rev))}
      <div class="divider"></div>
      ${metric('Trips', cur.trips, pctChip(cur.trips, prev.trips))}
      <div class="divider"></div>
      ${metric('Avg / Trip', money(cur.avg), pctChip(cur.avg, prev.avg))}
    </div>
    ${(()=>{ /* collected check — global, not period-limited: missing money is missing regardless of the filter */
      const unc = uncollectedList();
      const inv = invoicedOpenList();
      const uncTotal = unc.reduce((a,l)=>a+revenueOf(l), 0);
      const invTotal = inv.reduce((a,l)=>a+(l.invoiceAmount!=null?l.invoiceAmount:revenueOf(l)), 0);
      return (unc.length ? `
      <div class="card" style="border-left:4px solid #cf4d4d" onclick="modal={type:'uncollected'};render()">
        <div class="row1">
          <div class="name" style="color:#7c1414">⚠ ${money(uncTotal)} not collected</div>
          <span style="font-size:12px;color:var(--muted)">${unc.length} trip${unc.length>1?'s':''} ›</span>
        </div>
        <div class="hint" style="margin:4px 0 0">Billed trips with no payment behind them — tap to collect.</div>
      </div>` : `
      <div class="card" style="cursor:default;border-left:4px solid #2e9e6b">
        <div class="name" style="color:#0d5c33">✓ Collected — every billed trip is paid</div>
      </div>`) + (inv.length ? `
      <div class="card" style="border-left:4px solid var(--blue)" onclick="modal={type:'uncollected',showInvoiced:true};render()">
        <div class="row1">
          <div class="name" style="color:var(--blue)">${money(invTotal)} invoiced — awaiting payment</div>
          <span style="font-size:12px;color:var(--muted)">${inv.length} trip${inv.length>1?'s':''} ›</span>
        </div>
      </div>` : '');
    })()}
    <div class="card" style="cursor:default">
      <div style="font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Revenue — last 7 days</div>
      <div style="display:flex;align-items:flex-end;gap:6px;height:64px">
        ${trend.map(t=>`<div style="flex:1;text-align:center">
          <div style="background:${t.ds===fmtDate(today)?'var(--royal)':'#d8c2c4'};border-radius:4px 4px 0 0;height:${Math.max(2, Math.round(t.rev/tMax*48))}px"></div>
          <div style="font-size:9.5px;color:var(--muted);margin-top:3px">${t.lab}</div>
        </div>`).join('')}
      </div>
    </div>
    <div class="fsection">Revenue / Pay by Driver</div>
    ${rows.map(r=>`
    <div class="card" ${r.id!=='un'?`onclick="salesDriver='${r.id}';render()"`:'style="cursor:default"'}>
      <div class="row1" style="margin-bottom:8px">
        <div class="name">${esc(r.name)}${r.isAdmin?' <span style="font-size:10.5px;color:var(--muted);font-weight:600">(admin — no pay)</span>':''}</div>
        <span style="font-size:11px;color:var(--muted)">${r.id!=='un'?'tap for history ›':''}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="width:56px;font-size:10.5px;font-weight:700;color:#0d5c33">REVENUE</span>
        <div style="flex:1;background:#f1ecec;border-radius:5px;height:12px"><div style="width:${Math.round(r.rev/dMax*100)}%;background:#2e9e6b;height:12px;border-radius:5px"></div></div>
        <span style="width:70px;text-align:right;font-size:12px;font-weight:700">${money(r.rev)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:56px;font-size:10.5px;font-weight:700;color:#7c1414">PAY</span>
        <div style="flex:1;background:#f1ecec;border-radius:5px;height:12px"><div style="width:${Math.round(r.pay/dMax*100)}%;background:#cf4d4d;height:12px;border-radius:5px"></div></div>
        <span style="width:70px;text-align:right;font-size:12px;font-weight:700">${money(r.pay)}</span>
      </div>
    </div>`).join('') || '<div class="hint">No drivers yet.</div>'}
    <div class="fsection">Trips in This Period (${trips.length})</div>
    ${trips.length ? trips.map(l=>`
      <div class="card" onclick="modal={type:'apptDetail',leadId:${l.id}};render()">
        <div class="row1">
          <div class="name" style="font-size:13.5px">${esc(l.first)} ${esc(l.last)}</div>
          <span style="font-size:12.5px;font-weight:700">${money(revenueOf(l))}</span>
        </div>
        <div class="meta"><span>${fmtNice(l.date)}</span><span>${fmtTime(l.pickupTime)}</span><span>${esc(driverName(l.driverId))}</span><span>${l.status}</span></div>
      </div>`).join('') : '<div class="hint">No trips in this period.</div>'}`;
}
/* ================= ADMIN: FLEET (Bouncie live map) ================= */
let leafletP = null;
function loadLeaflet(){
  if(window.L) return Promise.resolve();
  if(leafletP) return leafletP;
  leafletP = new Promise((res, rej)=>{
    let need = 2;
    const done = ()=>{ if(--need === 0) res(); };
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    css.onload = done;
    css.onerror = done; /* style failure shouldn't dead-lock the map — js alone still draws */
    document.head.appendChild(css);
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    sc.onload = done;
    sc.onerror = ()=>{ leafletP = null; rej(new Error('leaflet load failed')); };
    document.head.appendChild(sc);
  });
  return leafletP;
}
function fmtAgo(min){
  if(min < 1) return 'just now';
  if(min < 60) return Math.round(min) + ' min ago';
  const h = Math.floor(min/60);
  if(h < 24) return h + ' h ago';
  return Math.floor(h/24) + ' d ago';
}
function vanStatus(loc){
  if(!loc || loc.lat == null) return {txt:'no signal yet', col:'#8a8580', kind:'none'};
  const ageMin = (Date.now() - new Date(loc.updatedAt).getTime())/60000;
  if(loc.tripActive && ageMin < 12) return {txt:(loc.speed != null ? Math.round(loc.speed) + ' mph · ' : '') + 'on a trip', col:'#2e9e6b', kind:'moving'};
  if(ageMin < 12 && loc.eventType && loc.eventType.toLowerCase().indexOf('tripend') >= 0) return {txt:'trip ended ' + fmtAgo(ageMin), col:'#5f5a5a', kind:'parked'};
  return {txt:'last seen ' + fmtAgo(ageMin), col: ageMin > 120 ? '#a04b00' : '#5f5a5a', kind:'parked'};
}
function vanLabel(v){ return v.label || ('Van ' + String(v.imei).slice(-4)); }
let fleetMap = null;
function fleetView(){
  const vans = vehicles.filter(v=>v.active!==false);
  const locByImei = {};
  vehicleLocs.forEach(l=>{ locByImei[l.imei] = l; });
  setTimeout(initFleetMap, 0);
  if(!vans.length) return `
    <div class="section-head"><div><h2>Fleet</h2></div></div>
    <div class="card" style="cursor:default"><div class="hint">Vans appear automatically the first time they drive with Bouncie connected.</div></div>`;
  return `
    <div class="section-head" style="margin-bottom:8px"><div><h2>Fleet</h2></div></div>
    <div id="fleet-map" style="height:52vh;min-height:300px;border-radius:14px;background:#eee6e6;margin-bottom:8px;overflow:hidden"></div>
    ${(()=>{
      const q = needsDriverList();
      const rc = returnsOnCallList();
      let h = '';
      if(!q.length && !rc.length) h += `<div style="display:flex;align-items:center;gap:7px;padding:8px 10px;border-radius:10px;background:#e9f6ee;color:#0d5c33;font-size:12px;font-weight:700;margin-bottom:8px">✓ Every trip is covered</div>`;
      if(q.length) h += `<div style="font-size:11px;font-weight:800;color:#8a4b00;margin:2px 2px 6px;letter-spacing:.4px">NEEDS A DRIVER (${q.length})</div>` + q.map(l=>`
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #eecfa8;background:#fff8ef;border-radius:10px;margin-bottom:6px">
        <div style="flex:1;min-width:0;cursor:pointer" onclick="modal={type:'apptDetail',leadId:${l.id}};render()">
          <div style="font-size:12.5px;font-weight:700">${fmtTime(l.pickupTime)||'—'} · ${esc(l.first)} ${esc(l.last)}</div>
          <div style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.date===fmtDate(today)?'Today':fmtNice(l.date)} · ${esc(l.pickup||'no pickup address')}</div>
        </div>
        <button class="btn-mini" style="flex-shrink:0" onclick="openSuggest(${l.id},'out')">Suggest</button>
      </div>`).join('');
      if(rc.length) h += `<div style="font-size:11px;font-weight:800;color:#185fa5;margin:8px 2px 6px;letter-spacing:.4px">RETURNS ON CALL (${rc.length})</div>` + rc.map(l=>`
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #b5d4f4;background:#f2f8fe;border-radius:10px;margin-bottom:6px">
        <div style="flex:1;min-width:0;cursor:pointer" onclick="modal={type:'apptDetail',leadId:${l.id}};render()">
          <div style="font-size:12.5px;font-weight:700">${esc(l.first)} ${esc(l.last)}</div>
          <div style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Will call when ready · falls to ${esc(driverName(retDriverOf(l)))} · ${esc(l.dropoff||'')}</div>
        </div>
        <button class="btn-mini" style="flex-shrink:0;background:#2e9e6b;color:#fff;border-color:#2e9e6b" onclick="clientReady(${l.id})">Ready</button>
        <button class="btn-mini ghost" style="flex-shrink:0" onclick="openSuggest(${l.id},'ret')">Suggest</button>
      </div>`).join('');
      const t = todayTripsList();
      if(t.length) h += `<div style="font-size:11px;font-weight:800;color:var(--muted);margin:8px 2px 2px;letter-spacing:.4px">TODAY (${t.length})</div>` + t.map(l=>{
        const isRound = l.tripType==='Round Trip';
        const leg = (isRound && l.outDone && !l.retDone) ? 'ret' : 'out';
        const drv = leg==='ret' ? retDriverOf(l) : l.driverId;
        return `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 6px;border-bottom:1px solid #eee3e3">
        <div style="flex:1;min-width:0;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" onclick="modal={type:'apptDetail',leadId:${l.id}};render()">
          <span style="font-size:12.5px;font-weight:700">${fmtTime(l.pickupTime)||'—'}</span>
          <span style="font-size:12.5px"> ${esc(l.first)} ${esc(l.last)}</span>
          <span style="font-size:11px;color:var(--muted)"> · ${esc(driverName(drv))}${leg==='ret'?' · return next':''}</span>
        </div>
        <button class="btn-mini ghost" style="flex-shrink:0" onclick="openSuggest(${l.id},'${leg}')">Suggest</button>
      </div>`;}).join('');
      return h;
    })()}
    ${vans.map(v=>{
      const st = vanStatus(locByImei[v.imei]);
      return `
    <div onclick="modal={type:'vanSheet',imei:'${esc(v.imei)}'};render()" style="display:flex;align-items:center;gap:9px;padding:11px 6px;border-bottom:1px solid #eee3e3;cursor:pointer">
      <span id="vdot-${esc(v.imei)}" style="width:9px;height:9px;border-radius:50%;background:${st.col};flex-shrink:0"></span>
      <span style="font-weight:800;font-size:13.5px">${esc(vanLabel(v))}</span>
      <span style="color:var(--muted);font-size:12.5px">${v.driverId ? esc(driverName(v.driverId)) : 'no driver set'}</span>
      <span id="vst-${esc(v.imei)}" style="margin-left:auto;font-size:11.5px;font-weight:700;color:${st.col};text-align:right">${st.txt}</span>
    </div>`;}).join('')}`;
}
function vanSheetHTML(imei){
  const v = vehicles.find(x=>x.imei===imei);
  if(!v) return '<div class="hint">This van no longer exists.</div>';
  const loc = vehicleLocs.find(l=>l.imei===imei);
  const st = vanStatus(loc);
  const drOpts = users.filter(u=>u.role==='driver' && u.active!==false)
    .map(u=>`<option value="${u.id}" ${v.driverId===u.id?'selected':''}>${esc(u.name)}</option>`).join('');
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <span style="font-size:12.5px;font-weight:700;color:${st.col}">${st.txt}</span>
      ${v.vin ? `<span style="font-size:11px;color:var(--muted)">VIN …${esc(String(v.vin).slice(-6))}</span>` : ''}
    </div>
    <div class="fgroup"><label>Driver</label>
      <select onchange="setVanDriver('${esc(imei)}', this.value)"><option value="">— unassigned —</option>${drOpts}</select>
    </div>
    ${loc && loc.lat != null ? `<button class="btn-primary" style="background:var(--blue)" onclick="centerVan('${esc(imei)}')">Show on map</button>` : ''}
    <button class="btn-mini ghost" style="margin-top:10px" onclick="renameVan('${esc(imei)}')">Rename van</button>`;
}
/* the client just called: they're ready for the return — stamp the time and tell the driver NOW */
async function clientReady(leadId){
  const l = liveLead(leadId); if(!l) return;
  const drv = retDriverOf(l);
  const retFrom = hasStop(l) ? l.stopAddr : l.dropoff;
  if(!drv){ toast('No driver on the return leg — tap Suggest first'); return; }
  const now = new Date();
  const hm = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  if(!confirm(l.first + ' ' + l.last + ' is ready for the return pickup?\n\n' + driverName(drv) + ' will be notified immediately (pickup at ' + (retFrom||'the drop-off location') + ').')) return;
  if(busyGate()){ toast('Working…'); return; }
  l.returnTime = hm;
  patchLead(l, {return_time: hm});
  const n = {id:Date.now(), driverId:drv, read:false, text:`READY NOW: ${l.first} ${l.last} is ready for the return pickup — ${retFrom||'see trip for address'}`};
  notifications.push(n); insertNotif(n);
  render(); toast(driverName(drv) + ' notified — ' + l.first + ' is ready ✓');
}
function centerVan(imei){
  const loc = vehicleLocs.find(l=>l.imei===imei);
  if(!loc || loc.lat == null) return;
  window._fleetView = {c:[loc.lat, loc.lng], z:15};
  modal = null; render();
}
/* ---- dispatch queue: TODAY's Confirmed trips with no driver (tomorrow joins after 6 PM, same rule the drivers see) ---- */
function needsDriverList(){
  const days = [fmtDate(today)];
  if(new Date().getHours() >= opsNum('eveningHour',18)) days.push(addDays(1));
  return leads.filter(l=>l.status==='Confirmed' && days.indexOf(l.date) >= 0 && !l.driverId)
    .sort((a,b)=>((a.date||'')+(a.pickupTime||'99')).localeCompare((b.date||'')+(b.pickupTime||'99')));
}
/* today's assigned, not-yet-finished trips — the working day at a glance, re-suggest at hand */
function todayTripsList(){
  const td = fmtDate(today);
  return leads.filter(l=>l.status==='Confirmed' && l.date===td && l.driverId && !isDone(l))
    .sort((a,b)=>(a.pickupTime||'99').localeCompare(b.pickupTime||'99'));
}
/* today's round trips: client dropped off, no set return time — they'll call when ready */
function returnsOnCallList(){
  const td = fmtDate(today);
  return leads.filter(l=>l.status==='Confirmed' && l.date===td && l.tripType==='Round Trip' && l.outDone && (!hasStop(l) || l.stopDone) && !l.retDone && !l.returnTime)
    .sort((a,b)=>(a.pickupTime||'').localeCompare(b.pickupTime||''));
}
async function openSuggest(leadId, leg){
  const l = liveLead(leadId); if(!l) return;
  leg = leg==='ret' ? 'ret' : 'out';
  modal = {type:'suggest', leadId:leadId, leg:leg, results:null};
  render();
  const drivers = assignableUsers().map(u=>u.role==='admin' ? Object.assign({}, u, {name:assignLabel(u)}) : u);
  const tMin = leg==='ret' ? toMin(l.returnTime) : toMin(l.pickupTime);
  const destAddr = leg==='ret' ? ((hasStop(l) ? l.stopAddr : l.dropoff) || l.pickup) : l.pickup; /* return pickup happens at the LAST drop-off (second stop when there is one) */
  const res = await Promise.all(drivers.map(async u=>{
    const van = vehicles.find(v=>v.driverId===u.id && v.active!==false);
    const loc = van ? vehicleLocs.find(x=>x.imei===van.imei) : null;
    const hasPos = !!(loc && loc.lat != null && (Date.now() - new Date(loc.updatedAt).getTime()) < opsNum('vanStaleHrs',12)*3600e3);
    const legs = driverLegs(u.id, l.date).filter(x=>x.l.id !== l.id);
    let conflict = null;
    if(tMin != null){
      const near = legs.map(x=>({t:toMin(x.time), x:x})).filter(y=>y.t != null && Math.abs(y.t - tMin) < opsNum('conflictMin',90))
        .sort((a,b)=>Math.abs(a.t - tMin) - Math.abs(b.t - tMin))[0];
      if(near) conflict = near.x;
    }
    let eta = null;
    if(hasPos && destAddr && OPS.mapsEnabled){
      try{ eta = await routesDuration({lat:loc.lat, lng:loc.lng}, destAddr); }catch(e){ console.error(e); }
    }
    return {u:u, van:van, eta:eta, conflict:conflict, clocked:!!openShiftOf(u.id), hasPos:hasPos, legsCount:legs.length};
  }));
  res.sort((a,b)=>{
    const ca = a.conflict ? 1 : 0, cb = b.conflict ? 1 : 0;
    if(ca !== cb) return ca - cb;
    if((a.eta != null) !== (b.eta != null)) return a.eta != null ? -1 : 1;
    if(a.eta != null && b.eta != null && a.eta !== b.eta) return a.eta - b.eta;
    return a.legsCount - b.legsCount;
  });
  if(modal && modal.type==='suggest' && modal.leadId===leadId && modal.leg===leg){ modal.results = res; render(); }
}
function suggestHTML(){
  const l = leads.find(x=>x.id===modal.leadId);
  if(!l) return '<div class="hint">This trip no longer exists.</div>';
  const leg = modal.leg==='ret' ? 'ret' : 'out';
  const cur = leg==='ret' ? retDriverOf(l) : l.driverId;
  const legLabel = leg==='ret'
    ? ('Return pickup · ' + (l.returnTime ? fmtTime(l.returnTime) : 'will call when ready') + ' · ' + esc((hasStop(l) ? l.stopAddr : l.dropoff) || l.pickup || ''))
    : (fmtTime(l.pickupTime) + ' pickup · ' + esc(l.pickup || ''));
  const head = `<div style="margin-bottom:12px">
    <div style="font-weight:800;font-size:14px">${esc(l.first)} ${esc(l.last)} — ${l.date===fmtDate(today)?'Today':fmtNice(l.date)}</div>
    <div class="hint" style="margin:2px 0 0">${legLabel}</div>
    ${cur ? `<div class="hint" style="margin:2px 0 0">Currently: <b>${esc(driverName(cur))}</b> — tap someone else to reassign</div>` : ''}
  </div>`;
  if(!modal.results) return head + '<div class="hint">Ranking drivers — live van positions, drive times, schedules…</div>';
  if(!modal.results.length) return head + '<div class="hint">No active drivers to suggest.</div>';
  return head + modal.results.map((r,i)=>{
    const isCur = cur && r.u.id === cur;
    const best = i===0 && !r.conflict && !isCur;
    const badge = isCur
      ? `<span style="background:#e9e4e4;color:#5f5a5a;font-size:10px;font-weight:800;padding:2px 8px;border-radius:9px">current</span>`
      : r.conflict
      ? `<span style="background:#faeeda;color:#633806;font-size:10px;font-weight:800;padding:2px 8px;border-radius:9px">tight window</span>`
      : best ? `<span style="background:#e1f5ee;color:#085041;font-size:10px;font-weight:800;padding:2px 8px;border-radius:9px">best fit</span>` : '';
    const bits = [];
    bits.push(r.eta != null ? (r.eta + ' min away' + (r.van ? ' (' + esc(vanLabel(r.van)) + ')' : '')) : (r.hasPos ? 'position known' : 'no live van position'));
    if(!r.clocked) bits.push('not clocked in');
    bits.push(r.conflict ? ('has ' + esc(r.conflict.l.first) + ' ' + esc(r.conflict.l.last) + ' at ' + fmtTime(r.conflict.time)) : (r.legsCount ? r.legsCount + ' other leg' + (r.legsCount===1?'':'s') + ' that day' : 'free that day'));
    return `<div onclick="assignFromSuggest(${l.id}, '${r.u.id}', '${leg}')" style="border:${best?'2px solid #b5d4f4':'1px solid #eee3e3'};border-radius:11px;padding:10px 12px;margin-bottom:8px;cursor:pointer;${isCur?'opacity:.75':''}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:800;font-size:13.5px">${esc(r.u.name)}</span>${badge}
      </div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${bits.join(' · ')}</div>
    </div>`;
  }).join('') + '<div class="hint" style="margin-top:4px">Tap a driver to assign — both drivers are notified on a reassign. Ranked by live drive time + schedule fit. Nothing assigns automatically.</div>';
}
async function assignFromSuggest(leadId, driverId, leg){
  const l = liveLead(leadId); if(!l) return;
  leg = leg==='ret' ? 'ret' : 'out';
  const cur = leg==='ret' ? retDriverOf(l) : l.driverId;
  if(cur === driverId){ toast(driverName(driverId) + ' already has this ' + (leg==='ret'?'return':'trip')); return; }
  const what = leg==='ret'
    ? ('the return pickup for ' + l.first + ' ' + l.last + (l.returnTime ? ' at ' + fmtTime(l.returnTime) : ' (on call)'))
    : (l.first + ' ' + l.last + ' — ' + fmtNice(l.date) + ', ' + fmtTime(l.pickupTime) + ' pickup');
  if(!confirm('Assign ' + driverName(driverId) + ' to ' + what + '?' + (cur ? '\n\n' + driverName(cur) + ' currently has it and will be notified of the change.' : ''))) return;
  if(busyGate()){ toast('Working…'); return; }
  const oldP = l.driverId, oldR = l.tripType==='Round Trip' ? retDriverOf(l) : null, oldDate = l.date;
  if(leg==='ret'){
    l.returnDriverId = (driverId === l.driverId) ? null : driverId;
    patchLead(l, {return_driver_id: l.returnDriverId});
    const n = {id:Date.now(), driverId:driverId, read:false, text:`Return pickup assigned: ${l.first} ${l.last} — ${l.date===fmtDate(today)?'today':fmtNice(l.date)}, ${l.returnTime ? fmtTime(l.returnTime) : 'client will call when ready'} · ${l.dropoff||''}`};
    notifications.push(n); insertNotif(n);
    if(cur && cur !== driverId) insertNotif({driverId:cur, read:false, text:`REASSIGNED: the return pickup for ${l.first} ${l.last} today was moved to ${driverName(driverId)} — removed from your schedule.`});
  } else {
    l.driverId = driverId;
    patchLead(l, {driver_id: driverId});
    const n = {id:Date.now(), driverId:driverId, read:false, text:`New trip assigned: ${l.first} ${l.last} — ${fmtNice(l.date)}, pickup ${fmtTime(l.pickupTime)}`};
    notifications.push(n); insertNotif(n);
    if(cur && cur !== driverId) insertNotif({driverId:cur, read:false, text:`REASSIGNED: ${l.first} ${l.last} — ${fmtNice(l.date)}, ${fmtTime(l.pickupTime)} pickup was moved to ${driverName(driverId)} — removed from your schedule.`});
  }
  if(l.status==='Confirmed' && !cur) queueConfirmation(l); /* reassigns don't re-email the client */
  recomputeAround(l, oldP, oldR, oldDate);
  modal = null; render(); toast('Assigned to ' + driverName(driverId) + ' ✓ — driver' + (cur?'s':'') + ' notified');
}
async function initFleetMap(){
  if(!(currentUser && currentUser.role==='admin') || adminTab!=='fleet' || !$('fleet-map')) return;
  try{ await loadLeaflet(); }
  catch(e){ const el=$('fleet-map'); if(el) el.innerHTML='<div class="hint" style="padding:24px;text-align:center">Could not load the map — check your internet and reopen this tab.</div>'; return; }
  if(adminTab!=='fleet' || !$('fleet-map')) return;
  if(fleetMap){ try{ fleetMap.remove(); }catch(e){} fleetMap = null; }
  window._fleetMarkers = {};
  fleetMap = L.map('fleet-map');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'&copy; OpenStreetMap'}).addTo(fleetMap);
  const pts = refreshFleetPositions();
  if(window._fleetView){ fleetMap.setView(window._fleetView.c, window._fleetView.z); }
  else if(pts.length === 1) fleetMap.setView(pts[0], 13);
  else if(pts.length) fleetMap.fitBounds(pts, {padding:[36,36]});
  else fleetMap.setView([29.7, -95.36], 9);
  fleetMap.on('moveend zoomend', ()=>{ try{ window._fleetView = {c:fleetMap.getCenter(), z:fleetMap.getZoom()}; }catch(e){} });
}
function vanIcon(st, label){
  return L.divIcon({className:'', iconSize:null, html:
    '<div style="background:'+st.col+';color:#fff;font:700 11px -apple-system,Helvetica,sans-serif;padding:3px 9px;border-radius:11px;white-space:nowrap;transform:translate(-50%,-50%);box-shadow:0 1px 4px rgba(0,0,0,.45)">'+esc(label)+'</div>'});
}
/* moves/refreshes markers on the EXISTING map (no teardown) + live-updates the status line on each van card */
function refreshFleetPositions(){
  if(!fleetMap) return [];
  const mks = window._fleetMarkers || (window._fleetMarkers = {});
  const seen = {};
  const pts = [];
  vehicles.filter(v=>v.active!==false).forEach(v=>{
    const loc = vehicleLocs.find(l=>l.imei===v.imei);
    const stEl = $('vst-'+v.imei);
    const st = vanStatus(loc);
    if(stEl){ stEl.textContent = st.txt; stEl.style.color = st.col; }
    const dotEl = $('vdot-'+v.imei);
    if(dotEl) dotEl.style.background = st.col;
    if(!loc || loc.lat == null) return;
    seen[v.imei] = true;
    pts.push([loc.lat, loc.lng]);
    const popup = '<b>'+esc(vanLabel(v))+'</b><br>'+(v.driverId ? esc(driverName(v.driverId))+'<br>' : '')+st.txt;
    if(mks[v.imei]){
      mks[v.imei].setLatLng([loc.lat, loc.lng]);
      mks[v.imei].setIcon(vanIcon(st, vanLabel(v)));
      mks[v.imei].setPopupContent(popup);
    } else {
      mks[v.imei] = L.marker([loc.lat, loc.lng], {icon: vanIcon(st, vanLabel(v))}).addTo(fleetMap).bindPopup(popup);
    }
  });
  Object.keys(mks).forEach(imei=>{ if(!seen[imei]){ try{ fleetMap.removeLayer(mks[imei]); }catch(e){} delete mks[imei]; } });
  return pts;
}
async function setVanDriver(imei, driverId){
  const {error} = await sb.from('vehicles').update({driver_id: driverId || null}).eq('imei', imei);
  if(error){ toast('Could not save: ' + error.message); return; }
  await refetch('vehicles');
  render(); toast(driverId ? 'Driver set ✓' : 'Driver cleared');
}
async function renameVan(imei){
  const v = vehicles.find(x=>x.imei===imei); if(!v) return;
  const name = prompt('Name for this van (e.g. "Van 1 — stretcher"):', v.label || '');
  if(name === null) return;
  const {error} = await sb.from('vehicles').update({label: name.trim().slice(0,40)}).eq('imei', imei);
  if(error){ toast('Could not save: ' + error.message); return; }
  await refetch('vehicles');
  render(); toast('Van renamed ✓');
}
function uncollectedHTML(){
  const showInv = !!modal.showInvoiced;
  const list = showInv ? invoicedOpenList() : uncollectedList();
  const total = list.reduce((a,l)=>a + (showInv ? (l.invoiceAmount!=null?l.invoiceAmount:revenueOf(l)) : revenueOf(l)), 0);
  const tabs = `
    <div class="pills" style="margin-bottom:12px">
      <button class="${!showInv?'active':''}" onclick="modal.showInvoiced=false;render()">Not collected (${uncollectedList().length})</button>
      <button class="${showInv?'active':''}" onclick="modal.showInvoiced=true;render()">Invoiced (${invoicedOpenList().length})</button>
    </div>`;
  if(!list.length) return tabs + `<div class="hint">${showInv ? 'No invoices awaiting payment.' : 'Nothing outstanding — every billed trip is paid. 🎉'}</div>`;
  return tabs + `
    <div class="hint" style="margin-bottom:10px"><b>${money(total)}</b> across ${list.length} trip${list.length>1?'s':''} — oldest first. Tap a trip to collect.</div>
    ${showInv ? `<button class="btn-mini" style="margin-bottom:10px" onclick="checkInvoices()">Check all with Square now</button>` : ''}
    ${list.map(l=>`
    <div class="card" onclick="modal={type:'apptDetail',leadId:${l.id}};render()">
      <div class="row1">
        <div class="name" style="font-size:13.5px">${esc(l.first)} ${esc(l.last)}</div>
        <span style="display:flex;gap:6px;align-items:center">${ageBadge(l)}<span style="font-size:12.5px;font-weight:700">${money(showInv ? (l.invoiceAmount!=null?l.invoiceAmount:revenueOf(l)) : revenueOf(l))}</span></span>
      </div>
      <div class="meta"><span>${fmtNice(l.date)}</span><span>${l.status}</span>${showInv && l.invoicedAt ? `<span>invoiced ${fmtNice(fmtDate(new Date(l.invoicedAt)))}</span>` : `<span>${l.status==='Canceled'?'cancel fee':l.status==='No Show'?'no-show fee':'trip charge'}</span>`}</div>
    </div>`).join('')}`;
}
function salesDriverView(){
  const u = users.find(x=>x.id===salesDriver);
  if(!u){ salesDriver=null; return salesView(); }
  const yStart = `${today.getFullYear()}-01-01`;
  const td = fmtDate(today);
  const ytdRev = driverRevenueMap(yStart, td)[u.id] || 0;
  const ytdPay = driverPayBetween(u.id, yStart, td);
  const ytdMargin = ytdRev > 0 ? ((ytdRev - ytdPay)/ytdRev*100).toFixed(1)+'%' : '—';
  const months = [];
  for(let i=0; i<12; i++){
    const d = new Date(today.getFullYear(), today.getMonth()-i, 1);
    const ms = fmtDate(d), me = fmtDate(new Date(d.getFullYear(), d.getMonth()+1, 0));
    const rev = driverRevenueMap(ms, me)[u.id] || 0;
    const pay = driverPayBetween(u.id, ms, me);
    if(rev===0 && pay===0 && i>2) continue;
    months.push({lab:d.toLocaleDateString('en-US',{month:'short',year:'numeric'}), rev, pay});
  }
  const mMax = Math.max(...months.map(x=>Math.max(x.rev,x.pay)), 1);
  return `
    <button class="btn-mini ghost" style="margin-bottom:12px" onclick="salesDriver=null;render()">‹ Back to Sales</button>
    <div class="card" style="cursor:default">
      <div class="user-card">
        ${avatarHTML(u)}
        <div style="flex:1"><div class="name">${esc(u.name)}</div><div class="meta"><span>${u.role==='admin' ? 'admin — not paid for trips' : money(u.hourlyRate||0)+'/hr'}</span></div></div>
      </div>
    </div>
    <div class="stat">
      <div style="flex:1"><div class="n">${money(ytdRev)}</div><div class="l">YTD Revenue</div></div>
      <div class="divider"></div>
      <div style="flex:1"><div class="n">${money(ytdPay)}</div><div class="l">YTD Pay</div></div>
      <div class="divider"></div>
      <div style="flex:1"><div class="n">${ytdMargin}</div><div class="l">Margin</div></div>
    </div>
    <div class="fsection">Month by Month</div>
    ${months.map(x=>{
      const marg = x.rev>0 ? ((x.rev-x.pay)/x.rev*100).toFixed(0)+'%' : '—';
      return `<div class="card" style="cursor:default">
      <div class="row1" style="margin-bottom:8px"><div class="name" style="font-size:14px">${x.lab}</div><span style="font-size:11.5px;font-weight:700;color:var(--muted)">margin ${marg}</span></div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <div style="flex:1;background:#f1ecec;border-radius:5px;height:10px"><div style="width:${Math.round(x.rev/mMax*100)}%;background:#2e9e6b;height:10px;border-radius:5px"></div></div>
        <span style="width:70px;text-align:right;font-size:12px;font-weight:700;color:#0d5c33">${money(x.rev)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="flex:1;background:#f1ecec;border-radius:5px;height:10px"><div style="width:${Math.round(x.pay/mMax*100)}%;background:#cf4d4d;height:10px;border-radius:5px"></div></div>
        <span style="width:70px;text-align:right;font-size:12px;font-weight:700;color:#7c1414">${money(x.pay)}</span>
      </div>
    </div>`;}).join('')}`;
}
function rangeHTML(){
  const [s, e] = periodRange(salesPeriod);
  return `
    <div class="frow">
      <div class="fgroup"><label>From</label><input id="r-from" type="date" value="${salesFrom||s}"></div>
      <div class="fgroup"><label>To</label><input id="r-to" type="date" value="${salesTo||e}"></div>
    </div>
    <button class="btn-primary" onclick="applyRange()">Apply Range</button>`;
}
function applyRange(){
  const f = $('r-from').value, t = $('r-to').value;
  if(!f || !t){ toast('Pick both dates'); return; }
  salesFrom = f <= t ? f : t;
  salesTo = f <= t ? t : f;
  salesPeriod = 'custom';
  modal = null; render();
}

/* ================= ADMIN: USERS ================= */
function usersView(){
  const active = users.filter(u=>u.active!==false);
  const items = active.map(u=>`
    <div class="card" onclick="openUserForm('${u.id}')">
      <div class="user-card">
        ${avatarHTML(u)}
        <div style="flex:1">
          <div class="name">${esc(u.name)}</div>
          <div class="meta"><span>@${esc(u.username)}</span><span>${esc(phoneFmt(u.phone))}</span></div>
        </div>
        <span class="badge ${u.role==='admin'?'gold':'completed'}">${u.role}</span>
      </div>
    </div>`).join('');
  return `
    <button class="btn-mini ghost" style="margin-bottom:12px" onclick="adminTab='settings';render()">‹ Back to Settings</button>
    <div class="section-head">
      <div><h2>Users</h2><div class="count">${active.length} accounts · tap a driver to edit</div></div>
      <button class="fab" onclick="openUserForm(null)">+</button>
    </div>${items}`;
}
function openUserForm(id){
  const u = id ? users.find(x=>x.id===id) : null;
  window._payBreak = false; /* start the payroll breakdown collapsed for each driver */
  modal = {type:'userForm', userId:id, photo:u ? (u.photo||null) : null};
  render();
}
function keepDraft(){
  modal.draft = {name:$('u-name').value, phone:$('u-phone').value, username:$('u-user').value, hourlyRate:$('u-rate')?$('u-rate').value:0};
  if($('u-role')) modal.draft.role = $('u-role').value;
  if($('u-pass')) modal.draft.password = $('u-pass').value;
  modal.rtDraft = Array.from({length:7},(_,i)=>$('rt-'+i)?$('rt-'+i).value:'');
}
function setFormPhoto(){ keepDraft(); pickImage(d => { modal.photo = d; render(); }, 256); }
function removeFormPhoto(){ keepDraft(); modal.photo = null; render(); }
function userFormHTML(u){
  const isNew = !u;
  u = u || {name:'',username:'',password:'',phone:'',role:'driver'};
  const isAdminRole = (u.role||'driver')==='admin';
  if(modal.draft) u = Object.assign({}, u, modal.draft);
  const pv = modal.photo ? `<img src="${esc(modal.photo)}">` : (u.name ? esc(u.name.split(' ').map(w=>w[0]).join('').slice(0,2)) : '📷');
  return `
    <div class="photo-row">
      <div class="avatar big">${pv}</div>
      <div>
        <button class="btn-mini" onclick="setFormPhoto()">${modal.photo?'Change Photo':'Upload Photo'}</button>
        ${modal.photo?`<button class="btn-mini ghost" style="margin-left:6px" onclick="removeFormPhoto()">Remove</button>`:''}
      </div>
    </div>
    <div class="fgroup"><label>Full Name</label><input id="u-name" value="${esc(u.name)}"></div>
    <div class="fgroup"><label>Phone</label><input id="u-phone" inputmode="tel" value="${esc(phoneFmt(u.phone))}" oninput="this.value=phoneFmt(this.value)"></div>
    <div class="fgroup"><label>Username</label><input id="u-user" value="${esc(u.username)}" autocomplete="off" ${isNew?'':'disabled'}>
      ${isNew?'':'<div class="hint">Usernames can\'t be changed after the account is created.</div>'}</div>
    ${isNew
      ? `<div class="fgroup"><label>Password (6+ characters)</label><input id="u-pass" value="${esc(u.password||'')}" autocomplete="off"></div>`
      : `<div class="hint" style="margin-bottom:12px">🔒 Passwords are securely encrypted. The driver can change theirs in Settings → Change Password. If they forget it, reset it in your Supabase dashboard (Authentication → Users).</div>`}
    <div class="fgroup"><label>Role</label>
      <select id="u-role">
        <option value="driver" ${!isAdminRole?'selected':''}>Driver</option>
        <option value="admin" ${isAdminRole?'selected':''}>Admin — full access to everything</option>
      </select>
      <div class="hint">Admins see all trips, money, clients and settings. Give each office person their own admin account so the audit trail shows who did what.</div>
    </div>

    ${(isAdminRole && !isNew) ? '' : `
    <div class="fgroup"><label>Hourly Rate ($/hour)</label><input id="u-rate" type="number" min="0" step="0.25" value="${u.hourlyRate!=null?u.hourlyRate:0}"></div>

    <div class="fsection">Office Report Times — Next 7 Days</div>
    <div class="hint" style="margin-bottom:10px">Auto = calculated from the day's first pickup minus drive time and buffer (needs the Maps key in Settings → Trip Timing &amp; Maps). Type a time to override; clear it to go back to Auto.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      ${Array.from({length:7},(_,i)=>{
        const d = new Date(today); d.setDate(d.getDate()+i);
        const ds = fmtDate(d);
        const rrow = modal.userId ? getReportRow(modal.userId, ds) : null;
        const autoVal = rrow && !rrow.manual && rrow.rt ? fmtTime(rrow.rt) : '';
        return `<div style="background:#fff;border:1.5px solid var(--line);border-radius:10px;padding:8px 10px">
          <div style="font-size:10.5px;font-weight:700;color:var(--muted)">${d.toLocaleDateString('en-US',{weekday:'short',month:'numeric',day:'numeric'})}${i===0?' · today':''}</div>
          <input id="rt-${i}" data-day="${ds}" type="time" value="${modal.rtDraft ? esc(modal.rtDraft[i]||'') : (rrow && rrow.manual ? esc(rrow.rt) : '')}" style="width:100%;min-width:0;border:none;padding:6px 0;font-size:14px;background:none;outline:none">
          <div style="font-size:10px;color:var(--muted)">${rrow && rrow.manual ? 'Manual override' : (autoVal ? 'Auto: '+autoVal : 'Auto')}</div>
        </div>`;
      }).join('')}
    </div>
    `}

    ${!isNew && modal.userId && !isAdminRole ? (()=>{
      const recent = shifts.filter(x=>x.driverId===modal.userId).sort((a,b)=>b.in-a.in).slice(0,10);
      const [ws40, we40] = weekRangeOf(today);
      const wk40 = paidBetween(modal.userId, ws40, we40);
      const hist40 = auditLog.filter(a=>a.action.startsWith('shift_') && a.target.includes('driver:'+modal.userId))
        .sort((a,b)=>(b.at||'').localeCompare(a.at||'')).slice(0,8);
      const auditName = id => { const p = users.find(u=>u.id===id); return p ? p.name : 'admin'; };
      return `
    ${wk40>40?`<div class="notifbar" style="background:#fdecec;border-color:#f0b9b9"><div class="nb-item" style="color:var(--red)"><b>⚠ ${wk40.toFixed(2)} hours this week — over 40.</b> Pay is flat-rate; review this week's shifts.</div></div>`:''}
    <div class="fsection">Driver's License</div>
    ${u.licPendAt?`<div class="notifbar" style="background:#fdf6e8;border-color:#e8d5a8"><div class="nb-item">🪪 <b>New license photos submitted ${fmtNice(fmtDate(new Date(u.licPendAt)))}</b> — review, then approve to replace the ones on file or reject to discard.</div></div>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <div style="flex:1;border:1px solid #e8d5a8;border-radius:10px;padding:10px;text-align:center;background:#fffdf6"><div style="font-size:11px;font-weight:700;margin-bottom:6px">New front</div>${u.licPendFront?`<button class="btn-mini ghost" onclick="viewDoc('${esc(u.licPendFront)}')">View</button>`:'<div class="hint">—</div>'}</div>
      <div style="flex:1;border:1px solid #e8d5a8;border-radius:10px;padding:10px;text-align:center;background:#fffdf6"><div style="font-size:11px;font-weight:700;margin-bottom:6px">New back</div>${u.licPendBack?`<button class="btn-mini ghost" onclick="viewDoc('${esc(u.licPendBack)}')">View</button>`:'<div class="hint">—</div>'}</div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button class="btn-mini" style="flex:1;background:var(--green)" onclick="approveLicense('${u.id}')">Approve new license</button>
      <button class="btn-mini ghost" style="flex:1;color:var(--red)" onclick="rejectLicense('${u.id}')">Reject</button>
    </div>`:''}
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <div style="flex:1;border:1px ${u.licFront?'solid':'dashed'} var(--line);border-radius:10px;padding:10px;text-align:center"><div style="font-size:11px;font-weight:700;margin-bottom:6px">Front on file</div>${u.licFront?`<button class="btn-mini ghost" onclick="viewDoc('${esc(u.licFront)}')">View</button>`:'<div class="hint">Not uploaded</div>'}</div>
      <div style="flex:1;border:1px ${u.licBack?'solid':'dashed'} var(--line);border-radius:10px;padding:10px;text-align:center"><div style="font-size:11px;font-weight:700;margin-bottom:6px">Back on file</div>${u.licBack?`<button class="btn-mini ghost" onclick="viewDoc('${esc(u.licBack)}')">View</button>`:'<div class="hint">Not uploaded</div>'}</div>
    </div>
    <div class="fsection">Pay the Driver</div>
    ${(()=>{ /* v6.47: mark what's been paid — first payout needs a start date, later ones anchor on the last */
      const dpo = payoutsOf(u.id);
      const dpt = paidThroughOf(u.id);
      const firstShift = (()=>{ const mine = shifts.filter(x=>x.driverId===u.id); return mine.length ? fmtDate(new Date(Math.min(...mine.map(x=>x.in)))) : fmtDate(today); })();
      const defFrom = dpt ? addDaysTo(dpt,1) : firstShift;
      const defTo = fmtDate(today);
      const defHrs = defFrom <= defTo ? paidBetween(u.id, defFrom, defTo) : 0;
      const defAmt = (defHrs * (+u.hourlyRate||0)).toFixed(2);
      return `
      ${dpt ? `<div class="hint" style="margin-bottom:8px">Paid through <b>${fmtNice(dpt)}</b> · owed since: <b>${defHrs.toFixed(2)} h · ${money(defHrs*(+u.hourlyRate||0))}</b></div>`
            : '<div class="hint" style="margin-bottom:8px">First payout for this driver — set the start date your arrangement began (defaults to their first recorded shift).</div>'}
      <div class="frow" style="align-items:flex-end">
        ${dpt ? `` : `<div class="fgroup" style="margin:0"><label>From (first payout)</label><input id="po-from" type="date" value="${defFrom}"></div>`}
        <div class="fgroup" style="margin:0"><label>Paid through</label><input id="po-to" type="date" value="${defTo}"></div>
        <div class="fgroup" style="margin:0"><label>Amount paid ($)</label><input id="po-amt" type="number" step="0.01" value="${defAmt}"></div>
      </div>
      <button type="button" class="btn-mini" style="margin:10px 0 6px;background:var(--green)" onclick="markPaidThrough('${u.id}')">Mark paid ✓</button>
      ${dpt ? `<div class="hint" style="margin-bottom:8px">Covers ${fmtNice(defFrom)} onward automatically. Amount is pre-filled from hours × rate — change it if you paid a different figure.</div>` : ''}
      ${dpo.length ? `<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:8px 0 4px">Payout history</div>
      <div class="detail-grid" style="margin-bottom:12px">
        ${dpo.slice(0,8).map((p,i)=>{ const cd = d => new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
          return `<div class="drow"><span class="k" style="min-width:0;flex-shrink:1">${p.at?cd(fmtDate(new Date(p.at))):''} · covered ${cd(p.start)} – ${cd(p.end)}, ${p.end.slice(0,4)}</span><span class="v" style="white-space:nowrap">${(+p.hours).toFixed(2)} h · <b>${money(p.amount)}</b>${i===0?` <button class="btn-mini ghost" style="padding:2px 8px;font-size:11px" onclick="undoLastPayout('${u.id}')">undo</button>`:''}</span></div>`;}).join('')}
      </div>` : ''}`;
    })()}
    <div class="fsection">Payroll — Any Date Range</div>
    <div class="frow">
      <div class="fgroup" style="margin-bottom:8px"><label>From</label><input type="date" value="${adFrom}" onchange="adFrom=this.value;renderPayResult('${modal.userId}')"></div>
      <div class="fgroup" style="margin-bottom:8px"><label>To</label><input type="date" value="${adTo}" onchange="adTo=this.value;renderPayResult('${modal.userId}')"></div>
    </div>
    <div id="pay-result">${payResultHTML(modal.userId)}</div>
    <div class="fsection">Time Clock — Recent Shifts</div>
    <div class="hint" style="margin-bottom:10px">Fix a missed or wrong punch here — corrected hours feed pay. Paid time starts at the scheduled report time; approve an early start to pay from the actual clock-in.</div>
    <div style="background:#fff;border:1.5px solid var(--line);border-radius:12px;padding:10px 12px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Add a completed shift</div>
      <div class="frow" style="align-items:flex-end">
        <div class="fgroup" style="margin:0"><label>Date</label><input id="as-date" type="date" value="${fmtDate(today)}"></div>
        <div class="fgroup" style="margin:0"><label>In</label><input id="as-in" type="time"></div>
        <div class="fgroup" style="margin:0"><label>Out</label><input id="as-out" type="time"></div>
      </div>
      <button type="button" class="btn-mini" style="margin-top:10px" onclick="adminAddShift('${modal.userId}')">Add Shift</button>
    </div>
    ${recent.length ? recent.map(x=>{
      const ps = paidStartOf(x);
      const clamped = ps > x.in;
      const earlyBtn = x.earlyOk
        ? `<div style="margin:-4px 0 10px"><button class="btn-mini" style="background:var(--green)" onclick="adminToggleEarly(${x.id},false)">✓ Early start approved — paid from ${fmtClock(x.in)} (tap to undo)</button></div>`
        : clamped
          ? `<div style="margin:-4px 0 10px"><button class="btn-mini ghost" onclick="adminToggleEarly(${x.id},true)">Clocked in ${fmtClock(x.in)} · paid from ${fmtClock(ps)} — tap to approve early start</button></div>`
          : '';
      return `
      <div class="frow" style="align-items:flex-end;margin-bottom:8px">
        <div style="width:80px;font-size:11px;font-weight:700;color:${x.flagged?'var(--red)':'var(--muted)'};padding-bottom:12px">${new Date(x.in).toLocaleDateString('en-US',{month:'short',day:'numeric'})}${x.flagged?'<br>⚠ review':''}</div>
        <div class="fgroup" style="margin:0"><label>In</label><input type="time" value="${toHM(x.in)}" onchange="this._dirty=1" onblur="if(this._dirty){this._dirty=0;adminFixShift(${x.id},'in',this.value)}"></div>
        <div class="fgroup" style="margin:0"><label>Out</label><input type="time" value="${x.out?toHM(x.out):''}" onchange="this._dirty=1" onblur="if(this._dirty){this._dirty=0;adminFixShift(${x.id},'out',this.value)}"></div>
        <button class="btn-mini ghost" style="margin-bottom:4px" onclick="adminDelShift(${x.id})">✕</button>
      </div>${earlyBtn}${clockInDetail(x)}`;}).join('') : '<div class="hint" style="margin-bottom:12px">No shifts recorded yet.</div>'}
    ${hist40.length?`
    <div class="fsection">Shift Change History</div>
    <div class="detail-grid">
      ${hist40.map(a=>`<div class="drow"><span class="k">${a.at?new Date(a.at).toLocaleDateString('en-US',{month:'short',day:'numeric'}):''} · ${a.action==='shift_add'?'Added':a.action==='shift_delete'?'Deleted':'Corrected'} by ${esc(auditName(a.actor))}</span>
        <span class="v">${a.before?esc(a.before)+' → ':''}${esc(a.after)||'removed'}</span></div>`).join('')}
    </div>`:''}`;
    })() : ''}

    <button class="btn-primary" onclick="saveUser(${isNew?'null':"'"+modal.userId+"'"})">${isNew?'Create Driver Account':'Save Changes'}</button>
    ${isNew?'':`<button class="btn-danger" onclick="deleteUser('${modal.userId}')">Deactivate ${isAdminRole?'Admin':'Driver'}</button>`}`;
}
async function saveUser(id){
  const name=$('u-name').value.trim(), un=$('u-user').value.trim().toLowerCase(), ph=$('u-phone').value;
  if(!name||!un){ toast('Name and username are required'); return; }
  if(!/^[a-z0-9._-]+$/.test(un)){ toast('Username: letters, numbers, dots, dashes only'); return; }
  if(users.some(u=>u.username && u.username.toLowerCase()===un && u.id!==id)){ toast('Username already taken'); return; }
  if(!id){ const pw0 = $('u-pass') ? $('u-pass').value : ''; if(!pw0 || pw0.length<6){ toast('Password must be at least 6 characters'); return; } }
  if(busyGate()){ toast('Saving…'); return; }
  const rate = Math.max(0, +($('u-rate') ? $('u-rate').value : 0) || 0);
  let uid;
  const roleSel = $('u-role') ? $('u-role').value : 'driver';
  if(id){
    const u = users.find(x=>x.id===id);
    if(roleSel !== u.role){
      const otherAdmins = users.filter(x=>x.role==='admin' && x.active!==false && x.id!==id).length;
      if(u.role==='admin' && roleSel==='driver'){
        if(id===currentUser.id){ toast('You cannot demote your own account'); return; }
        if(!otherAdmins){ toast('Cannot demote the only admin — promote someone else first'); return; }
      }
      const {error:re} = await sb.from('profiles').update({role:roleSel}).eq('id', id);
      if(re){ toast('Role change failed: ' + re.message); return; }
      u.role = roleSel;
    }
    Object.assign(u, {name, phone:ph, photo:modal.photo, hourlyRate:rate});
    /* v6.22: awaited + verified (was fire-and-forget) */
    const {error:uErr} = await sb.from('profiles').update(toDb.user(u)).eq('id', u.id);
    if(uErr){ syncErr(uErr); toast('SAVE FAILED — nothing stored. Check your connection and tap Save again.'); return; }
    uid=id; toast(u.role==='admin' ? 'Admin updated' : 'Driver updated');
  } else {
    const pw = $('u-pass').value;
    if(!pw || pw.length<6){ toast('Password must be at least 6 characters'); return; }
    toast('Creating account…');
    const {data, error} = await tmpAuthClient().auth.signUp({
      email:`${un}@${AUTH_DOMAIN}`, password:pw,
      options:{data:{role:'driver', name, username:un, phone:ph}}
    });
    if(error || !data.user){ syncErr(error); toast(error && /registered/i.test(error.message) ? 'That username already has an account' : 'Could not create account'); return; }
    uid = data.user.id;
    if(modal.photo) await sb.from('profiles').update({photo:modal.photo}).eq('id', uid);
    if(roleSel==='admin'){
      const {error:pe} = await sb.from('profiles').update({role:'admin'}).eq('id', uid);
      if(pe) toast('Account created but promotion failed: ' + pe.message);
    }
    await refetch('profiles');
    toast(roleSel==='admin' ? 'Admin account created' : 'Driver account created');
  }
  if(!isNaN(rate) && !id){
    const u2 = users.find(x=>x.id===uid);
    if(u2){ u2.hourlyRate = rate; pushUser(u2); }
  }
  for(let i=0;i<7;i++){
    const el = $('rt-'+i);
    if(!el) continue;
    const day = el.dataset.day;
    const v = el.value;
    const rrow = getReportRow(uid, day);
    if(v){
      if(!rrow || rrow.rt !== v || !rrow.manual){
        await upsertReportTime(uid, day, v, true);
        if(day===fmtDate(today) || day===addDays(1)){
          const n = {id:Date.now()+i, driverId:uid, read:false, text:`Your office report time changed to ${fmtTime(v)}.`};
          notifications.push(n); insertNotif(n);
        }
      }
    } else if(rrow && rrow.manual){
      await upsertReportTime(uid, day, '', false);
      recomputeReportTime(uid, day);
    }
  }
  modal=null; render();
}
function deleteUser(id){
  { const t = users.find(x=>x.id===id);
    if(t && t.role==='admin'){
      if(id===currentUser.id){ toast('You cannot deactivate your own account'); return; }
      if(!users.some(x=>x.role==='admin' && x.active!==false && x.id!==id)){ toast('Cannot deactivate the only admin'); return; }
    } }
  if(confirm('Deactivate this account? They can no longer sign in, and any assigned trips become unassigned. History is kept.')){
    const u = users.find(x=>x.id===id);
    if(u) u.active = false;
    leads.forEach(l=>{ if(l.driverId===id) l.driverId=null; if(l.returnDriverId===id) l.returnDriverId=null; });
    sb.from('leads').update({driver_id:null}).eq('driver_id', id).then(r=>syncErr(r.error));
    sb.from('leads').update({return_driver_id:null}).eq('return_driver_id', id).then(r=>syncErr(r.error));
    sb.from('profiles').update({active:false}).eq('id', id).then(r=>syncErr(r.error));
    modal=null; render(); toast('Driver deactivated');
  }
}

