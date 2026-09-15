# Search refactor — prioritized recommendations

Companion to [`docs/baseline-pre-refactor.md`](baseline-pre-refactor.md) (measured 2026-09-14 against
staging: MongoDB 9.0.1, `retail-unified-commerce.products`, 6 143 documents, store `store-030`).

**This is a proposal document. Nothing here has been applied.** Every recommendation below is
traceable to a measurement in the baseline or to a specific line of code read during the diagnosis;
where a claim rests on a judgement call rather than a measurement, it is labelled as such.

Priority is assigned on evidence, not on elegance:

| Tier | Meaning |
|---|---|
| **P0** | Produced a demonstrably wrong or empty result, or a silently dead code path, in the baseline |
| **P1** | Measured cost or measured inconsistency, but no wrong results yet |
| **P2** | Hygiene, documentation, or a theoretical improvement with no evidence of harm today |

Effort/risk scale: **S** = config or one-line change · **M** = contained code change · **L** = restructure
across layers · **XL** = needs new infrastructure, a data migration, or a write to staging.

---

## Priority ranking at a glance

| # | Rec | Layer | Priority | Effort | Evidence |
|---|---|---|---|---|---|
| 1 | Map `aboutTheProduct` in the text index (or delete the clause) | L1 | **P0** | S | Dead `should` clause in modes 2, 4, 5; 6 143 docs of unsearchable copy |
| 2 | Unify Brand Amplification semantics and bound its magnitude | L2 | **P0** | M | Q2 mode 3 L3: oolong tea ranked #1 for `tomatoe` |
| 3 | Fix brand matching: exact `$eq` vs analyzed `text` | L2 | **P0** | S–M | 38 brands / 288 docs have padded names; BA silently no-ops in modes 3–5 |
| 4 | Raise `numCandidates` above `limit` in mode 3 | L1/L2 | **P0** | S | `numCandidates: 200` with `limit: 200` — a 1:1 ratio, no over-fetch |
| 5 | Fix `total_results` / `total_pages` semantics | L2 | **P0** | M | Mode 3 always reports 200; mode 5 returned 271 vs 272 for identical input |
| 6 | Fix `weight = 0.0` silently becoming `1.0` | L2 | **P0** | S | `float(weights.get(...) or 1.0)` — falsy coercion, 4 call sites |
| 7 | Adopt one score normalization contract across modes | L2 | **P0** | M | Ties at exactly `1.0` (Q2 m2), 5.75e-4 spread (Q4 m5), raw RRF ~0.016 (m4) |
| 8 | Symmetrize hybrid candidate limits | L2 | **P1** | S | rrf text arm uncapped, scoreFusion text arm `$limit: 200` |
| 9 | Reuse a pooled Voyage HTTP client + cache query embeddings | L3 | **P1** | M | ~370–383 ms app-side overhead in modes 3–5; new `AsyncClient` per call |
| 10 | Replace mode 1's regex with a bounded index or Atlas Search | L1 | **P1** | M | `totalKeysExamined: 6143` on every query; 0 results for Q2/Q3/Q5 |
| 11 | Evaluate `$rerank` on a top-N of the hybrid modes | L4 | **P1** | L–XL | Q2/Q3/Q5 ranking failures; no reranking exists today |
| 12 | Retire dead parameters and the deprecated repo alias | L2 | **P1** | S | `in_stock`, `num_candidates`, `knn_limit`, `normalization` unreachable over HTTP |
| 13 | Reconcile the three searchMeta env var names | L2 | **P1** | S | Baseline Part B rows 22–24: works only via a hard-coded literal |
| 14 | Decide on `input_type` for query vs document embeddings | L3 | **P1** | S–XL | Neither set today; correct use needs re-embedding |
| 15 | Deduplicate the catalogue (or dedupe at query time) | L2 | **P2** | M–XL | 625 duplicate name+brand groups, 898 redundant docs (14.6%) |
| 16 | Expose the `inStock` filter, or drop it from the index | L1 | **P2** | S | Indexed filter never queried; only 23 of 98 595 rows are `false` |
| 17 | Re-evaluate the embedding model / dimensionality | L3 | **P2** | XL | `voyage-3-large` @ 1024 dims; any change means re-embedding |
| 18 | Index `getDistinctBrands`, or precompute it | L1/L2 | **P2** | M | Unindexed `$group` COLLSCAN on every BA panel open |
| 19 | Drop the unused `stringFacet` on `category` in the text index | L1 | **P2** | S | Facets only ever queried against the meta index |
| 20 | Document `productName_1` + the meta index; clean scratch collections | L1 | **P2** | S | Baseline Part B rows 8, 14, 17 |

---

## LAYER 1 — Database / index configuration

### L1.1 — Map `aboutTheProduct` in `product_atlas_search`, or delete the clause  ·  **P0** · effort **S**

**What to change.** Either:

* **(a)** add `aboutTheProduct: { type: "string" }` to the `mappings.fields` of the live
  `product_atlas_search` index and to `docs/setup/indexes/search-index.json`; or
* **(b)** delete the `aboutTheProduct` `should` clause from
  `app/infrastructure/mongodb/pipelines/text_pipeline.py:146`,
  `hybrid_rrf_pipeline.py:158` and `hybrid_score_fusion_pipeline.py:182`.

Pick one — the current state is the worst of both, because the code advertises a 1.8-boosted
description field that the index cannot serve.

**Expected impact: accuracy** (no meaningful performance change either way; option (a) grows the index
by ~3.7 MB of text, option (b) costs nothing). All 6 143 documents carry real description copy,
averaging 595 characters, and it is currently unreachable in every text-scored mode. This is the
single largest untapped relevance signal in the dataset.

**Re-test with.** **Q5** (`drink that helps me relax before bed`) is the decisive one — the sleep/relax
vocabulary lives in `aboutTheProduct`, not in product names, so mode 2's lexical arm should improve
markedly. **Q3** (`beverages`) second, since category-adjacent words appear in descriptions.
Q1/Q2 should be unaffected; if they move, the boost weighting needs revisiting.

