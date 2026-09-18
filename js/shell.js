/* ================= RENDER ROOT ================= */
function render(){
  /* the PWA stays resident for days — roll `today` forward when midnight passes */
  { const _n = new Date(); _n.setHours(0,0,0,0);
    if(_n.getTime() !== today.getTime()){
      const wasToday = boardDate === fmtDate(today);
      today.setTime(_n.getTime());
      if(wasToday) boardDate = fmtDate(today);
    } }
  const app = $('app');
  /* the iOS bottom strip paints with the body background — match it to the current screen */
  document.body.style.background = currentUser ? '#ffffff' : 'var(--royal-light)';
  if(!currentUser){ app.innerHTML = loginView(); return; }
  const isAdmin = currentUser.role==='admin';
  const tab = isAdmin ? adminTab : driverTab;
  let body = '';
  if(isAdmin){
    if(tab==='leads') body = leadsView();
    else if(tab==='appts') body = apptsView();
    else if(tab==='clients') body = clientsView();
    else if(tab==='sales') body = salesView();
    else if(tab==='fleet') body = fleetView();
    else if(tab==='users') body = usersView();
    else body = settingsView();
  } else {
    if(tab==='schedule') body = scheduleView();
    else if(tab==='pay') body = payView();
    else body = settingsView();
  }
  const brand = (isAdmin && appLogo)
    ? `<div class="logo wide"><img src="${esc(appLogo)}" alt="logo"></div>`
    : `<div class="logo">${EMBLEM}</div><div><h1>Royalty Medical</h1><div class="sub">Transportation</div></div>`;
  /* keep the reader's place: a background re-render must not yank the list back to the top */
  const _oldPage = app.querySelector('.page');
  const _keepScroll = _oldPage ? _oldPage.scrollTop : 0;
  /* v6.46: SAME rule for every modal — if a re-render keeps the SAME modal open (same type + same
     record), the sheet keeps its scroll position. Kills the whole jump-to-top bug class (payroll
     dates, review mark, shift punches, card buttons, leg toggles) in one place. A DIFFERENT modal
     (or none) still opens at the top, as it should. */
  const _oldSheet = document.querySelector('.sheet-body');
  const _sheetScroll = _oldSheet ? _oldSheet.scrollTop : 0;
  const _mKey = modal ? (modal.type + ':' + (modal.userId ?? modal.leadId ?? modal.clientId ?? modal.imei ?? modal.id ?? '')) : null;
  /* v6.18: a re-render must never wipe what's typed into the booking form — snapshot every
     f-* field (value + the manual-price/miles flags + checked) and restore after the redraw */
  let _draft = null, _draftFocus = null, _draftSheetScroll = 0;
  if(modal && modal.type==='leadForm'){
    _draft = {};
    document.querySelectorAll('[id^="f-"]').forEach(el=>{
      if(!('value' in el)) return;
      _draft[el.id] = { v: el.value, man: el.dataset ? el.dataset.man : undefined, chk: el.type==='checkbox' ? el.checked : undefined };
    });
    const ae = document.activeElement;
    if(ae && ae.id && ae.id.indexOf('f-') === 0) _draftFocus = ae.id;
    const sheetBody = document.querySelector('.sheet-body');
    if(sheetBody) _draftSheetScroll = sheetBody.scrollTop;
    if(!Object.keys(_draft).length) _draft = null;
  }
  app.innerHTML = `
    <div class="header">
      <div class="brand">
        ${brand}
        <div class="who">Signed in as<br><b>${esc(currentUser.name)}</b></div>
      </div>
    </div>
    <div class="page">${body}</div>
    ${tabbar(isAdmin, tab)}
    ${modal ? renderModal() : ''}
  `;
  if(_keepScroll){
    const _newPage = app.querySelector('.page');
    if(_newPage) _newPage.scrollTop = _keepScroll;
  }
  if(_mKey && _mKey === window._prevMKey && _sheetScroll && modal.type !== 'leadForm'){ /* leadForm has its own draft-aware restore below */
    const _newSheet = document.querySelector('.sheet-body');
    if(_newSheet) _newSheet.scrollTop = _sheetScroll;
  }
  window._prevMKey = _mKey;
  if(_draft && modal && modal.type==='leadForm'){
    Object.keys(_draft).forEach(id=>{
      const el = $(id); if(!el) return;
      const d = _draft[id];
      if(d.chk !== undefined) el.checked = d.chk;
      else if(el.value !== d.v) el.value = d.v;
      if(d.man !== undefined && el.dataset) el.dataset.man = d.man;
    });
    if($('stop-area') && $('f-triptype')) $('stop-area').style.display = $('f-triptype').value==='Round Trip' ? 'block' : 'none';
    const sheetBody = document.querySelector('.sheet-body');
    if(sheetBody && _draftSheetScroll) sheetBody.scrollTop = _draftSheetScroll;
    if(_draftFocus && $(_draftFocus)) try{ $(_draftFocus).focus(); }catch(e){}
  }
  if(modal && modal.type==='leadForm' && $('f-waiting')) calcCharges();
}

