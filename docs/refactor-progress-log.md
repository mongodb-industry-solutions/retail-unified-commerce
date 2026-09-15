# Search refactor — progress log

Running log of every fix applied on the `refactor/search-performance-and-accuracy` branch.

**How this file works:** one entry per fix, appended in order, newest at the bottom. Entries are
never edited or removed once written — if a fix is later revised or reverted, that becomes a *new*
entry referencing the old one. Each entry states the hypothesis it was testing, the queries used to
measure it, the before/after result, and whether the hypothesis held.

Companion documents:

* [`docs/baseline-pre-refactor.md`](baseline-pre-refactor.md) — the pre-refactor measurements and the
  per-fix verification detail (top-5 tables, timings, `explain` output)
* [`docs/recommendations-pre-refactor.md`](recommendations-pre-refactor.md) — the ranked
  recommendation backlog that entries here draw from (`L1.x`–`L4.x`)

---
## Fix #1 — weight=0.0 falsy bug

**Date:** 2026-09-14
**Source recommendation:** L2.3 in docs/recommendations-pre-refactor.md
**Files modified:** hybrid_rrf_pipeline.py, hybrid_score_fusion_pipeline.py
**Hypothesis:** weightVector=0.0 or weightText=0.0 was silently coerced to 1.0 by Python's `or` falsy behavior, so "text only" or "vector only" requests actually got a 50/50 blend

**Queries used to measure:** Q2 (tomatoe) and Q4 (green tea), modes 4 and 5, at weightText=1.0/weightVector=0.0 and the mirror weightText=0.0/weightVector=1.0

**Result BEFORE the fix:** Both weight configs collapsed to (1.0, 1.0) — identical to the 0.5/0.5 baseline in all 4 combinations

**Result AFTER the fix:** All 4 combinations now match the corresponding pure mode (2 or 3) exactly, position for position

**Confirms hypothesis?** ✅ Yes

**Measured impact:**
- Performance: no change expected (pure logic fix, no measured difference)
- Accuracy: improved — a documented API control now actually works

**Secondary findings:** mode 5 (scoreFusion) saturates near-identical scores (~0.999-1.0) at pure weight=1.0 (same issue as L2.5, already tracked); the previously-observed 271/272 total_results flapping did not reproduce in this run — appears intermittent, not weight-related

**Status:** Committed as 2a77d52

---
## Fix #2 — Brand matching asymmetry

**Date:** 2026-09-14
**Source recommendation:** L2.2 in docs/recommendations-pre-refactor.md
**Files modified:** vector_pipeline.py, hybrid_rrf_pipeline.py, hybrid_score_fusion_pipeline.py, text_pipeline.py
**Hypothesis:** Brand Amplification rules were matched with exact `$eq`/`$in` against `brand`, so the 38 brands carrying stray leading/trailing whitespace (288 documents) could never match a trimmed rule name — amplification silently did nothing in modes 3, 4 and 5, while mode 2 boosted the ranking correctly via its analyzed `text` operator but still reported `isBoosted: false`

**Queries used to measure:** `face wash` (107 matching docs in store-030, only 7 of them Aroma Magic) with a rule on the unpadded `"Aroma Magic"` — stored value is `'Aroma Magic '` — in modes 2, 3, 4 and 5 at boost level 1, in both brand-only and brand+category form; plus Q4 (green tea) with the unpadded `Teamonk` rule as a no-regression check, and an unamplified control. Each case also run at `page_size=50` to census `isBoosted` beyond the top 5

**Result BEFORE the fix:** Zero `isBoosted: true` documents in all 4 modes for the padded brand, despite 7–14 Aroma Magic documents sitting in the returned page. Mode 2 had nonetheless moved Aroma Magic from ranks 4–5 (unamplified) to ranks 1–5 (rule active) while flagging all five `false` — the ranking was boosted, the flag lied. Captured from a genuine pre-fix run, not reconstructed

**Result AFTER the fix:** 14 / 13 / 7 / 9 boosted documents in modes 2 / 3 / 4 / 5, with every target-brand document in the page correctly flagged, for both rule forms. Mode 2's ranking is unchanged (identical products, identical scores, delta 0.000000) with only the flag corrected

**Confirms hypothesis?** ✅ Yes

**Measured impact:**
- Performance: no change (expression-level change; all modes within their original baseline latency ranges)
- Accuracy: improved — amplification now reaches the 288 documents it previously skipped, and `isBoosted` is finally consistent with what the ranking actually did

