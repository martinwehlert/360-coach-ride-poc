'use strict';

/**
 * 360° Coach OS v1.2 Candidate
 * Signal Interpretability & Measurement Uncertainty Layer
 *
 * SHADOW ONLY.
 * This module evaluates whether a signal is interpretable. It never returns a
 * training action, never changes PLAN, and never writes to Garmin/Tredict.
 * Domain interpretation remains with the validated owner CORE (e.g. CORE 03).
 */

const QUALITY = Object.freeze({
  USABLE: 'USABLE',
  USABLE_WITH_CAUTION: 'USABLE_WITH_CAUTION',
  INSUFFICIENT: 'INSUFFICIENT',
});

const FRESHNESS = Object.freeze({
  CURRENT: 'CURRENT',
  PROBABLY_CURRENT: 'PROBABLY_CURRENT',
  STALE: 'STALE',
  UNKNOWN: 'UNKNOWN',
});

const BASELINE = Object.freeze({
  ELIGIBLE: 'ELIGIBLE',
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  UNKNOWN: 'UNKNOWN',
});

const VARIATION = Object.freeze({
  KNOWN: 'KNOWN',
  ESTIMATED: 'ESTIMATED',
  UNKNOWN: 'UNKNOWN',
});

const DEVIATION = Object.freeze({
  WITHIN_EXPECTED: 'WITHIN_EXPECTED_VARIATION',
  OUTSIDE_EXPECTED: 'OUTSIDE_EXPECTED_VARIATION',
  NOT_ASSESSED: 'NOT_ASSESSED',
  UNKNOWN: 'UNKNOWN',
});

const RELATIONSHIP = Object.freeze({
  ISOLATED: 'ISOLATED',
  REPEATED: 'REPEATED',
  CONVERGENT: 'CONVERGENT',
  CONFLICTING: 'CONFLICTING',
  NONE: 'NONE',
  UNKNOWN: 'UNKNOWN',
});

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function finiteValues(values) {
  return Array.isArray(values) ? values.filter(isFiniteNumber) : [];
}