function tabbar(isAdmin, tab){
  const unread = !isAdmin && unreadFor(currentUser.id).length;
  const t = (id,icon,label,dot) => `<button class="${tab===id?'active':''}" onclick="setTab('${id}')">${icons[icon]}${label}<div class="dot"></div>${dot?'<div class="ndot"></div>':''}</button>`;
  return `<div class="tabbar">` + (isAdmin
    ? t('leads','leads','Leads') + t('appts','appts','Appts', unreadAdmin().length>0 || runningLongWaits().length>0) + t('clients','clients','Clients') + t('sales','sales','Sales') + t('fleet','fleet','Fleet') + t('settings','gear','Settings')
    : t('pay','pay','Pay') + t('schedule','road','Schedule',unread) + t('settings','gear','Settings')) + `</div>`;
}
function setTab(id){ if(currentUser.role==='admin') adminTab=id; else driverTab=id; modal=null; render(); }
/* iOS date/time wheels fire onchange on EVERY tick — rendering mid-scroll destroys the open picker.
   pickerRender() waits until the picker is dismissed (input no longer focused), then renders once. */
function pickerRender(){
  clearTimeout(window._pkT);
  window._pkT = setTimeout(()=>{
    const ae = document.activeElement;
    if(ae && (ae.tagName==='INPUT' || ae.tagName==='SELECT' || ae.tagName==='TEXTAREA')){ pickerRender(); return; }
    render();
  }, 350);
}

/* ================= LOGIN ================= */
function loginView(){
  return `<div class="login-wrap">
    ${appLogo
      ? `<div class="login-logo wide"><img src="${esc(appLogo)}" alt="logo"></div>`
      : `<div class="login-logo">${EMBLEM}</div><h2>Royalty Medical Transportation</h2>`}
    <div class="tag">Non-Emergency Wheelchair &amp; Stretcher Transport</div>
    <div class="login-card">
      <label>Username</label><input id="lg-u" placeholder="Enter username" autocomplete="off">
      <label>Password</label><input id="lg-p" type="password" placeholder="Enter password" onkeydown="if(event.key==='Enter')doLogin()">
      <button class="btn-gold" onclick="doLogin()">Sign In</button>
      <div class="login-err" id="lg-err"></div>
    </div>
    <div class="demo-box"><p>Use the login provided by your administrator</p></div>
  </div>`;
}
async function doLogin(){
  const u=$('lg-u').value.trim().toLowerCase(), p=$('lg-p').value;
  if(!u || !p){ $('lg-err').textContent='Enter your username and password.'; return; }
  $('lg-err').textContent='Signing in…';
  const {data, error} = await sb.auth.signInWithPassword({email:`${u}@${AUTH_DOMAIN}`, password:p});
  if(error || !data.session){ $('lg-err').textContent='Invalid username or password.'; return; }
  $('lg-err').textContent='Loading your data…';
  await enterApp(data.session);
}
/* ---- v6.27: device sessions — Settings shows every signed-in device, admin can sign any out ---- */
function deviceId(){
  let id = null;
  try{ id = localStorage.getItem('rmt_device_id'); }catch(e){}
  if(!id){ id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); try{ localStorage.setItem('rmt_device_id', id); }catch(e){} }
  return id;
}
function deviceLabel(){
  const ua = navigator.userAgent || '';
  let os = 'Device';
  if(/iPhone/.test(ua)) os='iPhone'; else if(/iPad/.test(ua)) os='iPad';
  else if(/Android/.test(ua)) os='Android'; else if(/Macintosh/.test(ua)) os='Mac';
  else if(/Windows/.test(ua)) os='Windows'; else if(/Linux/.test(ua)) os='Linux';
  let br = 'browser';
  if(/CriOS|Chrome/.test(ua)) br='Chrome'; if(/FxiOS|Firefox/.test(ua)) br='Firefox';
  if(/Edg/.test(ua)) br='Edge'; if(/Version\/.*Safari/.test(ua) && !/Chrome|CriOS|Edg/.test(ua)) br='Safari';
  if(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) br='Home Screen app';
  return os + ' · ' + br;
}
/* v6.49: revocation is a ONE-TIME kick, exactly as the office toast promises.
   - fresh login (fresh=true): a real username+password login always clears any stale revocation —
     the old flow left revoked=true forever, so a signed-out device boot-looped at every login
     ("the app glitches when I log in").
   - periodic/wake check: boot ONLY this device (scope local — the old global signOut also killed
     the driver's session on their other devices ~an hour later), and DELETE the row so the
     revocation is consumed and the next login works. */
