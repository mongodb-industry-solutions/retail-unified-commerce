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

---
## Fix #7 — Score normalization contract

**Date:** 2026-09-15
**Source recommendation:** L2.5 in docs/recommendations-pre-refactor.md
**Files modified:** utils.py, text_pipeline.py, vector_pipeline.py, hybrid_rrf_pipeline.py, hybrid_score_fusion_pipeline.py
**Hypothesis:** two separate defects were tracked under one recommendation. **(a)** `$scoreFusion`'s `input.normalization: "sigmoid"` saturates — raw Lucene scores here run ~9–12 and `sigmoid(10) ≈ 0.99995`, so every text candidate normalized to ≈1.0, the text arm contributed a near-constant and stopped discriminating, and mode 5 degenerated into a copy of mode 3, inheriting vector-only artefacts such as `Green Tea Mugs` at rank 2 for `green tea`. `minMaxScaler` rescales each arm against its own min/max so both genuinely contribute. **(b)** the response `score` meant four different things — window-max in modes 2 and 3, raw `$rankFusion` (~0.014–0.018) in mode 4, raw fused value in mode 5 — and one shared max-normalization helper should make it mean one thing everywhere without reordering anything. Scoped down per Florencia's decision: **no new API fields**

**Queries used to measure:** Q1–Q5 across modes 1, 2, 3, 4 and 5, plus the Fix #1 weight cases (`weightText/weightVector` at 1.0/0.0 and 0.0/1.0) re-run in mode 5 on Q2 and Q4, since that saturation finding was originally measured under sigmoid. 29 cells per pass, genuine before and after passes. The mechanism was also confirmed read-only *before* writing code, by exercising the pre-existing `normalization` builder parameter across `sigmoid` / `minMaxScaler` / `none`

**Result BEFORE the fix:** Q4 mode 5 had `Green Tea Mugs - Multicolour` at rank 2, a top-5 spread of 5.9e-4, and a top 5 identical to the pure vector arm position-for-position. Mode 4 scores sat at 0.0137–0.0164. Q4 `w=1.0/0.0` in mode 5 had a top-5 spread of **exactly 0.0** — even the pure-text case was fully saturated

**Result AFTER the fix:** ✅ **`Green Tea Mugs` is gone from Q4 mode 5's top 5**, replaced by five genuine green teas, with the spread widening 5.9e-4 → 7.4e-2 (≈125×). Mode 5 stopped being a vector copy for Q1, Q3, Q4 and Q5; text agreement rose for Q1 (3/5→4/5), Q4 (2/5→4/5) and Q5 (2/5→3/5). Mode 4 scores moved to 0.8502–1.0000 with **ranking unchanged in all five queries**. **24 of 25 mode-1-to-4 cells are byte-identical in product order**; response keys identical at 13 before and after; no exact `0.0` in any of the 29 cells

**Confirms hypothesis?** ✅ Yes, both halves. The one non-identical mode-1-to-4 cell (Q4 mode 3) was diagnosed as ANN jitter, not the fix: ranks 1–4 match, only rank 5 swaps between two documents 9e-5 apart, the rank-2/3 raw scores also differed between passes, four consecutive repeat runs on the post-fix code are perfectly stable, and the post-fix value matches the *original* pre-refactor baseline exactly — the before pass was the outlier

**Measured impact:**
- Performance: no meaningful change; the helper emits the same three stages modes 2 and 3 already ran, and adds them to modes 4 and 5
- Accuracy: mode 5's ranking is materially better and genuinely blended rather than vector-only. Modes 1–4 unchanged by design

