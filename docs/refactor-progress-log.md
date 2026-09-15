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

---
## Fix #4 — aboutTheProduct indexed in product_atlas_search

**Date:** 2026-09-15
**Source recommendation:** L1.1 in docs/recommendations-pre-refactor.md
**Files modified:** docs/setup/indexes/search-index.json (documentation of intent); the live Atlas index `product_atlas_search` was rebuilt manually in the Atlas console by Florencia — no application code changed
**Hypothesis:** all three text-scoring pipelines query `path: "aboutTheProduct"` with a 1.8 boost, but the field was not in the index `mappings` and `dynamic` is `false`, so that `should` clause could never match. 6 143 documents of real description copy (mean 595 chars, 80.7% of the embedded text) were unreachable in modes 2, 4 and 5

**Queries used to measure:** Q1 (Onion) as the guard against long descriptions displacing exact name matches, Q3 (beverages) and Q5 (drink that helps me relax before bed) as the queries expected to gain most, each in modes 2, 4 and 5 at three boost values — 1.8 (committed), 1.0 and 0.6 — via temporary local code edits; Q2 (tomatoe) and Q4 (green tea) at 1.8 only as a lighter no-regression check. Pre-index reference is the *original* Part C baseline at amplification OFF, since this is the first change to text scoring

**Result BEFORE the fix:** The `aboutTheProduct` clause matched nothing. Mode 2 recall: Q1 160, Q3 71, Q5 1 220 results. Q3 mode 2 had a three-way tie at `0.228609`; Q5 mode 2 had `Red Grape Drink` at rank 4

**Result AFTER the fix:** Recall rose immediately — mode 2 Q3 71 → 103 (+45%), Q5 1 220 → 2 706 (+122%), Q1 160 → 165. **Q1's rank 1 (`Onion`, Fresho) held in all three modes at all three boost values** — no displacement. Q5 surfaced two genuinely relevant products reachable only via description (`Chamomile Tea Bags`, `Melatonin 10Mg Capsule`), stable at every boost. Q3's pre-existing three-way tie became a two-way tie. Q2's top 5 was unchanged in all modes

**Confirms hypothesis?** ✅ Yes — the field was dead and is now contributing, with a real recall and relevance gain

**Measured impact:**
- Performance: mostly neutral, with one significant regression — Q5 in mode 4 went from 1 092 ms to ~2 700 ms (2.5×), boost-independent, because `hybrid_rrf_pipeline.py`'s text arm has no `$limit` and now feeds 2 729 candidates into `$rankFusion` instead of 1 307. `$scoreFusion`, which caps its text arm at 200, barely moved (720 → 799 ms)
- Accuracy: improved recall and improved Q5 relevance, but **boost 1.8 introduces a clear class of false positive** — products whose description discusses a beverage without being one. Worst case: Q3 mode 4 at 1.8 returns four drinking vessels (coffee mugs, beer mug, water bottle) in the top 5, where the pre-index baseline returned actual beverages. `Green Tea Mugs` also intrudes into Q4's hybrid top 5, and a `PVC Food Mat` into Q5 mode 2 at rank 3. At 1.0 the intruders drop to rank 5 or vanish; at 0.6 they are gone from every top 5 checked

