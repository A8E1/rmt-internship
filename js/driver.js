/* ================= DRIVER: PAY (time clock) ================= */
function payView(){
  const me = currentUser.id;
  const rate = +(currentUser.hourlyRate||0);
  const open = openShiftOf(me);
  const todayStr = fmtDate(today);
  const todayH = shiftsOn(me, todayStr).reduce((a,x)=>a+paidHrs(x),0);
  const [ws, we] = weekRangeOf(today);
  const weekH = paidBetween(me, ws, we);
  const weekPay = weekH * rate;
  const rt = getReportTime(me, todayStr);
  const longShift = open && shiftHrs(open) > 12;
  const days = [];
  for(let i=0;i<7;i++){
    const d = new Date(ws+'T00:00:00'); d.setDate(d.getDate()+i);
    const ds = fmtDate(d);
    if(ds > todayStr) break;
    const list = shiftsOn(me, ds);
    days.push({ds, list, h:list.reduce((a,x)=>a+paidHrs(x),0)});
  }
  const hist = [];
  const mine = shifts.filter(x=>x.driverId===me);
  let wMax = 0;
  if(mine.length){
    const first = Math.min(...mine.map(x=>x.in));
    wMax = Math.min(200, Math.ceil((today - first)/(7*86400000)) + 1);
  }
  for(let w=1; w<=wMax; w++){
    const ref = new Date(today); ref.setDate(ref.getDate() - 7*w);
    const [hs, he] = weekRangeOf(ref);
    const h = paidBetween(me, hs, he);
    if(h > 0) hist.push({hs, he, h});
  }
  const rangeOk = payFrom && payTo && payFrom <= payTo;
  const rangeH = rangeOk ? paidBetween(me, payFrom, payTo) : 0;
  const pt = paidThroughOf(me);
  const owed = owedSinceOf(me);
  return `
    <div class="section-head"><div><h2>Pay</h2><div class="count">Rate: ${money(rate)}/hr (set by the office)</div></div></div>
    ${pt ? `<div class="notifbar" style="background:#eaf6f0;border-color:#bfe3d2"><div class="nb-item"><b style="color:var(--green)">Paid through ${fmtNice(pt)} ✓</b>${owed && owed.h>0 ? `<br><span style="font-size:12.5px">Since then: ${owed.h.toFixed(2)} h · ${money(owed.h*rate)} — not paid yet</span>` : '<br><span style="font-size:12.5px">Nothing owed since — all settled</span>'}</div></div>` : ''}
    ${longShift ? `<div class="notifbar" style="background:#fdecec;border-color:#f0b9b9"><div class="nb-item" style="color:var(--red)"><b>You've been clocked in over 12 hours.</b> If you forgot to clock out, tell the office — this shift is flagged for review.</div></div>` : ''}
    ${weekH>40 ? `<div class="notifbar" style="background:#fdf6e8;border-color:#e8d5a8"><div class="nb-item"><b>⚠ Over 40 hours this week (${weekH.toFixed(2)} h).</b> The office can see this too.</div></div>` : ''}
    ${rt ? `<div class="notifbar" style="background:#eef3fb;border-color:#bcd2ef"><div class="nb-item">Report by <b>${fmtTime(rt)}</b> today</div></div>` : ''}
    ${(()=>{ const rtT = new Date().getHours() >= opsNum('eveningHour',18) ? getReportTime(me, addDays(1)) : ''; if(!rtT) return ''; const wd = new Date(addDays(1)+'T12:00:00').toLocaleDateString('en-US',{weekday:'long'}); return `<div class="notifbar" style="background:#eef3fb;border-color:#bcd2ef"><div class="nb-item">${wd}: report by <b>${fmtTime(rtT)}</b></div></div>`; })()}
    <div class="card" style="cursor:default;text-align:center;padding:20px">
      ${open ? `
        <div style="font-size:12px;font-weight:800;color:var(--green);letter-spacing:.5px">● ON THE CLOCK</div>
        <div style="font-size:13px;color:var(--muted);margin:4px 0 2px">Clocked in at ${fmtClock(open.in)}</div>
        <div style="font-size:26px;font-weight:800;color:var(--ink);margin-bottom:12px">${fmtDur(Math.round(shiftHrs(open)*60))}</div>
        <button class="wait-btn stop" style="font-size:16px;padding:15px" onclick="clockOut(${open.id})">Clock Out</button>`
      : `
        <div style="font-size:12px;font-weight:800;color:var(--muted);letter-spacing:.5px">OFF THE CLOCK</div>
        <div style="height:10px"></div>
        <button class="wait-btn" style="font-size:16px;padding:15px" onclick="clockIn()">Clock In</button>`}
    </div>
    <div class="stat">
      <div style="flex:1"><div class="n">${todayH.toFixed(2)}</div><div class="l">Hours Today</div></div>
      <div class="divider"></div>
      <div style="flex:1"><div class="n">${weekH.toFixed(2)}</div><div class="l">Hours This Week</div></div>
      <div class="divider"></div>
      <div style="flex:1"><div class="n">${money(weekPay)}</div><div class="l">Pay This Week</div></div>
    </div>
    <div class="fsection">This Week's Timesheet</div>
    <div class="detail-grid">
      ${days.map(d=>{ const tg = d.list.length ? dayPayTag(me, d.ds) : null;
        const tag = tg==='paid' ? ' <span style="color:var(--green);font-size:11px;font-weight:700">· paid ✓</span>' : tg==='due' ? ' <span style="color:#b8860b;font-size:11px;font-weight:700">· not paid yet</span>' : '';
        return `<div class="drow"><span class="k">${fmtNice(d.ds)}${d.ds===todayStr?' · today':''}</span>
        <span class="v">${d.list.length ? d.list.map(x=>shiftLine(x)).join('<br>')+` · ${d.h.toFixed(2)} h`+tag : 'Off'}</span></div>`;}).join('')}
    </div>
    <div class="hint" style="margin-top:8px">Paid time starts at your scheduled office report time (or your clock-in if later). Early arrivals are recorded; ask the office to approve early pay when a trip required it.</div>
    ${pt && owed ? `
    <div class="fsection">Current Pay Period (since last payout)</div>
    <div class="detail-grid">
      <div class="drow"><span class="k">Period</span><span class="v">${fmtNice(owed.s)} – ${fmtNice(owed.e)}</span></div>
      <div class="drow"><span class="k">Hours</span><span class="v">${owed.h.toFixed(2)} h</span></div>
      <div class="drow"><span class="k">Owed so far</span><span class="v"><b>${money(owed.h*rate)}</b></span></div>
    </div>` : `
    <div class="fsection">Current Pay Period (Week)</div>
    <div class="detail-grid">
      <div class="drow"><span class="k">Period</span><span class="v">${fmtNice(ws)} – ${fmtNice(we)}</span></div>
      <div class="drow"><span class="k">Hours</span><span class="v">${weekH.toFixed(2)} h</span></div>
      <div class="drow"><span class="k">Pay</span><span class="v"><b>${money(weekPay)}</b></span></div>
    </div>`}
    <div class="fsection">Look Up Any Date Range</div>
    <div class="frow">
      <div class="fgroup"><label>From</label><input type="date" value="${payFrom}" onchange="payFrom=this.value;pickerRender()"></div>
      <div class="fgroup"><label>To</label><input type="date" value="${payTo}" onchange="payTo=this.value;pickerRender()"></div>
    </div>
    ${rangeOk ? `<div class="detail-grid" style="margin-bottom:14px">
      <div class="drow"><span class="k" style="min-width:0;flex-shrink:1">${new Date(payFrom+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${new Date(payTo+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span><span class="v" style="white-space:nowrap">${rangeH.toFixed(2)} h · <b>${money(rangeH*rate)}</b></span></div>
    </div>` : (payFrom||payTo ? '<div class="hint" style="margin-bottom:14px">Pick both dates (From must be on or before To).</div>' : '<div class="hint" style="margin-bottom:14px">Pick two dates to total the paid hours and pay for any period.</div>')}
    <div class="fsection">Pay History — Every Week</div>
    ${hist.length ? `<div class="detail-grid">
      ${hist.map(x=>{ const wt = !pt ? '' : x.he <= pt ? ' <span style="color:var(--green);font-size:11px;font-weight:700">paid ✓</span>' : x.hs > pt ? ' <span style="color:#b8860b;font-size:11px;font-weight:700">not paid yet</span>' : ' <span style="color:#b8860b;font-size:11px;font-weight:700">partly paid</span>';
        const cd = d => new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
        return `<div class="drow"><span class="k" style="min-width:0;flex-shrink:1">${cd(x.hs)} – ${cd(x.he)}, ${x.he.slice(0,4)}</span><span class="v" style="white-space:nowrap">${x.h.toFixed(2)} h · <b>${money(x.h*rate)}</b>${x.h>40?' <span style="color:var(--red);font-weight:700">⚠ 40+</span>':''}${wt}</span></div>`;}).join('')}
    </div>` : '<div class="hint">No previous pay periods yet.</div>'}`;
}

/* ================= DRIVER: SCHEDULE ================= */
function legCard(l, leg){
  const isRet = leg==='ret';
  const isMid = leg==='mid';
  const from = isRet ? (hasStop(l) ? l.stopAddr : l.dropoff) : isMid ? l.dropoff : l.pickup;
  const to   = isRet ? (l.returnDropoff || l.pickup) : isMid ? l.stopAddr : l.dropoff; /* v6.52: custom return address when set */
  const time = isRet ? l.returnTime : isMid ? '' : l.pickupTime;
  const done = isRet ? l.retDone : isMid ? l.stopDone : l.outDone;
  /* wait timers: stop 1 lives on the pickup card (existing fields), stop 2 on the middle card
     (its own arrive/depart pair). Both waits are ADDED TOGETHER and billed as one total. */
  const combinedNote = hasStop(l) ? ' Waits at both stops are added together and billed as one total.' : '';
  const wait1 = (leg==='out' && l.waiting==='Yes') ? `
      <div class="waitbox">
        <div class="wb-line"><b>Wait timer${hasStop(l)?' — stop 1':''}</b> — est. ${fmtDur(estWaitMins(l))} total. Tap Arrived when you get to the appointment; tap Departed when you leave.${combinedNote}</div>
        ${l.actualWaitMin!=null
          ? `<div class="wb-line">Actual wait here: <b>${fmtDur(l.actualWaitMin)}</b>${hasStop(l)?'':` → billed ${fmtDur(Math.ceil(l.actualWaitMin/15)*15)} = <b>${money(waitBill(l.actualWaitMin, l.tripKind))}</b>`}</div>
             <button class="wait-btn stop" onclick="resetWait(${l.id})">Reset Timer</button>`
          : l.arrivedAt
            ? `<div class="wb-line">Arrived at <b>${fmtClock(l.arrivedAt)}</b> — timer running…</div>
               <button class="wait-btn stop" onclick="markDeparted(${l.id})">Departed — Stop Timer</button>`
            : `<button class="wait-btn" onclick="markArrived(${l.id})">Arrived — Start Wait Timer</button>`}
      </div>`:'';
  const wait2 = (isMid && l.waiting==='Yes') ? `
      <div class="waitbox">
        <div class="wb-line"><b>Wait timer — stop 2</b> — tap Arrived when you get to the second stop; tap Departed when you leave.${combinedNote}</div>
        ${l.actualWaitMin2!=null
          ? `<div class="wb-line">Actual wait here: <b>${fmtDur(l.actualWaitMin2)}</b></div>
             <button class="wait-btn stop" onclick="resetWait2(${l.id})">Reset Timer</button>`
          : l.arrived2At
            ? `<div class="wb-line">Arrived at <b>${fmtClock(l.arrived2At)}</b> — timer running…</div>
               <button class="wait-btn stop" onclick="markDeparted2(${l.id})">Departed — Stop Timer</button>`
            : `<button class="wait-btn" onclick="markArrived2(${l.id})">Arrived — Start Wait Timer</button>`}
      </div>`:'';
  const waitHTML = wait1 + wait2;
  /* Trip notes are ONE shared field per trip. Editor priority: pickup driver > stop-2 driver >
     return driver — each driver gets ONE editor at most (textarea id must stay unique per view). */
  const iAmOut = l.driverId === currentUser.id;
  const iAmMid = hasStop(l) && stopDriverOf(l) === currentUser.id;
  const editorHere = (leg==='out') || (isMid && !iAmOut) || (isRet && !iAmOut && !iAmMid);
  const notesHTML = editorHere ? `
        <span class="flabel" style="display:block;margin-top:10px">Notes about this trip${leg!=='out' && l.driverNotes ? ' (shared across all legs)' : ''}</span>
        <textarea id="note-${l.id}" rows="2" placeholder="Anything the office should know...">${esc(l.driverNotes)}</textarea>
        <button class="save-note" onclick="saveNote(${l.id})">Save Note</button>`
    : (l.driverNotes ? `<div class="line" style="margin-top:8px"><span><b>Trip notes:</b> ${esc(l.driverNotes)}</span></div>` : '');
  const legLabel = isRet ? 'RETURN TRIP' : isMid ? 'STOP 2' : 'PICKUP TRIP';
  const timeLabel = isRet ? ('Return ' + (time?fmtTime(time):'— time TBD')) : isMid ? 'Stop 2 — after the first drop-off' : ('Pickup ' + (time?fmtTime(time):'— time TBD'));
  return `
    <div class="trip ${isRet||isMid?'ret':''}${done?' done':''}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="time">${timeLabel}</span>
        <span style="display:flex;gap:6px;align-items:center">
          <span class="legtag ${isRet||isMid?'ret':''}">${legLabel}</span>
          <span class="badge ${done?'completed':'pending'}">${done?'Completed':'Upcoming'}</span>
        </span>
      </div>
      <h4>${esc(l.first)} ${esc(l.last)}</h4>
      <div class="line"><span><b>${esc(l.tripKind||'Wheelchair')}</b>${l.weight?` · ${esc(l.weight)} lbs`:''}</span></div>
      <div class="line"><span><b>Phone:</b> <a href="tel:${esc(phoneFmt(l.phone1))}">${esc(phoneFmt(l.phone1))}</a></span></div>
      ${l.clientId && !waiverOf(l.clientId) && !done && !isRet && !isMid ? `<div style="background:#fdf6e8;border:1px solid #e8d5a8;border-radius:10px;padding:10px 12px;margin:8px 0">
        <div style="font-size:13px;font-weight:700;color:#7d5a10;margin-bottom:8px">Client Needs a Waiver</div>
        <button type="button" class="btn-mini" style="width:100%;padding:11px" onclick="collectWaiverOnly(${l.id})">Collect agreement signature</button>
      </div>` : ''}
      ${l.clientId && waiverOf(l.clientId) && fmtDate(new Date(waiverOf(l.clientId)))===fmtDate(today) ? `<div class="hint" style="margin:2px 0 8px;color:var(--green)">Service agreement signed · ${fmtClock(new Date(waiverOf(l.clientId)).getTime())}</div>` : ''}
      <div class="line"><span><b>From:</b> ${esc(from)}</span></div>
      <div class="line" style="gap:8px">
        <a class="btn-mini" style="background:var(--blue);text-decoration:none;color:#fff" href="${mapsLink(from)}">Navigate</a>
        <button class="btn-mini ghost" data-a="${esc(from)}" onclick="copyText(this.dataset.a)">Copy address</button>
      </div>
      <div class="line"><span><b>To:</b> ${esc(to)}</span></div>
      <div class="line" style="gap:8px">
        <a class="btn-mini" style="background:var(--blue);text-decoration:none;color:#fff" href="${mapsLink(to)}">Navigate</a>
        <button class="btn-mini ghost" data-a="${esc(to)}" onclick="copyText(this.dataset.a)">Copy address</button>
      </div>
      ${isRet && !time ? `<div class="line"><span><b>Return time not set</b> — dispatch will confirm the time.</span></div>`:''}
      ${l.adminNotes ? `<div class="notifbar" style="background:#fdf6e8;border-color:#e8d5a8;margin:8px 0"><div class="nb-item"><b>📋 Office notes:</b> ${esc(l.adminNotes)}</div></div>`:''}
      ${l.clientNotes ? `<div class="notifbar" style="background:#eef3fb;border-color:#bcd2ef;margin:8px 0"><div class="nb-item"><b>👤 Client notes:</b> ${esc(l.clientNotes)}</div></div>`:''}
      ${needsChips(l)}
      ${placeNotesBlock(from, to)}
      ${!done ? driverActionRow(l, leg) : ''}
      ${done ? (sigStampOf(l, leg)
        ? `<div class="hint" style="margin:2px 0 8px">Drop-off signature on file · ${fmtClock(new Date(sigStampOf(l, leg)).getTime())}</div>`
        : `<button class="btn-mini ghost" style="margin:2px 0 8px;color:#9a6a00;border-color:#e8d5a8" onclick="collectTripSignature(${l.id},'${leg}')">Signature missing — collect now</button>`) : ''}
      ${!done && !l.lateTexted && leg!=='mid' ? `<button class="btn-mini ghost" style="margin:2px 0 8px;color:#9a6a00;border-color:#e8d5a8" onclick="lateNotify(${l.id})">Running 5 to 15 min late — text the client</button>`
        : (l.lateTexted && !done ? `<div class="hint" style="margin:2px 0 8px">✓ Client was told the driver is running late.</div>` : '')}
      ${waitHTML}
      <div class="foot">
        <span class="flabel">${isRet?'Return trip status':isMid?'Stop 2 status':'Pickup trip status'}</span>
        <select onchange="setLegStatus(${l.id},'${leg}',this.value)">
          <option ${!done?'selected':''} value="no">Not Completed</option>
          <option ${done?'selected':''} value="yes">Completed</option>
        </select>
        ${notesHTML}
      </div>
    </div>`;
}
function scheduleView(){
  /* v6.34: off the clock → trips are a dimmed, look-only preview; only the floating pill clocks in */
  const offClock = currentUser.role==='driver' && !openShiftOf(currentUser.id);
  const dimO = offClock ? '<div style="opacity:0.6;pointer-events:none">' : '';
  const dimC = offClock ? '</div>' : '';
  const clockPill = offClock ? `<div style="position:fixed;left:0;right:0;bottom:calc(74px + env(safe-area-inset-bottom, 0px));display:flex;justify-content:center;z-index:60;pointer-events:none">
      <button onclick="clockIn()" style="pointer-events:auto;background:var(--royal);color:#fff;border:none;border-radius:24px;padding:12px 26px;font-size:15px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,0.25)">🕐 Clock in to start</button>
    </div>` : '';
  const myLeads = leads.filter(l=>l.status==='Confirmed' && l.date===fmtDate(today) && (l.driverId===currentUser.id || (l.tripType==='Round Trip' && retDriverOf(l)===currentUser.id) || (hasStop(l) && stopDriverOf(l)===currentUser.id)));
  const legs = sortCompletedLast(driverLegsFor(currentUser.id, myLeads));
  const doneCount = myLeads.filter(isDone).length;
  const unread = unreadFor(currentUser.id);
  const notifHTML = unread.length ? `
    <div class="notifbar">
      <div class="nb-title">New Assignments (${unread.length})</div>
      ${unread.map(n=>`<div class="nb-item">• ${esc(n.text)}</div>`).join('')}
      <button class="btn-mini" style="margin-top:8px" onclick="markNotifsRead()">Got it</button>
    </div>`:'';
  const evening = new Date().getHours() >= opsNum('eveningHour',18); /* after 6 PM the evening glance is about TOMORROW — today drops below */
  const offRt = getReportTime(currentUser.id, fmtDate(today));
  const offRtTom = getReportTime(currentUser.id, addDays(1));
  const tomWd = new Date(addDays(1)+'T12:00:00').toLocaleDateString('en-US',{weekday:'long'});
  const officeHTML = (evening && offRtTom)
    ? `<div class="notifbar" style="background:#eef3fb;border-color:#bcd2ef"><div class="nb-item">${tomWd}: report by <b>${fmtTime(offRtTom)}</b></div></div>`
    : (!evening && offRt ? `<div class="notifbar" style="background:#eef3fb;border-color:#bcd2ef"><div class="nb-item">Office report time: <b>${fmtTime(offRt)}</b></div></div>` : '');
  const pushPromo = (!pushEnabled && pushSupported()) ? `
    <div class="notifbar" style="cursor:pointer" onclick="enablePush()">
      <div class="nb-item"><b>Turn on push notifications</b> to get new trip alerts even when the app is closed — tap here.</div>
    </div>` : '';
  const statHTML = `
    <div class="stat">
      <div><div class="n">${myLeads.length}</div><div class="l">Clients Today</div></div>
      <div class="divider"></div>
      <div><div class="n">${legs.length}</div><div class="l">Trips (Legs)</div></div>
      <div class="divider"></div>
      <div><div class="n">${doneCount}</div><div class="l">Done</div></div>
    </div>`;
  const todayLegsHTML = legs.map(x=>legCard(x.l, x.leg)).join('');
  if(evening){
    /* only UNFINISHED today legs survive after 6 PM — completed ones disappear; when the last one is done, it's tomorrow only */
    const openLegs = legs.filter(x => !legDone(x)); /* v6.24: was a hand-rolled check predating multi-stop — an unfinished STOP-2 leg vanished from "Still open today" once the pickup was done */
    const todayBlock = openLegs.length ? `
      <div class="date-group" style="margin-top:24px">Still open today — ${fmtNice(fmtDate(today))}</div>
      ${openLegs.map(x=>legCard(x.l, x.leg)).join('')}` : '';
    return `
    <div class="section-head"><div><h2>Tomorrow's Schedule</h2><div class="count">${fmtNice(addDays(1))}</div></div></div>
    ${notifHTML}
    ${officeHTML}
    ${pushPromo}
    ${dimO}
    ${tomorrowSection(true)}
    ${todayBlock}
    ${dimC}
    ${clockPill}`;
  }
  return `
    <div class="section-head"><div><h2>Today's Schedule</h2><div class="count">${fmtNice(fmtDate(today))}</div></div></div>
    ${notifHTML}
    ${officeHTML}
    ${pushPromo}
    ${dimO}
    ${statHTML}
    ${todayLegsHTML || '<div class="empty">No trips assigned for today.<br>Check back later or contact dispatch.</div>'}
    ${tomorrowSection(false)}
    ${dimC}
    ${clockPill}`;
}
function tomorrowSection(lead){
  const after6 = new Date().getHours() >= opsNum('eveningHour',18);
  if(!after6) return `<div class="empty" style="padding:18px;font-size:12px">🌙 Tomorrow's trips unlock at 6:00 PM.</div>`;
  const tLeads = leads.filter(l=>l.status==='Confirmed' && l.date===addDays(1) && (l.driverId===currentUser.id || (l.tripType==='Round Trip' && retDriverOf(l)===currentUser.id) || (hasStop(l) && stopDriverOf(l)===currentUser.id)));
  const tLegs = sortCompletedLast(driverLegsFor(currentUser.id, tLeads));
  const cards = tLegs.length
    ? tLegs.map(x=>legCard(x.l, x.leg)).join('')
    : '<div class="empty" style="padding:18px">No trips assigned for tomorrow yet.</div>';
  if(lead) return cards; /* evening layout: header is already "Tomorrow's Schedule" */
  return `
    <div class="date-group" style="margin-top:24px">Tomorrow — ${fmtNice(addDays(1))}</div>
    ${cards}`;
}
async function setLegStatus(id, leg, v){
  const l = liveLead(id); if(!l) return;
  const prev = leg==='ret' ? l.retDone : leg==='mid' ? l.stopDone : l.outDone;
  if(leg==='ret') l.retDone = v==='yes'; else if(leg==='mid') l.stopDone = v==='yes'; else l.outDone = v==='yes';
  render();
  const ok = await patchLeadV(l, leg==='ret' ? {ret_done:l.retDone} : leg==='mid' ? {stop_done:l.stopDone} : {out_done:l.outDone});
  if(!ok){ if(leg==='ret') l.retDone = prev; else if(leg==='mid') l.stopDone = prev; else l.outDone = prev; render(); return; }
  if(v==='yes' && currentUser.role==='driver'){
    adminAlert(`✓ ${currentUser.name} completed ${l.first} ${l.last}'s ${leg==='ret'?'return':leg==='mid'?'second-stop':'pickup'} trip (${fmtNice(l.date)})`);
  }
  toast(v==='yes' ? 'Trip marked completed ✓' : 'Trip re-opened');
  /* v6.57: completing a leg opens the drop-off signing sheet (waiver first on a client's
     first-ever trip). Not awaited — the completion save above already succeeded. */
  if(v==='yes' && !sigStampOf(l, leg)) collectTripSignature(id, leg);
}
/* v6.26 batch: one-tap late notice — texts the client (kind 'late' jumps the send window and spacing), rings the office, once per trip */
async function lateNotify(id){
  const l = liveLead(id); if(!l || l.lateTexted) return;
  const ph = (l.phone1 || l.phone2 || '').replace(/\D/g,'').slice(-10);
  if(ph.length !== 10){ toast('No textable phone number on this trip — call them instead'); return; }
  const ok = await confirmSheet({
    title: 'Text the client?',
    body: `<div style="font-size:13px;line-height:1.5">${esc(l.first)} gets: "Hi ${esc(l.first)}, your Royalty Medical Transportation driver is on the way and running about 5 to 15 minutes behind. Sorry for the delay, we will be there soon."</div>`,
    yes: 'Send it', no: 'Cancel'
  });
  if(!ok) return;
  const body = 'Hi ' + l.first + ', your Royalty Medical Transportation driver is on the way and running about 5 to 15 minutes behind. Sorry for the delay, we will be there soon.';
  const {error} = await sb.from('sms_queue').insert({kind:'late', lead_id:l.id, client_id:l.clientId||null, to_phone:ph, body, status:'pending', due_at:new Date().toISOString(), cycle:0});
  if(error){ syncErr(error); toast('DID NOT SEND — weak signal? Try again or call them.'); return; }
  l.lateTexted = true;
  const okP = await patchLeadV(l, {late_texted_at:new Date().toISOString()});
  if(!okP) l.lateTexted = false;
  adminAlert(`🕐 ${currentUser.name} is running 5 to 15 min late to ${l.first} ${l.last} (pickup ${fmtTime(l.pickupTime)}) — client was texted`);
  render(); toast('Client will get the text within 5 minutes');
}
async function saveNote(id){
  const l = liveLead(id); if(!l) return;
  const t = $('note-'+id).value;
  const changed = t.trim() && t.trim() !== (l.driverNotes||'').trim();
  const prevNote = l.driverNotes;
  l.driverNotes = t;
  const ok = await patchLeadV(l, {driver_notes:t});
  if(!ok){ l.driverNotes = prevNote; return; }
  if(changed && currentUser.role==='driver'){
    adminAlert(`📝 ${currentUser.name} — note on ${l.first} ${l.last}: “${t.trim().slice(0,140)}”`);
  }
  toast('Note saved');
}
async function markArrived(id){ const l=liveLead(id); if(!l) return; const p={a:l.arrivedAt,d:l.departedAt,w:l.actualWaitMin}; l.arrivedAt=Date.now(); l.departedAt=null; l.actualWaitMin=null; render(); const ok = await patchLeadV(l, {arrived_at:new Date(l.arrivedAt).toISOString(), departed_at:null, actual_wait_min:null}); if(!ok){ l.arrivedAt=p.a; l.departedAt=p.d; l.actualWaitMin=p.w; render(); return; } toast('Wait timer started'); }
async function markDeparted(id){
  const l=liveLead(id); if(!l) return;
  if(!l.arrivedAt){ toast('Timer was reset — tap Arrived first'); render(); return; }
  l.departedAt=Date.now();
  l.actualWaitMin=Math.max(1, Math.round((l.departedAt-l.arrivedAt)/60000));
  if(l.actualWaitMin > 120){
    const n = {id:Date.now(), adminAlert:true, read:false,
      text:`⚠️ Long wait: ${l.first} ${l.last} — ${fmtDur(l.actualWaitMin)} recorded by ${driverName(l.driverId)} (${fmtNice(l.date)}). Wait charge: ${money(waitBill(l.actualWaitMin, l.tripKind))}.`};
    notifications.push(n); insertNotif(n);
  }
  render();
  const okD = await patchLeadV(l, {departed_at:new Date(l.departedAt).toISOString(), actual_wait_min:l.actualWaitMin});
  if(!okD){ l.departedAt=null; l.actualWaitMin=null; render(); return; }
  toast('Wait recorded: '+fmtDur(l.actualWaitMin)+' — '+money(waitBill(l.actualWaitMin, l.tripKind))+' added to total');
}
async function resetWait(id){ const l=liveLead(id); if(!l) return; const p={a:l.arrivedAt,d:l.departedAt,w:l.actualWaitMin}; l.arrivedAt=null; l.departedAt=null; l.actualWaitMin=null; render(); const ok = await patchLeadV(l, {arrived_at:null, departed_at:null, actual_wait_min:null}); if(!ok){ l.arrivedAt=p.a; l.departedAt=p.d; l.actualWaitMin=p.w; render(); return; } toast('Wait timer reset'); }
/* stop-2 wait timer (multi-stop trips) — its own arrive/depart pair; billing adds both stops together */
async function markArrived2(id){ const l=liveLead(id); if(!l) return; const p={a:l.arrived2At,d:l.departed2At,w:l.actualWaitMin2}; l.arrived2At=Date.now(); l.departed2At=null; l.actualWaitMin2=null; render(); const ok = await patchLeadV(l, {arrived2_at:new Date(l.arrived2At).toISOString(), departed2_at:null, actual_wait_min2:null}); if(!ok){ l.arrived2At=p.a; l.departed2At=p.d; l.actualWaitMin2=p.w; render(); return; } toast('Stop 2 wait timer started'); }
async function markDeparted2(id){
  const l=liveLead(id); if(!l) return;
  if(!l.arrived2At){ toast('Timer was reset — tap Arrived first'); render(); return; }
  l.departed2At=Date.now();
  l.actualWaitMin2=Math.max(1, Math.round((l.departed2At-l.arrived2At)/60000));
  const combined = (+l.actualWaitMin||0) + l.actualWaitMin2;
  if(combined > 120){
    const n = {id:Date.now(), adminAlert:true, read:false,
      text:`⚠️ Long wait: ${l.first} ${l.last} — ${fmtDur(combined)} combined across both stops (${fmtNice(l.date)}). Wait charge: ${money(waitBill(combined, l.tripKind))}.`};
    notifications.push(n); insertNotif(n);
  }
  render();
  const okD2 = await patchLeadV(l, {departed2_at:new Date(l.departed2At).toISOString(), actual_wait_min2:l.actualWaitMin2});
  if(!okD2){ l.departed2At=null; l.actualWaitMin2=null; render(); return; }
  toast('Stop 2 wait recorded: '+fmtDur(l.actualWaitMin2)+' — both stops bill together as '+money(waitBill(combined, l.tripKind)));
}
async function resetWait2(id){ const l=liveLead(id); if(!l) return; const p={a:l.arrived2At,d:l.departed2At,w:l.actualWaitMin2}; l.arrived2At=null; l.departed2At=null; l.actualWaitMin2=null; render(); const ok = await patchLeadV(l, {arrived2_at:null, departed2_at:null, actual_wait_min2:null}); if(!ok){ l.arrived2At=p.a; l.departed2At=p.d; l.actualWaitMin2=p.w; render(); return; } toast('Stop 2 wait timer reset'); }
function markNotifsRead(){
  notifications.forEach(n=>{ if(n.driverId===currentUser.id) n.read=true; });
  sb.from('notifications').update({read:true}).eq('driver_id', currentUser.id).then(r=>syncErr(r.error));
  render();
}

