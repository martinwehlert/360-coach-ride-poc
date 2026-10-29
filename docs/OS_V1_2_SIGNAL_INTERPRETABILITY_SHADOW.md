# 360° Coach OS v1.2 Candidate — Signal Interpretability & Measurement Uncertainty Extension

**Status:** SHADOW ONLY / NOT LIVE CONTROL  
**Date:** 2026-10-29  
**Parent:** 360° Coach OS v1.1 Shadow Final  
**Owner for daily readiness interpretation:** CORE 03  
**Purpose:** Improve interpretation of monitoring signals before they reach the existing coaching decision chain without creating a new readiness score or a parallel coaching engine.

## 1. Red-Team outcome

`PASS WITH MODIFICATIONS` for shadow implementation.  
`HOLD / TEST FIRST` for any live influence on training decisions.

The extension is allowed only as an **interpretability layer**. It may describe whether a measurement is usable, comparable and distinguishable from an explicitly supplied expected-variation model. It may not prescribe training.

## 2. Placement in the existing chain

Existing:

`DATA PROVENANCE -> PLAUSIBILITY / CONFLICT CHECK -> ATHLETE STATE -> CORE 03 / OWNER CORE -> ORCHESTRATOR -> MATERIALITY / STABILITY`

Candidate:

`DATA PROVENANCE -> SIGNAL INTERPRETABILITY -> PLAUSIBILITY / CONFLICT CHECK -> ATHLETE STATE -> CORE 03 / OWNER CORE -> ORCHESTRATOR -> MATERIALITY / STABILITY`

No other ownership changes.

## 3. Outputs

For each signal the layer may emit:

- `measurementQuality`: `USABLE | USABLE_WITH_CAUTION | INSUFFICIENT`
- `baselineEligibility`: `ELIGIBLE | NOT_ELIGIBLE | UNKNOWN`
- `expectedVariation`: `KNOWN | ESTIMATED | UNKNOWN`
- `deviationStatus`: `WITHIN_EXPECTED_VARIATION | OUTSIDE_EXPECTED_VARIATION | NOT_ASSESSED | UNKNOWN`
- `concernStatus`: direction-aware interpretation only when the caller explicitly supplies a concern direction
- `recommendedUse`: interpretability guidance only
- `decisionEffect`: always `NONE`
- `shadowOnly`: always `true`

Across signals it may classify the relationship as:

- `ISOLATED`
- `CONVERGENT`
- `CONFLICTING`
- `NONE`
- `UNKNOWN`

These are not readiness states and must not be shown as a traffic-light score.

## 4. Hard locks

1. **Missing = unknown/neutral.** Missing values never become negative evidence.
2. **No invented thresholds.** The module contains no default SD multiplier, MDC or biological cutoff.
3. **No synthetic measurement precision.** A variation model must have explicit provenance and confidence.
4. **Proprietary derived scores are context-only by default.** Sleep Score, Body Battery, Stress Score and similar values receive no invented MDC or z-score.
5. **Deviation != readiness.** `OUTSIDE_EXPECTED_VARIATION` means only that the signal deserves owner-core interpretation.
6. **Deviation != action.** The module never returns `TRAIN`, `REST`, `MODIFY`, `MOVE`, `SKIP` or any plan mutation.
7. **Subjective feedback remains first-class data.** Statistical signal processing cannot override athlete-reported symptoms or health concerns.
8. **CORE ownership unchanged.** CORE 03 owns daily readiness/availability; CORE 01/02 retain session purpose; other COREs keep their domains.
9. **Materiality/Stability remain downstream.** Even a credible signal change does not automatically justify a plan change.
10. **No new UI for the athlete in v1.2 Shadow.** The existing seven-day readiness dashboard remains display-only; its seven-day averages are not redefined as biological baselines.
11. **No autonomous provider writes.** Garmin/Tredict remain unaffected.
12. **Everything versioned and rollbackable.** Shadow observations must identify module version and model provenance.

## 5. Variation model contract

The module does not decide which threshold is scientifically correct. The caller/evidence owner must supply an explicit model when justified.

Supported shadow model shapes:

### `ABS_RANGE`
Explicit lower and upper comparison limits with provenance.

### `MDC_ABS`
Explicit center and absolute minimum detectable change with provenance.

### `SD_BAND`
Explicit center source plus explicit multiplier. The module intentionally has **no default multiplier**.

A model may be marked:

- `VALIDATED`
- `EMPIRICAL`
- `PROVISIONAL`

`PROVISIONAL` is suitable only for shadow learning and cannot by itself justify a live training rule.

## 6. Baseline policy

Baseline eligibility is caller-configured rather than silently hard-coded. `minimumObservations` is an engineering/data-sufficiency requirement, not a physiological threshold. The production candidate must additionally consider comparability of measurement conditions and device/algorithm changes.

## 7. Initial metric policy

### Candidate for structured shadow interpretation

- HRV, if acquisition conditions and source continuity are sufficiently comparable
- Resting HR, if source and timing are sufficiently comparable

### Contextual / cautious

- Sleep duration
- other direct/raw measurements with documented limitations

### Context-only unless independently validated

- Garmin Sleep Score
- Body Battery
- proprietary Stress Score
- other opaque composite readiness/recovery scores

## 8. Shadow test matrix

At minimum test:

1. normal execute-as-planned day
2. isolated HRV deviation with normal subjective state
3. subjective concern with normal wearables
4. objective concern with normal subjective state
5. convergent independent caution signals
6. conflicting signals
7. missing signal
8. stale signal
9. non-comparable measurement context
10. proprietary score anomaly without known measurement error
11. key session vs easy session with identical signal pattern
12. health symptom present despite reassuring wearable data
13. intra-day reassessment after material new information
14. device/algorithm/source transition

## 9. Shadow evaluation criteria

Compare baseline v1.1 reasoning with v1.2 candidate reasoning. Promotion requires repeated evidence that the extension:

- improves traceability of why a signal was or was not weighted
- reduces reactions to likely noise
- does not suppress clinically/safety-relevant subjective information
- does not increase unnecessary plan changes
- does not create fake precision
- does not create extra athlete input burden
- leaves `NO CHANGE` and `ABSTAIN` fully valid
- preserves owner-core boundaries
- adds more decision value than complexity

One successful case is never sufficient.

## 10. Failure / rollback conditions

Rollback or simplify if the layer:

- begins acting like a readiness score
- causes more plan instability
- privileges wearable data over athlete symptoms
- invents thresholds for metrics without measurement-error evidence
- treats missing data as negative
- converts statistical abnormality directly into training action
- increases athlete-facing complexity without meaningful decision benefit
- becomes a second CORE 03 or second Decision Orchestrator

## 11. Current implementation

Code: `shadow/signal-interpretability-v1.2.js`  
Tests: `shadow/signal-interpretability-v1.2.test.cjs`

The implementation is deliberately pure and side-effect free. It has no network access and no provider write path. It can therefore be tested safely before any integration into the live 360° Coach service.