**Secondary findings:** mode 3 is sharply sensitive even at level 1 — a +0.05 factor moved Aroma Magic from one slot to all five in the top 5, displacing the prior rank-1 result, which is the same magnitude problem as L2.1 now applying to 288 more documents; mode 4 remains the least responsive (2 of 5 boosted vs 5 of 5 elsewhere); the brand+category rule form behaved identically to brand-only because all Aroma Magic products in this store share one category, so the category comparison is confirmed not-broken but not independently exercised; no-regression and control cases held with only ANN/fusion run-to-run score jitter (≤3.4e-4, product order identical); the 38 padded brand values remain in the data and still surface in API responses — this fix makes matching tolerant, it does not clean the catalogue

**Status:** Committed as df7c270

---
## Fix #3 — Vector candidate ratio

**Date:** 2026-09-15
**Source recommendation:** L1.2 in docs/recommendations-pre-refactor.md
**Files modified:** vector_pipeline.py
**Hypothesis:** `numCandidates` and `knn_limit` were both hardcoded to 200 — a 1:1 ratio, the degenerate case for HNSW, where the ANN search explores no more candidates than it returns. Raising the candidate pool to 500 and deriving retrieval depth from `page_size` should improve recall for queries whose correct answer is a weak lexical match, and surface a wider pool for Brand Amplification to act on

**Queries used to measure:** Q2 (tomatoe) and Q5 (drink that helps me relax before bed) in mode 3 as the recall-sensitive cases, plus Q4 (green tea) with and without a level-1 `Teamonk` rule to test the amplification-surface claim. Effective `$vectorSearch` parameters moved from `numCandidates=200, limit=200` to `numCandidates=500, limit=50` at `page_size=5`. A separate control held `knn_limit` fixed at 50 and varied `numCandidates` across 200 / 500 / 2000 to isolate the recall effect from the retrieval-depth change

**Result BEFORE the fix:** Genuine pre-fix pass, which reproduced the original baseline's mode 3 top-5 exactly for Q2, Q4 and Q5. `total_results` 200 for every query; docsExamined/keysExamined/nReturned all 200; mean DB 284.7 ms, mean APP 686.8 ms; 35 Teamonk documents in the top-50 for Q4, 39 boosted with the rule active

**Result AFTER the fix:** Top-5 **byte-identical** for all four cases — not one position or score digit changed. docsExamined 200 → 50; mean DB 284.7 → 251.6 ms (−11.7%); mean APP 686.8 → 648.8 ms (−5.5%); `total_results` 200 → 50; Teamonk counts unchanged at 35 and 39. The control was decisive: `numCandidates` of 200, 500 and 2000 all return the identical 50 documents in the identical order for Q2, Q4 and Q5 — zero documents appear only at a higher candidate budget

**Confirms hypothesis?** ⚠️ Partially — the performance half yes, the recall half no. At 6 143 documents (3 914 stocked by this store) the store pre-filter narrows the candidate space enough that HNSW is already effectively exact, so there was no lost recall to recover. The measured DB saving comes from pushing 50 rather than 200 documents through `$setWindowFields`/`$sort`/`$facet`, not from the over-fetch — the control shows a larger candidate pool costs slightly more for no benefit. The change remains defensible as forward-looking (the 1:1 ratio would bite on a larger catalogue) but it is not the accuracy fix L1.2 predicted

**Measured impact:**
- Performance: improved — mean DB time −11.7%, documents examined cut 4× (200 → 50)
- Accuracy: no measured change at this catalogue size; no regression either

**Secondary findings:** `total_results` fell 200 → 50 as expected and was deliberately not addressed (L2.4) — `total_pages` at `page_size=5` drops from 40 to 10, and deep pagination capacity is genuinely reduced at large page sizes, since `page_size=50` now derives `knn_limit=100` against a flat 200 before, which is a real trade-off of deriving depth from page size; `numCandidates=500` is currently pure overhead and deriving it from `knn_limit` (e.g. `max(200, knn_limit * 10)`) would keep the ratio healthy without over-paying at small scale, left unchanged as outside this fix's literal scope; most importantly, Q2 and Q5 coming back unchanged is the strongest evidence yet that mode 3's known failures — including the Q2 level-3 boost inversion in the original baseline — are scoring and amplification-magnitude problems (L2.1), not retrieval problems, so this fix does not move the needle on them

**Status:** Committed as dc1240d