**Secondary findings:** **Q2 remains an exact vector copy in mode 5 and no normalization can fix it** — every `tomatoe` text candidate carries the identical raw Lucene score `8.983116` (`fuzzy: {maxEdits: 2}` scores all `tomato*` matches the same), so min-max of a constant series is degenerate and the text arm contributes a constant again; this is the same root cause as Q2's five-way `1.0` tie, which likewise survives, needs a deterministic tiebreaker, and is **not** a normalization defect — **correcting an earlier claim, the original baseline wrongly attributed that tie to window-max normalization**; **Q3 moved toward the vector arm** (text 2/5→1/5), confirming the fix makes the arms actually blend rather than biasing toward text; `minMaxScaler` is window-dependent by construction so mode 5 scores shift if the candidate set changes, which Fix #5's `FUSION_ARM_LIMIT` now bounds; the helper removed net −50 lines of duplicated `$setWindowFields` logic; mode 3 deliberately still normalizes its post-boost `adjustedScore` rather than the raw score, to avoid entangling this fix with L2.1; `score` is rendered as a `toFixed(5)` badge in both product cards but `ProductInventorySlice.js` only contains it in mock fixture data, so no frontend change was needed — though both cards guard with `{score && …}`, which would hide the badge for a legitimate `0.0`, so a `score != null` guard would be more correct

**Status:** Committed as 9f2828b

---
## Fix #8 — total_results semantics

**Date:** 2026-09-15
**Source recommendation:** L2.4 in docs/recommendations-pre-refactor.md — scoped down substantially after read-only investigation showed most of it was not a bug
**Files modified:** vector_pipeline.py, schemas.py, plus `total_results` semantics notes in the module docstrings of hybrid_rrf_pipeline.py and hybrid_score_fusion_pipeline.py
**Hypothesis:** the `$facet` count branch counts the candidate window rather than the match count, so `total_results` was claimed to be dishonest in modes 3, 4 and 5. Investigation revised this: **modes 1 and 2 already report a true match count** (their count branch has no `$limit` ahead of it — verified against `$searchMeta`, which agreed exactly on all five queries: 165/10/103/786/2706), and for modes 3–5 **no true count exists** — `$searchMeta` cannot run over a vectorSearch index ("Cannot execute $search over vectorSearch index") and kNN has no match set, since all 3 914 in-store documents have some similarity. The real defect was narrower: Fix #3 had derived mode 3's retrieval depth from `page_size` (`max(50, page_size * 2)`), so the user-visible result count moved with the page-size control

**Queries used to measure:** Q1–Q5 in mode 3 at `page_size=5`; Q1–Q5 in modes 4 and 5 as untouched controls; and Q4 in modes 3 and 4 swept across `page_size` 5 / 10 / 20 / 50 / 100 to demonstrate the sensitivity. Plus an explicit pagination-contract check requesting every one of the 10 advertised pages individually at the production `page_size=20`, and a cost measurement of the rejected extra-round-trip option

**Result BEFORE the fix:** mode 3 `total_results` was 50 for every query at `page_size=5`, and moved to 50 / 50 / 50 / 100 / 200 as `page_size` went 5 / 10 / 20 / 50 / 100 — three distinct values `{50, 100, 200}` for the same query. An extra count round-trip was measured at 136–145 ms, i.e. **+91% on Q2**, +60% on Q4, +31% on Q5

**Result AFTER the fix:** mode 3 `total_results` is a stable **200** for every query and **every page size** — distinct values across page sizes went `{50, 100, 200}` → `{200}`. **Top-5 is identical for all five queries**; modes 4 and 5 are completely unaffected (totals and top-5 identical, as predicted, since they already bounded their arms with `FUSION_ARM_LIMIT`). Pagination contract verified intact: all 10 advertised pages return exactly 20 documents, none empty, and page 11 is empty by design and never offered by the UI

**Confirms hypothesis?** ⚠️ Partially — the *revised* hypothesis yes, the original one no. The original L2.4 premise (that the reported numbers are wrong and need a true count) was disproven: modes 1–2 were already correct, and modes 3–5 have no correct alternative. What was genuinely broken — page-size coupling — is fixed, and the semantics are now documented rather than left implicit