**Risk.** Option (a) rebuilds the index (a DDL operation on staging — needs explicit approval) and will
shift every mode-2/4/5 score, so the baseline must be re-captured afterwards. It also risks
*diluting* precision: a 595-character description matches many queries weakly, and at boost 1.8 —
the second-highest weight in the clause list — long descriptions may crowd out exact name matches.
I'd recommend option (a) with the boost dropped to ~0.5–0.8 initially, then tuned.

---

### L1.2 — Raise `numCandidates` well above `limit` in mode 3  ·  **P0** · effort **S**

**What to change.** `app/infrastructure/mongodb/pipelines/vector_pipeline.py:105-106`:
`num_candidates: int = 200` with `knn_limit: int = 200`. A 1:1 ratio means the HNSW search explores
no more candidates than it returns, which is the degenerate case for ANN recall. The hybrid builders
already use 500/200 (a 2.5:1 ratio) — still low. Atlas guidance is to over-fetch by roughly 10–20×
the desired `limit`.

Suggested: `numCandidates = 500`, `knn_limit = 50` for a 5–20 result page (10:1), and derive both
from `page × page_size` rather than hard-coding them.

**Expected impact: accuracy, and probably performance too.** Better recall at the retrieval step, and
returning 50 instead of 200 documents through `$setWindowFields` + `$facet` should *reduce* mode 3's
~304 ms average DB time, since the normalization window and the count branch currently process 200
documents to serve 5.

**Re-test with.** **Q2** (`tomatoe`) and **Q5** — the two queries where the correct answer is a weak
lexical match and therefore most sensitive to ANN recall. Also re-check **Q4**, where a larger
candidate pool should bring in more Teamonk products for the boost to act on.

**Risk.** Low. Pure parameter change, no index rebuild. Note that it will change mode 3's
`total_results` (currently pinned at 200 — see L2.4), so fix these two together.

---

### L1.3 — Replace mode 1's unbounded regex with a bounded index or Atlas Search  ·  **P1** · effort **M**

**What to change.** `keyword_pipeline.py:73` uses `{"$regex": f"^{query}", "$options": "i"}`. The
case-insensitive flag defeats index bounds, so `productName_1` is scanned end to end:
`totalKeysExamined: 6143` on all five baseline queries, against `totalDocsExamined` of 0–18.

Three options, in ascending order of change:

1. **Case-insensitive collation index** — create `productName_1` with
   `collation: { locale: "en", strength: 2 }` and drop `$options: "i"`, so the `^` anchor produces real
   index bounds. Requires the query to use the same collation.
2. **Atlas Search `autocomplete`** — add an `autocomplete` mapping on `productName` and rewrite mode 1
   as a `$search` `autocomplete` query. Better UX (handles mid-word matches), but then mode 1 is no
   longer "the no-Atlas-Search baseline mode", which may defeat its demo purpose.
3. **Retire mode 1** as a user-facing option and keep it only as a documented contrast.

Also fold the two sequential `$match` stages (`keyword_pipeline.py:71-83`) into one — they cannot be
reordered by the planner as written, and the store filter is currently applied *after* the name match.

**Expected impact: performance, at scale.** At 6 143 documents a full index scan costs 5–9 ms of
server time, so this is invisible today; at 10× the catalogue it is a linear regression. Option 2 is
the only one that also improves **accuracy** — it would give mode 1 non-empty results for Q2.

**Re-test with.** **Q1** and **Q4** for the scan-efficiency change (compare `totalKeysExamined`, which
should fall from 6143 to roughly the number of matching prefixes). **Q2/Q3/Q5** only if option 2 is
chosen — those three return 0 results today and only autocomplete/fuzzy changes that.

**Risk.** Option 1 requires dropping and recreating `productName_1` (DDL; brief window where mode 1
does a COLLSCAN) and is easy to get wrong — the collation must be specified on the *query* too, or the
index is silently not used. Option 2 is a mode-semantics change and needs product sign-off.

**Judgement call:** this is P1 rather than P0 because the wrongness of mode 1 (0 results for 3 of 5
queries) is inherent to prefix matching, not a bug. The scan is a real but currently cheap
inefficiency.

---

### L1.4 — Expose the `inStock` filter, or remove it from the vector index  ·  **P2** · effort **S**

**What to change.** `inventorySummary.inStock` is a declared `filter` field in the live
`product_text_vector_index`, and `build_vector_pipeline` accepts `in_stock` — but **no caller ever
passes it** (verified: the only references are the parameter, its docstring, and its log line).
Either surface it as a request field on `SearchRequest` and thread it through the use case, or remove
it from the index definition and from `docs/setup/indexes/vector-index.json`.

**Expected impact: neither, at current data.** Only **23 of 98 595** inventory rows have
`inStock: false` (0.02%), so filtering on it would change almost nothing today. The value is
forward-looking — an "in stock only" toggle is a plausible product requirement, and the index already
pays the (small) cost of supporting it.

**Re-test with.** None of Q1–Q5 as written. If implemented, the meaningful test is a query scoped to a
store/product pair known to be out of stock, which the baseline query set does not cover.

**Risk.** Very low either way. Keep the index field and wire it up: it costs little and removing a
filter field from a vector index means a rebuild.

---

### L1.5 — Drop the unused `stringFacet` on `category` in `product_atlas_search`  ·  **P2** · effort **S**

**What to change.** `product_atlas_search` maps `category` as `[{string}, {stringFacet}]`, but no code
ever runs `$searchMeta` or `$search` with `facet` against that index — faceting goes exclusively to
`product_atlas_search_meta` (`frontend/app/api/searchMeta/route.js`). The `stringFacet` half is dead
index weight.

**Expected impact: performance, marginal.** Slightly smaller index and faster rebuilds. No query
behaviour change, provided nothing starts faceting against this index later.

**Re-test with.** Q1–Q5 in mode 2, purely as a no-change regression check — scores must be identical.

**Risk.** Low, but it needs an index rebuild, and the payoff is small. Only worth bundling into
whatever rebuild L1.1 requires.

---

### L1.6 — Document what actually exists; remove what shouldn't  ·  **P2** · effort **S**

**What to change.** Three documentation gaps from Part B of the baseline:

