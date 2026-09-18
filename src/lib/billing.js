// Pass A: original arithmetic preserved; pricing is supplied by the caller.
function pnum(v, fb){ const n = +v; return (v != null && v !== '' && isFinite(n) && n >= 0) ? n : fb; }
export function priceSet(kind, prices){
  if(kind === 'Stretcher'){
    return { oneWayLoad:pnum(prices.strOneWayLoad, prices.oneWayLoad), roundLoad:pnum(prices.strRoundLoad, prices.roundLoad),
      officePerMile:pnum(prices.strOfficePerMile, prices.officePerMile), tripPerMile:pnum(prices.strTripPerMile, prices.tripPerMile),
      waitPer15:pnum(prices.strWaitPer15, prices.waitPer15) };
  }
  return { oneWayLoad:prices.oneWayLoad, roundLoad:prices.roundLoad, officePerMile:prices.officePerMile, tripPerMile:prices.tripPerMile, waitPer15:prices.waitPer15 };
}
export function suggestPrice(tripType, officeMiles, tripMiles, stopTrip, kind, prices){
  const P = priceSet(kind, prices);
  const om = Math.max(0, +officeMiles||0), tm = Math.max(0, +tripMiles||0);
  const load = +(tripType==='Round Trip' ? P.roundLoad : P.oneWayLoad)||0;
  const loaded = stopTrip ? tm : (tripType==='Round Trip' ? tm*2 : tm);
  return load + om*P.officePerMile + loaded*P.tripPerMile;
}
export function waitBill(mins, kind, prices){ if(!mins || mins<=0) return 0; return Math.ceil(mins/15)*priceSet(kind, prices).waitPer15; }
export function estWaitMins(l){ return (+l.waitH||0)*60 + (+l.waitM||0); }
export function waitChargeOf(l, prices){
  /* owner rule (v6.14): waits at BOTH stops are added together and billed as ONE group */
  if(l.actualWaitMin != null || l.actualWaitMin2 != null) return waitBill((+l.actualWaitMin||0) + (+l.actualWaitMin2||0), l.tripKind, prices);
  return l.waiting==='Yes' ? waitBill(estWaitMins(l), l.tripKind, prices) : 0;
}
export function rentFee(l, prices){ return (l.rentWheelchair && (l.tripKind||'Wheelchair')==='Wheelchair') ? +(prices.wheelchairRent!=null?prices.wheelchairRent:30) : 0; }
export function totalCharge(l, prices){ return waitChargeOf(l, prices) + (+l.tripCharge||0) + rentFee(l, prices); }