**Measured impact:**
- Performance: small regression in mode 3, mean ~630 → ~679 ms (+8%, worst case Q3 541 → 684 ms), because 200 rather than 50 documents now pass through `$setWindowFields`/`$sort`/`$facet`. Zero extra round-trips — the rejected count-call option would have cost 136–145 ms per request
- Accuracy: no ranking change anywhere. The reported number is now stable and correctly described

**Secondary findings:** **one visible change, accepted deliberately** — at the production `page_size=20` mode 3 now advertises "of 200 items" / 10 pages instead of "of 50 items" / 3 pages; all 10 pages are fully populated so pagination *behaviour* is unchanged, but the offered depth is larger and the tail of those 200 is low-similarity filler; the **`min(200, store size)` branch could not be exercised** because no staging store is small enough — the smallest, `store-047`, holds 384 products and duly reports 200, so that behaviour is structural rather than verified; **`total_pages` is dead weight** — the frontend never reads it (`lib/api.js:81` forwards only `total_results` as `totalItems`) and LeafyGreen recomputes page count itself, but removing it would change the payload shape and was left alone as agreed; `total_results` **is** user-visible, rendered by LeafyGreen as the "1 – 20 of N items" label, which is why its stability matters; the page-size dropdown is currently inert (`ProductList.jsx:40` passes `itemsPerPageOptions` with no `onItemsPerPageOptionChange` handler and `lib/api.js:29` sends the constant 20), so the defect fixed here was latent rather than active; **correcting an earlier claim**, the original baseline said mode 3 advertises pages that turn out empty — it does not, `ceil(200/5)=40` pages for 200 retrievable results is exactly right; `VECTOR_RETRIEVAL_DEPTH` duplicates `FUSION_ARM_LIMIT`'s value in a second module and a shared constant in `utils.py` would be the natural consolidation, outside this fix's scope

**Status:** Committed as 139f6ec

---
## Fix #9 — Rank-space Brand Amplification

**Date:** 2026-09-15
**Source recommendation:** L2.1 in docs/recommendations-pre-refactor.md
**Files modified:** utils.py, vector_pipeline.py, hybrid_rrf_pipeline.py, hybrid_score_fusion_pipeline.py (text_pipeline.py deliberately untouched)
**Hypothesis:** amplification multiplied the relevance score by `(1 + 0.05|0.10|0.15)` in modes 3/4/5, which is unbounded in effect because what a multiplier does to a ranking depends on how tightly that mode's scores are packed — and the packing differs wildly (Lucene ~0.4–18.7 on this catalogue, cosine ~0.75–0.84, raw RRF ~0.014–0.018). The same `high` setting was therefore a no-op on `beverages` and put an unrelated oolong tea at rank 1 for `tomatoe`. Expressing amplification in **rank space** — `targetRank = max(1, ceil(preRank / F))`, F = 4/10/25, ordered by `(targetRank, preRank)` — is comparable across modes without calibration and bounds how far a document can climb

**Queries used to measure:** Q1–Q5 × modes 3/4/5 × levels off/low/medium/high at **page_size=20** (the production value, not the 5 used in earlier fixes), plus the `Aroma Magic` / `face wash` case from Fix #2 as a regression check. 66 configurations

**Result BEFORE the fix:** documented across the original baseline and Fixes #2/#4/#6 — `tomatoe` mode 3 at level 3 returned `Global Darjeeling Oolong Tea` at **rank 1**; mode 3 over-reacted at level 1 (Aroma Magic went from one slot to all five of the top 5); modes 3/4/5 were a total no-op on `beverages` at every level; mode 4 was the least responsive at 2 of 5 where others gave 5 of 5; and the displayed `score` embedded our boost multiplier

