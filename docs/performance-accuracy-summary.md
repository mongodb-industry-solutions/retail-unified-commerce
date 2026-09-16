# Search performance and accuracy — before vs after

Executive comparison of the search system **today**, after eleven fixes, against the **original
baseline** captured on 2026-09-14 before any change was applied.

Every figure here is carried over from measurements already recorded in
[`docs/baseline-pre-refactor.md`](baseline-pre-refactor.md) and
[`docs/refactor-progress-log.md`](refactor-progress-log.md). Nothing was re-measured for this
document, and nothing here is an estimate.

**Scope.** Staging Atlas (MongoDB 9.0.1), `retail-unified-commerce.products`, 6 143 documents,
store `store-030` (3 914 products). Five baseline queries throughout: **Q1** `Onion` (exact name),
**Q2** `tomatoe` (misspelling), **Q3** `beverages` (generic category), **Q4** `green tea`
(boosted-brand term), **Q5** `drink that helps me relax before bed` (semantic, lexically disjoint).

---

## 1. Comparative table by search mode

| | **Mode 2** `$search` | **Mode 3** `$vectorSearch` | **Mode 4** `$rankFusion` | **Mode 5** `$scoreFusion` |
|---|---|---|---|---|
| **Avg APP wall-clock — original** | 297.9 ms | 675.4 ms | 798.2 ms | 718.7 ms |
| **Avg APP wall-clock — current** | **236.5 ms** | 719.9 ms | **757.7 ms** | 743.8 ms |
| **Δ APP** | **−20.6%** | +6.6% | **−5.1%** | +3.5% |
| **Avg DB aggregation — original** | 272.1 ms | 304.1 ms | 427.7 ms | 335.6 ms |
| **Avg DB aggregation — current** | **234.8 ms** | **291.0 ms** | **356.5 ms** | 343.9 ms |
| **Δ DB** | **−13.7%** | **−4.3%** | **−16.7%** | +2.5% |
| **APP − DB (the embedding hop), then → now** | 25.9 → **1.7 ms** | 371.3 → **428.9 ms** | 370.5 → **401.2 ms** | 383.1 → **399.9 ms** |
| **APP − DB after Fix #11 (pooled client)** | unchanged, no embedding call | **~267 ms** | **~304 ms** | **~283 ms** |
| **APP range — original** | 151.7 – 491.5 ms | 606.0 – 723.8 ms | 654.3 – **1 092.1** ms | 643.1 – 839.6 ms |
| **APP range — current** | 148.0 – 515.6 ms | 653.3 – 789.7 ms | 678.6 – **908.5** ms | 687.6 – 801.0 ms |
| **Worst query (mean of 4 amp settings), then → now** | Q5 444 → **409 ms** | Q5 698 → 739 ms | **Q5 1 033 → 813 ms (−21%)** | Q1 725 → 758 ms |
| **Accuracy defects found originally** | ① `aboutTheProduct` clause dead (field unmapped, `dynamic:false`) ② five-way tie at exactly `1.0` on Q2 ③ `isBoosted` false for padded brands ④ `isBoosted` ignored category scope | ① `numCandidates == limit` (1:1 ratio) ② oolong tea at **rank 1** for `tomatoe` at high boost ③ amplification hair-trigger at low (1 slot → all 5) ④ amplification a no-op on Q3 ⑤ no-op for padded brands ⑥ `total_results` pinned to retrieval depth and varying with `page_size` ⑦ `score` embedded our boost multiplier | ① text arm uncapped vs 200-doc vector arm ② raw RRF scores ~0.014–0.018, incomparable ③ least responsive to amplification (2 of 5) ④ `weight=0.0` coerced to `1.0` ⑤ amplification a no-op on Q3 | ① `sigmoid` saturation made it a **copy of mode 3** (5/5 identical order) ② `Green Tea Mugs` at rank 2 for `green tea`, at any boost level ③ top-5 spread 5.75e-4 ④ `total_results` 271 vs 272 for identical input ⑤ `weight=0.0` coerced ⑥ no-op on Q3 |
| **Current status** | ① **fixed** (#4) ② **still open** ③ **fixed** (#2) ④ **fixed** (#10) | ① **fixed** (#3) ② **fixed** (#9) ③ **improved** (#9) ④ **still open** ⑤ **fixed** (#2) ⑥ **fixed** (#8) ⑦ **fixed** (#9) | ① **fixed** (#5) ② **fixed** (#7) ③ **improved** (#9) ④ **fixed** (#1) ⑤ **fixed** (#9) | ① **fixed** (#7) ② **fixed** (#7) ③ **fixed** (#7) ④ **intermittent** ⑤ **fixed** (#1) ⑥ **fixed** (#9) |

**Methodology — identical on both sides.** The current figures come from a re-run of the original
Part C matrix against the post-fix code: **80 configurations** (5 queries × 4 modes × 4 amplification
settings: off / low / medium / high with a `Teamonk` rule), `page_size = 5`, store `store-030`, one
discarded warm-up then 2 measured repetitions with the median reported. APP is a real
`POST /api/v1/search`; DB is the same pipeline rebuilt in-process and executed directly, so it
excludes HTTP, validation and the embedding hop. Read-only throughout.

**One row is measured separately.** The 80-configuration matrix was run against the code as of
Fix #10, so its `APP − DB` row still reflects a new HTTP client per embedding call. Fix #11's
row comes from its own verification — 8 distinct query texts per mode, 24 calls, no repeats —
and is the current state of that figure.

**One caveat that does remain.** The two passes ran on **different days** (2026-09-14 and
2026-09-15) against a shared staging cluster, so day-to-day ambient variance is not controlled. This
matters for one figure in particular: **mode 2's −20.6% is not attributable to any fix.** Nothing
this session should have made lexical search faster — if anything Fix #4 more than doubled its match
count on Q5 (1 220 → 2 706) and should have made it *slower*. Read that number as ambient, not
earned. The changes that *are* attributable, because they match what the individual fix
verifications predicted, are **mode 3's +6.6%** (Fix #8's deeper 200-document window, predicted +8%)
and **mode 4's tail collapsing from 1 092 ms to 908 ms** (Fix #5's arm capping).

