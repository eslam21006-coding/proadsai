\[date] — Bugs found while testing past\_due banner manually:



1\. SCHEMA MISMATCH: billingStatus is stored at users/{uid}.billingState.billingStatus

&#x20;  (nested in the billingState map). But App.tsx listener (line 1129 per audit) reads

&#x20;  userData.billingStatus at top-level. Field is never found, fallback 'active' applies,

&#x20;  amber screen never renders. FIX: either move billingStatus to top-level on write,

&#x20;  or update App.tsx + entitlements + all readers to use billingState.billingStatus.

&#x20;  Affects: past\_due banner, cancelled banner, all gating logic. Phase 21 must reconcile.



2\. STALE PLAN VALUE: my user doc shows plan: "scaling" but launch matrix HOTFIX (plan

&#x20;  alignment) requires plan: "scale". Either the hotfix didn't migrate existing user

&#x20;  records OR there is code still writing "scaling". Phase 21 must:

&#x20;  - Audit functions/src for any remaining "scaling" references

&#x20;  - Migrate existing user records: scaling → scale

&#x20;  - Add a one-time Firestore migration script



Both blockers must be resolved before live cutover.