**Result AFTER the fix:** all six acceptance criteria pass. **(a)** no boosted document reaches rank 1 for `tomatoe` in any of the 12 configurations, and the accepted trade-off did **not** materialise — the best Teamonk document lands at rank 6 at `high`, just outside the top 5. **(b)** `green tea` boosted-count in the top 5 is strictly monotonic in all three modes (mode 5: 2→4→5→5). **(c)** `beverages` climbs monotonically and is never #1 at low/medium — mode 4 18→8→4, mode 5 —→16→7. **(d)** `Aroma Magic` still amplifies, 0→7–9→12–13 documents flagged per 20-row page. **(e)** `Onion` holds rank 1 with a Teamonk rule active in all three modes. **(f)** 7 of 7 non-boosted documents carry byte-identical scores with amplification on and off

**Confirms hypothesis?** ✅ Yes

**Measured impact:**
- Performance: no meaningful change — one `$sort` plus one `$setWindowFields` on a ≤200-document window, and only when rules are active (the no-rules path emits just `$set isBoosted:false` + the original `$sort`)
- Accuracy: materially better and, more importantly, *bounded*. The level now means one thing in every mode

**Secondary findings:** **the `(targetRank, preRank)` tiebreak does the protective work, not the bound** — Teamonk's pre-boost rank for `tomatoe` is 106 so `ceil(106/25)=5`, but the genuinely-relevant document at preRank 5 shares targetRank 5 and sorts first, pushing the boosted document to position 6; in general a boosted document cannot displace those above its own targetRank, so entering the top 5 at `high` requires preRank ≤ 100 — **and the margin on this query is thin, 106 against 100**, so a slightly stronger spurious semantic match would have landed inside the top 5; `$documentNumber` accepts only a **single-element** `sortBy` (`{score:-1,_id:1}` fails with `Location5371602`), so the helper emits an explicit deterministic `$sort` first and then windows on `{score:-1}` alone — ordering among byte-identical scores is stable in practice but not guaranteed by spec; the three divergent `BOOST_MAP`s are replaced by one `AMPLIFICATION_FACTORS`, net **−92 lines**, while mode 2 keeps its own 1.5/2.0/2.5 map because that feeds Lucene's native boost, a genuinely different mechanism; mode 3 remains an unavoidable no-op on `beverages` because Teamonk is absent from the whole 200-document vector window, which no amplification model can fix without unioning the lexical match set into mode 3 and turning "pure vector" into a hybrid

