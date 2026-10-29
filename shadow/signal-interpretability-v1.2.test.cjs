'use strict';

const assert = require('node:assert/strict');
const {
  QUALITY,
  FRESHNESS,
  DEVIATION,
  BASELINE,
  RELATIONSHIP,
  assessSignal,
  classifyRelationship,
} = require('./signal-interpretability-v1.2.js');

function base(overrides = {}) {
  return {
    metric: 'hrv_ms',
    value: 65,
    history: [64, 66, 65, 67, 63, 65, 66, 64],
    quality: QUALITY.USABLE,
    freshness: FRESHNESS.CURRENT,
    comparable: true,
    proprietaryDerived: false,
    concernDirection: 'LOW',
    baselinePolicy: { minimumObservations: 7, rationale: 'shadow engineering sufficiency only; not a biological threshold' },
    variationModel: {
      kind: 'SD_BAND',
      centerSource: 'HISTORY_MEAN',
      multiplier: 2,
      requiresBaseline: true,
      provenance: 'shadow fixture; explicit model required by caller',
      confidence: 'PROVISIONAL',
    },
    ...overrides,
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('missing remains UNKNOWN/neutral and never creates action', () => {
  const r = assessSignal(base({ value: null }));
  assert.equal(r.value, null);
  assert.equal(r.deviationStatus, DEVIATION.UNKNOWN);
  assert.equal(r.recommendedUse, 'MISSING_NEUTRAL');
  assert.equal(r.decisionEffect, 'NONE');
  assert.equal(r.shadowOnly, true);
});

test('ordinary within-person variation stays contextual', () => {
  const r = assessSignal(base({ value: 65 }));
  assert.equal(r.baselineEligibility, BASELINE.ELIGIBLE);
  assert.equal(r.deviationStatus, DEVIATION.WITHIN_EXPECTED);
  assert.equal(r.concernStatus, 'NO_INTERPRETABLE_CONCERN');
  assert.equal(r.recommendedUse, 'CONTEXT_SUPPORT_ONLY');
});

test('explicit low HRV outside the supplied model is only eligible for owner-core interpretation', () => {
  const r = assessSignal(base({ value: 55 }));
  assert.equal(r.deviationStatus, DEVIATION.OUTSIDE_EXPECTED);
  assert.equal(r.concernStatus, 'CONCERN_DIRECTION_MATCH');
  assert.equal(r.recommendedUse, 'ELIGIBLE_FOR_OWNER_CORE_INTERPRETATION');
  assert.equal(r.decisionEffect, 'NONE');
});

test('proprietary derived score has no invented MDC without explicit model', () => {
  const r = assessSignal(base({
    metric: 'body_battery',
    value: 32,
    proprietaryDerived: true,
    variationModel: null,
    concernDirection: 'LOW',
  }));
  assert.equal(r.deviationStatus, DEVIATION.NOT_ASSESSED);
  assert.equal(r.recommendedUse, 'CONTEXT_ONLY');
});

test('insufficient-quality measurement cannot become a meaningful deviation', () => {
  const r = assessSignal(base({ value: 54, quality: QUALITY.INSUFFICIENT }));
  assert.equal(r.deviationStatus, DEVIATION.UNKNOWN);
  assert.equal(r.recommendedUse, 'RECHECK_OR_CONTEXT_ONLY');
});

test('stale measurement cannot become a meaningful deviation', () => {
  const r = assessSignal(base({ value: 54, freshness: FRESHNESS.STALE }));
  assert.equal(r.deviationStatus, DEVIATION.UNKNOWN);
});

test('non-comparable measurement fails closed', () => {
  const r = assessSignal(base({ value: 54, comparable: false }));
  assert.equal(r.baselineEligibility, BASELINE.NOT_ELIGIBLE);
  assert.equal(r.deviationStatus, DEVIATION.UNKNOWN);
});

test('caller must state SD multiplier; module invents no threshold', () => {
  const model = { ...base().variationModel };
  delete model.multiplier;
  const r = assessSignal(base({ value: 54, variationModel: model }));
  assert.equal(r.deviationStatus, DEVIATION.UNKNOWN);
});

test('two independent concern-direction matches are CONVERGENT, still without action', () => {
  const hrv = assessSignal(base({ value: 55 }));
  const rhr = assessSignal(base({
    metric: 'resting_hr_bpm',
    value: 58,
    history: [49, 50, 51, 50, 49, 50, 51, 50],
    concernDirection: 'HIGH',
  }));
  assert.equal(hrv.decisionEffect, 'NONE');
  assert.equal(rhr.decisionEffect, 'NONE');
  assert.equal(classifyRelationship([hrv, rhr]), RELATIONSHIP.CONVERGENT);
});

test('one concern plus an opposite-direction outlier is CONFLICTING', () => {
  const hrv = assessSignal(base({ value: 55 }));
  const unusuallyLowRhr = assessSignal(base({
    metric: 'resting_hr_bpm',
    value: 40,
    history: [49, 50, 51, 50, 49, 50, 51, 50],
    concernDirection: 'HIGH',
  }));
  assert.equal(unusuallyLowRhr.concernStatus, 'OPPOSITE_DIRECTION');
  assert.equal(classifyRelationship([hrv, unusuallyLowRhr]), RELATIONSHIP.CONFLICTING);
});

test('one interpretable concern is ISOLATED', () => {
  const hrv = assessSignal(base({ value: 55 }));
  const bodyBattery = assessSignal(base({ metric: 'body_battery', value: 30, proprietaryDerived: true, variationModel: null }));
  assert.equal(classifyRelationship([hrv, bodyBattery]), RELATIONSHIP.ISOLATED);
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

console.log(`\n${passed}/${tests.length} tests passed`);