**Mode 1** (`$match` regex) is excluded from the table: it was untouched this session. It still
returns **0 results for 3 of the 5 queries** and still scans the whole `productName_1` index
(`totalKeysExamined: 6143` on every query) — rec **L1.3**, still open.

---

## 2. Headline fixes

| | Before | After |
|---|---|---|
| **Relevance inversion** | `tomatoe`: an unrelated oolong tea reached **rank 1** in mode 3 at high boost | **no boosted document reaches rank 1** in any of 12 tested configurations; the best Teamonk lands at rank 6, outside the top 5 |
| **Score fusion was broken** | mode 5's top 5 was **identical to the pure vector arm, 5/5 in order** — `sigmoid(10) ≈ 0.99995` flattened the text arm to a constant, so `Green Tea Mugs` sat at rank 2 for `green tea` at *any* boost level | genuinely blended (4/5 agreement with the text arm on Q4); **mug out of the top 5**; top-5 spread widened from 5.9e-4 to 7.4e-2 (≈125×) |
| **Latency regression** | Q5 in mode 4 took **2 911 ms** — one uncapped fusion arm fed 2 729 candidates against the other's 200 | **726 ms** (−75%), and **−34% below the original 1 092 ms baseline**, with top-5 rankings byte-identical |
| **A dead relevance signal** | `aboutTheProduct` was queried with a 1.8 boost in three modes but was **unmapped** in a `dynamic:false` index — 6 143 documents of description copy unreachable | mapped and live; mode 2 recall **1 220 → 2 706** on Q5 (+122%) and **71 → 103** on Q3 (+45%), surfacing products reachable only by description |
| **A TLS handshake on every search** | every embedding call constructed a **new HTTP client**, so each request in modes 3/4/5 paid a fresh TCP connect and TLS handshake on top of the API call — **400–429 ms** of app-side overhead, more than the entire database cost of those modes | one pooled client for the process lifetime: **~280 ms**, a **28–30% cut on every request** (median 400.2 → 280.8 ms in a direct A/B), with the handshake paid once at startup instead of once per search |
| **Honest scoring** | in modes 3/4/5 the displayed `score` was multiplied by our own boost factor, and meant four different things across modes | one contract everywhere (engine score, max-normalized); **verified byte-identical for 7 of 7 non-boosted documents** with amplification on versus off |