**Deliberately not built, and why:**
1. **Eligibility-gated amplification.** A design gating promotion on lexical match — using `$rankFusion`/`$scoreFusion` `scoreDetails` for per-arm participation in modes 4/5 — was worked through and dry-run against real windows. It cleanly separated the three test cases (Teamonk absent from `tomatoe`'s match set, present for `green tea` and `beverages`) and would have given stronger protection plus better `beverages` visibility. **Rejected in favour of a single explainable rule**; simplicity was prioritised for this iteration. The measurements are in the conversation record if it is revisited.
2. **Native `$score` normalization (MongoDB 8.2+, available on 9.0.1).** Evaluated as a replacement for Fix #7's `max_normalize_stages`. Verified working after `$search`, `$vectorSearch` and `$rankFusion`, and its metadata survives both `$setWindowFields` and `$facet`. **Deferred as a future Fix #10** because `normalization: "minMaxScaler"` maps the minimum to exactly `0.0`, and both product cards guard with `{score && …}` — so the score badge would vanish for one row, landing on **page 1** whenever the match set fits within a page (measured: `tomatoe` mode 2, 10 matches, rank 20 → `0.000`). It also arguably reduces honesty: `green tea` mode 3's rank-20 document has cosine 0.830 against a 0.835 maximum but min-max displays 0.815 where the true ratio is 0.982
3. **A native-rerank alternative to this whole approach.** MongoDB's native `$rerank` (Voyage `rerank-2.5`/`-lite`) could in principle replace bounded amplification with genuine relevance reranking over a top-N, making the relevance floor a model judgement rather than a rank heuristic. Flagged as **future exploration only** — not built, not costed beyond the rough estimate in rec L4.1

**Status:** Committed as 9c65c38

---
## Fix #10 — Mode 2 isBoosted flag under category-scoped rules

**Date:** 2026-09-15
**Source recommendation:** none — a pre-existing defect surfaced by Fix #9's category-scoping verification, related to L2.2 (Fix #2), which corrected the same class of bug for whitespace-padded brands
**Files modified:** text_pipeline.py
**Hypothesis:** `_brand_amp_should_clauses` appended every rule's brand to the unscoped `boosted_brands` list *before* checking whether the rule carried `categories`. The `isBoosted` projection tests `$in [normalized($brand), boosted_brands]` as the first arm of an `$or`, so any document of that brand satisfied it regardless of category. The ranking was always correctly scoped — a scoped rule's `should` clause uses `compound.must` on `brand` with a `filter` on `category` — so mode 2 reported documents as boosted that it had never actually boosted. Moving the append inside the `if not categories:` branch should make the flag agree with the ranking, leaving scoped rules to rely on `brand_cat_pairs`, which the `$or`'s second arm already checks

**Queries used to measure:** the exact test that found the bug — query `green tea`, mode 2, store-030, `page_size=50` (wide enough to hold Teamonk products from both `Beverages` and `Gourmet & World Food`), with a `Teamonk` + `categories: ["Beverages"]` rule; plus Fix #2's brand-only `Teamonk` rule as a regression check and an unamplified control. Genuine before and after passes

**Result BEFORE the fix:** scoped rule flagged **14/14 in-category AND 14/14 out-of-category** Teamonk documents — 28 flagged in a page where only 14 had actually been boosted. Brand-only rule flagged 37/37; control flagged 0

**Result AFTER the fix:** scoped rule flags **14/14 in-category and 0/14 out-of-category** ✅. Individual documents flipped as expected (`Strawberry Green Tea`, `Avana Darjeeling Green Tea`, `Ashwagandha Green Tea`, `Pineapple Green Tea` — all `Gourmet & World Food` — went `true` → `false`). Brand-only rule unchanged at 37/37 with 0 non-Teamonk documents flagged. Product order, scores and `total_results` (786) are **byte-identical** in all three configurations, as expected for a projection-only change

**Confirms hypothesis?** ✅ Yes

**Measured impact:**
- Performance: none — the change is in Python list construction, not in the emitted pipeline
- Accuracy: the `isBoosted` explainability signal now agrees with what the ranking actually did. No ranking change

**Secondary findings:** **why this went unnoticed** — it requires a brand whose products span more than one category *and* a rule scoped to one of them; Fix #2 used `Aroma Magic`, whose products in this store are all `Beauty & Hygiene`, so scoped and brand-only rules produced identical output, which is exactly the limitation Fix #2's entry recorded at the time; **user-visible impact before the fix** — `ProductCard.jsx:61,67` keys both the lime card highlight and the "Boosted" badge off `isBoosted === true`, so a merchandiser scoping a rule to `Beverages` saw Gourmet teas presented as boosted in the very panel built to demonstrate the feature; **modes 3/4/5 were already correct** after Fix #9, since their `$switch` branches require brand **and** category and `isBoosted` derives from the same factor, verified at 0 out-of-category flags; the `boostedBrands=%d` log line now counts only brands with unscoped rules, with scoped ones under `brandCatPairs` — more accurate, but the denominator changed for anyone comparing old and new logs

**Status:** Committed as 79e6936

---

## Fix #11 — Pooled Voyage HTTP client

**Date:** 2026-09-15
**Source recommendation:** L3.1 (Voyage / embeddings layer) — the last open performance item
**Files modified:** voyage_ai/client.py, main.py
**Hypothesis:** Part C measured a persistent 400–429 ms `APP − DB` gap in every embedding-dependent mode (3, 4, 5), larger than the entire database cost of those modes, and attributed it to the single outward HTTP hop to Voyage. `create_embedding` opened a **new** `httpx.AsyncClient` inside every call, so each search paid a fresh TCP connect and TLS handshake before the request could even go out. Building one `AsyncClient` at startup, reusing it for the process lifetime and closing it in the shutdown hook should remove that per-request connection setup and cut the gap measurably. This is an infrastructure-layer change only: no pipeline file is touched, so the emitted aggregations and therefore the results must be bit-for-bit unchanged

**Queries used to measure:** **8 distinct query texts per mode, never repeated** within or across mode blocks (`organic red onion`, `ripe roma tomatoes`, `sparkling fruit beverage`, `jasmine green tea leaves`, `something soothing for a sore throat`, `gluten free breakfast cereal`, `cold pressed coconut oil`, `low sugar dark chocolate bar` for mode 3, and eight further distinct texts each for modes 4 and 5) — 24 app calls in total, every one a first-time embedding of unseen text. APP measured via `POST /api/v1/search` on port 8010, store-030, `page_size=5`; DB measured in-process with the same pipeline builders, median of 3 after a plan-warming call, preserving Part C's APP/DB separation. Pooling was then isolated directly against the Voyage API, 8 distinct texts per arm, reproducing the pre-fix path exactly (a brand-new `httpx.AsyncClient` per request) so the arms differ only in connection reuse

**Result BEFORE the fix:** `APP − DB` gap of **400–429 ms** (Part C). Reproduced independently in the direct A/B: the pre-fix code path measured a median of **400.2 ms** and **386.3 ms** across two runs of 8 calls, confirming both measurements sit on the same footing

**Result AFTER the fix:** the gap is consistently **~280 ms per call** — median **267.4 / 303.5 / 282.9 ms** for modes 3 / 4 / 5, and **292.7 ms** across all calls (mean 288.9, range 179.3–402.4, n=23 excluding the process's first call). The direct A/B isolates the saving at **120.4 ms (30%)** and **107.7 ms (28%)** across two runs: median **400.2 → 280.8 ms** and **386.3 → 275.6 ms**. The saving applies to **every** request — there is no cheaper path for some requests and not others. Every call still reaches the network: the service log shows 24 searches → **24** outbound `Embedding request` entries → **24** `Embedding length` responses, on **24** distinct query texts

**Confirms hypothesis?** ✅ Yes

**Measured impact:**
- Performance: −110 to −130 ms of app-side overhead on **every** embedding-dependent request (gap 400–429 → ~280 ms), i.e. ~28–30% of the embedding call. Modes 1 and 2 are unaffected, as they never embed. The remaining ~280 ms is the Voyage request itself and is not addressable from the client side
- Accuracy: none, by construction — no pipeline file was touched and the embedding is fetched fresh on every request exactly as before, so the same input takes the same code path and returns the same vector

**Secondary findings:** **the handshake is paid once per process, then amortized** — the *first* pooled call still costs 388.5 ms, indistinguishable from the pre-fix path, because that is the call where the connection is actually established; every call after it drops to ~275 ms, so the win is not per-call magic but one handshake spread across the process lifetime; **the first request of the process is a visible outlier** at a 1202.3 ms gap, which also absorbs the first Atlas connection and first-touch import/JIT of the FastAPI and Pydantic serialization paths — reported rather than dropped, and excluded from the aggregate medians; **short-lived processes benefit proportionally less** for the same reason, which matters for any future serverless or per-request-process deployment; **`httpx` connection-pool sizing was left at library defaults** and no concurrency tuning was measured, so behaviour under real parallel load is untested; **the remaining ~280 ms is now the single largest cost in the semantic and hybrid paths**, still comparable to the whole database cost of those modes (291–357 ms), and it is a network round-trip rather than inference — switching to a lighter embedding model would not address it

**Status:** Pending Florencia's review and commit
