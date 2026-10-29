# 360° Coach Ride POC — LEGACY IMPLEMENTATION REFERENCE

**LEGACY IMPLEMENTATION REFERENCE – NOT CURRENT SYSTEM SOURCE OF TRUTH**

Status checked: 29 October 2026. This repository is historical Ride/FTMS implementation and a retained fallback. It is not the current 360° Coach App backend or the development target for Coach OS work.

The current App is https://coach-360-app.mwehlert.chatgpt.site . Its verified Sites source, central D1 store, Coach Requests/Results and versioned workout library own the current implementation. Tredict remains the operational calendar. Active Technical Architecture, OS governance, Cross-Core Integration and Prescription Integrity take precedence over this repository and old handoffs.

DISCOVERABLE ≠ AUTHORITATIVE. Reconfirm a current deployment/runtime path before treating any repository as active.

The App vendors the historical Ride engine locally. Its authenticated `/api/ride` service owns assets and validated workout runtime data. Historical JSON/config here must not become a fallback outside the current prescription gate. The App's residual Pages icon dependencies are being migrated in the current Sites source; do not disable Pages based only on this notice.

## Retirement gate

Keep this repository and Pages available until the App deployment has removed remote asset dependencies and real KICKR / HRM-Pro / ERG / FIT / Bluefy acceptance is confirmed. Archiving is preferred to deletion after these checks. This notice does not claim physical regression has passed or that all old browser bookmarks are unused.

## Erroneous OS branch — DO NOT MERGE

`feature/os-v1.2-signal-interpretability-shadow` is misplaced OS work. On 29 October its comparison against main showed only three added OS shadow documentation/code/test files (three commits). It must never be merged into main. Removal requires a supported branch-deletion operation; this session's GitHub connector does not expose one. Do not replace deletion with merging or resetting main.

No Coach OS implementation belongs here. Preserve historical source hashes and durable FTMS/FIT findings in the current App documentation before eventual archival.