---

## 3. What still affects performance

| Item | Measured cost | Rec |
|---|---|---|
| **Voyage embedding round-trip** — still the single largest remaining cost | **~280 ms** of app-side overhead per request in modes 3, 4 and 5 (medians 267 / 304 / 283 ms), down from 400–429 ms now that one pooled client serves the whole process, against **1.7 ms** for mode 2 which makes no embedding call. What remains is the Voyage request itself and is not addressable from the client side — it is a network round-trip, not inference. Still comparable to the entire database cost of those modes (291–357 ms) | partly addressed in #11 |
| **Mode 1's unbounded index scan** | `totalKeysExamined: 6143` on every query against `totalDocsExamined` of 0–18 — a case-insensitive `^` regex cannot produce index bounds. Cheap at this catalogue size, linear as it grows | **L1.3**, open |
| **Mode 3's deeper window** | **+8%** (mean ~630 → ~679 ms) — the accepted cost of pushing 200 rather than 50 documents through `$setWindowFields`/`$sort`/`$facet` in exchange for a `page_size`-independent result count | accepted in #8 |
| **`getDistinctBrands`** | an unindexed `$group` over all 6 143 documents — an unavoidable COLLSCAN — every time the Brand Amplification panel opens | **L2.10**, open |
| **Catalogue duplication** | **625 duplicate name+brand groups, 898 redundant documents (14.6%)**. Not a latency cost but a wasted-page-slot cost: a five-row page can be half redundant | **L2.9**, open |
| **`$scoreFusion` window dependence** | `minMaxScaler` derives min/max from the candidate set, so mode 5's scores shift if that set changes. Fix #5's `FUSION_ARM_LIMIT` bounds it; the intermittent `total_results` 271/272 flap has the same root | known, monitored |

Two further items were evaluated and deliberately deferred rather than left unexamined: **native
`$score`** (works on 9.0.1, but `minMaxScaler` maps the minimum to exactly `0.0` and both product
cards guard with `{score && …}`, so a badge would vanish), and **native `$rerank`** (costed at
roughly $3–44/month at 100 k searches, but it adds a second synchronous model call on top of the
~280 ms already being paid).

---

## 4. General performance recommendations

Each of these is grounded in something measured this session, not general advice.

**1. Cap every fusion arm symmetrically.** One uncapped `$search` arm against a 200-document
`$vectorSearch` arm produced a **2.5× latency regression** on a broad query (2 911 ms vs 726 ms
capped) with **zero ranking benefit** — the top 5 was byte-identical either way, so 2 500 extra
candidates bought nothing. With rank-based fusion there is a second reason: an uncapped arm's ranks
run far deeper than the capped arm's, so the two arms' reciprocal-rank contributions stop being
comparable.

**2. Bound ANN retrieval depth by what you will actually show, and don't assume over-fetching buys
recall.** A control varying `numCandidates` across **200 / 500 / 2000** with retrieval depth fixed
returned the **identical 50 documents in identical order** on all three test queries — zero new
documents at any higher budget. At ~4 000 filtered vectors, HNSW was already effectively exact. The
measured win came from pushing **fewer documents through the downstream stages**
(`$setWindowFields`, `$sort`, `$facet`), not from a bigger candidate pool. Over-fetch for real
recall risk at scale, not reflexively.

**3. Express business boosting in rank space, not score space, when combining heterogeneous scoring
mechanisms.** The same multiplier meant completely different things per mode because score packing
differs wildly — Lucene spanned **0.4–18.7** on this catalogue, cosine **0.75–0.84**, raw RRF
**0.014–0.018**. One `+15%` setting was a total no-op on one query and put an unrelated document at
**rank 1** on another. Rank is comparable across modes with no calibration, and
`ceil(rank / factor)` is inherently bounded. A useful detail: ordering by
`(targetRank, originalRank)` means a promoted document cannot displace anything ranked above its own
target, so the tiebreak does much of the safety work.