async function deviceHeartbeat(fresh){
  if(!currentUser) return;
  const id = deviceId();
  const row = { device_id:id, user_id:currentUser.id, label:deviceLabel(), ua:(navigator.userAgent||'').slice(0,300), app_version:BUILD, last_seen:new Date().toISOString(), revoked:false };
  if(!fresh){
    const {data:mine} = await sb.from('device_sessions').select('revoked').eq('device_id', id).maybeSingle();
    if(mine && mine.revoked){
      await sb.from('device_sessions').delete().eq('device_id', id); /* consume the kick — next login is clean */
      toast('This device was signed out by the office');
      try{ await sb.auth.signOut({scope:'local'}); }catch(e){ console.error(e); }
      currentUser=null; modal=null; render(); return;
    }
  }
  await sb.from('device_sessions').upsert(row).then(r=>{ if(r.error) syncErr(r.error); });
}
async function enterApp(session){
  const ok = await loadAll();
  if(!ok){
    currentUser=null; render();
    setTimeout(()=>{ const e=$('lg-err'); if(e) e.textContent='Connection problem — check your internet and try again.'; },50);
    return;
  }
  const me = users.find(u=>u.id===session.user.id);
  if(!me || me.active===false){
    await sb.auth.signOut();
    currentUser=null; render();
    setTimeout(()=>{ const e=$('lg-err'); if(e) e.textContent='This account has been deactivated.'; },50);
    return;
  }
  currentUser = me; adminTab='leads';
  /* v6.33: a driver who is NOT on the clock lands on the Pay tab (clock-in) instead of their trips —
     the shift/photos/mileage start the day. Already clocked in → straight to today's schedule. */
  driverTab = (me.role==='driver' && !openShiftOf(me.id)) ? 'pay' : 'schedule';
  startRealtime();
  deviceHeartbeat(true); /* v6.49: FRESH login — always registers cleanly, clearing any stale revocation */
  if(!window._devTick) window._devTick = setInterval(()=>{ if(currentUser) deviceHeartbeat(); }, 5*60000);
  await checkPushState();
  if(me.role==='admin') setTimeout(()=>{ checkInvoices(true); voidStaleConfirmations(); }, 4000); /* quiet Square-invoice sync + stale-confirmation cleanup on every admin login/open */
  /* v6.58: drivers can't read the clients table — load the privacy-safe id→waiver-date view
     so first-trip detection works on their phones (read-only; refreshed each login/open) */
  if(me.role!=='admin') sb.from('client_waivers').select('*').then(r=>{ if(!r.error && r.data) waiverMap = Object.fromEntries(r.data.map(x=>[x.id, x.waiver_at])); });
  if(!window._payTick){
    window._payTick = setInterval(()=>{
      if(currentUser && currentUser.role==='driver'){
        checkLongShift();
        const ae = document.activeElement;
        const typing = ae && (ae.tagName==='TEXTAREA' || ae.tagName==='INPUT' || ae.tagName==='SELECT');
        if(driverTab==='pay' && !modal && !typing) render();
      }
    }, 30000);
  }
  render();
}
async function logout(){
  /* v6.49: remove this device from the office's Signed-In Devices list — before signOut, while we still have auth */
  try{ await sb.from('device_sessions').delete().eq('device_id', deviceId()); }catch(e){ console.error(e); }
  try{ await sb.auth.signOut({scope:'local'}); }catch(e){ console.error(e); } /* only THIS device — never kills other phones */
  currentUser=null; modal=null;
  leads=[]; clients=[]; notifications=[]; availability={}; users=[]; shifts=[]; reportTimes=[]; emailsQ=[]; auditLog=[];
  search.leads=''; search.appts=''; search.clients='';
  adminTab='leads'; driverTab='schedule'; apptFilter='today'; apptView='list'; leadTab='active'; leadAttn=false;
  payFrom=''; payTo=''; adFrom=''; adTo=''; boardDate=fmtDate(today);
  try{ sb.removeAllChannels(); }catch(e){}
  rtStarted=false;
  render();
}