**Secondary findings:** the boost decision effectively governs only modes 2 and 4 — mode 5 returned the identical top 5 in identical order at all three values for Q5, because `$scoreFusion`'s sigmoid normalization compresses the text arm's contribution (same saturation seen in Fix #1), which is further argument for L2.5; the Q5 mode-4 latency regression is a measured consequence of the hybrid candidate-limit asymmetry documented as L2.6, which was P1 on the strength of a timing difference and is now a 1.7-second regression on a real query — **L2.6 should be promoted to P0 and fixed before the boost value is finalized**, since capping the text arm will change mode 4's fused ranking and therefore its optimal boost; Q2's five-way tie at exactly `1.0` in mode 2 survives untouched, confirming it is a window-max normalization artefact (L2.5) rather than a field-coverage problem; recall is a property of the index mapping and not the boost, so lowering the boost costs no coverage

**Status:** Committed as bf2fb56 (index mapping doc)

---
## Fix #5 — Hybrid candidate-limit symmetry

**Date:** 2026-09-15
**Source recommendation:** L2.6 in docs/recommendations-pre-refactor.md — promoted P1 → P0 after the Fix #4 boost sweep measured a 2.5× latency regression traceable to this asymmetry
**Files modified:** hybrid_rrf_pipeline.py
**Hypothesis:** `$rankFusion` fused an **uncapped** `$search` arm against a 200-document `$vectorSearch` arm, while `$scoreFusion` already capped its text arm at 200. Since RRF is rank-based, an uncapped arm's ranks run far deeper than the capped arm's, so the two arms' reciprocal-rank contributions are not comparable — and on a broad query the extra candidates drag the whole fusion stage down. Capping the text arm at the same depth should remove the latency regression and make the two hybrid modes legitimately comparable

**Queries used to measure:** Q5 (drink that helps me relax before bed) in mode 4 as the regression case, Q3 (beverages) and Q4 (green tea) in mode 4 for ranking impact, and all three in mode 5 as an untouched control. 3 measured reps per case rather than the usual 2, since latency was the headline metric. The mode-4 half of the Fix #4 boost sweep was then re-run with the cap in place (Q3/Q5 at 1.8/1.0/0.6, plus Q4 which the original sweep only covered at 1.8) to check whether capping altered the boost conclusions

**Result BEFORE the fix:** Q5 mode 4 at **2 911 ms** median (reps 2 680 / 2 911 / 3 118), feeding 2 729 text candidates into fusion; `total_results` Q4 825, Q5 2 729. Q3 mode 4 731 ms, Q4 mode 4 849 ms. Mode 5 controls: Q3 710 ms, Q4 701 ms, Q5 811 ms

**Result AFTER the fix:** **Q5 mode 4 at 726 ms — a 4.0× improvement, and 34% below the original pre-index baseline of 1 092 ms.** Mode 5 controls flat within noise (712 / 727 / 748 ms), confirming causation. **Mode-4 top-5 rankings are byte-identical before and after for all three queries** — same products, same order, same scores. `total_results` fell for broad queries (Q4 825 → 263, Q5 2 729 → 345) and now agrees with mode 5 (264 and 345 respectively)

**Confirms hypothesis?** ✅ Yes on latency and on structural comparability; ⚠️ partially on ranking comparability. The two modes' candidate pools, totals and latencies converged (Q4: 825 vs 263 → 263 vs 264; Q5: 2 729 vs 345 → 345 vs 345), so a side-by-side `$rankFusion` vs `$scoreFusion` demo is now an honest comparison of fusion strategy. But top-5 **agreement between the modes did not improve** (set overlap 3/5 → 2/5 on Q4, position agreement 0/5 both times): mode 4's ranking did not move at all, and the residual disagreement comes from `$scoreFusion`'s sigmoid compressing its top 5 into a ~6e-4 band versus raw reciprocal ranks — a scoring problem (L2.5), not a candidate-pool one. This fix removed the illegitimate source of disagreement; the legitimate one remains

**Measured impact:**
- Performance: large improvement on broad queries — Q5 mode 4 −75% (2 911 → 726 ms). Q3 unchanged (its text arm matched only 103 docs, under the cap) and Q4 −15%. No mode is slower
- Accuracy: no change at all — identical rankings. The 2 500 discarded candidates on Q5 contributed nothing but latency, before or after `aboutTheProduct` was indexed

**Secondary findings:** the Fix #4 caveat that "the L2.6 fix will invalidate part of this" proved **unfounded** — the false-positive pattern is entirely boost-driven, not candidate-pool-driven, and Q3 mode 4 returns the same four drinking vessels at boost 1.8 whether capped or uncapped, with the same clean results at 1.0 and 0.6; **0.6 remains the recommendation and gained a third supporting query** — Q4 mode 4, only covered at 1.8 in the original sweep, has `Green Tea Mugs` at rank 4 at boost 1.8 and gone from the top 5 at both 1.0 and 0.6; `FUSION_ARM_LIMIT = 200` and `VECTOR_NUM_CANDIDATES = 500` replace inline literals so mode 4's fusion depth is now one named knob, though mode 5 still carries its own inline `$limit: 200` — unifying them across files would require `utils.py` or a cross-module import, outside this fix's one-file scope; mode 4 and mode 5 `total_results` now agree but remain candidate counts rather than match counts, so L2.4 is still open — they are at least the same kind of wrong in both modes now

**Status:** Committed as 40ddc63 — note on numbering: the `aboutTheProduct` boost-value decision, referred to as "a separate Fix #5" in the Fix #4 entry above, became **Fix #6**, because this fix landed first

---
## Fix #6 — aboutTheProduct boost set to 0.6

**Date:** 2026-09-15
**Source recommendation:** L1.1 in docs/recommendations-pre-refactor.md — the boost half of that recommendation, deferred from Fix #4 and renumbered from #5 after the L2.6 fix landed first
**Files modified:** text_pipeline.py, hybrid_rrf_pipeline.py, hybrid_score_fusion_pipeline.py
**Hypothesis:** with `aboutTheProduct` now indexed (Fix #4), its clause boost of 1.8 — the second-highest in the ladder, above `brand` 1.2, `category` 1.1 and `subCategory` 1.0 — lets a 595-character average description outrank exact name matches. Lowering it to 0.6 should keep the recall and relevance gains while removing description-driven false positives. **Permanent change this time, not a sweep edit**

**Queries used to measure:** the decision rests on evidence already recorded in **Fix #4** (full sweep, Q1–Q5 across modes 2/4/5 at 1.8 / 1.0 / 0.6) and **Fix #5** (mode-4 re-check at all three values with the text arm capped). This entry adds only a confirmation pass at the committed value: Q1, Q3, Q4, Q5 in modes 2, 4 and 5 at boost 0.6

**Result BEFORE the fix:** boost 1.8 in all three builders. Q3 mode 4 returned four drinking vessels in its top 5 for `beverages`; Q5 mode 2 had a `PVC Food Mat` at rank 3; Q4 mode 4 had `Green Tea Mugs` at rank 4

**Result AFTER the fix:** **11 of 12 confirmation cells reproduce the earlier sweeps exactly** — same products, same order, same scores. The twelfth (Q4 mode 2, never measured at 0.6 before) returns five genuine green teas. Q1's exact match holds at rank 1 in all three modes; Q3 mode 4 returns actual beverages (Booch, Pepsi, Paper Boat, two Raw Pressery juices); Q5 keeps the newly-reachable `Chamomile Tea Bags` and `Melatonin 10Mg Capsule`; Q4 mode 4 is free of mugs. The mode-4 cells match both the pre-cap Fix #4 sweep and the post-cap Fix #5 re-check, independently re-confirming that capping the text arm changes no ranking

**Confirms hypothesis?** ✅ Yes — 0.6 is the only tested value where every checked query's top 5 is free of description-driven false positives in modes 2 and 4, while retaining the full recall gain (recall is set by the index mapping, not the boost)

**Measured impact:**
- Performance: none — a scoring weight, not a retrieval parameter. Latencies unchanged within noise
- Accuracy: improved in modes 2 and 4; unchanged in mode 5, which is boost-insensitive

**Secondary findings:** **one residual false positive survives** — Q4 mode 5 still returns `Green Tea Mugs - Multicolour` at rank 2 at boost 0.6, where modes 2 and 4 have no mug at all. `$scoreFusion`'s sigmoid normalization compresses its top 5 into a ~6e-4 band (0.848689 → 0.848095), so no boost value can reorder it; the fix is rec **L2.5** (single score normalization contract), not a different boost. Recorded so the Layer 1 / Layer 2 P0 work is not mistaken for having cleared every description-driven false positive. The clause ladder is now `productName` 3.0 ≫ `brand` 1.2 > `category` 1.1 > `subCategory` 1.0 > **`aboutTheProduct` 0.6**, making the description a corroborating signal — which per the embedding-source investigation is the only place description content influences ranking at all, since the stored vectors substantially under-represent it

**Status:** Committed as 5d9157d