* `productName_1` exists in staging and mode 1 depends on it, but `docs/setup/indexes/` documents no
  b-tree indexes at all. Add a `docs/setup/indexes/product-name-index.json` and a README step.
* `docs/setup/indexes/search-meta-index.json` exists but `docs/setup/indexes/README.md` never tells
  anyone to create `product_atlas_search_meta`. A fresh environment following the README gets a
  broken Brand Amplification panel. Add it as step 3.
* Staging holds two scratch collections —
  `Testing : New Boost Weights in  full text  Search + Normalized Scores` and
  `stage 1 baseline with  stage 2 score to see`. Dropping them is a **write**, so it needs your
  explicit go-ahead; I have not touched them.

**Expected impact: neither** — reproducibility only. A new contributor cannot currently stand up a
working environment from the docs alone.

**Re-test with.** Not applicable; validate by provisioning a clean environment from the README.

**Risk.** None for the doc changes. The collection drops are irreversible and need confirmation.

---

## LAYER 2 — Application layer

### L2.1 — Unify Brand Amplification semantics and bound its magnitude  ·  **P0** · effort **M**

**What to change.** Amplification is implemented three different ways, with three different
magnitudes, in four files:

| Mode | File | Mechanism | Magnitude |
|---|---|---|---|
| 2 | `text_pipeline.py:26-30` | Lucene `should` clause boost, inside scoring | multiplier `1.5 / 2.0 / 2.5` |
| 3 | `vector_pipeline.py:35-39` | post-kNN `$switch`, then re-normalize | factor `+0.05 / +0.10 / +0.15` |
| 4 | `hybrid_rrf_pipeline.py:39` | post-fusion multiply on raw RRF score | factor `+0.05 / +0.10 / +0.15` |
| 5 | `hybrid_score_fusion_pipeline.py:48` | post-fusion multiply on sigmoid score | factor `+0.05 / +0.10 / +0.15` |

The same `boostLevel: 3` therefore means "2.5× the term's contribution to a Lucene score" in mode 2
and "+15% on a final normalized score" in mode 3 — and those are not comparable quantities. The
consequences are both directions of failure, both measured:

* **Too strong** (mode 3, Q2, level 3): a +15% factor on a final score was enough to lift
  `Global Darjeeling Oolong Tea` (Teamonk) to **rank 1 for the query `tomatoe`**, above four
  near-exact `Tomato - …` matches. This is the worst single result in the baseline.
* **Too weak** (modes 3, 4, 5 on Q3 `beverages`): identical top 5 at OFF, L1, L2 and L3 — including
  with the real staging rule scoped to `Beverages`, where `$searchMeta` confirms Teamonk has 20
  matching products. A +5% factor cannot close the gap to the head of the result window.

Proposed change: define amplification **once**, in the domain layer, as a bounded rank-space
operation rather than a score multiplier — e.g. "a boosted document may be promoted by at most N
positions" or "a boosted document may not displace a document whose pre-boost score exceeds it by
more than X%". Implement it as a single shared helper consumed by all four builders, so `boostLevel`
means one thing everywhere.

**Expected impact: accuracy, substantially.** A bound makes the Q2 failure structurally impossible,
and a rank-space formulation makes the Q3 no-op visible and tunable instead of silently absorbed.