**4. Never apply sigmoid normalization to unbounded scores.** `sigmoid(10) ≈ 0.99995`, so with raw
Lucene scores in the 9–12 range every text candidate normalized to ≈1.0 — the arm contributed a
constant and **stopped discriminating entirely**, silently degrading hybrid search into
vector-only. `minMaxScaler` preserved each arm's internal spread. Note the mirror failure too:
`none` let unnormalized Lucene (~9.76) dwarf cosine (~1.0) and killed the *vector* arm instead.

**5. Reuse HTTP client connections for external API calls.** Constructing a new client per
request pays a full TCP/TLS handshake every time; pooling one client for the process lifetime
removes that overhead on every call.

**6. With `dynamic: false`, verify every queried path is actually mapped.** Three pipelines carried
a 1.8-boosted clause on a field absent from the index — a dead clause across 6 143 documents and the
single largest untapped relevance signal in the dataset. Nothing errors; the clause simply never
matches.

**7. Treat "how many results are there" as mode-dependent, and say so in the contract.** kNN has no
discrete match count — every filtered document has *some* similarity — and `$searchMeta` **cannot
run against a vector index** at all. Lexical modes can report a true count; semantic and hybrid
modes can only honestly report retrievable depth. Also: an extra round-trip to "fix" a count that
was already correct would have cost **+91%** on the fastest query.

**8. Keep the displayed relevance score free of business-rule arithmetic.** Embedding the boost
factor in the score made the number un-auditable and hid the mechanism. Reordering plus an explicit
`isBoosted` flag shows *more*: a boosted item visibly sitting above a higher-scored one is the
feature demonstrating itself.

**9. Normalize rule matching on both sides.** **38 brand values carrying stray whitespace, across
288 documents**, silently broke exact `$eq` matching while the analyzed `text` operator matched them
fine — so the ranking and the explainability flag disagreed, in opposite directions, in different
modes. Compare trimmed and case-folded on both sides.

**10. Pair every fix with a control that isolates one variable, and capture a genuine "before".**
The `numCandidates` control stopped us claiming a recall improvement that never happened. Separating
ANN jitter (≤3.4e-4, order preserved) from real ranking change stopped a false regression report.
And where a fix could not be reconstructed after the fact, a real pre-fix pass was captured rather
than inferred — twice this session that distinction changed the conclusion.

---

## Summary

Eleven fixes closed **all eight P0 defects** from the original baseline — the seven identified in
the recommendations plus **L2.6**, promoted from P1 when the latency regression was measured. Accuracy
improved on every dimension tested: no relevance inversions remain, hybrid score fusion genuinely
blends both signals, brand amplification is bounded and works in four of five modes, and the score
field is honest.

Latency, measured on an identical 80-configuration matrix, is **flat to modestly better in the
database** (−4% to −17% in three of four modes) with the **one large regression eliminated**: mode
4's worst case fell from 1 092 ms to 908 ms, and Q5 specifically from 1 033 ms to 813 ms. Mode 3
carries a deliberate +6.6% for a `page_size`-independent result count.

The dominant remaining cost is not in the database at all — it is the **synchronous embedding
round-trip** in the semantic and hybrid paths. Fix #11 cut it from 400–429 ms to **~280 ms** on
every request by pooling one HTTP client instead of constructing a new one per call, a 28–30%
saving. What is left is the Voyage request itself, still comparable to the entire aggregation cost
of those modes, and not reducible from the client side — any further gain has to come from the API
call itself, not from how it is connected.

Three defects remain open and are understood: Q2's **five-way score tie** (identical raw Lucene
scores — needs a deterministic tiebreak, not a normalization change), amplification's **no-op on Q3
in mode 3** (the brand is absent from the vector candidate window — structural), and mode 5's
**intermittent `total_results` flap**.
