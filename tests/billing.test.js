import { describe, expect, it } from 'vitest';
import { suggestPrice, waitBill, rentFee, totalCharge } from '../src/lib/billing.js';

// Synthetic fixture, matching the original defaults. No app boot or backend access.
const rates = Object.freeze({
  oneWayLoad: 85, roundLoad: 100, officePerMile: 1, tripPerMile: 4,
  waitPer15: 11.25, wheelchairRent: 30,
  strOneWayLoad: null, strRoundLoad: null, strOfficePerMile: null,
  strTripPerMile: null, strWaitPer15: null,
});

// Pass B golden master: 3850d53. Pass C updates intentional corrections in separate commits.
describe('suggestPrice — current quote behavior', () => {
  it.each([
    ['one way includes office and loaded miles', 'One Way', 5, 10, false, 'Wheelchair', {}, 130],
    ['round trip doubles loaded miles', 'Round Trip', 5, 10, false, 'Wheelchair', {}, 185],
    ['multi-stop mileage already describes the whole loop', 'Round Trip', 5, 25, true, 'Wheelchair', {}, 205],
    ['stretcher uses configured overrides', 'One Way', 5, 10, false, 'Stretcher', { strOneWayLoad: 125, strOfficePerMile: 2, strTripPerMile: 6 }, 195],
    ['negative office mileage cannot discount a quote', 'One Way', -5, 10, false, 'Wheelchair', {}, 125],
    ['negative loaded mileage cannot discount a round trip', 'Round Trip', 5, -10, false, 'Wheelchair', {}, 105],
    ['null mileage retains the loading fee', 'One Way', null, null, false, 'Wheelchair', {}, 85],
    ['zero mileage retains the loading fee', 'One Way', 0, 0, false, 'Wheelchair', {}, 85],
    ['numeric string load fee must return a numeric quote', 'One Way', 5, 10, false, 'Wheelchair', { oneWayLoad: '85' }, 130],
    ['round-trip string load fee must return a numeric quote', 'Round Trip', '5', '10', false, 'Wheelchair', { roundLoad: '100' }, 185],
  ])('%s', (_label, type, office, trip, stop, kind, overrides, expected) => {
    expect(suggestPrice(type, office, trip, stop, kind, { ...rates, ...overrides })).toBe(expected);
  });
});

describe('waitBill — current 15-minute intervals', () => {
  it.each([
    ['zero minutes is free', 0, 'Wheelchair', {}, 0],
    ['exactly 15 minutes is one interval', 15, 'Wheelchair', {}, 11.25],
    ['16 minutes rounds up to two intervals', 16, 'Wheelchair', {}, 22.5],
    ['unset stretcher rate falls back to standard', 15, 'Stretcher', {}, 11.25],
    ['configured stretcher rate replaces standard', 16, 'Stretcher', { strWaitPer15: 15 }, 30],
  ])('%s', (_label, minutes, kind, overrides, expected) => {
    expect(waitBill(minutes, kind, { ...rates, ...overrides })).toBe(expected);
  });
});

describe('rentFee — current wheelchair eligibility and defaults', () => {
  it.each([
    ['wheelchair rental is charged', { rentWheelchair: true, tripKind: 'Wheelchair' }, {}, 30],
    ['no rental is free', { rentWheelchair: false, tripKind: 'Wheelchair' }, {}, 0],
    ['stretcher does not incur wheelchair rental', { rentWheelchair: true, tripKind: 'Stretcher' }, {}, 0],
    ['missing kind and null rental rate use legacy defaults', { rentWheelchair: true }, { wheelchairRent: null }, 30],
  ])('%s', (_label, lead, overrides, expected) => {
    expect(rentFee(lead, { ...rates, ...overrides })).toBe(expected);
  });
});

describe('totalCharge — current aggregation', () => {
  it.each([
    ['trip, one estimated waiting interval, and rental', { tripCharge: 130, waiting: 'Yes', waitH: 0, waitM: 15, rentWheelchair: true }, {}, 171.25],
    ['both stops are combined before rounding', { tripCharge: 100, actualWaitMin: 7, actualWaitMin2: 7 }, {}, 111.25],
    ['recorded zero wait overrides an hour estimate', { tripCharge: 85, waiting: 'Yes', waitH: 1, actualWaitMin: 0 }, {}, 85],
    ['estimated hours are converted to minutes', { tripCharge: 85, waiting: 'Yes', waitH: 1, waitM: 1 }, {}, 141.25],
    ['decimal amounts sum to a cent-denominated total', { tripCharge: 0.1, rentWheelchair: true }, { wheelchairRent: 0.2 }, 0.3],
    ['half-cent trip amount rounds up', { tripCharge: 1.005 }, {}, 1.01],
    ['binary-sensitive half-cent amount rounds up', { tripCharge: 10.075 }, {}, 10.08],
    ['components round before aggregation', { tripCharge: 0.005, rentWheelchair: true }, { wheelchairRent: 0.005 }, 0.02],
    ['negative adjustments round symmetrically', { tripCharge: -1.005 }, {}, -1.01],
    ['tiny scientific-notation amounts round to zero', { tripCharge: 1e-7 }, {}, 0],
    ['combined waiting is rounded as one monetary component', { actualWaitMin: 16 }, { waitPer15: 0.335 }, 0.67],
  ])('%s', (_label, lead, overrides, expected) => {
    expect(totalCharge(lead, { ...rates, ...overrides })).toBe(expected);
  });
});