**Re-test with.** **Q2 at level 3** is the regression test that must pass — tomatoes back at ranks 1–4.
**Q3 and Q5 at all three levels** verify the opposite bound: Q5's `Natural Sleep Aid Supplement
Tablets` should stay in the top 5 at level 3 instead of dropping out. **Q4** confirms amplification
still works where it legitimately should (Teamonk genuinely matches `green tea`). Q1 as a control.

**Risk.** This is the most invasive of the P0 items — it touches four pipeline builders plus the
domain model, and it changes ranking for every boosted query, so the demo's visible behaviour
changes. It should land with a fresh baseline capture. Do it after L2.2 and L2.3, which are cheap and
partially overlapping.

---

### L2.2 — Fix brand matching: exact `$eq` in modes 3–5 vs analyzed `text` in mode 2  ·  **P0** · effort **S–M**

**What to change.** Modes 3, 4 and 5 match boost rules with exact equality
(`{"$eq": ["$brand", brand]}` — `vector_pipeline.py:74`, `hybrid_rrf_pipeline.py:81`,
`hybrid_score_fusion_pipeline.py:90`), while mode 2 uses the analyzed `text` operator
(`text_pipeline.py:62-68`). The data makes this asymmetry bite: **38 distinct brands, covering 288
documents, have leading or trailing whitespace** in `brand` — `'Aroma Magic '` (61 docs),
`'INATUR '` (46), `'Iveo '` (26), `'Elephant '` (23), and 34 more.

For any of those brands, a rule sent as `"Aroma Magic"` (what the UI's brand picker shows after
trimming, and what `BrandAmplification` stores after `.strip()`) **matches nothing in modes 3–5** and
**matches fine in mode 2**. Silent, brand-specific, mode-dependent failure.

The schema compounds this: `BrandBoost.name` is not stripped (only `categories` is —
`schemas.py:46-54`), while the domain model doesn't strip `name` either
(`brand_amplification.py:28-32`). So whether the boost works depends on whether the caller happened
to include the trailing space.

Fix in the pipeline, not the data (data normalization is a write): compare on trimmed, case-folded
values on both sides — e.g. `{"$eq": [{"$toLower": {"$trim": {"input": "$brand"}}}, brand.strip().lower()]}`.
Apply the same treatment to the `category` comparison, and to the `brand::category` pair
reconstruction used for the `isBoosted` flag (`text_pipeline.py:199-204`).

**Expected impact: accuracy.** Makes amplification behave identically across modes and fixes it
outright for 288 documents. Negligible performance cost (a `$trim`/`$toLower` per candidate
document, on a ≤200-document window).

**Re-test with.** Q1–Q5 with a rule on **`Aroma Magic`** (unpadded) in modes 3, 4 and 5 — today that
produces zero `isBoosted: true` documents; it should produce some. Then **Q4** with the `Teamonk` rule
as a no-regression check, since `Teamonk` is unpadded and works today.

**Risk.** Low and well-contained. Note that `$trim` in the boost comparison does not fix the
underlying data, so `brand` values shown in the UI will still display the padding.

---

### L2.3 — Fix `weight = 0.0` silently becoming `1.0`  ·  **P0** · effort **S**

**What to change.** Four identical lines — `hybrid_rrf_pipeline.py:126-127` and
`hybrid_score_fusion_pipeline.py:145-146`:

```python
w_vec = max(0.0, float(weights.get("vectorPipeline") or 1.0))
```

`0.0 or 1.0` evaluates to `1.0` in Python. So a caller who sends `weightVector: 0.0` — the documented
way to ask for "text only" — gets **full** vector weight instead of none. The API accepts the value
(`ge=0.0` in `schemas.py:98-113`), the use case preserves it (`hybrid_use_case.py:71-72` clamps to
`[0,1]`), and the builder then discards it. Replace with an explicit `None` check.

**Expected impact: accuracy** — it makes a documented control work. No performance change.

**Re-test with.** **Q2** and **Q4** at `weightVector: 0.0, weightText: 1.0` and the mirror image
`weightVector: 1.0, weightText: 0.0`, in both mode 4 and mode 5. Correct behaviour: the first should
reproduce mode 2's ordering closely, the second mode 3's. Today both produce the same 50/50 blend.
These two configurations are absent from the baseline — worth adding to the re-test matrix
regardless, since they are the cheapest way to sanity-check fusion.

**Risk.** Minimal — but note the baseline was captured at 0.5/0.5, so it does not cover this path and
cannot tell us whether anything downstream depends on the current (broken) behaviour.

---

### L2.4 — Fix `total_results` / `total_pages` semantics  ·  **P0** · effort **M**

**What to change.** The `$facet` `count` branch counts the *candidate window*, not the matching set,
and the route divides by `page_size` to produce `total_pages` (`routes.py:178`). Measured consequences:

* **Mode 3 reports `total_results: 200` for every query** — Q1 through Q5, boost on and off. That is
  `knn_limit`, not a match count. A client paginating to page 40 finds documents; page 41 is empty
  with no indication why.
* **Mode 5, Q4 returned 271 results at boost OFF/L1/L3 and 272 at L2** for a pipeline whose boost
  stage cannot change cardinality. The fused candidate window itself varies between executions, so
  the advertised total is not reproducible.
* Modes 4 and 5 report fused-window sizes (328, 225, 693, 1307, …) that correspond to no
  user-meaningful quantity.

Options: (a) report `total_results` as "candidates considered" and rename it in the response schema so
it stops masquerading as a match count; (b) compute a true count with a separate cheap
`$searchMeta`/`countDocuments` call for the modes where that is well-defined (2, and 1); or (c) drop
`total_pages` and move to cursor/`searchAfter` pagination, which is the honest model for
relevance-ranked results over a bounded candidate window.

**Expected impact: correctness of the API contract**, not relevance. Some performance cost if option
(b) adds a second round trip.

**Re-test with.** All of **Q1–Q5 in modes 3, 4 and 5**, checking that `total_results` is either a true
count or an explicitly-named candidate count, and that requesting the last advertised page actually
returns documents. **Q4 in mode 5** specifically, repeated ~10× to confirm the 271/272 flapping is gone.

**Risk.** Option (c) is a breaking API change affecting the frontend's pagination controls. Option (a)
is nearly free and I'd start there — it converts a silent lie into an honest label, which is enough to
unblock the rest of the refactor.

---

### L2.5 — Adopt one score normalization contract across all modes  ·  **P0** · effort **M**

**What to change.** Four modes, four incompatible score scales:

| Mode | Normalization | Measured consequence |
|---|---|---|
| 1 | none — `score` is never set | Always `null` in the response |
| 2 | window-max: `originalScore / max(originalScore)` | **Ties at exactly `1.0`**: Q2's entire top 5 scored `1.0`; Q1's top 2 both `1.0` |
| 3 | window-max on the post-boost score | [0,1], but the max is boost-dependent, so scores are not comparable across boost levels |
| 4 | none — raw `$rankFusion` meta score | Values ~`0.014`–`0.018`; three orders of magnitude off every other mode |
| 5 | `$scoreFusion` `sigmoid`, no post-normalization | **Q4's top 5 spanned `0.848670`→`0.848095`** — a 5.75e-4 range |

A client cannot threshold, compare, or display these interchangeably, and window-max is actively
lossy: dividing by the window maximum guarantees the top document scores `1.0` and destroys the
information about *how good* the best match was.

Proposed: define the response `score` as a single documented quantity — my recommendation is
min-max normalization over the returned page with the raw engine score preserved in a separate
`rawScore` field, or `$scoreFusion`'s `minMaxScaler` applied uniformly. Centralize it in one helper
(a good fit for `app/infrastructure/mongodb/utils.py`, alongside `PRODUCT_FIELDS`) instead of four
copies of `$setWindowFields`.

Two related cleanups while in these files: mode 2 projects `originalScore` into the documents by
default (`log_score_details: bool = True`, `text_pipeline.py:196-197`) where it is serialized over the
wire and then dropped by `ProductOut` — wasted payload; and mode 1 should populate *something* for
`score` or the field should be documented as mode-dependent.

**Expected impact: both.** Accuracy of *presentation* rather than of ranking — the ordering barely
changes, but the scores become meaningful. Small performance gain from removing a
`$setWindowFields` pass in modes where it is redundant.

**Re-test with.** **Q2 in mode 2** (the tie case — the top 5 must no longer all read `1.0`) and
**Q4 in mode 5** (the compression case — the top 5 must be distinguishable at 3 decimal places).
**Q1 across all five modes** as the cross-mode comparability check: the same document at rank 1
should carry a comparable score in every mode.

**Risk.** Medium. It changes every score the frontend displays, and if any UI logic thresholds on
score (worth checking in `frontend/redux/slices/ProductInventorySlice.js`), that logic breaks. Ranking
order should be preserved — verify that explicitly, since a normalization bug that reorders results
would be easy to miss.

---

### L2.6 — Symmetrize the hybrid candidate limits  ·  **P1** · effort **S**

**What to change.** The two fusion builders feed structurally different inputs to their fusion stage:

| Arm | `hybrid_rrf_pipeline.py` | `hybrid_score_fusion_pipeline.py` |
|---|---|---|
| Text | `$search` with **no `$limit`** (lines 143-174) | `$search` + **`$limit: 200`** (line 199) |
| Vector | `numCandidates: 500`, `limit: 200` | `numCandidates: 500`, `limit: 200` |

So mode 4 fuses an unbounded text ranking against a 200-document vector ranking, while mode 5 fuses
200 against 200. For RRF — which is purely rank-based — an unbounded text arm means text ranks run to
the full match count (1 307 for Q5) while vector ranks stop at 200, systematically skewing the
reciprocal-rank contributions between the two arms. This is a plausible partial explanation for mode
4 being both the slowest mode (avg 798 ms app / 428 ms DB) and the one whose Q5 ranking is most
text-dominated, though I have not isolated it experimentally.

Fix: give both arms the same explicit cap in both builders, derived from one constant.

**Expected impact: both.** Bounding mode 4's text arm should cut its DB time (Q5 measured 599 ms with
1 307 text candidates) and make the two fusion modes genuinely comparable — which matters, because
choosing between them is a demo talking point.

**Re-test with.** **Q5** first (the broadest query, 1 307 text matches — the largest expected timing
delta), then **Q3** (1 220 matches in mode 2). Compare mode 4 vs mode 5 ordering on **Q4** before and
after; they should converge somewhat.

**Risk.** Low mechanically, but it *will* change mode 4's rankings, so it needs a baseline re-capture.
The correct cap value is a tuning question, not a correctness question.

---

### L2.7 — Retire dead parameters and dead code paths  ·  **P1** · effort **S**

**What to change.** Parameters that exist in the builders but cannot be reached through the API:

* `in_stock`, `num_candidates`, `knn_limit` — `vector_pipeline.py:104-106` (see also L1.4, L1.2)
* `normalization` — `hybrid_score_fusion_pipeline.py:123`, hard-defaulted to `"sigmoid"`; the
  `minMaxScaler` and `none` branches are unreachable despite being validated
* `log_score_details` — `text_pipeline.py:113`
* `normalization_mode: str = "window_max"` — `text_pipeline.py:112`, accepted and then **never read**
  anywhere in the function body

Plus genuinely dead code:

* `MongoSearchRepository.search_hybrid_rrf()` (`search_repository.py:284-312`) — a self-described
  deprecated alias that just forwards to `search_hybrid()`. No caller.
* `boostLevel` is validated **three times** for the same request — `schemas.py:32-37` (Pydantic
  `ge/le`), `routes.py:106-110` (manual range check), `brand_amplification.py:45-53` (domain
  validator). Keep the schema and the domain check; the route's is redundant.
* `filter_inventory_summary()` (`utils.py:30-46`) re-filters `inventorySummary` in Python, but every
  pipeline already does it in the projection with `$filter`. One of the two is redundant work on
  every document of every response.

Either wire these through to the API (`normalization` and `in_stock` are the two with real value) or
delete them. A parameter that is validated but ignored is worse than no parameter.

**Expected impact: maintainability**, plus a small performance gain from dropping the duplicated
inventory filtering. No accuracy change.

**Re-test with.** Q1–Q5 across all modes as a pure no-change regression: identical results, identical
scores. Any difference means something was load-bearing after all.

**Risk.** Low. `normalization_mode` and `search_hybrid_rrf` are provably unused. Deleting
`filter_inventory_summary` needs a check that mode 1 — whose `$project` uses the raw `PRODUCT_FIELDS`
dict without a `$filter` expression — isn't relying on it. It is: **keep the Python filter for mode 1
or add `$filter` to the keyword pipeline's projection.**

---

### L2.8 — Reconcile the three searchMeta env var names  ·  **P1** · effort **S**

**What to change.** From Part B rows 22–24, one config value has three names and no definition:

| Name | Where |
|---|---|
| `SEARCH_META_INDEX` | what `frontend/app/api/searchMeta/route.js:10` actually reads |
| `NEXT_PUBLIC_SEARCH_META_INDEX` | what `frontend/.example.env` declares |
| `SEARCH_INDEX` | what `docs/setup/indexes/README.md:73` documents — and what the live `frontend/.env` defines, read by nothing |

The route works only because it falls back to the hard-coded literal
`'product_atlas_search_meta'`. The same pattern affects the collection name: the route reads
`COLLECTION_PRODUCTS` while `.example.env` declares `NEXT_PUBLIC_COLLECTION_PRODUCTS`, and the
fallback `'products'` happens to be right. And the four `NEXT_PUBLIC_ENABLE_*_SEARCH` feature flags in
`.example.env` are absent from the live `.env` entirely — so whatever they gate is in an undefined
state.

Pick one name per value, define it in `.example.env`, read exactly that name in the route, and keep
the literal fallback only as a last resort with a startup warning.

**Expected impact: neither today** — the fallbacks mask it. The risk is a silent mis-target the day
someone renames an index or points the frontend at a different environment, and it will fail as a
confusing "no facets" bug rather than a config error.

**Re-test with.** Not a query-level test. Validate by unsetting the variable and confirming a loud
failure rather than a silent fallback, and by pointing it at a deliberately wrong index name and
confirming the error surfaces.

**Risk.** Low, but touches frontend runtime config — needs a deploy-config review, since
`NEXT_PUBLIC_`-prefixed variables are inlined at build time while unprefixed ones are read at
runtime. That distinction is likely the origin of the confusion and should be settled deliberately.

---

### L2.9 — Deduplicate the catalogue, or dedupe at query time  ·  **P2** · effort **M–XL**

**What to change.** The catalogue contains **625 groups of duplicate `productName` + `brand`,
accounting for 898 redundant documents — 14.6% of the collection** (69 groups are identical even on
`productName` + `brand` + `quantity`). This visibly degrades every top-5 in the baseline:
`Tomato - Hybrid (Loose)` appears twice in mode 2's Q2 results, `Nilgiris Green Tea - Anicca
Chamomile` three times in mode 4's Q5, `Tea` by Red Label three times in mode 2's Q3. A five-result
page can be half redundant.

Two paths: **(a)** deduplicate the source data — correct, but a write to staging plus a re-embed of
whatever survives, so it needs your explicit approval; or **(b)** collapse at query time with a
`$group`/`$first` on a normalized key before pagination, which costs a stage and needs care not to
break the counts discussed in L2.4.

**Expected impact: accuracy as perceived by a user** — the ranking is arguably already correct, but
the *useful* information density of a page is ~15% lower than it should be, and the demo looks buggy.

**Re-test with.** **Q2** (duplicate tomatoes, modes 2 and 3), **Q3** (triplicate Red Label teas,
mode 2), **Q5** (triplicate chamomile teas, mode 4). The test is qualitative: five distinct products
in the top 5.

**Risk.** Path (a) is destructive and irreversible — do not start there. Path (b) interacts with
pagination: collapsing after `$skip`/`$limit` produces short pages, collapsing before it changes the
totals. Also, some duplicates may be legitimately distinct (different `quantity`, different
`absoluteUrl`), so the dedupe key needs product input. Deferred to P2 for that reason, despite
showing up in three of five baseline queries.

---

### L2.10 — Index or precompute `getDistinctBrands`  ·  **P2** · effort **M**

**What to change.** `frontend/app/api/getDistinctBrands/route.js` runs an unindexed
`$group` over all 6 143 documents (`$sum` count, `$addToSet` of `category`) every time the Brand
Amplification panel opens. There is no index that can serve a full-collection `$group`, so this is
always a COLLSCAN.

Options: cache the result in memory with a TTL; serve it from `$searchMeta` against
`product_atlas_search_meta` (which already facets `category` and keyword-indexes `brand`, and measured
**~128 ms** in the baseline); or maintain a small `brands` summary collection via the existing Atlas
trigger infrastructure in `docs/setup/atlas-triggers/`.

**Expected impact: performance** of the BA configuration UI only — not the search path. Unmeasured at
the app level (the Next.js server was not started for the baseline), so the current cost is unknown;
the DB-level `$searchMeta` alternative is measured at ~128 ms.

**Re-test with.** Not a Q1–Q5 test. Measure the route directly before and after, and confirm the brand
list is identical (including the 38 padded brand names — a `$searchMeta` implementation using the
`lucene.keyword` analyzer may render those differently).

**Risk.** Low. Note the `$searchMeta` route only returns facet *counts* for `category`, not the
brand→categories mapping this route produces, so it is not a drop-in substitute.

---

## LAYER 3 — Voyage AI / embeddings

**Confirmed current configuration:** `VOYAGE_MODEL = voyage-3-large`, 1024 dimensions, cosine
similarity, stored in `textEmbeddingVector` on all 6 143 documents (verified: exactly one `$size`
bucket of 1024). The client is `app/infrastructure/voyage_ai/client.py` — `httpx`, 5 s timeout,
3 attempts with exponential backoff, calling `{VOYAGE_API_URL}/embeddings` with
`{"input": text, "model": model}`.

**Measured cost:** modes 3, 4 and 5 show **371, 371 and 383 ms** of average app-side overhead above
their own aggregation time, versus **26 ms** for mode 2, which makes no embedding call. That gap is
essentially all Voyage. It is the largest single cost in the semantic and hybrid paths — larger than
the database work itself in modes 3 and 5.

### L3.1 — Reuse a pooled HTTP client and cache query embeddings  ·  **P1** · effort **M**

**What to change.** Two independent problems in `client.py:56-92`:

1. **A new `httpx.AsyncClient` is constructed per request** — `async with httpx.AsyncClient(timeout=5)`
   inside `create_embedding`. Every search therefore pays a fresh TCP connect and full TLS handshake
   to the Voyage endpoint. On a cross-region HTTPS hop that is plausibly 100–200 ms of the measured
   ~370 ms, though I have not instrumented the handshake separately to confirm the split. Fix: build
   one `AsyncClient` at startup (alongside the other singletons in `main.py:88-95` /
   `dependencies.py`), reuse it, and close it in the shutdown hook.
2. **No caching whatsoever.** Query embeddings are perfectly cacheable: the same query text always
   maps to the same vector for a fixed model, and demo/retail traffic is heavily repetitive. An
   in-process LRU keyed on `(model, normalized_query)` would take mode 3/4/5 overhead to ~0 ms on a
   hit. For multi-replica deployments, back it with Redis; for this demo, an in-process
   `functools.lru_cache`-style dict of a few thousand entries is enough and costs ~4 KB per entry
   (1024 floats).

Worth noting for expectation-setting: during baseline capture I cached embeddings in the measurement
harness, which is why DB-level timings exclude this cost entirely — the 371 ms is what a *cold* query
pays, and a cache makes the warm path look like mode 2.

**Expected impact: performance, large.** Connection reuse is a pure win on every request. Caching
eliminates the hop entirely on repeats. Together these plausibly bring modes 3/4/5 from ~675–798 ms
down toward ~300–450 ms on warm queries. No accuracy change — the vectors are bit-identical.

**Re-test with.** **Q1–Q5 in modes 3, 4 and 5**, each measured twice: once cold (cache miss) and once
warm (cache hit). The interesting number is the APP − DB gap from the baseline summary table, which
should collapse toward mode 2's ~26 ms on warm runs. **Q4** and **Q5** are the best cold-path tests
since they were the slowest (704 ms and 1 092 ms).

**Risk.** Low for connection pooling — standard practice, and the singleton wiring already exists for
Mongo. Caching needs a bounded size and an eviction policy to avoid unbounded memory, and a decision
about whether cache entries survive a model change (key on the model name, as proposed, and they do).

---

### L3.2 — Decide on `input_type` for query vs document embeddings  ·  **P1** · effort **S–XL**

**What to change.** The Voyage API accepts `input_type: "query" | "document"`, which prepends a
task-specific instruction and measurably improves retrieval quality for asymmetric search (short
query against long document) — exactly this workload. **Neither the client nor, apparently, the
document ingestion pipeline sets it** (verified: no occurrence of `input_type` anywhere in the
backend).

The catch: query-side and document-side must be chosen *together*. Setting `input_type: "query"` on
the search path while the stored vectors were embedded without any `input_type` would compare vectors
from two different embedding regimes and could easily make relevance **worse**. So this is either:

* **S** — confirm the ingestion script (not in this repo — the vectors predate it) also used no
  `input_type`, and leave both unset; or
* **XL** — re-embed all 6 143 documents with `input_type: "document"` and set `"query"` on the search
  path. That is a bulk write plus a vector index rebuild.

**Expected impact: accuracy**, unquantified — Voyage reports single-digit-percent retrieval gains for
asymmetric tasks. No performance change.

**Re-test with.** **Q5** (`drink that helps me relax before bed`) is the canonical asymmetric case —
a long natural-language query against product descriptions — followed by **Q3** (generic single word)
and **Q2** (misspelling, where instruction-tuning may help or hurt). **Q1** as a control: an exact
name match should not regress.

**Risk.** High if done carelessly, because a partial rollout silently degrades relevance with no
error. It also requires writes to staging, which are out of scope for this analysis. I would treat
this as an experiment on a copied collection, not an in-place change, and gate it on a measured
improvement across Q1–Q5.

---

### L3.3 — Re-evaluate the model and dimensionality  ·  **P2** · effort **XL**

**What to change.** `voyage-3-large` @ 1024 dimensions is Voyage's high-end general-purpose embedding
model. Two questions worth asking, neither answerable without an experiment:

* **Is it over-specified for this workload?** The queries are 1–6 words of retail vocabulary; the
  documents are ≤5 244 characters of product copy (mean 595). A lighter model (`voyage-3.5-lite`)
  would cut both embedding latency and cost. But it would *not* remove the ~370 ms — that is
  dominated by the network round trip, not by inference — so the latency argument for switching is
  weak. L3.1 is the real fix for latency.
* **Is 1024 dimensions necessary?** `voyage-3-large` supports Matryoshka output dimensions
  (2048/1024/512/256) and quantized outputs. Dropping to 512 would roughly halve the vector index
  size and its memory footprint. At 6 143 documents that is irrelevant; at 10× the catalogue it
  matters.

**Expected impact: performance and cost at scale; accuracy risk in both directions.** At the current
catalogue size, neither change is justified by any measurement in the baseline.

**Re-test with.** Q1–Q5 across modes 3, 4 and 5, comparing top-5 overlap against the current baseline.
Any model change must be judged on ranking agreement, not on latency — and **Q2** and **Q5** are the
queries where a weaker model would show degradation first.

**Risk.** XL and destructive: changing model or dimensionality invalidates all 6 143 stored vectors and
requires a full re-embed plus a vector index rebuild (`numDimensions` is fixed in the index
definition). Do not undertake this to solve the latency problem — it won't.

**A note on the two remaining options you asked about:**

* **Batching** does not apply to the search path. Each request embeds exactly one query string, and
  there is nothing to batch it with; Voyage's batch endpoint helps ingestion, not queries. The only
  "batching" that would help is request coalescing across concurrent identical queries — which the
  cache in L3.1 handles more simply.
* **Async handling** is already in place: `create_embedding` is `async` and awaited without blocking
  the event loop. The problem is not that the call blocks the *server*, it is that it blocks the
  *request* — the aggregation cannot start until the vector exists. In modes 3 and 5 there is no work
  to overlap it with. In mode 4 the text arm theoretically could run concurrently, but `$rankFusion`
  requires both arms in a single pipeline, so extracting that parallelism would mean abandoning
  `$rankFusion` and fusing in the application — a bad trade. **Caching, not concurrency, is the
  available win here.**

---

## LAYER 4 — Reranking

**Confirmed: no reranking exists anywhere in the repository.** A search for `rerank` across all
Python, JS, JSON and Markdown returns only two aspirational mentions — `README.md:175` ("MongoDB will
soon offer native support for … reranking") and
`docs/adr/adr-2025-07-clean-architecture-advanced-search-ms.md:59` (listing rerankers as future
extensibility). No `$rerank` stage, no cross-encoder call, no application-side reordering beyond the
Brand Amplification `$sort`.

**Prerequisites, as you noted:** MongoDB **8.3+** — staging runs **9.0.1**, so the version gate is
already satisfied; and **Native Reranking enabled at the project level in Atlas**, which I cannot
verify or enable from a read-only session and which you would need to confirm. The stage should be
applied to a **bounded top-N**, not the full candidate set.

### L4.1 — Evaluate `$rerank` on a top-N of the hybrid modes  ·  **P1** · effort **L–XL**

**What to change.** Insert a `$rerank` stage into `hybrid_rrf_pipeline.py` and
`hybrid_score_fusion_pipeline.py` between the fusion stage and the boost/sort stages, scoped to a
top-N slice:

```
$rankFusion / $scoreFusion        →  fused candidate window (currently 200–1300 docs)
$limit: N                          →  N = 25 or 50   ← new, essential for latency and cost control
$rerank  (rerank-2.5 / -lite)      →  semantic relevance reorder of those N   ← new
$set boostFactor / $sort           →  bounded Brand Amplification (see L2.1)
$facet                             →  pagination + count
```

The exact `$rerank` syntax (field name to rerank on, how the score is exposed) must be verified
against the Atlas documentation for the target release before implementation — I am describing the
placement and shape, not asserting the operator's parameter names.

**Would it fix the documented failures? Partly — and the ordering is what decides it.**

* **Q2 `tomatoe` at boost level 3** (oolong tea at rank 1): a cross-encoder scoring
  `"tomatoe"` against `"Global Darjeeling Oolong Tea — Tapas"` will rank it far below the
  `Tomato - …` products, so **reranking fixes the underlying relevance error**. But if Brand
  Amplification still multiplies the *final* score afterwards, a +15% factor can re-break the
  ordering exactly as it does today. **`$rerank` alone does not fix Q2 — `$rerank` plus L2.1's
  bounded amplification does.** This is the single most important conclusion in this layer: reranking
  is not a substitute for fixing the boost semantics, it is a complement to it.
* **Q3 `beverages` and Q5 `relax before bed`** (relevant results pushed out of the top 5): here
  reranking helps more directly. In both cases the displaced document
  (`Natural Sleep Aid Supplement Tablets`, the genuine beverage products) is still present in the
  fused window — it was pushed from rank 1 to rank 4 or out of the top 5, not dropped. A reranker
  operating on a top-25 or top-50 that still contains it will restore it. **Likely fixed, with the
  same caveat about boost ordering.**
* **Q3's amplification no-op in modes 3/4/5** is orthogonal — reranking neither causes nor fixes it.

**Expected impact: accuracy, meaningfully — at a real latency cost.** This is the only recommendation
in this document that trades performance for accuracy rather than improving both or being neutral.

**Rough cost, at this catalogue size.** Reranking bills query + document tokens per call. Measured
inputs: `aboutTheProduct` averages **595 characters** (max 5 244); the short fields
(`productName`, `brand`, `category`, `subCategory` concatenated) average **95 characters**. At ~4
characters/token:

| Document text sent | Tokens/doc | top-N = 25 | top-N = 50 |
|---|---|---|---|
| Short fields only | ~24 | ~0.6 k/req | ~1.2 k/req |
| Short fields + `aboutTheProduct` | ~175 | ~4.4 k/req | ~8.8 k/req |

Against **$0.05/1M tokens** (rerank-2.5) and **$0.02/1M** (rerank-2.5-lite), and the
**first 200 M tokens free org-wide**:

| Configuration | Cost/request (2.5) | 100 k searches/month (2.5) | 100 k/month (lite) | Free-tier headroom |
|---|---|---|---|---|
| Short fields, top-25 | $0.00003 | ~$3 | ~$1.20 | ~330 k requests |
| Full text, top-25 | $0.00022 | ~$22 | ~$8.80 | ~45 k requests |
| Full text, top-50 | $0.00044 | ~$44 | ~$17.60 | ~23 k requests |

**Order of magnitude: single-digit to low-tens of dollars per month at 100 k searches.** For a demo
environment the 200 M free tier alone covers roughly 23 k–330 k searches depending on configuration —
i.e. **cost is not the deciding factor here; latency is.**

**The latency tradeoff, and my recommendation.** Mode 4 already averages **798 ms** end-to-end (peaking
at **1 092 ms** on Q5) and mode 5 **719 ms**, of which ~370–383 ms is the Voyage embedding hop.
`$rerank` adds a second synchronous model call — a cross-encoder over N documents, which is
*inherently* more expensive per document than embedding a single short query. A top-50 rerank
plausibly adds 200–400 ms; I have no measurement, and this is the number that most needs to be
established empirically before committing. That would put hybrid+rerank around **1.0–1.5 s**, which
is past the point where a store associate's search feels responsive.

So, concretely:

1. **Do L3.1 first.** Caching and connection pooling free up ~370 ms in exactly the modes where
   reranking would spend it. Reranking is much easier to justify on a 400 ms baseline than on an
   800 ms one — the sequencing matters.
2. **Do L2.1 first too.** Without bounded amplification, reranking's gains are re-broken by the boost
   stage on precisely the query (Q2) that motivates it.
3. **Then prototype `$rerank` on mode 4 only**, at **top-25 with short fields + a truncated
   `aboutTheProduct`**, and measure it against Q1–Q5. Do not enable it for modes 1–3: mode 1 has no
   relevance scoring to improve, mode 2 is the fast lexical path whose 26 ms overhead is its selling
   point, and mode 3's failure (Q2 at level 3) is better fixed by L2.1 and L1.2 than by adding a
   model call.
4. **Reserve it as an opt-in request flag** (e.g. `rerank: true`) rather than making it the default
   for option 4, so the demo can show the accuracy/latency tradeoff side by side — which is arguably
   more valuable for this repository's teaching purpose than silently enabling it.

**Re-test with.** **Q2 at boost level 3** (the headline failure — must be fixed, and must *stay* fixed
with amplification on), **Q5 at all boost levels** (displaced sleep-aid result restored),
**Q3 at all levels** (displaced beverage results restored), **Q4** (must not *degrade* — Teamonk
genuinely matches `green tea`, so a reranker should agree with the boost here), **Q1** as a control.
Capture app-level wall-clock for every one of them: the accuracy gain has to be weighed against a
measured latency delta, not an assumed one.

**Risk.** **L–XL, the highest in this document.** It needs a project-level Atlas setting enabled
(outside this repo's control), it adds a hard dependency on a second Voyage model in the critical
request path — including its failure modes, for which `VoyageClient`'s existing retry/timeout
behaviour has no equivalent inside an aggregation pipeline — and it cannot be explained with
`explain()`, since `$rankFusion` and `$scoreFusion` already fail there (`remote error from mongot:
"index" is required`), so debugging will be observational. Treat it as an experiment behind a flag,
not a refactor step.

---

## Suggested sequencing

Not a schedule — a dependency order, since several of these interact:

1. **Cheap P0 fixes, independently verifiable:** L2.3 (weight falsy bug), L2.2 (brand matching),
   L1.2 (candidate ratio). Small, isolated, each with a clear re-test.
2. **L1.1** (`aboutTheProduct`) — needs an index rebuild, so it gates the re-baseline. Bundle
   L1.5 and any other index changes into the same rebuild.
3. **L2.4 + L2.5** (totals and score contract) — both change the API surface; land them together so
   the frontend adapts once.
4. **L2.1** (amplification semantics) — the big one, and the one that most needs a fresh baseline
   underneath it. Depends on L2.2 and L2.5.
5. **L3.1** (pooling + cache) — independent of all the above, and the best performance-per-effort
   item in the document. Could run in parallel from the start.
6. **L2.6, L2.7, L2.8** — cleanup, once the behaviour is settled.
7. **L4.1** (`$rerank`) — last, behind a flag, only after steps 4 and 5.
8. **P2 items** (L2.9 duplicates, L3.2/L3.3 embedding changes, L1.4, L1.6, L2.10) — each needs either
   a product decision or a write to staging. Revisit once the above is measured.

Re-capture `docs/baseline-pre-refactor.md` after steps 2, 4 and 7 — those are the three points where
rankings change materially.