function mean(values) {
  const xs = finiteValues(values);
  if (!xs.length) return null;
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

function sampleSd(values) {
  const xs = finiteValues(values);
  if (xs.length < 2) return null;
  const m = mean(xs);
  const variance = xs.reduce((sum, x) => sum + ((x - m) ** 2), 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function median(values) {
  const xs = finiteValues(values).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function summarizeHistory(values) {
  const xs = finiteValues(values);
  return Object.freeze({
    n: xs.length,
    mean: mean(xs),
    median: median(xs),
    sampleSd: sampleSd(xs),
    min: xs.length ? Math.min(...xs) : null,
    max: xs.length ? Math.max(...xs) : null,
  });
}

function baselineEligibility(input, historySummary) {
  if (input.comparable === false) return BASELINE.NOT_ELIGIBLE;
  if (!input.baselinePolicy) return BASELINE.UNKNOWN;

  const required = input.baselinePolicy.minimumObservations;
  if (!Number.isInteger(required) || required < 2) return BASELINE.UNKNOWN;
  if (historySummary.n < required) return BASELINE.NOT_ELIGIBLE;
  if (input.comparable === null || typeof input.comparable === 'undefined') return BASELINE.UNKNOWN;
  return BASELINE.ELIGIBLE;
}

function expectedVariationStatus(model) {
  if (!model) return VARIATION.UNKNOWN;
  if (model.confidence === 'VALIDATED') return VARIATION.KNOWN;
  if (model.confidence === 'EMPIRICAL' || model.confidence === 'PROVISIONAL') return VARIATION.ESTIMATED;
  return VARIATION.UNKNOWN;
}

function resolveCenter(input, historySummary, model) {
  if (isFiniteNumber(model.center)) return model.center;
  if (model.centerSource === 'HISTORY_MEAN') return historySummary.mean;
  if (model.centerSource === 'HISTORY_MEDIAN') return historySummary.median;
  return null;
}

function evaluateDeviation(input, historySummary, baselineStatus) {
  const value = input.value;
  const model = input.variationModel;

  if (!isFiniteNumber(value)) return { status: DEVIATION.UNKNOWN, center: null, lower: null, upper: null };
  if (input.quality === QUALITY.INSUFFICIENT) return { status: DEVIATION.UNKNOWN, center: null, lower: null, upper: null };
  if (input.freshness === FRESHNESS.STALE) return { status: DEVIATION.UNKNOWN, center: null, lower: null, upper: null };
  if (input.comparable === false) return { status: DEVIATION.UNKNOWN, center: null, lower: null, upper: null };

  // Proprietary/derived scores are context-only unless an explicit variation model
  // with stated provenance is supplied. No synthetic MDC or z-score is invented.
  if (input.proprietaryDerived === true && !model) {
    return { status: DEVIATION.NOT_ASSESSED, center: null, lower: null, upper: null };
  }

  if (!model) return { status: DEVIATION.NOT_ASSESSED, center: null, lower: null, upper: null };
  if (!model.provenance || !model.confidence) return { status: DEVIATION.UNKNOWN, center: null, lower: null, upper: null };
  if (model.requiresBaseline === true && baselineStatus !== BASELINE.ELIGIBLE) {
    return { status: DEVIATION.UNKNOWN, center: null, lower: null, upper: null };
  }

  if (model.kind === 'ABS_RANGE') {
    if (!isFiniteNumber(model.low) || !isFiniteNumber(model.high) || model.low > model.high) {
      return { status: DEVIATION.UNKNOWN, center: null, lower: null, upper: null };
    }
    return {
      status: value >= model.low && value <= model.high ? DEVIATION.WITHIN_EXPECTED : DEVIATION.OUTSIDE_EXPECTED,
      center: (model.low + model.high) / 2,
      lower: model.low,
      upper: model.high,
    };
  }

  if (model.kind === 'MDC_ABS') {
    const center = resolveCenter(input, historySummary, model);
    if (!isFiniteNumber(center) || !isFiniteNumber(model.mdc) || model.mdc <= 0) {
      return { status: DEVIATION.UNKNOWN, center: null, lower: null, upper: null };
    }
    const lower = center - model.mdc;
    const upper = center + model.mdc;
    return {
      status: value >= lower && value <= upper ? DEVIATION.WITHIN_EXPECTED : DEVIATION.OUTSIDE_EXPECTED,
      center,
      lower,
      upper,
    };
  }

  if (model.kind === 'SD_BAND') {
    const center = resolveCenter(input, historySummary, model);
    const sd = isFiniteNumber(model.sd) ? model.sd : historySummary.sampleSd;
    // No default multiplier: the evidence/config owner must state it explicitly.
    if (!isFiniteNumber(center) || !isFiniteNumber(sd) || sd <= 0 || !isFiniteNumber(model.multiplier) || model.multiplier <= 0) {
      return { status: DEVIATION.UNKNOWN, center: null, lower: null, upper: null };
    }
    const width = sd * model.multiplier;
    const lower = center - width;
    const upper = center + width;
    return {
      status: value >= lower && value <= upper ? DEVIATION.WITHIN_EXPECTED : DEVIATION.OUTSIDE_EXPECTED,
      center,
      lower,
      upper,
    };
  }

  return { status: DEVIATION.UNKNOWN, center: null, lower: null, upper: null };
}

function concernStatus(input, deviation) {
  if (deviation.status !== DEVIATION.OUTSIDE_EXPECTED) return 'NO_INTERPRETABLE_CONCERN';
  if (!isFiniteNumber(deviation.center)) return 'UNKNOWN';

  if (input.concernDirection === 'LOW') return input.value < deviation.center ? 'CONCERN_DIRECTION_MATCH' : 'OPPOSITE_DIRECTION';
  if (input.concernDirection === 'HIGH') return input.value > deviation.center ? 'CONCERN_DIRECTION_MATCH' : 'OPPOSITE_DIRECTION';
  if (input.concernDirection === 'EITHER') return 'CONCERN_DIRECTION_MATCH';
  return 'UNKNOWN';
}

function recommendedUse(input, deviation) {
  if (!isFiniteNumber(input.value)) return 'MISSING_NEUTRAL';
  if (input.quality === QUALITY.INSUFFICIENT || input.freshness === FRESHNESS.STALE || input.comparable === false) {
    return 'RECHECK_OR_CONTEXT_ONLY';
  }
  if (deviation.status === DEVIATION.OUTSIDE_EXPECTED) return 'ELIGIBLE_FOR_OWNER_CORE_INTERPRETATION';
  if (deviation.status === DEVIATION.WITHIN_EXPECTED) return 'CONTEXT_SUPPORT_ONLY';
  return 'CONTEXT_ONLY';
}

function assessSignal(input) {
  if (!input || typeof input !== 'object') throw new TypeError('input must be an object');
  if (!input.metric) throw new TypeError('metric is required');

  const history = summarizeHistory(input.history);
  const baseline = baselineEligibility(input, history);
  const deviation = evaluateDeviation(input, history, baseline);

  return Object.freeze({
    metric: input.metric,
    value: isFiniteNumber(input.value) ? input.value : null,
    measurementQuality: input.quality || QUALITY.INSUFFICIENT,
    freshness: input.freshness || FRESHNESS.UNKNOWN,
    baselineEligibility: baseline,
    expectedVariation: expectedVariationStatus(input.variationModel),
    deviationStatus: deviation.status,
    concernStatus: concernStatus(input, deviation),
    history,
    comparison: Object.freeze({
      center: deviation.center,
      lower: deviation.lower,
      upper: deviation.upper,
    }),
    recommendedUse: recommendedUse(input, deviation),
    decisionEffect: 'NONE',
    shadowOnly: true,
    limitations: Object.freeze([
      'Interpretability is not readiness.',
      'Deviation is not a training decision.',
      'Missing data are neutral/unknown.',
      'Owner CORE and existing Safety/Materiality/Stability gates remain authoritative.',
    ]),
  });
}

function classifyRelationship(assessments) {
  const xs = Array.isArray(assessments) ? assessments : [];
  const interpretable = xs.filter(x => x && x.deviationStatus !== DEVIATION.UNKNOWN && x.deviationStatus !== DEVIATION.NOT_ASSESSED);
  if (!interpretable.length) return RELATIONSHIP.UNKNOWN;

  const concerns = interpretable.filter(x => x.concernStatus === 'CONCERN_DIRECTION_MATCH');
  const opposites = interpretable.filter(x => x.concernStatus === 'OPPOSITE_DIRECTION');

  if (concerns.length >= 2 && opposites.length === 0) return RELATIONSHIP.CONVERGENT;
  if (concerns.length >= 1 && opposites.length >= 1) return RELATIONSHIP.CONFLICTING;
  if (concerns.length === 1) return RELATIONSHIP.ISOLATED;
  return RELATIONSHIP.NONE;
}

const api = Object.freeze({
  QUALITY,
  FRESHNESS,
  BASELINE,
  VARIATION,
  DEVIATION,
  RELATIONSHIP,
  summarizeHistory,
  assessSignal,
  classifyRelationship,
});

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.CoachSignalInterpretabilityV12 = api;
