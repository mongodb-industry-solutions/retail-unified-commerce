# Search baseline — pre-refactor

Captured on **2026-09-14** against the **staging** Atlas cluster (MongoDB **9.0.1**),
database `retail-unified-commerce`, collection `products` (**6 143** documents).
Branch at capture time: `refactor/search-performance-and-accuracy` @ `a4b62e7`.

This document is a **measurement record only** — no fixes are proposed or applied here.

**How it was captured**

* Every database interaction was read-only (`aggregate`, `find`, `countDocuments`,
  `explain`, `listSearchIndexes`, `listIndexes`). No writes, no index creation, no `$out`/`$merge`.
* **APP-level** timings: `advanced-search-ms` was started locally from
  `backend/advanced-search-ms` (`uvicorn main:app`, port 8010) against the same staging
  `.env`; each configuration was issued as a real `POST /api/v1/search`. One warm-up request
  is discarded, then **2 measured repetitions** — the table reports the median and the raw pair.
  Wall-clock is measured around the HTTP call, so it includes FastAPI routing, Pydantic
  validation, the Voyage AI embedding hop (options 3 and 4), the aggregation, and response
  serialization.
* **DB-level** timings and `explain("executionStats")`: the *same* pipeline was rebuilt
  in-process from the shipped builders in
  `app/infrastructure/mongodb/pipelines/` and executed directly against staging, so the
  number excludes HTTP, Pydantic and the embedding hop.
* **Fixed parameters:** `storeObjectId = 684aa28064ff7c785a568ae7` (`store-030`, the
  best-covered store with 3 914 products), `page = 1`, `page_size = 5`,
  hybrid weights `weightText = weightVector = 0.5`.
* **Boosted brand:** `Teamonk` (39 products in this store) — the brand that the staging
  `brand-amplification` collection actually contains.

**Query sample (drawn from real staging data)**

| Label | Query text | Why |
|---|---|---|
| Q1 | `Onion` | exact `productName` present in the collection |
| Q2 | `tomatoe` | misspelling of a real product (`Tomato - …`) |
| Q3 | `beverages` | generic category name, not a product name |
| Q4 | `green tea` | term dominated by the boosted brand `Teamonk` |
| Q5 | `drink that helps me relax before bed` | semantically related, lexically disjoint |

---

## Part A — Full search capability map

`advanced-search-ms` exposes exactly **one** search endpoint whose `option` and `fusionMode`
parameters select five distinct techniques (rows 1–5). Rows 6–9 are the remaining search and
discovery capabilities in the system; they live in the Next.js frontend routes, not in
`advanced-search-ms`, and are listed because they are part of the same search surface the
refactor touches.

| # | Capability / mode | Endpoint & method | Technique | Parameters accepted | Index(es) depended on | Brand Amplification? |
|---|---|---|---|---|---|---|
| 1 | **Keyword / prefix regex** | `POST /api/v1/search` with `option=1` (proxied by `POST /api/v1/search` in Next.js) | `$match` with `{$regex: "^<query>", $options: "i"}` on `productName`, then `$match` `inventorySummary.$elemMatch.storeObjectId`, then `$project` + `$facet` | `query` (required, ≥1 char), `storeObjectId` (required, ObjectId hex), `option=1`, `page` (≥1), `page_size` (1–100, default 20) | `productName_1` b-tree index (present in staging, **not documented** in `docs/setup/indexes/`); no Atlas Search index | **No.** The route returns HTTP 400 `INVALID_OPTION_FOR_BRAND_AMP` if `brandAmplification` is sent. No `score` is produced either (response `score` is `null`, `isBoosted` defaults to `false`). |
| 2 | **Atlas Search full-text** | `POST /api/v1/search` with `option=2` | `$search` `compound` — store `filter` via `equals`, one `must` wrapping a `should` block over 5 fields with static boosts: `productName` 3.0 (`fuzzy.maxEdits: 2`), `aboutTheProduct` 1.8, `brand` 1.2, `category` 1.1, `subCategory` 1.0, `minimumShouldMatch: 1`; then `$setWindowFields` window-max normalization, `$sort`, `$facet` | `query`, `storeObjectId`, `option=2`, `page`, `page_size`, `brandAmplification[]` | `product_atlas_search` (`SEARCH_TEXT_INDEX`) | **Yes — in-engine.** Each rule becomes an extra `should` clause: brand-only → `text` on `brand` with multiplier boost `{1: 1.5, 2: 2.0, 3: 2.5}`; brand+category → `compound.must` on `brand` (boosted) with a `filter` `text` on `category`. `isBoosted` is projected by re-testing `brand ∈ boostedBrands` or `"brand::category" ∈ pairs`. |
| 3 | **Semantic vector k-NN** | `POST /api/v1/search` with `option=3` | `$vectorSearch` (`numCandidates: 200`, `limit: 200`, pre-filter on `inventorySummary.storeObjectId`, optional `inventorySummary.inStock`), then `$switch` boost factor, `$setWindowFields` normalization, `$sort`, `$facet`. Query text is embedded first via Voyage AI (`voyage-3-large`) | `query`, `storeObjectId`, `option=3`, `page`, `page_size`, `brandAmplification[]`. Builder-only knobs not reachable over HTTP: `in_stock`, `num_candidates`, `knn_limit` | `product_text_vector_index` (`SEARCH_VECTOR_INDEX`) on `textEmbeddingVector` (`EMBEDDING_FIELD_NAME`) | **Yes — post-retrieval.** `$switch` yields an additive factor `{1: 0.05, 2: 0.10, 3: 0.15}`; `adjustedScore = originalScore × (1 + factor)`, then re-normalized against the window max. Rules match on exact `brand` equality (and exact `category` equality when `categories` is given). `isBoosted = factor > 0`. |
| 4 | **Hybrid — rank fusion** | `POST /api/v1/search` with `option=4`, `fusionMode="rrf"` (also the default when `fusionMode` is omitted). The frontend labels this "Rank Fusion ($rankFusion)" | `$rankFusion` over two input pipelines (the same 5-field `$search` as row 2 **without** the amplification clauses, and `$vectorSearch` with `numCandidates: 500`, `limit: 200`), `combination.weights`, then `$set` `{$meta: "score"}`, `$switch` boost, `$sort`, `$facet` | `query`, `storeObjectId`, `option=4`, `page`, `page_size`, `fusionMode` (`rrf`\|`scoreFusion`), `weightText` (0–1), `weightVector` (0–1), `brandAmplification[]`. Weights default to 0.5 in the use case; the builder substitutes 1.0 for any falsy weight | `product_atlas_search` **and** `product_text_vector_index` | **Yes — post-fusion.** `boostedScore = rrfScore × (1 + factor)` with `{1: 0.05, 2: 0.10, 3: 0.15}`. The text sub-pipeline carries no boost clauses, so amplification acts purely on the fused score. `isBoosted = factor > 0`. |
| 5 | **Hybrid — score fusion** | `POST /api/v1/search` with `option=4`, `fusionMode="scoreFusion"` | `$scoreFusion` with `input.normalization: "sigmoid"` and `combination.method: "expression"` computing `(w_text × $$text) + (w_vector × $$vector)`; text sub-pipeline capped by `$limit: 200`, vector `numCandidates: 500` / `limit: 200`; then `$set` `{$meta: "score"}`, `$switch` boost, `$sort`, `$facet` | same as row 4. `normalization` (`none`\|`sigmoid`\|`minMaxScaler`) is a builder argument only — not exposed over HTTP | `product_atlas_search` **and** `product_text_vector_index` | **Yes — post-fusion.** Identical `× (1 + {0.05, 0.10, 0.15})` treatment of the fused score. |
| 6 | **Facet / metadata counts** | `POST /api/searchMeta` (Next.js) | `$searchMeta` with `facet.operator` (`text` on `brand` when a brand is given, else `exists` on `brand`; wrapped in `compound.must` + `category` `filter` when categories are given) and `facets.categoriesFacet` = `string` facet on `category` | `databaseName`, `collectionName` (default `products`), `indexName` (default `product_atlas_search_meta`), `brand`, `categories[]` | `product_atlas_search_meta` — requires the `stringFacet` mapping on `category` | **Not applicable.** This route *configures* Brand Amplification (it feeds the brand/category picker) but applies no boosting itself. |
| 7 | **Geospatial nearest stores** | `POST /api/getDistances` (Next.js) | `$geoNear` (`spherical: true`, `distanceField: "distance"`) on `stores`, then `$project` with `distanceInKM` and `isNearby` (< 15 km) | `collectionName` (default `stores`), `mainPoint` (`[lng, lat]`) | `location_2dsphere` on `stores` | **Not applicable.** Different collection, no relevance scoring. |
| 8 | **Brand / category catalogue** | `POST /api/getDistinctBrands` (Next.js) | `$group` on `$brand` with `$sum` count and `$addToSet` of `category`, then `$sort` by count | `databaseName`, `collectionName` (default `products`) | **None** — unindexed full-collection `$group` (COLLSCAN) | **Indirect.** Supplies the brand and category lists the Brand Amplification UI offers; applies no boosting. |
| 9 | **Generic document lookup** | `POST /api/findDocuments` (Next.js) | `find(filter, {projection, ...options})`, with caller-driven `ObjectId` coercion and collection-specific special cases for `inventory` | `filter`, `projection`, `options`, `databaseName`, `collectionName` (required), `objectIdFields[]` | Depends entirely on the caller's `filter` | **Not applicable.** |

Request-level notes that apply to rows 1–5:

* `brandAmplification` is a list of `{name, boostLevel, categories?}`. `boostLevel` must be `1`, `2` or `3` (validated in the Pydantic schema, again in the route, and a third time in the domain model); an empty list is rejected; each `categories` entry must be a non-empty string.
* `boostLevel` is the **only** intensity control exposed. The numeric mapping is hard-coded per pipeline, and differs between modes: `1.5/2.0/2.5` as a Lucene multiplier in mode 2 versus `+0.05/+0.10/+0.15` as an additive score factor in modes 3, 4 and 5.
* Store scope is always mandatory and is pushed into the search engine (`$search.compound.filter.equals` / `$vectorSearch.filter`) in modes 2–5, but applied as a post-`$match` in mode 1.
* Every mode returns `{total_results, total_pages, products[], deployment}` where `deployment` is derived by string-matching `.mongodb.net` in the connection string.

---

## Part B — Repo docs vs live staging

`listSearchIndexes()` on `retail-unified-commerce.products` returned three indexes, all
`status: READY`, `queryable: true`: `product_atlas_search` (type `search`),
`product_atlas_search_meta` (type `search`), `product_text_vector_index` (type `vectorSearch`).

| # | Item | Repo says | Live staging reality | Match |
|---|---|---|---|---|
| 1 | Text index name | `product_atlas_search` (`docs/setup/indexes/README.md`) | `product_atlas_search`, READY, queryable | ✅ |
| 2 | Text index `mappings.dynamic` | `false` (`search-index.json`) | `false` | ✅ |
| 3 | Text index mapped fields | `brand`, `category`, `productName`, `subCategory`, `inventorySummary.storeObjectId` | `productName`, `brand`, `category`, `subCategory`, `inventorySummary.storeObjectId` — identical set, different key order only | ✅ |
| 4 | Text index field types | `brand`/`productName`/`subCategory` = `string`; `category` = `[string, stringFacet]`; `inventorySummary` = `document` containing `storeObjectId: objectId` | Identical, field-by-field | ✅ |
| 5 | **`aboutTheProduct` indexed in the text index** | **Not present** in `search-index.json`, and the README's field list omits it | **Not present** in the live `latestDefinition`, and `dynamic: false` means it is not picked up implicitly | ✅ repo and live agree — but see #6 |
| 6 | `aboutTheProduct` queried by the code | `text_pipeline.py:146`, `hybrid_rrf_pipeline.py:158` and `hybrid_score_fusion_pipeline.py:182` all include a `should` clause `{"text": {"query": query, "path": "aboutTheProduct", "score": {"boost": {"value": 1.8}}}}` | The path is unmapped in the live index, so that clause can never match a document. Modes 2, 4 and 5 effectively search 4 fields, not 5 | ❌ code and index disagree |
| 7 | `aboutTheProduct` has real content | Present in the sample export `docs/setup/collections/retail-unified-commerce.products.json` | 6 143 / 6 143 documents have a non-empty string; sampled lengths 426, 1 040, 1 040 chars of genuine marketing copy | ✅ |
| 8 | SearchMeta index name | `product_atlas_search_meta` — only implied by the default in `frontend/app/api/searchMeta/route.js`; `docs/setup/indexes/README.md` never mentions creating it, although `search-meta-index.json` exists | `product_atlas_search_meta`, READY, queryable | ✅ exists / ❌ undocumented in the setup guide |
| 9 | SearchMeta index definition | `dynamic: false`; `brand` = `string` with `analyzer: lucene.keyword`; `category` = `[string, stringFacet]` | Identical, field-by-field | ✅ |
| 10 | Vector index name | `product_text_vector_index` | `product_text_vector_index`, type `vectorSearch`, READY, queryable | ✅ |
| 11 | Vector index definition | `textEmbeddingVector`, `numDimensions: 1024`, `similarity: cosine`; filters on `inventorySummary.storeObjectId` and `inventorySummary.inStock` | Identical — same path, 1024, cosine, same two filter fields | ✅ |
| 12 | Declared 1024 dims vs real vectors | `vector-index.json` declares `numDimensions: 1024` | `$size` of `textEmbeddingVector` grouped over the whole collection returns exactly one bucket: **1024 → 6 143 documents**. Elements are `double` | ✅ |
| 13 | Geospatial index | `{ "key": { "location": "2dsphere" }, "name": "location_2dsphere" }` on `stores` | `location_2dsphere`, `2dsphereIndexVersion: 3`, on `stores` | ✅ |
| 14 | Regular (b-tree) indexes on `products` | `docs/setup/indexes/` documents none | `_id_` plus **`productName_1`** — the index mode 1's regex relies on | ❌ live index undocumented |
| 15 | Database name | `retail-unified-commerce` | `retail-unified-commerce` | ✅ |
| 16 | Product document shape | 15 fields in the sample export, including `embeddingText`, `imageUrl`, `multimodalEmbeddingVector` | Same 15 fields, all 6 143 documents, no field missing or extra | ✅ |
| 17 | Extra collections | Setup docs describe `products`, `inventory`, `stores` (+ `brand-amplification` in the user guide) | Also present: `Testing : New Boost Weights in  full text  Search + Normalized Scores`, `stage 1 baseline with  stage 2 score to see`, `system.views` — leftover scratch collections | ❌ undocumented staging residue |
| 18 | `SEARCH_TEXT_INDEX` → a real index | README: `SEARCH_TEXT_INDEX=product_atlas_search` | Runtime value resolves to `product_atlas_search`, which exists and is queryable | ✅ |
| 19 | `SEARCH_VECTOR_INDEX` → a real index | README: `SEARCH_VECTOR_INDEX=product_text_vector_index` | Runtime value resolves to `product_text_vector_index`, which exists and is queryable | ✅ |
| 20 | `EMBEDDING_FIELD_NAME` → a real field | `textEmbeddingVector` | Runtime value resolves to `textEmbeddingVector`; present on all 6 143 documents and it is the path the live vector index is built on | ✅ |
| 21 | Backend env var set | `.env.example` lists `MONGODB_URI`, `MONGODB_DATABASE`, `PRODUCTS_COLLECTION`, `SEARCH_TEXT_INDEX`, `SEARCH_VECTOR_INDEX`, `EMBEDDING_FIELD_NAME`, `VOYAGE_API_KEY`, `VOYAGE_API_URL`, `VOYAGE_MODEL` | The runtime `.env` defines exactly those nine names — `Settings` would fail to start otherwise, since all nine are required with no defaults | ✅ |
| 22 | Frontend searchMeta index var | `docs/setup/indexes/README.md` documents `SEARCH_INDEX=product_atlas_search`; `frontend/.example.env` declares `NEXT_PUBLIC_SEARCH_META_INDEX` | `searchMeta/route.js` reads **`process.env.SEARCH_META_INDEX`** — a third name, defined in neither file. The live `frontend/.env` has `SEARCH_INDEX` but no `SEARCH_META_INDEX`, so the route silently falls back to its hard-coded `'product_atlas_search_meta'`, which happens to exist | ❌ three different names; works only by falling back to a literal |
| 23 | Frontend products-collection var | `frontend/.example.env` declares `NEXT_PUBLIC_COLLECTION_PRODUCTS` | `searchMeta/route.js` and `getDistinctBrands/route.js` read `process.env.COLLECTION_PRODUCTS`, which is not defined in the live `frontend/.env`; both fall back to the literal `'products'`, which is correct by luck | ❌ name mismatch, masked by the fallback |
| 24 | `SEARCH_INDEX` consumed anywhere | Documented in `docs/setup/indexes/README.md` as the frontend's index name | Defined in the live `frontend/.env`, but **no route reads it** — dead configuration | ❌ documented but unused |
| 25 | Feature-flag env vars | `frontend/.example.env` declares `NEXT_PUBLIC_ENABLE_ATLAS_SEARCH`, `…_VECTOR_SEARCH`, `…_HYBRID_SEARCH`, `…_FULLTEXT_SEARCH` | None of the four are present in the live `frontend/.env` | ❌ |
| 26 | `products` document count | not stated | 6 143 | — |
| 27 | Server version | not stated | MongoDB 9.0.1 (Atlas), `$rankFusion` and `$scoreFusion` both available | — |

---

## Part C — Performance and accuracy baseline, per search mode

Reading the tables:

* **APP wall-clock** is the full `POST /api/v1/search` round-trip (median of 2 measured reps).
* **DB aggregation** is the same pipeline executed directly against staging (median of 2 reps),
  excluding HTTP, validation and the Voyage embedding call.
* **APP − DB** is therefore the application-and-embedding overhead, not a DB cost.
* `explain("executionStats")` is reported as-is. For `$search` / `$vectorSearch` the work happens in
  `mongot`, so there is no classic `IXSCAN`/`COLLSCAN` stage — the index name and the
  documents-examined / returned counts are the meaningful figures.
* `$rankFusion` and `$scoreFusion` **cannot be explained** on this deployment: the command fails with
  `remote error from mongot: "index" is required`. Those two modes have timing and accuracy data
  but no `executionStats`.

### M1 keyword regex

Option 1. Brand Amplification is rejected by the route (HTTP 400), so only the OFF column exists.

**Timings (median of 2 measured reps, after one discarded warm-up)**

| Query | Amplification | APP wall-clock (ms) | DB aggregation (ms) | APP − DB (ms) | total_results |
|---|---|---|---|---|---|
| Q1 exact product name | OFF | 146.5 | 561.5 | -415.0 | 6 |
| Q2 partial / misspelled | OFF | 127.6 | 125.7 | 1.9 | 0 |
| Q3 generic category | OFF | 134.3 | 121.8 | 12.5 | 0 |
| Q4 boosted-brand term | OFF | 133.0 | 184.2 | -51.2 | 13 |
| Q5 semantic, lexically diff. | OFF | 131.7 | 137.9 | -6.2 | 0 |

**DB-level `explain("executionStats")`**

| Query | Amplification | executionStats |
|---|---|---|
| Q1 exact product name | OFF | idx `productName_1` · IXSCAN · docsExamined 12 · keysExamined 6143 · nReturned 12 · execMs 9 |
| Q2 partial / misspelled | OFF | idx `productName_1` · IXSCAN · docsExamined 0 · keysExamined 6143 · nReturned 1 · execMs 5 |
| Q3 generic category | OFF | idx `productName_1` · IXSCAN · docsExamined 0 · keysExamined 6143 · nReturned 1 · execMs 5 |
| Q4 boosted-brand term | OFF | idx `productName_1` · IXSCAN · docsExamined 18 · keysExamined 6143 · nReturned 18 · execMs 8 |
| Q5 semantic, lexically diff. | OFF | idx `productName_1` · IXSCAN · docsExamined 0 · keysExamined 6143 · nReturned 1 · execMs 8 |

**Accuracy — top 5**

<details><summary><code>Q1 exact product name</code> — query <code>Onion</code> — amplification <b>OFF</b> (total_results 6)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Onion | Fresho | _null_ | false |
| 2 | Onion (Loose) | Fresho | _null_ | false |
| 3 | Onion Hair Oil For Hair Growth & Hair Fall Control - 100% Natural | Spruce Shave Club | _null_ | false |
| 4 | Onion Hair Oil With Bhringraj - Boosts Growth, Repairs Damage | Sesa | _null_ | false |
| 5 | Onion Oil Concentrate - Anti Hairfall, Anti Dandruff & Strength | Beardo | _null_ | false |

</details>

<details><summary><code>Q2 partial / misspelled</code> — query <code>tomatoe</code> — amplification <b>OFF</b> (total_results 0)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| _(no results)_ | | | |

</details>

<details><summary><code>Q3 generic category</code> — query <code>beverages</code> — amplification <b>OFF</b> (total_results 0)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| _(no results)_ | | | |

</details>

<details><summary><code>Q4 boosted-brand term</code> — query <code>green tea</code> — amplification <b>OFF</b> (total_results 13)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Green Tea - Ikusei, Cardamom | Teamonk | _null_ | false |
| 2 | Green Tea - With Peppermint Leaves, Grown Fresh | Wingreens Farms | _null_ | false |
| 3 | Green Tea - With Rose Petals | Wingreens Farms | _null_ | false |
| 4 | Green Tea - Zoho, Lemongrass | Teamonk | _null_ | false |
| 5 | Green Tea Alcohol-Free Toner | Plum | _null_ | false |

</details>

<details><summary><code>Q5 semantic, lexically diff.</code> — query <code>drink that helps me relax before bed</code> — amplification <b>OFF</b> (total_results 0)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| _(no results)_ | | | |

</details>


### M2 atlas text $search

Option 2. Amplification = extra `should` clauses with multiplier boosts 1.5 / 2.0 / 2.5 inside `$search`.

**Timings (median of 2 measured reps, after one discarded warm-up)**

| Query | Amplification | APP wall-clock (ms) | DB aggregation (ms) | APP − DB (ms) | total_results |
|---|---|---|---|---|---|
| Q1 exact product name | OFF | 294.1 | 223.7 | 70.4 | 160 |
| Q1 exact product name | ON L1 | 231.1 | 295.1 | -64.0 | 160 |
| Q1 exact product name | ON L2 | 299.6 | 262.1 | 37.5 | 160 |
| Q1 exact product name | ON L3 | 227.4 | 277.3 | -49.9 | 160 |
| Q2 partial / misspelled | OFF | 299.6 | 211.4 | 88.2 | 10 |
| Q2 partial / misspelled | ON L1 | 216.5 | 138.9 | 77.6 | 10 |
| Q2 partial / misspelled | ON L2 | 222.3 | 191.8 | 30.5 | 10 |
| Q2 partial / misspelled | ON L3 | 216.4 | 212.2 | 4.2 | 10 |
| Q3 generic category | OFF | 239.8 | 225.9 | 13.9 | 71 |
| Q3 generic category | ON L1 | 151.7 | 312.7 | -161.0 | 71 |
| Q3 generic category | ON L2 | 232.1 | 293.0 | -60.9 | 71 |
| Q3 generic category | ON L3 | 330.9 | 230.1 | 100.8 | 71 |
| Q4 boosted-brand term | OFF | 390.9 | 384.4 | 6.5 | 639 |
| Q4 boosted-brand term | ON L1 | 373.3 | 271.0 | 102.3 | 639 |
| Q4 boosted-brand term | ON L2 | 266.9 | 190.5 | 76.4 | 639 |
| Q4 boosted-brand term | ON L3 | 191.0 | 196.8 | -5.8 | 639 |
| Q5 semantic, lexically diff. | OFF | 405.0 | 381.0 | 24.0 | 1220 |
| Q5 semantic, lexically diff. | ON L1 | 491.5 | 473.1 | 18.4 | 1220 |
| Q5 semantic, lexically diff. | ON L2 | 406.3 | 263.8 | 142.5 | 1220 |
| Q5 semantic, lexically diff. | ON L3 | 472.3 | 406.6 | 65.7 | 1220 |

**DB-level `explain("executionStats")`**

| Query | Amplification | executionStats |
|---|---|---|
| Q1 exact product name | OFF | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 160 · keysExamined 160 · nReturned 160 · execMs — |
| Q1 exact product name | ON L1 | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 160 · keysExamined 160 · nReturned 160 · execMs — |
| Q1 exact product name | ON L2 | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 160 · keysExamined 160 · nReturned 160 · execMs — |
| Q1 exact product name | ON L3 | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 160 · keysExamined 160 · nReturned 160 · execMs — |
| Q2 partial / misspelled | OFF | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 10 · keysExamined 10 · nReturned 10 · execMs — |
| Q2 partial / misspelled | ON L1 | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 10 · keysExamined 10 · nReturned 10 · execMs — |
| Q2 partial / misspelled | ON L2 | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 10 · keysExamined 10 · nReturned 10 · execMs — |
| Q2 partial / misspelled | ON L3 | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 10 · keysExamined 10 · nReturned 10 · execMs — |
| Q3 generic category | OFF | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 71 · keysExamined 71 · nReturned 71 · execMs — |
| Q3 generic category | ON L1 | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 71 · keysExamined 71 · nReturned 71 · execMs — |
| Q3 generic category | ON L2 | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 71 · keysExamined 71 · nReturned 71 · execMs — |
| Q3 generic category | ON L3 | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 71 · keysExamined 71 · nReturned 71 · execMs — |
| Q4 boosted-brand term | OFF | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 639 · keysExamined 639 · nReturned 639 · execMs — |
| Q4 boosted-brand term | ON L1 | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 639 · keysExamined 639 · nReturned 639 · execMs — |
| Q4 boosted-brand term | ON L2 | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 639 · keysExamined 639 · nReturned 639 · execMs — |
| Q4 boosted-brand term | ON L3 | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 639 · keysExamined 639 · nReturned 639 · execMs — |
| Q5 semantic, lexically diff. | OFF | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 1220 · keysExamined 1220 · nReturned 1220 · execMs — |
| Q5 semantic, lexically diff. | ON L1 | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 1220 · keysExamined 1220 · nReturned 1220 · execMs — |
| Q5 semantic, lexically diff. | ON L2 | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 1220 · keysExamined 1220 · nReturned 1220 · execMs — |
| Q5 semantic, lexically diff. | ON L3 | idx `product_atlas_search` · mongot (no classic scan stage) · docsExamined 1220 · keysExamined 1220 · nReturned 1220 · execMs — |

**Accuracy — top 5**

<details><summary><code>Q1 exact product name</code> — query <code>Onion</code> — amplification <b>OFF</b> (total_results 160)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Onion | Fresho | 1.0 | false |
| 2 | Onion (Loose) | Fresho | 0.939582 | false |
| 3 | Onion Sabudana Papad | DNV | 0.655762 | false |
| 4 | Potato Crisps - Sour Cream and Onion | Pringles | 0.538016 | false |
| 5 | Onion Oil Concentrate - Anti Hairfall, Anti Dandruff & Strength | Beardo | 0.480498 | false |

</details>

<details><summary><code>Q1 exact product name</code> — query <code>Onion</code> — amplification <b>ON L1</b> (total_results 160)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Onion | Fresho | 1.0 | false |
| 2 | Onion (Loose) | Fresho | 0.939582 | false |
| 3 | Onion Sabudana Papad | DNV | 0.655762 | false |
| 4 | Potato Crisps - Sour Cream and Onion | Pringles | 0.538016 | false |
| 5 | Onion Oil Concentrate - Anti Hairfall, Anti Dandruff & Strength | Beardo | 0.480498 | false |

</details>

<details><summary><code>Q1 exact product name</code> — query <code>Onion</code> — amplification <b>ON L2</b> (total_results 160)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Onion | Fresho | 1.0 | false |
| 2 | Onion (Loose) | Fresho | 0.939582 | false |
| 3 | Onion Sabudana Papad | DNV | 0.655762 | false |
| 4 | Potato Crisps - Sour Cream and Onion | Pringles | 0.538016 | false |
| 5 | Onion Oil Concentrate - Anti Hairfall, Anti Dandruff & Strength | Beardo | 0.480498 | false |

</details>

<details><summary><code>Q1 exact product name</code> — query <code>Onion</code> — amplification <b>ON L3</b> (total_results 160)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Onion | Fresho | 1.0 | false |
| 2 | Onion (Loose) | Fresho | 0.939582 | false |
| 3 | Onion Sabudana Papad | DNV | 0.655762 | false |
| 4 | Potato Crisps - Sour Cream and Onion | Pringles | 0.538016 | false |
| 5 | Onion Oil Concentrate - Anti Hairfall, Anti Dandruff & Strength | Beardo | 0.480498 | false |

</details>

<details><summary><code>Q2 partial / misspelled</code> — query <code>tomatoe</code> — amplification <b>OFF</b> (total_results 10)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Tomato - Hybrid (Loose) | Fresho | 1.0 | false |
| 2 | Tomato - Hybrid (Loose) | Fresho | 1.0 | false |
| 3 | Tomato - Local (Loose) | Fresho | 1.0 | false |
| 4 | Tomato - Local (Loose) | Fresho | 1.0 | false |
| 5 | Rings - Tomato Twist | Too Yumm! | 1.0 | false |

</details>

<details><summary><code>Q2 partial / misspelled</code> — query <code>tomatoe</code> — amplification <b>ON L1</b> (total_results 10)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Tomato - Hybrid (Loose) | Fresho | 1.0 | false |
| 2 | Tomato - Hybrid (Loose) | Fresho | 1.0 | false |
| 3 | Tomato - Local (Loose) | Fresho | 1.0 | false |
| 4 | Tomato - Local (Loose) | Fresho | 1.0 | false |
| 5 | Rings - Tomato Twist | Too Yumm! | 1.0 | false |

</details>

<details><summary><code>Q2 partial / misspelled</code> — query <code>tomatoe</code> — amplification <b>ON L2</b> (total_results 10)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Tomato - Hybrid (Loose) | Fresho | 1.0 | false |
| 2 | Tomato - Hybrid (Loose) | Fresho | 1.0 | false |
| 3 | Tomato - Local (Loose) | Fresho | 1.0 | false |
| 4 | Tomato - Local (Loose) | Fresho | 1.0 | false |
| 5 | Rings - Tomato Twist | Too Yumm! | 1.0 | false |

</details>

<details><summary><code>Q2 partial / misspelled</code> — query <code>tomatoe</code> — amplification <b>ON L3</b> (total_results 10)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Tomato - Hybrid (Loose) | Fresho | 1.0 | false |
| 2 | Tomato - Hybrid (Loose) | Fresho | 1.0 | false |
| 3 | Tomato - Local (Loose) | Fresho | 1.0 | false |
| 4 | Tomato - Local (Loose) | Fresho | 1.0 | false |
| 5 | Rings - Tomato Twist | Too Yumm! | 1.0 | false |

</details>

<details><summary><code>Q3 generic category</code> — query <code>beverages</code> — amplification <b>OFF</b> (total_results 71)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 1.0 | false |
| 2 | Tea | Red Label | 0.228609 | false |
| 3 | Tea | Red Label | 0.228609 | false |
| 4 | Tea | Red Label | 0.228609 | false |
| 5 | Tea - Natural Care | Red Label | 0.228609 | false |

</details>

<details><summary><code>Q3 generic category</code> — query <code>beverages</code> — amplification <b>ON L1</b> (total_results 71)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 1.0 | false |
| 2 | Nilgiri Oolong Tea - Wa, May Help In Weight Management | Teamonk | 0.539538 | **true** |
| 3 | Nilgiri Oolong Tea - Wa, May Help In Managing Weight | Teamonk | 0.539538 | **true** |
| 4 | Nilgiri Oolong Tea - Wa, May Help In Weight Management | Teamonk | 0.539538 | **true** |
| 5 | Nilgiri Green Tea - Taido Ginger, Easy To Digest | Teamonk | 0.539538 | **true** |

</details>

<details><summary><code>Q3 generic category</code> — query <code>beverages</code> — amplification <b>ON L2</b> (total_results 71)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 1.0 | false |
| 2 | Nilgiri Oolong Tea - Wa, May Help In Weight Management | Teamonk | 0.643182 | **true** |
| 3 | Nilgiri Oolong Tea - Wa, May Help In Managing Weight | Teamonk | 0.643182 | **true** |
| 4 | Nilgiri Oolong Tea - Wa, May Help In Weight Management | Teamonk | 0.643182 | **true** |
| 5 | Nilgiri Green Tea - Taido Ginger, Easy To Digest | Teamonk | 0.643182 | **true** |

</details>

<details><summary><code>Q3 generic category</code> — query <code>beverages</code> — amplification <b>ON L3</b> (total_results 71)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 1.0 | false |
| 2 | Nilgiri Oolong Tea - Wa, May Help In Weight Management | Teamonk | 0.746825 | **true** |
| 3 | Nilgiri Oolong Tea - Wa, May Help In Managing Weight | Teamonk | 0.746825 | **true** |
| 4 | Nilgiri Oolong Tea - Wa, May Help In Weight Management | Teamonk | 0.746825 | **true** |
| 5 | Nilgiri Green Tea - Taido Ginger, Easy To Digest | Teamonk | 0.746825 | **true** |

</details>

<details><summary><code>Q4 boosted-brand term</code> — query <code>green tea</code> — amplification <b>OFF</b> (total_results 639)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Green Tea - Zoho, Lemongrass | Teamonk | 1.0 | false |
| 2 | Green Tea - Ikusei, Cardamom | Teamonk | 1.0 | false |
| 3 | Rakshan Green Tea - Supports Strong Immunity | Kapiva | 0.916292 | false |
| 4 | Svastha Green Tea - Promotes Overall Well-Being | Kapiva | 0.881528 | false |
| 5 | Strawberry Green Tea | Teamonk | 0.873918 | false |

</details>

<details><summary><code>Q4 boosted-brand term</code> — query <code>green tea</code> — amplification <b>ON L1</b> (total_results 639)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Green Tea - Zoho, Lemongrass | Teamonk | 1.0 | **true** |
| 2 | Green Tea - Ikusei, Cardamom | Teamonk | 1.0 | **true** |
| 3 | Strawberry Green Tea | Teamonk | 0.896798 | **true** |
| 4 | Nilgiri Green Tea - Taido Ginger, Easy To Digest | Teamonk | 0.877615 | **true** |
| 5 | Avana Darjeeling Green Tea | Teamonk | 0.855042 | **true** |

</details>

<details><summary><code>Q4 boosted-brand term</code> — query <code>green tea</code> — amplification <b>ON L2</b> (total_results 639)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Green Tea - Zoho, Lemongrass | Teamonk | 1.0 | **true** |
| 2 | Green Tea - Ikusei, Cardamom | Teamonk | 1.0 | **true** |
| 3 | Strawberry Green Tea | Teamonk | 0.902685 | **true** |
| 4 | Nilgiri Green Tea - Taido Ginger, Easy To Digest | Teamonk | 0.884596 | **true** |
| 5 | Avana Darjeeling Green Tea | Teamonk | 0.86331 | **true** |

</details>

<details><summary><code>Q4 boosted-brand term</code> — query <code>green tea</code> — amplification <b>ON L3</b> (total_results 639)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Green Tea - Zoho, Lemongrass | Teamonk | 1.0 | **true** |
| 2 | Green Tea - Ikusei, Cardamom | Teamonk | 1.0 | **true** |
| 3 | Strawberry Green Tea | Teamonk | 0.907936 | **true** |
| 4 | Nilgiri Green Tea - Taido Ginger, Easy To Digest | Teamonk | 0.890823 | **true** |
| 5 | Avana Darjeeling Green Tea | Teamonk | 0.870686 | **true** |

</details>

<details><summary><code>Q5 semantic, lexically diff.</code> — query <code>drink that helps me relax before bed</code> — amplification <b>OFF</b> (total_results 1220)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Natural Sleep Aid Supplement Tablets - Helps To Relax | Himalayan Organics | 1.0 | false |
| 2 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.946161 | false |
| 3 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.946161 | false |
| 4 | Red Grape Drink | Quencha | 0.77814 | false |
| 5 | Nilgiris Green Tea - Yoshin Lemon, Helps To Feel Relaxed | Teamonk | 0.757865 | false |

</details>

<details><summary><code>Q5 semantic, lexically diff.</code> — query <code>drink that helps me relax before bed</code> — amplification <b>ON L1</b> (total_results 1220)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 1.0 | **true** |
| 2 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 1.0 | **true** |
| 3 | Natural Sleep Aid Supplement Tablets - Helps To Relax | Himalayan Organics | 0.850484 | false |
| 4 | Nilgiris Green Tea - Yoshin Lemon, Helps To Feel Relaxed | Teamonk | 0.839858 | **true** |
| 5 | Nilgiri Green Tea - Seiki Peppermint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.808731 | **true** |

</details>

<details><summary><code>Q5 semantic, lexically diff.</code> — query <code>drink that helps me relax before bed</code> — amplification <b>ON L2</b> (total_results 1220)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 1.0 | **true** |
| 2 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 1.0 | **true** |
| 3 | Nilgiris Green Tea - Yoshin Lemon, Helps To Feel Relaxed | Teamonk | 0.849646 | **true** |
| 4 | Nilgiri Green Tea - Seiki Peppermint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.820422 | **true** |
| 5 | Nilgiris Green Tea - Kozan Spearmint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.820422 | **true** |

</details>

<details><summary><code>Q5 semantic, lexically diff.</code> — query <code>drink that helps me relax before bed</code> — amplification <b>ON L3</b> (total_results 1220)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 1.0 | **true** |
| 2 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 1.0 | **true** |
| 3 | Nilgiris Green Tea - Yoshin Lemon, Helps To Feel Relaxed | Teamonk | 0.858307 | **true** |
| 4 | Nilgiri Green Tea - Seiki Peppermint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.830766 | **true** |
| 5 | Nilgiris Green Tea - Kozan Spearmint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.830766 | **true** |

</details>


### M3 $vectorSearch

Option 3. Amplification = post-kNN `$switch` factor +0.05 / +0.10 / +0.15, applied multiplicatively then re-normalized.

**Timings (median of 2 measured reps, after one discarded warm-up)**

| Query | Amplification | APP wall-clock (ms) | DB aggregation (ms) | APP − DB (ms) | total_results |
|---|---|---|---|---|---|
| Q1 exact product name | OFF | 673.3 | 260.1 | 413.2 | 200 |
| Q1 exact product name | ON L1 | 641.9 | 283.7 | 358.2 | 200 |
| Q1 exact product name | ON L2 | 628.3 | 281.8 | 346.5 | 200 |
| Q1 exact product name | ON L3 | 606.0 | 265.7 | 340.3 | 200 |
| Q2 partial / misspelled | OFF | 686.6 | 306.1 | 380.5 | 200 |
| Q2 partial / misspelled | ON L1 | 677.6 | 274.2 | 403.4 | 200 |
| Q2 partial / misspelled | ON L2 | 619.2 | 262.8 | 356.4 | 200 |
| Q2 partial / misspelled | ON L3 | 674.4 | 287.5 | 386.9 | 200 |
| Q3 generic category | OFF | 674.3 | 289.8 | 384.5 | 200 |
| Q3 generic category | ON L1 | 648.4 | 301.4 | 347.0 | 200 |
| Q3 generic category | ON L2 | 646.9 | 325.0 | 321.9 | 200 |
| Q3 generic category | ON L3 | 689.5 | 363.4 | 326.1 | 200 |
| Q4 boosted-brand term | OFF | 704.4 | 324.5 | 379.9 | 200 |
| Q4 boosted-brand term | ON L1 | 721.4 | 310.4 | 411.0 | 200 |
| Q4 boosted-brand term | ON L2 | 701.7 | 335.3 | 366.4 | 200 |
| Q4 boosted-brand term | ON L3 | 723.8 | 325.6 | 398.2 | 200 |
| Q5 semantic, lexically diff. | OFF | 721.1 | 328.1 | 393.0 | 200 |
| Q5 semantic, lexically diff. | ON L1 | 689.3 | 352.9 | 336.4 | 200 |
| Q5 semantic, lexically diff. | ON L2 | 672.9 | 302.5 | 370.4 | 200 |
| Q5 semantic, lexically diff. | ON L3 | 706.9 | 301.8 | 405.1 | 200 |

**DB-level `explain("executionStats")`**

| Query | Amplification | executionStats |
|---|---|---|
| Q1 exact product name | OFF | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q1 exact product name | ON L1 | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q1 exact product name | ON L2 | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q1 exact product name | ON L3 | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q2 partial / misspelled | OFF | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q2 partial / misspelled | ON L1 | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q2 partial / misspelled | ON L2 | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q2 partial / misspelled | ON L3 | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q3 generic category | OFF | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q3 generic category | ON L1 | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q3 generic category | ON L2 | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q3 generic category | ON L3 | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q4 boosted-brand term | OFF | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q4 boosted-brand term | ON L1 | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q4 boosted-brand term | ON L2 | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q4 boosted-brand term | ON L3 | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q5 semantic, lexically diff. | OFF | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q5 semantic, lexically diff. | ON L1 | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q5 semantic, lexically diff. | ON L2 | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |
| Q5 semantic, lexically diff. | ON L3 | idx `product_text_vector_index` · mongot (no classic scan stage) · docsExamined 200 · keysExamined 200 · nReturned 200 · execMs — |

**Accuracy — top 5**

<details><summary><code>Q1 exact product name</code> — query <code>Onion</code> — amplification <b>OFF</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Onion | Fresho | 1.0 | false |
| 2 | Onion (Loose) | Fresho | 0.998884 | false |
| 3 | Red Onion Oil With Jojoba, Argan & Black Seed Oil | Qraa Men | 0.92848 | false |
| 4 | Onion Hair Oil For Hair Growth & Hair Fall Control - 100% Natural | Spruce Shave Club | 0.921654 | false |
| 5 | Onion Hair Oil With Bhringraj - Boosts Growth, Repairs Damage | Sesa | 0.915387 | false |

</details>

<details><summary><code>Q1 exact product name</code> — query <code>Onion</code> — amplification <b>ON L1</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Onion | Fresho | 1.0 | false |
| 2 | Onion (Loose) | Fresho | 0.998884 | false |
| 3 | Red Onion Oil With Jojoba, Argan & Black Seed Oil | Qraa Men | 0.92848 | false |
| 4 | Onion Hair Oil For Hair Growth & Hair Fall Control - 100% Natural | Spruce Shave Club | 0.921654 | false |
| 5 | Onion Hair Oil With Bhringraj - Boosts Growth, Repairs Damage | Sesa | 0.915387 | false |

</details>

<details><summary><code>Q1 exact product name</code> — query <code>Onion</code> — amplification <b>ON L2</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Onion | Fresho | 1.0 | false |
| 2 | Onion (Loose) | Fresho | 0.998884 | false |
| 3 | Red Onion Oil With Jojoba, Argan & Black Seed Oil | Qraa Men | 0.92848 | false |
| 4 | Onion Hair Oil For Hair Growth & Hair Fall Control - 100% Natural | Spruce Shave Club | 0.921654 | false |
| 5 | Onion Hair Oil With Bhringraj - Boosts Growth, Repairs Damage | Sesa | 0.915387 | false |

</details>

<details><summary><code>Q1 exact product name</code> — query <code>Onion</code> — amplification <b>ON L3</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Onion | Fresho | 1.0 | false |
| 2 | Onion (Loose) | Fresho | 0.998884 | false |
| 3 | Red Onion Oil With Jojoba, Argan & Black Seed Oil | Qraa Men | 0.92848 | false |
| 4 | Onion Hair Oil For Hair Growth & Hair Fall Control - 100% Natural | Spruce Shave Club | 0.921654 | false |
| 5 | Onion Hair Oil With Bhringraj - Boosts Growth, Repairs Damage | Sesa | 0.915387 | false |

</details>

<details><summary><code>Q2 partial / misspelled</code> — query <code>tomatoe</code> — amplification <b>OFF</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 1.0 | false |
| 2 | Tomato - Local (Loose) | Fresho | 0.999517 | false |
| 3 | Tomato - Hybrid (Loose) | Fresho | 0.993149 | false |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.992756 | false |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.978213 | false |

</details>

<details><summary><code>Q2 partial / misspelled</code> — query <code>tomatoe</code> — amplification <b>ON L1</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 1.0 | false |
| 2 | Tomato - Local (Loose) | Fresho | 0.999517 | false |
| 3 | Tomato - Hybrid (Loose) | Fresho | 0.993149 | false |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.992756 | false |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.978213 | false |

</details>

<details><summary><code>Q2 partial / misspelled</code> — query <code>tomatoe</code> — amplification <b>ON L2</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 1.0 | false |
| 2 | Tomato - Local (Loose) | Fresho | 0.999517 | false |
| 3 | Tomato - Hybrid (Loose) | Fresho | 0.993149 | false |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.992756 | false |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.978213 | false |

</details>

<details><summary><code>Q2 partial / misspelled</code> — query <code>tomatoe</code> — amplification <b>ON L3</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Global Darjeeling Oolong Tea - Tapas, 100% Natural, Freshest Leaves | Teamonk | 1.0 | **true** |
| 2 | Tomato - Local (Loose) | Fresho | 0.987239 | false |
| 3 | Tomato - Local (Loose) | Fresho | 0.986762 | false |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.980475 | false |
| 5 | Tomato - Hybrid (Loose) | Fresho | 0.980088 | false |

</details>

<details><summary><code>Q3 generic category</code> — query <code>beverages</code> — amplification <b>OFF</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Red Grape Drink | Quencha | 1.0 | false |
| 2 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 0.98993 | false |
| 3 | Black Soft Drink - Max Taste, Zero Sugar(Diet) | Pepsi | 0.978926 | false |
| 4 | Coffee Delight | Bayars | 0.973652 | false |
| 5 | Beer Mug - Printed Clear Glass, Multipurpose, Durable, Working On My Belly | Indigifts | 0.973355 | false |

</details>

<details><summary><code>Q3 generic category</code> — query <code>beverages</code> — amplification <b>ON L1</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Red Grape Drink | Quencha | 1.0 | false |
| 2 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 0.98993 | false |
| 3 | Black Soft Drink - Max Taste, Zero Sugar(Diet) | Pepsi | 0.978926 | false |
| 4 | Coffee Delight | Bayars | 0.973652 | false |
| 5 | Beer Mug - Printed Clear Glass, Multipurpose, Durable, Working On My Belly | Indigifts | 0.973355 | false |

</details>

<details><summary><code>Q3 generic category</code> — query <code>beverages</code> — amplification <b>ON L2</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Red Grape Drink | Quencha | 1.0 | false |
| 2 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 0.98993 | false |
| 3 | Black Soft Drink - Max Taste, Zero Sugar(Diet) | Pepsi | 0.978926 | false |
| 4 | Coffee Delight | Bayars | 0.973652 | false |
| 5 | Beer Mug - Printed Clear Glass, Multipurpose, Durable, Working On My Belly | Indigifts | 0.973355 | false |

</details>

<details><summary><code>Q3 generic category</code> — query <code>beverages</code> — amplification <b>ON L3</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Red Grape Drink | Quencha | 1.0 | false |
| 2 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 0.98993 | false |
| 3 | Black Soft Drink - Max Taste, Zero Sugar(Diet) | Pepsi | 0.978926 | false |
| 4 | Coffee Delight | Bayars | 0.973652 | false |
| 5 | Beer Mug - Printed Clear Glass, Multipurpose, Durable, Working On My Belly | Indigifts | 0.973355 | false |

</details>

<details><summary><code>Q4 boosted-brand term</code> — query <code>green tea</code> — amplification <b>OFF</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management | Teamonk | 1.0 | false |
| 2 | Green Tea Mugs - Multicolour | Hot Muggs | 0.998376 | false |
| 3 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.995567 | false |
| 4 | Green Tea - Ikusei, Cardamom | Teamonk | 0.993504 | false |
| 5 | Strawberry Green Tea | Teamonk | 0.993237 | false |

</details>

<details><summary><code>Q4 boosted-brand term</code> — query <code>green tea</code> — amplification <b>ON L1</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management | Teamonk | 1.0 | **true** |
| 2 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.995567 | **true** |
| 3 | Green Tea - Ikusei, Cardamom | Teamonk | 0.993504 | **true** |
| 4 | Strawberry Green Tea | Teamonk | 0.993237 | **true** |
| 5 | Nilgiris Green Tea - Kozan Spearmint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.993013 | **true** |

</details>

<details><summary><code>Q4 boosted-brand term</code> — query <code>green tea</code> — amplification <b>ON L2</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management | Teamonk | 1.0 | **true** |
| 2 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.995567 | **true** |
| 3 | Green Tea - Ikusei, Cardamom | Teamonk | 0.993504 | **true** |
| 4 | Strawberry Green Tea | Teamonk | 0.993237 | **true** |
| 5 | Nilgiris Green Tea - Kozan Spearmint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.993013 | **true** |

</details>

<details><summary><code>Q4 boosted-brand term</code> — query <code>green tea</code> — amplification <b>ON L3</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management | Teamonk | 1.0 | **true** |
| 2 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.995567 | **true** |
| 3 | Green Tea - Ikusei, Cardamom | Teamonk | 0.993504 | **true** |
| 4 | Strawberry Green Tea | Teamonk | 0.993237 | **true** |
| 5 | Nilgiris Green Tea - Kozan Spearmint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.993013 | **true** |

</details>

<details><summary><code>Q5 semantic, lexically diff.</code> — query <code>drink that helps me relax before bed</code> — amplification <b>OFF</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Melatonin + Tagara Spray - Mint Flavour, Natural Sleep Support | Carbamide Forte | 1.0 | false |
| 2 | Effervescent Tablets - Melatonin Sleep, Enhances Focus, Stress Relief, Cranberry Flavour | Suprfit | 0.989389 | false |
| 3 | Natural Sleep Aid Supplement Tablets - Helps To Relax | Himalayan Organics | 0.983254 | false |
| 4 | Nilgiris Green Tea - Anicca Chamomile, Helps To Feel Relaxed & Calm | Teamonk | 0.982318 | false |
| 5 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 0.976276 | false |

</details>

<details><summary><code>Q5 semantic, lexically diff.</code> — query <code>drink that helps me relax before bed</code> — amplification <b>ON L1</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiris Green Tea - Anicca Chamomile, Helps To Feel Relaxed & Calm | Teamonk | 1.0 | **true** |
| 2 | Melatonin + Tagara Spray - Mint Flavour, Natural Sleep Support | Carbamide Forte | 0.969524 | false |
| 3 | Effervescent Tablets - Melatonin Sleep, Enhances Focus, Stress Relief, Cranberry Flavour | Suprfit | 0.959236 | false |
| 4 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.955062 | **true** |
| 5 | Natural Sleep Aid Supplement Tablets - Helps To Relax | Himalayan Organics | 0.953288 | false |

</details>

<details><summary><code>Q5 semantic, lexically diff.</code> — query <code>drink that helps me relax before bed</code> — amplification <b>ON L2</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiris Green Tea - Anicca Chamomile, Helps To Feel Relaxed & Calm | Teamonk | 1.0 | **true** |
| 2 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.955062 | **true** |
| 3 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.952666 | **true** |
| 4 | Nilgiri Green Tea - Seiki Peppermint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.952023 | **true** |
| 5 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.949386 | **true** |

</details>

<details><summary><code>Q5 semantic, lexically diff.</code> — query <code>drink that helps me relax before bed</code> — amplification <b>ON L3</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiris Green Tea - Anicca Chamomile, Helps To Feel Relaxed & Calm | Teamonk | 1.0 | **true** |
| 2 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.955062 | **true** |
| 3 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.952666 | **true** |
| 4 | Nilgiri Green Tea - Seiki Peppermint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.952023 | **true** |
| 5 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.949386 | **true** |

</details>


### M4 hybrid $rankFusion

Option 4, `fusionMode: "rrf"`. Amplification = post-fusion `× (1 + 0.05/0.10/0.15)` on the RRF meta score.

**Timings (median of 2 measured reps, after one discarded warm-up)**

| Query | Amplification | APP wall-clock (ms) | DB aggregation (ms) | APP − DB (ms) | total_results |
|---|---|---|---|---|---|
| Q1 exact product name | OFF | 768.9 | 429.2 | 339.7 | 328 |
| Q1 exact product name | ON L1 | 751.9 | 387.6 | 364.3 | 328 |
| Q1 exact product name | ON L2 | 760.7 | 385.1 | 375.6 | 328 |
| Q1 exact product name | ON L3 | 721.3 | 374.6 | 346.7 | 328 |
| Q2 partial / misspelled | OFF | 654.3 | 332.7 | 321.6 | 200 |
| Q2 partial / misspelled | ON L1 | 685.6 | 323.6 | 362.0 | 200 |
| Q2 partial / misspelled | ON L2 | 743.0 | 355.6 | 387.4 | 200 |
| Q2 partial / misspelled | ON L3 | 692.0 | 325.1 | 366.9 | 200 |
| Q3 generic category | OFF | 669.2 | 309.2 | 360.0 | 225 |
| Q3 generic category | ON L1 | 681.0 | 320.8 | 360.2 | 225 |
| Q3 generic category | ON L2 | 686.0 | 333.9 | 352.1 | 225 |
| Q3 generic category | ON L3 | 697.7 | 340.0 | 357.7 | 225 |
| Q4 boosted-brand term | OFF | 763.7 | 449.1 | 314.6 | 693 |
| Q4 boosted-brand term | ON L1 | 840.8 | 468.3 | 372.5 | 693 |
| Q4 boosted-brand term | ON L2 | 842.3 | 449.3 | 393.0 | 693 |
| Q4 boosted-brand term | ON L3 | 873.8 | 518.1 | 355.7 | 693 |
| Q5 semantic, lexically diff. | OFF | 1092.1 | 599.0 | 493.1 | 1307 |
| Q5 semantic, lexically diff. | ON L1 | 1033.3 | 620.7 | 412.6 | 1307 |
| Q5 semantic, lexically diff. | ON L2 | 972.0 | 602.5 | 369.5 | 1307 |
| Q5 semantic, lexically diff. | ON L3 | 1035.3 | 629.8 | 405.5 | 1307 |

**DB-level `explain("executionStats")`**

| Query | Amplification | executionStats |
|---|---|---|
| Q1 exact product name | OFF | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q1 exact product name | ON L1 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q1 exact product name | ON L2 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q1 exact product name | ON L3 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q2 partial / misspelled | OFF | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q2 partial / misspelled | ON L1 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q2 partial / misspelled | ON L2 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q2 partial / misspelled | ON L3 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q3 generic category | OFF | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q3 generic category | ON L1 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q3 generic category | ON L2 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q3 generic category | ON L3 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q4 boosted-brand term | OFF | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q4 boosted-brand term | ON L1 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q4 boosted-brand term | ON L2 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q4 boosted-brand term | ON L3 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q5 semantic, lexically diff. | OFF | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q5 semantic, lexically diff. | ON L1 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q5 semantic, lexically diff. | ON L2 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q5 semantic, lexically diff. | ON L3 | ❌ `explain` unsupported (mongot: `"index" is required`) |

**Accuracy — top 5**

<details><summary><code>Q1 exact product name</code> — query <code>Onion</code> — amplification <b>OFF</b> (total_results 328)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Onion | Fresho | 0.016393 | false |
| 2 | Onion (Loose) | Fresho | 0.016129 | false |
| 3 | Red Onion Oil With Jojoba, Argan & Black Seed Oil | Qraa Men | 0.015512 | false |
| 4 | Onion Hair Oil With Bhringraj - Boosts Growth, Repairs Damage | Sesa | 0.015268 | false |
| 5 | Onion Oil Concentrate - Anti Hairfall, Anti Dandruff & Strength | Beardo | 0.015268 | false |

</details>

<details><summary><code>Q1 exact product name</code> — query <code>Onion</code> — amplification <b>ON L1</b> (total_results 328)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Onion | Fresho | 0.016393 | false |
| 2 | Onion (Loose) | Fresho | 0.016129 | false |
| 3 | Red Onion Oil With Jojoba, Argan & Black Seed Oil | Qraa Men | 0.015512 | false |
| 4 | Onion Hair Oil With Bhringraj - Boosts Growth, Repairs Damage | Sesa | 0.015268 | false |
| 5 | Onion Oil Concentrate - Anti Hairfall, Anti Dandruff & Strength | Beardo | 0.015268 | false |

</details>

<details><summary><code>Q1 exact product name</code> — query <code>Onion</code> — amplification <b>ON L2</b> (total_results 328)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Onion | Fresho | 0.016393 | false |
| 2 | Onion (Loose) | Fresho | 0.016129 | false |
| 3 | Red Onion Oil With Jojoba, Argan & Black Seed Oil | Qraa Men | 0.015512 | false |
| 4 | Onion Hair Oil With Bhringraj - Boosts Growth, Repairs Damage | Sesa | 0.015268 | false |
| 5 | Onion Oil Concentrate - Anti Hairfall, Anti Dandruff & Strength | Beardo | 0.015268 | false |

</details>

<details><summary><code>Q1 exact product name</code> — query <code>Onion</code> — amplification <b>ON L3</b> (total_results 328)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Onion | Fresho | 0.016393 | false |
| 2 | Onion (Loose) | Fresho | 0.016129 | false |
| 3 | Red Onion Oil With Jojoba, Argan & Black Seed Oil | Qraa Men | 0.015512 | false |
| 4 | Onion Hair Oil With Bhringraj - Boosts Growth, Repairs Damage | Sesa | 0.015268 | false |
| 5 | Onion Oil Concentrate - Anti Hairfall, Anti Dandruff & Strength | Beardo | 0.015268 | false |

</details>

<details><summary><code>Q2 partial / misspelled</code> — query <code>tomatoe</code> — amplification <b>OFF</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 0.016393 | false |
| 2 | Tomato - Local (Loose) | Fresho | 0.016261 | false |
| 3 | Tomato - Hybrid (Loose) | Fresho | 0.016133 | false |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.016009 | false |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.015889 | false |

</details>

<details><summary><code>Q2 partial / misspelled</code> — query <code>tomatoe</code> — amplification <b>ON L1</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 0.016393 | false |
| 2 | Tomato - Local (Loose) | Fresho | 0.016261 | false |
| 3 | Tomato - Hybrid (Loose) | Fresho | 0.016133 | false |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.016009 | false |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.015889 | false |

</details>

<details><summary><code>Q2 partial / misspelled</code> — query <code>tomatoe</code> — amplification <b>ON L2</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 0.016393 | false |
| 2 | Tomato - Local (Loose) | Fresho | 0.016261 | false |
| 3 | Tomato - Hybrid (Loose) | Fresho | 0.016133 | false |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.016009 | false |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.015889 | false |

</details>

<details><summary><code>Q2 partial / misspelled</code> — query <code>tomatoe</code> — amplification <b>ON L3</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 0.016393 | false |
| 2 | Tomato - Local (Loose) | Fresho | 0.016261 | false |
| 3 | Tomato - Hybrid (Loose) | Fresho | 0.016133 | false |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.016009 | false |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.015889 | false |

</details>

<details><summary><code>Q3 generic category</code> — query <code>beverages</code> — amplification <b>OFF</b> (total_results 225)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 0.016261 | false |
| 2 | Black Soft Drink - Max Taste, Zero Sugar(Diet) | Pepsi | 0.016001 | false |
| 3 | Aamras Mango Fruit Juice | Paper Boat | 0.01564 | false |
| 4 | Cold Extracted Juice - Mixed Fruit, 1lt + Sugarcane, 1lt | Raw Pressery | 0.015417 | false |
| 5 | Cold Extracted Juice - Basics, Sugarcane | Raw Pressery | 0.015207 | false |

</details>

<details><summary><code>Q3 generic category</code> — query <code>beverages</code> — amplification <b>ON L1</b> (total_results 225)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 0.016261 | false |
| 2 | Black Soft Drink - Max Taste, Zero Sugar(Diet) | Pepsi | 0.016001 | false |
| 3 | Aamras Mango Fruit Juice | Paper Boat | 0.01564 | false |
| 4 | Cold Extracted Juice - Mixed Fruit, 1lt + Sugarcane, 1lt | Raw Pressery | 0.015417 | false |
| 5 | Cold Extracted Juice - Basics, Sugarcane | Raw Pressery | 0.015207 | false |

</details>

<details><summary><code>Q3 generic category</code> — query <code>beverages</code> — amplification <b>ON L2</b> (total_results 225)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 0.016261 | false |
| 2 | Black Soft Drink - Max Taste, Zero Sugar(Diet) | Pepsi | 0.016001 | false |
| 3 | Aamras Mango Fruit Juice | Paper Boat | 0.01564 | false |
| 4 | Cold Extracted Juice - Mixed Fruit, 1lt + Sugarcane, 1lt | Raw Pressery | 0.015417 | false |
| 5 | Cold Extracted Juice - Basics, Sugarcane | Raw Pressery | 0.015207 | false |

</details>

<details><summary><code>Q3 generic category</code> — query <code>beverages</code> — amplification <b>ON L3</b> (total_results 225)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 0.016261 | false |
| 2 | Black Soft Drink - Max Taste, Zero Sugar(Diet) | Pepsi | 0.016001 | false |
| 3 | Aamras Mango Fruit Juice | Paper Boat | 0.01564 | false |
| 4 | Cold Extracted Juice - Mixed Fruit, 1lt + Sugarcane, 1lt | Raw Pressery | 0.015417 | false |
| 5 | Cold Extracted Juice - Basics, Sugarcane | Raw Pressery | 0.015207 | false |

</details>

<details><summary><code>Q4 boosted-brand term</code> — query <code>green tea</code> — amplification <b>OFF</b> (total_results 693)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Green Tea - Ikusei, Cardamom | Teamonk | 0.016009 | false |
| 2 | Strawberry Green Tea | Teamonk | 0.015385 | false |
| 3 | Green Tea - With Peppermint Leaves, Grown Fresh | Wingreens Farms | 0.014719 | false |
| 4 | Svastha Green Tea - Promotes Overall Well-Being | Kapiva | 0.014662 | false |
| 5 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.014109 | false |

</details>

<details><summary><code>Q4 boosted-brand term</code> — query <code>green tea</code> — amplification <b>ON L1</b> (total_results 693)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Green Tea - Ikusei, Cardamom | Teamonk | 0.01681 | **true** |
| 2 | Strawberry Green Tea | Teamonk | 0.016154 | **true** |
| 3 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.014815 | **true** |
| 4 | Green Tea - With Peppermint Leaves, Grown Fresh | Wingreens Farms | 0.014719 | false |
| 5 | Svastha Green Tea - Promotes Overall Well-Being | Kapiva | 0.014662 | false |

</details>

<details><summary><code>Q4 boosted-brand term</code> — query <code>green tea</code> — amplification <b>ON L2</b> (total_results 693)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Green Tea - Ikusei, Cardamom | Teamonk | 0.01761 | **true** |
| 2 | Strawberry Green Tea | Teamonk | 0.016923 | **true** |
| 3 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.01552 | **true** |
| 4 | Avana Darjeeling Green Tea | Teamonk | 0.014963 | **true** |
| 5 | Nilgiri Green Tea - Yakuso Tulsi, 100% Natural, Loose Leaf | Teamonk | 0.014761 | **true** |

</details>

<details><summary><code>Q4 boosted-brand term</code> — query <code>green tea</code> — amplification <b>ON L3</b> (total_results 693)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Green Tea - Ikusei, Cardamom | Teamonk | 0.018411 | **true** |
| 2 | Strawberry Green Tea | Teamonk | 0.017692 | **true** |
| 3 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.016226 | **true** |
| 4 | Avana Darjeeling Green Tea | Teamonk | 0.015643 | **true** |
| 5 | Nilgiri Green Tea - Yakuso Tulsi, 100% Natural, Loose Leaf | Teamonk | 0.015432 | **true** |

</details>

<details><summary><code>Q5 semantic, lexically diff.</code> — query <code>drink that helps me relax before bed</code> — amplification <b>OFF</b> (total_results 1307)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Natural Sleep Aid Supplement Tablets - Helps To Relax | Himalayan Organics | 0.016133 | false |
| 2 | Nilgiris Green Tea - Anicca Chamomile, Helps To Feel Relaxed & Calm | Teamonk | 0.015388 | false |
| 3 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.014315 | false |
| 4 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.014089 | false |
| 5 | Red Grape Drink | Quencha | 0.01391 | false |

</details>

<details><summary><code>Q5 semantic, lexically diff.</code> — query <code>drink that helps me relax before bed</code> — amplification <b>ON L1</b> (total_results 1307)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiris Green Tea - Anicca Chamomile, Helps To Feel Relaxed & Calm | Teamonk | 0.016158 | **true** |
| 2 | Natural Sleep Aid Supplement Tablets - Helps To Relax | Himalayan Organics | 0.016133 | false |
| 3 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.01503 | **true** |
| 4 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.014793 | **true** |
| 5 | Nilgiri Green Tea - Seiki Peppermint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.014436 | **true** |

</details>

<details><summary><code>Q5 semantic, lexically diff.</code> — query <code>drink that helps me relax before bed</code> — amplification <b>ON L2</b> (total_results 1307)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiris Green Tea - Anicca Chamomile, Helps To Feel Relaxed & Calm | Teamonk | 0.016927 | **true** |
| 2 | Natural Sleep Aid Supplement Tablets - Helps To Relax | Himalayan Organics | 0.016133 | false |
| 3 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.015746 | **true** |
| 4 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.015497 | **true** |
| 5 | Nilgiri Green Tea - Seiki Peppermint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.015123 | **true** |

</details>

<details><summary><code>Q5 semantic, lexically diff.</code> — query <code>drink that helps me relax before bed</code> — amplification <b>ON L3</b> (total_results 1307)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiris Green Tea - Anicca Chamomile, Helps To Feel Relaxed & Calm | Teamonk | 0.017696 | **true** |
| 2 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.016462 | **true** |
| 3 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.016202 | **true** |
| 4 | Natural Sleep Aid Supplement Tablets - Helps To Relax | Himalayan Organics | 0.016133 | false |
| 5 | Nilgiri Green Tea - Seiki Peppermint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.015811 | **true** |

</details>


### M5 hybrid $scoreFusion

Option 4, `fusionMode: "scoreFusion"`, sigmoid normalization. Amplification = post-fusion `× (1 + 0.05/0.10/0.15)`.

**Timings (median of 2 measured reps, after one discarded warm-up)**

| Query | Amplification | APP wall-clock (ms) | DB aggregation (ms) | APP − DB (ms) | total_results |
|---|---|---|---|---|---|
| Q1 exact product name | OFF | 747.3 | 473.6 | 273.7 | 328 |
| Q1 exact product name | ON L1 | 706.4 | 344.9 | 361.5 | 328 |
| Q1 exact product name | ON L2 | 751.8 | 342.6 | 409.2 | 328 |
| Q1 exact product name | ON L3 | 694.5 | 321.8 | 372.7 | 328 |
| Q2 partial / misspelled | OFF | 658.2 | 294.8 | 363.4 | 200 |
| Q2 partial / misspelled | ON L1 | 839.6 | 322.5 | 517.1 | 200 |
| Q2 partial / misspelled | ON L2 | 669.2 | 301.8 | 367.4 | 200 |
| Q2 partial / misspelled | ON L3 | 643.1 | 313.0 | 330.1 | 200 |
| Q3 generic category | OFF | 711.0 | 340.8 | 370.2 | 225 |
| Q3 generic category | ON L1 | 704.3 | 310.5 | 393.8 | 225 |
| Q3 generic category | ON L2 | 681.0 | 305.4 | 375.6 | 225 |
| Q3 generic category | ON L3 | 715.4 | 348.3 | 367.1 | 225 |
| Q4 boosted-brand term | OFF | 774.2 | 331.7 | 442.5 | 271 |
| Q4 boosted-brand term | ON L1 | 696.4 | 308.0 | 388.4 | 271 |
| Q4 boosted-brand term | ON L2 | 721.2 | 323.1 | 398.1 | 272 |
| Q4 boosted-brand term | ON L3 | 755.5 | 345.5 | 410.0 | 271 |
| Q5 semantic, lexically diff. | OFF | 720.0 | 338.1 | 381.9 | 361 |
| Q5 semantic, lexically diff. | ON L1 | 726.4 | 385.8 | 340.6 | 361 |
| Q5 semantic, lexically diff. | ON L2 | 732.1 | 338.6 | 393.5 | 361 |
| Q5 semantic, lexically diff. | ON L3 | 725.7 | 321.2 | 404.5 | 361 |

**DB-level `explain("executionStats")`**

| Query | Amplification | executionStats |
|---|---|---|
| Q1 exact product name | OFF | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q1 exact product name | ON L1 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q1 exact product name | ON L2 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q1 exact product name | ON L3 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q2 partial / misspelled | OFF | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q2 partial / misspelled | ON L1 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q2 partial / misspelled | ON L2 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q2 partial / misspelled | ON L3 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q3 generic category | OFF | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q3 generic category | ON L1 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q3 generic category | ON L2 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q3 generic category | ON L3 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q4 boosted-brand term | OFF | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q4 boosted-brand term | ON L1 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q4 boosted-brand term | ON L2 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q4 boosted-brand term | ON L3 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q5 semantic, lexically diff. | OFF | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q5 semantic, lexically diff. | ON L1 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q5 semantic, lexically diff. | ON L2 | ❌ `explain` unsupported (mongot: `"index" is required`) |
| Q5 semantic, lexically diff. | ON L3 | ❌ `explain` unsupported (mongot: `"index" is required`) |

**Accuracy — top 5**

<details><summary><code>Q1 exact product name</code> — query <code>Onion</code> — amplification <b>OFF</b> (total_results 328)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Onion | Fresho | 0.852248 | false |
| 2 | Onion (Loose) | Fresho | 0.852136 | false |
| 3 | Onion Sabudana Papad | DNV | 0.842931 | false |
| 4 | Red Onion Oil With Jojoba, Argan & Black Seed Oil | Qraa Men | 0.841862 | false |
| 5 | Onion Oil Concentrate - Anti Hairfall, Anti Dandruff & Strength | Beardo | 0.841495 | false |

</details>

<details><summary><code>Q1 exact product name</code> — query <code>Onion</code> — amplification <b>ON L1</b> (total_results 328)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Onion | Fresho | 0.852248 | false |
| 2 | Onion (Loose) | Fresho | 0.852136 | false |
| 3 | Onion Sabudana Papad | DNV | 0.842931 | false |
| 4 | Red Onion Oil With Jojoba, Argan & Black Seed Oil | Qraa Men | 0.841862 | false |
| 5 | Onion Oil Concentrate - Anti Hairfall, Anti Dandruff & Strength | Beardo | 0.841495 | false |

</details>

<details><summary><code>Q1 exact product name</code> — query <code>Onion</code> — amplification <b>ON L2</b> (total_results 328)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Onion | Fresho | 0.852248 | false |
| 2 | Onion (Loose) | Fresho | 0.852136 | false |
| 3 | Onion Sabudana Papad | DNV | 0.842931 | false |
| 4 | Red Onion Oil With Jojoba, Argan & Black Seed Oil | Qraa Men | 0.841862 | false |
| 5 | Onion Oil Concentrate - Anti Hairfall, Anti Dandruff & Strength | Beardo | 0.841495 | false |

</details>

<details><summary><code>Q1 exact product name</code> — query <code>Onion</code> — amplification <b>ON L3</b> (total_results 328)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Onion | Fresho | 0.852248 | false |
| 2 | Onion (Loose) | Fresho | 0.852136 | false |
| 3 | Onion Sabudana Papad | DNV | 0.842931 | false |
| 4 | Red Onion Oil With Jojoba, Argan & Black Seed Oil | Qraa Men | 0.841862 | false |
| 5 | Onion Oil Concentrate - Anti Hairfall, Anti Dandruff & Strength | Beardo | 0.841495 | false |

</details>

<details><summary><code>Q2 partial / misspelled</code> — query <code>tomatoe</code> — amplification <b>OFF</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 0.850258 | false |
| 2 | Tomato - Local (Loose) | Fresho | 0.850217 | false |
| 3 | Tomato - Hybrid (Loose) | Fresho | 0.849658 | false |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.849626 | false |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.848311 | false |

</details>

<details><summary><code>Q2 partial / misspelled</code> — query <code>tomatoe</code> — amplification <b>ON L1</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 0.850282 | false |
| 2 | Tomato - Local (Loose) | Fresho | 0.850239 | false |
| 3 | Tomato - Hybrid (Loose) | Fresho | 0.84967 | false |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.849635 | false |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.848331 | false |

</details>

<details><summary><code>Q2 partial / misspelled</code> — query <code>tomatoe</code> — amplification <b>ON L2</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 0.850282 | false |
| 2 | Tomato - Local (Loose) | Fresho | 0.850239 | false |
| 3 | Tomato - Hybrid (Loose) | Fresho | 0.84967 | false |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.849635 | false |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.848331 | false |

</details>

<details><summary><code>Q2 partial / misspelled</code> — query <code>tomatoe</code> — amplification <b>ON L3</b> (total_results 200)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 0.850282 | false |
| 2 | Tomato - Local (Loose) | Fresho | 0.850239 | false |
| 3 | Tomato - Hybrid (Loose) | Fresho | 0.84967 | false |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.849635 | false |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.848331 | false |

</details>

<details><summary><code>Q3 generic category</code> — query <code>beverages</code> — amplification <b>OFF</b> (total_results 225)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 0.847805 | false |
| 2 | Black Soft Drink - Max Taste, Zero Sugar(Diet) | Pepsi | 0.813571 | false |
| 3 | Aamras Mango Fruit Juice | Paper Boat | 0.813025 | false |
| 4 | Cold Extracted Juice - Mixed Fruit, 1lt + Sugarcane, 1lt | Raw Pressery | 0.812824 | false |
| 5 | Cold Extracted Juice - Basics, Sugarcane | Raw Pressery | 0.812667 | false |

</details>

<details><summary><code>Q3 generic category</code> — query <code>beverages</code> — amplification <b>ON L1</b> (total_results 225)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 0.847805 | false |
| 2 | Black Soft Drink - Max Taste, Zero Sugar(Diet) | Pepsi | 0.813571 | false |
| 3 | Aamras Mango Fruit Juice | Paper Boat | 0.813025 | false |
| 4 | Cold Extracted Juice - Mixed Fruit, 1lt + Sugarcane, 1lt | Raw Pressery | 0.812824 | false |
| 5 | Cold Extracted Juice - Basics, Sugarcane | Raw Pressery | 0.812667 | false |

</details>

<details><summary><code>Q3 generic category</code> — query <code>beverages</code> — amplification <b>ON L2</b> (total_results 225)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 0.847805 | false |
| 2 | Black Soft Drink - Max Taste, Zero Sugar(Diet) | Pepsi | 0.813571 | false |
| 3 | Aamras Mango Fruit Juice | Paper Boat | 0.813025 | false |
| 4 | Cold Extracted Juice - Mixed Fruit, 1lt + Sugarcane, 1lt | Raw Pressery | 0.812824 | false |
| 5 | Cold Extracted Juice - Basics, Sugarcane | Raw Pressery | 0.812667 | false |

</details>

<details><summary><code>Q3 generic category</code> — query <code>beverages</code> — amplification <b>ON L3</b> (total_results 225)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 0.847805 | false |
| 2 | Black Soft Drink - Max Taste, Zero Sugar(Diet) | Pepsi | 0.813571 | false |
| 3 | Aamras Mango Fruit Juice | Paper Boat | 0.813025 | false |
| 4 | Cold Extracted Juice - Mixed Fruit, 1lt + Sugarcane, 1lt | Raw Pressery | 0.812824 | false |
| 5 | Cold Extracted Juice - Basics, Sugarcane | Raw Pressery | 0.812667 | false |

</details>

<details><summary><code>Q4 boosted-brand term</code> — query <code>green tea</code> — amplification <b>OFF</b> (total_results 271)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management | Teamonk | 0.84867 | false |
| 2 | Green Tea Mugs - Multicolour | Hot Muggs | 0.848542 | false |
| 3 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.848297 | false |
| 4 | Green Tea - Ikusei, Cardamom | Teamonk | 0.848119 | false |
| 5 | Strawberry Green Tea | Teamonk | 0.848095 | false |

</details>

<details><summary><code>Q4 boosted-brand term</code> — query <code>green tea</code> — amplification <b>ON L1</b> (total_results 271)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management | Teamonk | 0.891103 | **true** |
| 2 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.890712 | **true** |
| 3 | Green Tea - Ikusei, Cardamom | Teamonk | 0.890524 | **true** |
| 4 | Strawberry Green Tea | Teamonk | 0.890499 | **true** |
| 5 | Nilgiris Green Tea - Kozan Spearmint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.890453 | **true** |

</details>

<details><summary><code>Q4 boosted-brand term</code> — query <code>green tea</code> — amplification <b>ON L2</b> (total_results 272)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management | Teamonk | 0.933537 | **true** |
| 2 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.933136 | **true** |
| 3 | Green Tea - Ikusei, Cardamom | Teamonk | 0.932971 | **true** |
| 4 | Nilgiris Green Tea - Kozan Spearmint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.932887 | **true** |
| 5 | Strawberry Green Tea | Teamonk | 0.932875 | **true** |

</details>

<details><summary><code>Q4 boosted-brand term</code> — query <code>green tea</code> — amplification <b>ON L3</b> (total_results 271)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management | Teamonk | 0.97597 | **true** |
| 2 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.975542 | **true** |
| 3 | Green Tea - Ikusei, Cardamom | Teamonk | 0.975336 | **true** |
| 4 | Strawberry Green Tea | Teamonk | 0.975309 | **true** |
| 5 | Nilgiris Green Tea - Kozan Spearmint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.975258 | **true** |

</details>

<details><summary><code>Q5 semantic, lexically diff.</code> — query <code>drink that helps me relax before bed</code> — amplification <b>OFF</b> (total_results 361)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Natural Sleep Aid Supplement Tablets - Helps To Relax | Himalayan Organics | 0.848466 | false |
| 2 | Nilgiris Green Tea - Anicca Chamomile, Helps To Feel Relaxed & Calm | Teamonk | 0.848376 | false |
| 3 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine | Booch | 0.84511 | false |
| 4 | Melatonin 10Mg Capsule - Helps To Sleep Well | Himalayan Organics | 0.845026 | false |
| 5 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.84419 | false |

</details>

<details><summary><code>Q5 semantic, lexically diff.</code> — query <code>drink that helps me relax before bed</code> — amplification <b>ON L1</b> (total_results 361)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiris Green Tea - Anicca Chamomile, Helps To Feel Relaxed & Calm | Teamonk | 0.890795 | **true** |
| 2 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.886399 | **true** |
| 3 | Nilgiri Green Tea - Seiki Peppermint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.886333 | **true** |
| 4 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.886092 | **true** |
| 5 | Nilgiris Green Tea - Kozan Spearmint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.885301 | **true** |

</details>

<details><summary><code>Q5 semantic, lexically diff.</code> — query <code>drink that helps me relax before bed</code> — amplification <b>ON L2</b> (total_results 361)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiris Green Tea - Anicca Chamomile, Helps To Feel Relaxed & Calm | Teamonk | 0.933213 | **true** |
| 2 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.928609 | **true** |
| 3 | Nilgiri Green Tea - Seiki Peppermint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.928539 | **true** |
| 4 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.928287 | **true** |
| 5 | Nilgiris Green Tea - Kozan Spearmint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.927458 | **true** |

</details>

<details><summary><code>Q5 semantic, lexically diff.</code> — query <code>drink that helps me relax before bed</code> — amplification <b>ON L3</b> (total_results 361)</summary>

| # | productName | brand | score | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiris Green Tea - Anicca Chamomile, Helps To Feel Relaxed & Calm | Teamonk | 0.975632 | **true** |
| 2 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.970818 | **true** |
| 3 | Nilgiri Green Tea - Seiki Peppermint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.970745 | **true** |
| 4 | Nilgiris Green Tea - Anicca Chamomile, Helps To Relax & Calm | Teamonk | 0.970482 | **true** |
| 5 | Nilgiris Green Tea - Kozan Spearmint, Helps To Feel Relaxed & Refreshed | Teamonk | 0.969615 | **true** |

</details>


### M6 $searchMeta facets

Frontend route `POST /api/searchMeta`. No free-text product query and no Brand Amplification — its inputs are `brand` + `categories`, so the parameter sweep below replaces the query×boost matrix. Measured at the aggregation only (the Next.js dev server was not started for this baseline).

| Parameters | DB aggregation (ms) | executionStats | result count |
|---|---|---|---|
| brand=(any) cats=(none) | 126.1 | idx `product_atlas_search_meta` · mongot (no classic scan stage) · docsExamined — · keysExamined — · nReturned 1 · execMs — | 6143 |
| brand=(any) cats=['Beverages'] | 125.1 | idx `product_atlas_search_meta` · mongot (no classic scan stage) · docsExamined — · keysExamined — · nReturned 1 · execMs — | 115 |
| brand=Teamonk cats=(none) | 133.5 | idx `product_atlas_search_meta` · mongot (no classic scan stage) · docsExamined — · keysExamined — · nReturned 1 · execMs — | 59 |
| brand=Teamonk cats=['Beverages'] | 128.4 | idx `product_atlas_search_meta` · mongot (no classic scan stage) · docsExamined — · keysExamined — · nReturned 1 · execMs — | 20 |

**Top 5**

<details><summary><code>brand=(any) cats=(none)</code></summary>

| # | facet bucket | — | doc count | — |
|---|---|---|---|---|
| 1 | facet:Beauty & Hygiene | - | 2800 | false |
| 2 | facet:Kitchen, Garden & Pets | - | 998 | false |
| 3 | facet:Foodgrains, Oil & Masala | - | 651 | false |
| 4 | facet:Cleaning & Household | - | 399 | false |
| 5 | facet:Gourmet & World Food | - | 323 | false |

</details>

<details><summary><code>brand=(any) cats=['Beverages']</code></summary>

| # | facet bucket | — | doc count | — |
|---|---|---|---|---|
| 1 | facet:Beverages | - | 115 | false |

</details>

<details><summary><code>brand=Teamonk cats=(none)</code></summary>

| # | facet bucket | — | doc count | — |
|---|---|---|---|---|
| 1 | facet:Gourmet & World Food | - | 39 | false |
| 2 | facet:Beverages | - | 20 | false |

</details>

<details><summary><code>brand=Teamonk cats=['Beverages']</code></summary>

| # | facet bucket | — | doc count | — |
|---|---|---|---|---|
| 1 | facet:Beverages | - | 20 | false |

</details>


### M7 geospatial $geoNear

Frontend route `POST /api/getDistances` on the `stores` collection. No query text, no Brand Amplification. `isBoosted` column reused to show the route's `isNearby` (<15 km) flag, and `score` shows distance in km. Measured at the aggregation only.

| Parameters | DB aggregation (ms) | executionStats | result count |
|---|---|---|---|
| near Bangkok | 139.0 | idx `location_2dsphere` · IXSCAN · docsExamined 50 · keysExamined 90 · nReturned 50 · execMs 2 | 50 |
| near Chiang Mai | 137.0 | idx `location_2dsphere` · IXSCAN · docsExamined 50 · keysExamined 111 · nReturned 50 · execMs 4 | 50 |

**Top 5**

<details><summary><code>near Bangkok</code></summary>

| # | storeName | distance | distance (km) | isNearby |
|---|---|---|---|---|
| 1 | Suraprasert, Chaisatit and Titipatrayunyong - Bangkok | 1.1 km | 1.06 | **true** |
| 2 | Turongkinanon-Boonpungbaramee - Bangkok | 1.6 km | 1.566 | **true** |
| 3 | Wasunun Inc - Bangkok | 1.9 km | 1.888 | **true** |
| 4 | Suraprachit-Chomsri - Ayutthaya | 65.7 km | 65.673 | false |
| 5 | Intaum, Pitanuwat and Pothanun - Ayutthaya | 66.3 km | 66.312 | false |

</details>

<details><summary><code>near Chiang Mai</code></summary>

| # | storeName | distance | distance (km) | isNearby |
|---|---|---|---|---|
| 1 | Trikasemmart, Anekvorakul and Krittayanukoon - Chiang Mai | 0.0 km | 0.03 | **true** |
| 2 | Youprasert-Prayoonhong - Chiang Mai | 0.9 km | 0.93 | **true** |
| 3 | Todsapornpitakul Ltd - Chiang Mai | 1.6 km | 1.553 | **true** |
| 4 | Methavorakul, Benchapatranon and Norramon - Chiang Mai | 1.7 km | 1.697 | **true** |
| 5 | Neerachapong Inc - Chiang Mai | 1.9 km | 1.884 | **true** |

</details>


### Supplementary — the Brand Amplification rule actually stored in staging

The `brand-amplification` collection in staging holds exactly one rule: `{name: "Teamonk", categories: ["Gourmet & World Food", "Beverages"], boostLevel: 1}`. The matrix above uses the brand-only form of that rule; this table re-runs the two relevant queries with the category-scoped form, as production would send it.

| Mode | Query | APP wall-clock (ms) | total_results | Top-5 brands | any isBoosted? |
|---|---|---|---|---|---|
| M2 atlas text | Q3 generic category | 256.3 | 71 | Booch, Teamonk | **yes** |
| M3 vector | Q3 generic category | 1019.0 | 200 | Quencha, Booch, Pepsi, Bayars, Indigifts | no |
| M4 rankFusion | Q3 generic category | 1009.5 | 225 | Booch, Pepsi, Paper Boat, Raw Pressery | no |
| M5 scoreFusion | Q3 generic category | 796.9 | 225 | Booch, Pepsi, Paper Boat, Raw Pressery | no |
| M2 atlas text | Q4 boosted-brand term | 264.6 | 639 | Teamonk | **yes** |
| M3 vector | Q4 boosted-brand term | 732.9 | 200 | Teamonk | **yes** |
| M4 rankFusion | Q4 boosted-brand term | 992.9 | 693 | Teamonk, Wingreens Farms, Kapiva | **yes** |
| M5 scoreFusion | Q4 boosted-brand term | 1008.8 | 271 | Teamonk | **yes** |

---

## Summary

### Average APP time vs average DB time, per mode

Averaged across every configuration measured for that mode (all queries × all amplification settings).

| Search mode | Configs measured | Avg APP wall-clock (ms) | Avg DB aggregation (ms) | Avg APP − DB (ms) | APP range (ms) |
|---|---|---|---|---|---|
| M1 keyword regex | 5 | 134.6 | 226.2 | -91.6 | 127.6 – 146.5 |
| M2 atlas text $search | 20 | 297.9 | 272.1 | 25.8 | 151.7 – 491.5 |
| M3 $vectorSearch | 20 | 675.4 | 304.1 | 371.3 | 606.0 – 723.8 |
| M4 hybrid $rankFusion | 20 | 798.2 | 427.7 | 370.5 | 654.3 – 1092.1 |
| M5 hybrid $scoreFusion | 20 | 718.7 | 335.6 | 383.1 | 643.1 – 839.6 |
| M6 $searchMeta facets | 4 | not measured | 128.3 | n/a | not measured |
| M7 geospatial $geoNear | 2 | not measured | 138.0 | n/a | not measured |

Reading these numbers:

* **Mode 1 is the only mode where DB time exceeds APP time**, and that is an artifact: the very first
  aggregation of the session (Q1) took 988 ms cold, against 122–135 ms for every subsequent run.
  Steady-state, mode 1's aggregation is ~125 ms and its APP wall-clock ~130 ms — the cheapest mode
  by a wide margin, and also the least capable.
* **Modes 3, 4 and 5 all carry ~370–383 ms of APP-side overhead that the database never sees.**
  That is the synchronous Voyage AI `POST /embeddings` hop (`httpx`, 5 s timeout, 3 retries),
  serialized ahead of the aggregation on every single request. It is the single largest cost in the
  semantic and hybrid paths — larger than the aggregation itself in modes 3 and 5.
* **Mode 2 has almost no APP overhead** (~26 ms): no embedding call, so APP ≈ DB.
* Mode 4 (`$rankFusion`) is the slowest mode end-to-end (avg 798 ms, peaking at 1 092 ms on Q5) and
  also the most expensive at the database (avg 428 ms) — consistent with it running a 5-field
  `$search` and a 500-candidate `$vectorSearch` and fusing them.
* Modes 6 and 7 were measured at the aggregation only (the Next.js server was not started), so they
  have no APP figure. Both are cheap and well-indexed: `$searchMeta` ~128 ms, `$geoNear` ~138 ms
  with `location_2dsphere` (50 docs examined, 2–4 ms of server execution time).

### Queries with clearly wrong or empty results

**Empty results**

* **Mode 1, Q2 `tomatoe`, Q3 `beverages`, Q5 `drink that helps me relax before bed` → 0 results
  (3 of 5 queries).** The pipeline is an anchored case-insensitive prefix regex on `productName`
  only, so any misspelling, category term or natural-language phrase returns nothing. Every other
  mode returns results for all five queries.

**Wrong or misleading rankings**

* **Mode 3, Q2 `tomatoe`, boost level 3 — the worst result in the matrix.**
  `Global Darjeeling Oolong Tea - Tapas` (Teamonk) is ranked **#1**, ahead of all four
  `Tomato - Local/Hybrid (Loose)` products, for a query that is a one-character misspelling of
  "tomato". A +0.15 factor on a weak k-NN neighbour was enough to overtake near-exact matches.
  Levels 1 and 2 on the same query leave the ranking untouched, so the failure appears abruptly at
  the top boost level.
* **Mode 2, Q3 `beverages`, all boost levels.** Ranks 2–5 are all Teamonk oolong/green teas,
  displacing actual beverage products (`Black Soft Drink`, `Red Grape Drink`, the Red Label teas
  that ranked 2–5 with boost OFF).
* **Mode 2, Q5, all boost levels.** With boost OFF the best match is
  `Natural Sleep Aid Supplement Tablets` (score 1.0); at level 1 it drops to #3, and at levels 2–3
  it falls out of the top 5 entirely, replaced by five Teamonk teas.
* **Mode 4, Q5, boost level 3.** `Natural Sleep Aid Supplement Tablets` drops from #1 to #4 behind
  three Teamonk green teas.

**Scoring and determinism defects**

* **Mode 2, Q2 `tomatoe`: the top five results all have `score` exactly `1.0`.** The window-max
  normalization (`originalScore / maxScore` over a `partitionBy: None` window) collapses to ties
  whenever fuzzy matching produces identical raw scores, so the client receives no usable ranking
  signal. `Onion` (Q1) shows the same pattern in mode 2 for the top two entries.
* **Mode 5 compresses scores to the point of uselessness.** With `normalization: "sigmoid"`, the
  Q4 top five span `0.848670 → 0.848095` — a total spread of 5.75e-4. Q3's top five span
  `0.847805 → 0.812667`. Distinguishing rank 1 from rank 5 requires six decimal places.
* **Mode 4 returns scores on a completely different scale from every other mode** (raw RRF values
  ~0.014–0.018, never normalized) while modes 2, 3 and 5 return values in [0, 1]. A client cannot
  compare or threshold `score` across modes.
* **Mode 5, Q4 `green tea`: `total_results` is not stable across runs** — 271 at boost OFF, L1 and
  L3, but **272** at L2, for a pipeline whose boost stage cannot change the result set size. The
  count comes from the `$facet` `$count` branch over the fused candidate window, so the window
  itself is varying between executions.
* **Mode 1 never populates `score` (always `null`) and never sets `isBoosted`**, so the response
  contract is only nominally uniform across modes.

**Amplification that silently does nothing**

* **Mode 3, Q3 `beverages`: identical top 5 at OFF, L1, L2 and L3.** Same for
  **mode 5, Q3** at every level. The supplementary run with the *real* staging rule
  (`Teamonk` scoped to `Gourmet & World Food` + `Beverages`, level 1) also leaves modes 3, 4 and 5
  completely unboosted on `beverages` — no `isBoosted: true` document appears in the top 5 —
  even though `$searchMeta` confirms Teamonk has 20 products in `Beverages` in this store's catalogue.
  At level 1 the factor is +0.05, which is smaller than the score gap to the retrieval window's head.
* Modes 2–5 on Q1 `Onion` and Q2 `tomatoe` are unaffected at every level, which is expected: no
  Teamonk product is a plausible match.

**Index / code mismatch affecting accuracy in three of five modes**

* Modes 2, 4 and 5 each include a `should` clause on `aboutTheProduct` with a 1.8 boost, but
  `aboutTheProduct` is not mapped in the live `product_atlas_search` index (which is
  `dynamic: false`). All 6 143 documents have substantial `aboutTheProduct` copy that is currently
  unsearchable. See Part B rows 5–7.

**Query efficiency**

* **Mode 1 examines the entire `productName_1` index on every query**: `totalKeysExamined: 6143`
  for all five queries, against `totalDocsExamined` of 0–18. The stage is an `IXSCAN`, but a
  case-insensitive `$regex` cannot produce index bounds, so it is a full index scan with a
  post-filter — it only looks cheap because the collection is small.
* Modes 2 and 3 examine exactly as many documents as they return (mode 2: 10–1 220 depending on
  query breadth; mode 3: a constant 200, the `knn_limit`), all served from the correct Atlas
  Search / Vector Search index.
* Mode 2's cost tracks query breadth directly: Q2 examines 10 documents (211 ms DB) while Q5
  examines 1 220 (381 ms DB).

### Artifacts

Raw measurements for every configuration in this document are in the session scratchpad
(`partc.json`, `partc_livecfg.json`); the tables above are generated from them.

---

## Post-fix verification — Fix 1 (weight=0.0 bug)

Appended **2026-09-14**, after applying Fix 1 from
[`docs/recommendations-pre-refactor.md`](recommendations-pre-refactor.md) (rec **L2.3**). Nothing
above this heading has been modified — the original baseline stands as captured.

### What changed

`hybrid_rrf_pipeline.py:126-127` and `hybrid_score_fusion_pipeline.py:145-146` both read:

```python
w_vec = max(0.0, float(weights.get("vectorPipeline") or 1.0))
```

`0.0 or 1.0` evaluates to `1.0` in Python, so an explicitly-sent weight of `0.0` was silently
replaced by full weight. Replaced with an explicit `None` check, so `0.0` is honoured as zero
weight while a genuinely missing key still defaults to `1.0`. No other change was made.

### Method

Same harness and fixed parameters as the original baseline: `storeObjectId = 684aa28064ff7c785a568ae7`
(`store-030`), `page = 1`, `page_size = 5`, no Brand Amplification, one discarded warm-up then
2 measured reps (median reported). All calls were `POST /api/v1/search` against the service running
locally with the fix applied; read-only, no writes, no DDL.

Two reference runs establish what "text-only" and "vector-only" *should* look like: **mode 2**
(pure `$search`) and **mode 3** (pure `$vectorSearch`).

**How the pre-fix column was obtained without reverting the code:** pre-fix, an explicit `0.0` was
coerced to `1.0`, so *both* test configurations collapsed to weights `(1.0, 1.0)`. A post-fix run at
`weightText=1.0, weightVector=1.0` therefore reproduces the pre-fix behaviour exactly. The
`0.5/0.5` row is included to confirm the original baseline's ordering: equal weights scale the fused
score linearly and so produce identical ordering, which the results below verify.

### Ordering agreement — the headline result

`ordering == mode N` means the top-5 list matched that pure mode's top-5 **exactly, in order**.

| Query | Mode | Weights | ordering == mode 2 | ordering == mode 3 | ordering == 0.5/0.5 baseline |
|---|---|---|---|---|---|
| Q2 | mode 4 | pre-fix equivalent (1.0/1.0) | no | ✅ **yes** | ✅ **yes** |
| Q2 | mode 4 | baseline 50/50 (0.5/0.5) | no | ✅ **yes** | — |
| Q2 | mode 4 | (a) text-only (1.0/0.0) | ✅ **yes** | no | — |
| Q2 | mode 4 | (b) vector-only (0.0/1.0) | no | ✅ **yes** | — |
| Q2 | mode 5 | pre-fix equivalent (1.0/1.0) | no | ✅ **yes** | ✅ **yes** |
| Q2 | mode 5 | baseline 50/50 (0.5/0.5) | no | ✅ **yes** | — |
| Q2 | mode 5 | (a) text-only (1.0/0.0) | ✅ **yes** | no | — |
| Q2 | mode 5 | (b) vector-only (0.0/1.0) | no | ✅ **yes** | — |
| Q4 | mode 4 | pre-fix equivalent (1.0/1.0) | no | no | ✅ **yes** |
| Q4 | mode 4 | baseline 50/50 (0.5/0.5) | no | no | — |
| Q4 | mode 4 | (a) text-only (1.0/0.0) | ✅ **yes** | no | — |
| Q4 | mode 4 | (b) vector-only (0.0/1.0) | no | ✅ **yes** | — |
| Q4 | mode 5 | pre-fix equivalent (1.0/1.0) | no | ✅ **yes** | ✅ **yes** |
| Q4 | mode 5 | baseline 50/50 (0.5/0.5) | no | ✅ **yes** | — |
| Q4 | mode 5 | (a) text-only (1.0/0.0) | ✅ **yes** | no | — |
| Q4 | mode 5 | (b) vector-only (0.0/1.0) | no | ✅ **yes** | — |

**Verdict: the fix works in all four combinations.**

* **Configuration (a) `weightText=1.0, weightVector=0.0` now reproduces mode 2's ordering exactly**
  — in all 4 of 4 combinations (2 queries × 2 fusion modes). Before the fix it matched mode 2 in
  none of them.
* **Configuration (b) `weightText=0.0, weightVector=1.0` now reproduces mode 3's ordering exactly**
  — in all 4 of 4 combinations.
* The pre-fix equivalent `(1.0, 1.0)` is **identical to the `0.5/0.5` baseline** in all 4
  combinations, confirming both that the coercion was real and that the original baseline's
  ordering was unaffected by weight magnitude.

**One honest caveat on configuration (b).** In 3 of the 4 combinations the pre-fix 50/50 blend
*already* happened to agree with mode 3's ordering, so config (b) alone cannot distinguish fixed
from broken there — vector simply dominated the blend. Configuration (a) is the discriminating test
in all four cases, and **Q4 / mode 4 is the single cleanest cell**: pre-fix it matched *neither*
pure mode (1 of 5 positions vs mode 2, 0 of 5 vs mode 3), and post-fix (a) matches mode 2 on all 5
positions while (b) matches mode 3 on all 5.

### Q2 — `tomatoe`

**Reference: pure modes**

<details open><summary><b>mode 2 — pure text ($search)</b> — app 199.9 ms, total_results 10</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Tomato - Hybrid (Loose) | Fresho | 1.0 |
| 2 | Tomato - Hybrid (Loose) | Fresho | 1.0 |
| 3 | Tomato - Local (Loose) | Fresho | 1.0 |
| 4 | Tomato - Local (Loose) | Fresho | 1.0 |
| 5 | Rings - Tomato Twist | Too Yumm! | 1.0 |

</details>

<details open><summary><b>mode 3 — pure vector ($vectorSearch)</b> — app 630.7 ms, total_results 200</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 1.0 |
| 2 | Tomato - Local (Loose) | Fresho | 0.999517 |
| 3 | Tomato - Hybrid (Loose) | Fresho | 0.993149 |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.992756 |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.978213 |

</details>

**mode 4 — $rankFusion**

| Weights | APP wall-clock (ms) | total_results | ordering matches |
|---|---|---|---|
| pre-fix equivalent (1.0/1.0) | 668.8 | 200 | **mode 3 (vector)** |
| baseline 50/50 (0.5/0.5) | 655.5 | 200 | **mode 3 (vector)** |
| (a) text-only (1.0/0.0) | 655.3 | 200 | **mode 2 (text)** |
| (b) vector-only (0.0/1.0) | 683.9 | 200 | **mode 3 (vector)** |

<details><summary><code>pre-fix equivalent (1.0/1.0)</code> — app 668.8 ms</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 0.032787 |
| 2 | Tomato - Local (Loose) | Fresho | 0.032522 |
| 3 | Tomato - Hybrid (Loose) | Fresho | 0.032266 |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.032018 |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.031778 |

</details>

<details><summary><code>baseline 50/50 (0.5/0.5)</code> — app 655.5 ms</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 0.016393 |
| 2 | Tomato - Local (Loose) | Fresho | 0.016261 |
| 3 | Tomato - Hybrid (Loose) | Fresho | 0.016133 |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.016009 |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.015889 |

</details>

<details><summary><code>(a) text-only (1.0/0.0)</code> — app 655.3 ms</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Tomato - Hybrid (Loose) | Fresho | 0.016393 |
| 2 | Tomato - Hybrid (Loose) | Fresho | 0.016393 |
| 3 | Tomato - Local (Loose) | Fresho | 0.016393 |
| 4 | Tomato - Local (Loose) | Fresho | 0.016393 |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.016393 |

</details>

<details><summary><code>(b) vector-only (0.0/1.0)</code> — app 683.9 ms</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 0.016393 |
| 2 | Tomato - Local (Loose) | Fresho | 0.016129 |
| 3 | Tomato - Hybrid (Loose) | Fresho | 0.015873 |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.015625 |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.015385 |

</details>


**mode 5 — $scoreFusion**

| Weights | APP wall-clock (ms) | total_results | ordering matches |
|---|---|---|---|
| pre-fix equivalent (1.0/1.0) | 706.5 | 200 | **mode 3 (vector)** |
| baseline 50/50 (0.5/0.5) | 690.2 | 200 | **mode 3 (vector)** |
| (a) text-only (1.0/0.0) | 646.3 | 200 | **mode 2 (text)** |
| (b) vector-only (0.0/1.0) | 773.5 | 200 | **mode 3 (vector)** |

<details><summary><code>pre-fix equivalent (1.0/1.0)</code> — app 706.5 ms</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 1.700564 |
| 2 | Tomato - Local (Loose) | Fresho | 1.700478 |
| 3 | Tomato - Hybrid (Loose) | Fresho | 1.69934 |
| 4 | Tomato - Hybrid (Loose) | Fresho | 1.69927 |
| 5 | Rings - Tomato Twist | Too Yumm! | 1.696663 |

</details>

<details><summary><code>baseline 50/50 (0.5/0.5)</code> — app 690.2 ms</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 0.850282 |
| 2 | Tomato - Local (Loose) | Fresho | 0.850239 |
| 3 | Tomato - Hybrid (Loose) | Fresho | 0.84967 |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.849635 |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.848331 |

</details>

<details><summary><code>(a) text-only (1.0/0.0)</code> — app 646.3 ms</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Tomato - Hybrid (Loose) | Fresho | 0.999842 |
| 2 | Tomato - Hybrid (Loose) | Fresho | 0.999842 |
| 3 | Tomato - Local (Loose) | Fresho | 0.999842 |
| 4 | Tomato - Local (Loose) | Fresho | 0.999842 |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.999842 |

</details>

<details><summary><code>(b) vector-only (0.0/1.0)</code> — app 773.5 ms</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Tomato - Local (Loose) | Fresho | 0.700722 |
| 2 | Tomato - Local (Loose) | Fresho | 0.700636 |
| 3 | Tomato - Hybrid (Loose) | Fresho | 0.699498 |
| 4 | Tomato - Hybrid (Loose) | Fresho | 0.699428 |
| 5 | Rings - Tomato Twist | Too Yumm! | 0.696821 |

</details>


### Q4 — `green tea`

**Reference: pure modes**

<details open><summary><b>mode 2 — pure text ($search)</b> — app 255.5 ms, total_results 639</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Green Tea - Zoho, Lemongrass | Teamonk | 1.0 |
| 2 | Green Tea - Ikusei, Cardamom | Teamonk | 1.0 |
| 3 | Rakshan Green Tea - Supports Strong Immunity | Kapiva | 0.916292 |
| 4 | Svastha Green Tea - Promotes Overall Well-Being | Kapiva | 0.881528 |
| 5 | Strawberry Green Tea | Teamonk | 0.873918 |

</details>

<details open><summary><b>mode 3 — pure vector ($vectorSearch)</b> — app 772.4 ms, total_results 200</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management | Teamonk | 1.0 |
| 2 | Green Tea Mugs - Multicolour | Hot Muggs | 0.998376 |
| 3 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.995567 |
| 4 | Green Tea - Ikusei, Cardamom | Teamonk | 0.993504 |
| 5 | Strawberry Green Tea | Teamonk | 0.993237 |

</details>

**mode 4 — $rankFusion**

| Weights | APP wall-clock (ms) | total_results | ordering matches |
|---|---|---|---|
| pre-fix equivalent (1.0/1.0) | 849.5 | 693 | neither pure mode |
| baseline 50/50 (0.5/0.5) | 800.2 | 693 | neither pure mode |
| (a) text-only (1.0/0.0) | 783.8 | 693 | **mode 2 (text)** |
| (b) vector-only (0.0/1.0) | 803.3 | 693 | **mode 3 (vector)** |

<details><summary><code>pre-fix equivalent (1.0/1.0)</code> — app 849.5 ms</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Green Tea - Ikusei, Cardamom | Teamonk | 0.032018 |
| 2 | Strawberry Green Tea | Teamonk | 0.030769 |
| 3 | Green Tea - With Peppermint Leaves, Grown Fresh | Wingreens Farms | 0.029437 |
| 4 | Svastha Green Tea - Promotes Overall Well-Being | Kapiva | 0.029324 |
| 5 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.028219 |

</details>

<details><summary><code>baseline 50/50 (0.5/0.5)</code> — app 800.2 ms</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Green Tea - Ikusei, Cardamom | Teamonk | 0.016009 |
| 2 | Strawberry Green Tea | Teamonk | 0.015385 |
| 3 | Green Tea - With Peppermint Leaves, Grown Fresh | Wingreens Farms | 0.014719 |
| 4 | Svastha Green Tea - Promotes Overall Well-Being | Kapiva | 0.014662 |
| 5 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.014109 |

</details>

<details><summary><code>(a) text-only (1.0/0.0)</code> — app 783.8 ms</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Green Tea - Zoho, Lemongrass | Teamonk | 0.016393 |
| 2 | Green Tea - Ikusei, Cardamom | Teamonk | 0.016393 |
| 3 | Rakshan Green Tea - Supports Strong Immunity | Kapiva | 0.015873 |
| 4 | Svastha Green Tea - Promotes Overall Well-Being | Kapiva | 0.015625 |
| 5 | Strawberry Green Tea | Teamonk | 0.015385 |

</details>

<details><summary><code>(b) vector-only (0.0/1.0)</code> — app 803.3 ms</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management | Teamonk | 0.016393 |
| 2 | Green Tea Mugs - Multicolour | Hot Muggs | 0.016129 |
| 3 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.015873 |
| 4 | Green Tea - Ikusei, Cardamom | Teamonk | 0.015625 |
| 5 | Strawberry Green Tea | Teamonk | 0.015385 |

</details>


**mode 5 — $scoreFusion**

| Weights | APP wall-clock (ms) | total_results | ordering matches |
|---|---|---|---|
| pre-fix equivalent (1.0/1.0) | 672.3 | 271 | **mode 3 (vector)** |
| baseline 50/50 (0.5/0.5) | 711.5 | 271 | **mode 3 (vector)** |
| (a) text-only (1.0/0.0) | 693.8 | 271 | **mode 2 (text)** |
| (b) vector-only (0.0/1.0) | 679.4 | 271 | **mode 3 (vector)** |

<details><summary><code>pre-fix equivalent (1.0/1.0)</code> — app 672.3 ms</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management | Teamonk | 1.697343 |
| 2 | Green Tea Mugs - Multicolour | Hot Muggs | 1.697036 |
| 3 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 1.696556 |
| 4 | Green Tea - Ikusei, Cardamom | Teamonk | 1.696234 |
| 5 | Strawberry Green Tea | Teamonk | 1.696153 |

</details>

<details><summary><code>baseline 50/50 (0.5/0.5)</code> — app 711.5 ms</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management | Teamonk | 0.84867 |
| 2 | Green Tea Mugs - Multicolour | Hot Muggs | 0.848542 |
| 3 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.848297 |
| 4 | Green Tea - Ikusei, Cardamom | Teamonk | 0.848119 |
| 5 | Strawberry Green Tea | Teamonk | 0.848095 |

</details>

<details><summary><code>(a) text-only (1.0/0.0)</code> — app 693.8 ms</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Green Tea - Zoho, Lemongrass | Teamonk | 1.0 |
| 2 | Green Tea - Ikusei, Cardamom | Teamonk | 1.0 |
| 3 | Rakshan Green Tea - Supports Strong Immunity | Kapiva | 1.0 |
| 4 | Svastha Green Tea - Promotes Overall Well-Being | Kapiva | 0.999999 |
| 5 | Strawberry Green Tea | Teamonk | 0.999999 |

</details>

<details><summary><code>(b) vector-only (0.0/1.0)</code> — app 679.4 ms</summary>

| # | productName | brand | score |
|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management | Teamonk | 0.697383 |
| 2 | Green Tea Mugs - Multicolour | Hot Muggs | 0.697097 |
| 3 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf | Teamonk | 0.696601 |
| 4 | Green Tea - Ikusei, Cardamom | Teamonk | 0.696237 |
| 5 | Strawberry Green Tea | Teamonk | 0.69619 |

</details>


### Secondary observations

Not part of Fix 1, but visible in these runs and worth recording:

* **Mode 5 saturates under `sigmoid` normalization at weight 1.0.** Q2 config (a) returned five
  results all scoring `0.999842`, and Q4 config (a) returned `1.0, 1.0, 1.0, 0.999999, 0.999999`.
  Raising a weight from 0.5 to 1.0 pushes the sigmoid into its flat region, so the scores stop
  discriminating entirely. This strengthens rec **L2.5** (score normalization contract): the fix
  makes the weights functional, which in turn makes mode 5's normalization problem easier to hit.
* **Mode 4's scores scale with the weights rather than being normalized** — `0.0164` at 50/50 versus
  `0.0328` at 1.0/1.0 for the same ordering on Q2. Confirms the raw-RRF observation in the summary.
* **`total_results` remains unreliable** (rec **L2.4**): mode 4 and mode 5 both report `200` for Q2
  regardless of weights, and mode 5 reported a stable `271` for Q4 across all four configurations
  in this run — the 271/272 flapping recorded in the original baseline did not reproduce here, so
  it is intermittent rather than weight-related.
* Latency is unchanged by the fix, as expected: mode 4 ranged 655–850 ms and mode 5 646–774 ms,
  both consistent with the original baseline's averages (798 ms and 719 ms).

---

## Post-fix verification — Fix 2 (brand matching asymmetry)

Appended **2026-09-14**, after applying Fix 2 from
[`docs/recommendations-pre-refactor.md`](recommendations-pre-refactor.md) (rec **L2.2**). Nothing
above this heading has been modified.

### What changed

Brand Amplification rules were matched against `brand` with exact equality, e.g.
`{"$eq": ["$brand", brand]}` in `vector_pipeline.py:74`, `hybrid_rrf_pipeline.py:81` and
`hybrid_score_fusion_pipeline.py:90`, plus an exact `$in` for the `isBoosted` flag in
`text_pipeline.py:199-204`. Because **38 brands covering 288 documents carry stray leading or
trailing whitespace**, a rule sent as the trimmed `"Aroma Magic"` could never match the stored
`'Aroma Magic '`.

All four comparisons (brand *and* category, plus the `isBoosted` reconstruction) now normalize both
sides via a local `_norm_field()` helper — `$toLower` of `$trim` of `$ifNull` on the document side,
`.strip().lower()` on the rule side. **Mode 2's matching mechanism was deliberately left alone**:
its `should` clauses use the analyzed `text` operator, which already tolerated the whitespace. Only
its `isBoosted` flag was inconsistent, and that is what was corrected.

### Method

Same harness and fixed parameters as the baseline: `storeObjectId = 684aa28064ff7c785a568ae7`
(`store-030`), `page = 1`, boost level 1, one discarded warm-up then 2 measured reps. Read-only —
`POST /api/v1/search` only, no writes, no DDL.

**Unlike Fix 1, the pre-fix state could not be reconstructed after the change**, so the service was
run once with the original code to capture a genuine BEFORE pass, then restarted with the fix for
the AFTER pass. Both passes are real measurements.

Query selection: **`face wash`** matches 107 documents in this store, of which only **7 are Aroma
Magic** — the brand is a minority of the result set, so a boost is observable rather than
self-fulfilling. Each case was additionally run at `page_size=50` to census `isBoosted` across a
wider page, since a level-1 boost does not always move a document into the top 5.

### Headline result — `isBoosted` census over a 50-document page

| Test | Mode | isBoosted BEFORE | isBoosted AFTER | target-brand docs in page | all target docs flagged? |
|---|---|---|---|---|---|
| A | mode 2 — $search | 0 | **14** | 14 | ✅ yes |
| A | mode 3 — $vectorSearch | 0 | **13** | 13 | ✅ yes |
| A | mode 4 — $rankFusion | 0 | **7** | 7 | ✅ yes |
| A | mode 5 — $scoreFusion | 0 | **9** | 9 | ✅ yes |
| B | mode 2 — $search | 0 | **14** | 14 | ✅ yes |
| B | mode 3 — $vectorSearch | 0 | **13** | 13 | ✅ yes |
| B | mode 4 — $rankFusion | 0 | **7** | 7 | ✅ yes |
| B | mode 5 — $scoreFusion | 0 | **9** | 9 | ✅ yes |
| C | mode 2 — $search | 31 | **31** | 31 | ✅ yes |
| C | mode 3 — $vectorSearch | 39 | **39** | 39 | ✅ yes |
| C | mode 4 — $rankFusion | 30 | **30** | 30 | ✅ yes |
| C | mode 5 — $scoreFusion | 37 | **37** | 37 | ✅ yes |
| D | mode 2 — $search | 0 | **0** | 0 | — |
| D | mode 3 — $vectorSearch | 0 | **0** | 0 | — |
| D | mode 4 — $rankFusion | 0 | **0** | 0 | — |
| D | mode 5 — $scoreFusion | 0 | **0** | 0 | — |

**Verdict: hypothesis confirmed.** For the padded brand (tests A and B) amplification produced
**zero** boosted documents in all four modes before the fix, despite 7–14 Aroma Magic documents
sitting in the returned page. After the fix every one of those documents is boosted, in every mode,
for both the brand-only and the brand+category rule form.

### Did the no-regression case hold?

Separating *ranking changes* from *score jitter*, since `$vectorSearch` ANN retrieval and
`$scoreFusion` are not bit-reproducible between runs (already documented in the original baseline):

| Test | Mode | same products, same order? | max abs score delta |
|---|---|---|---|
| A | mode 2 — $search | ✅ yes | 0.000000 |
| A | mode 3 — $vectorSearch | changed | _n/a — order changed_ |
| A | mode 4 — $rankFusion | changed | _n/a — order changed_ |
| A | mode 5 — $scoreFusion | changed | _n/a — order changed_ |
| B | mode 2 — $search | ✅ yes | 0.000000 |
| B | mode 3 — $vectorSearch | changed | _n/a — order changed_ |
| B | mode 4 — $rankFusion | changed | _n/a — order changed_ |
| B | mode 5 — $scoreFusion | changed | _n/a — order changed_ |
| C | mode 2 — $search | ✅ yes | 0.000000 |
| C | mode 3 — $vectorSearch | ✅ yes | 0.000344 |
| C | mode 4 — $rankFusion | ✅ yes | 0.000000 |
| C | mode 5 — $scoreFusion | ✅ yes | 0.000000 |
| D | mode 2 — $search | ✅ yes | 0.000000 |
| D | mode 3 — $vectorSearch | ✅ yes | 0.000000 |
| D | mode 4 — $rankFusion | ✅ yes | 0.000000 |
| D | mode 5 — $scoreFusion | ✅ yes | 0.000023 |

* **Test C (`Teamonk`, unpadded) — no regression.** Product order is byte-identical in all four
  modes. Mode 3 shows a 3.4e-4 score delta and mode 5's control a 2.3e-5 delta; both are
  run-to-run ANN/fusion variance, not effects of the fix — for an unpadded brand the normalized
  comparison is logically equivalent to the old exact one. `isBoosted` counts are identical
  (31/39/30/37 before and after).
* **Test D (control, no amplification) — no regression.** Order identical in all four modes, and
  with no rules the changed code path is not even reached (empty `$switch` branches, empty `$in`
  lists).
* **Tests A and B — order changed in modes 3, 4 and 5, as intended**: the boost now actually
  applies. Mode 2's order is unchanged with only the flag flipping — see below.

### The mode 2 finding — a measured confirmation of the L2.2 diagnosis

Mode 2's ranking **was already being boosted** before the fix, while its `isBoosted` flag reported
`false` for every one of those documents. Compare test A against the unamplified control D in the
BEFORE pass:

| Rank | Control D (no amplification) | Test A BEFORE (rule active, pre-fix) | flag |
|---|---|---|---|
| 1 | Acne Clearing Face Wash (Qraa Men) | Face Wash - Lavender (Aroma Magic ) | **false** ← wrong |
| 2 | Foaming Face Wash (Clean & Clear) | Face Wash - Grapefruit (Aroma Magic ) | **false** ← wrong |
| 3 | Foaming Face Wash (Clean & Clear) | Face Wash - Strawberry (Aroma Magic ) | **false** ← wrong |
| 4 | Face Wash - Lavender (Aroma Magic ) | Face Wash - White Tea & Chamomile (Aroma Magic ) | **false** ← wrong |
| 5 | Face Wash - Grapefruit (Aroma Magic ) | Face Wash - Activated Bamboo Charcoal (Aroma Magic ) | **false** ← wrong |

Aroma Magic occupied ranks 4–5 unamplified and **ranks 1–5 with the rule active** — the analyzed
`text` clause matched the padded brand correctly — yet all five were reported `isBoosted: false`.
Post-fix the ranking is unchanged (identical products, identical scores, delta 0.000000) and all
five are correctly flagged `true`. This is exactly the asymmetry L2.2 predicted: **mode 2 boosted
without saying so, modes 3–5 said nothing because they never boosted at all.**

### Test A — padded brand, brand-only rule

Query `face wash` · rule `[{"name": "Aroma Magic", "boostLevel": 1}]`

**mode 2 — $search** — app 309.7 ms, total_results 1606

| # | BEFORE — productName (brand) | isBoosted | AFTER — productName (brand) | isBoosted |
|---|---|---|---|---|
| 1 | Face Wash - Lavender (Aroma Magic ) | false | Face Wash - Lavender (Aroma Magic ) | **true** |
| 2 | Face Wash - Grapefruit (Aroma Magic ) | false | Face Wash - Grapefruit (Aroma Magic ) | **true** |
| 3 | Face Wash - Strawberry (Aroma Magic ) | false | Face Wash - Strawberry (Aroma Magic ) | **true** |
| 4 | Face Wash - White Tea & Chamomile (Aroma Magic ) | false | Face Wash - White Tea & Chamomile (Aroma Magic ) | **true** |
| 5 | Face Wash - Activated Bamboo Charcoal (Aroma Magic ) | false | Face Wash - Activated Bamboo Charcoal (Aroma Magic ) | **true** |

**mode 3 — $vectorSearch** — app 605.6 ms, total_results 200

| # | BEFORE — productName (brand) | isBoosted | AFTER — productName (brand) | isBoosted |
|---|---|---|---|---|
| 1 | Foaming Face Wash (Clean & Clear) | false | Face Wash - White Tea & Chamomile, Everyday Pollution Defence, All Skin Types, No Chemicals, Paraben Free (Aroma Magic ) | **true** |
| 2 | Face Wash - White Tea & Chamomile, Everyday Pollution Defence, All Skin Types, No Chemicals, Paraben Free (Aroma Magic ) | false | Face Wash - Activated Bamboo Charcoal (Aroma Magic ) | **true** |
| 3 | Face Wash - Charcoal, Cleanse, Refresh, Illuminate, Sulfate & Paraben Free (Fizzy Fern) | false | Face Wash - White Tea & Chamomile (Aroma Magic ) | **true** |
| 4 | Pure & Gentle Daily Cleansing Facewash - Ultra Mild, 98% Pure Glycerine (Pears) | false | Face Wash - Lavender (Aroma Magic ) | **true** |
| 5 | Foaming Face Wash (Clean & Clear) | false | Face Wash - Strawberry (Aroma Magic ) | **true** |

**mode 4 — $rankFusion** — app 913.6 ms, total_results 1608

| # | BEFORE — productName (brand) | isBoosted | AFTER — productName (brand) | isBoosted |
|---|---|---|---|---|
| 1 | Foaming Face Wash (Clean & Clear) | false | Foaming Face Wash (Clean & Clear) | false |
| 2 | Foaming Face Wash (Clean & Clear) | false | Face Wash - Lavender (Aroma Magic ) | **true** |
| 3 | Face Wash - Lavender (Aroma Magic ) | false | Face Wash - Strawberry (Aroma Magic ) | **true** |
| 4 | Face Wash - Strawberry (Aroma Magic ) | false | Foaming Face Wash (Clean & Clear) | false |
| 5 | Face Wash - Charcoal, Cleanse, Refresh, Illuminate, Sulfate & Paraben Free (Fizzy Fern) | false | Face Wash - Charcoal, Cleanse, Refresh, Illuminate, Sulfate & Paraben Free (Fizzy Fern) | false |

**mode 5 — $scoreFusion** — app 697.2 ms, total_results 294

| # | BEFORE — productName (brand) | isBoosted | AFTER — productName (brand) | isBoosted |
|---|---|---|---|---|
| 1 | Foaming Face Wash (Clean & Clear) | false | Face Wash - White Tea & Chamomile, Everyday Pollution Defence, All Skin Types, No Chemicals, Paraben Free (Aroma Magic ) | **true** |
| 2 | Face Wash - White Tea & Chamomile, Everyday Pollution Defence, All Skin Types, No Chemicals, Paraben Free (Aroma Magic ) | false | Face Wash - Activated Bamboo Charcoal (Aroma Magic ) | **true** |
| 3 | Face Wash - Charcoal, Cleanse, Refresh, Illuminate, Sulfate & Paraben Free (Fizzy Fern) | false | Face Wash - White Tea & Chamomile (Aroma Magic ) | **true** |
| 4 | Foaming Face Wash (Clean & Clear) | false | Face Wash - Lavender (Aroma Magic ) | **true** |
| 5 | Face Wash - Activated Bamboo Charcoal (Aroma Magic ) | false | Face Wash - Strawberry (Aroma Magic ) | **true** |

### Test B — padded brand, brand+category rule

Query `face wash` · rule `[{"name": "Aroma Magic", "boostLevel": 1, "categories": ["Beauty & Hygiene"]}]`

**mode 2 — $search** — app 310.4 ms, total_results 1606

| # | BEFORE — productName (brand) | isBoosted | AFTER — productName (brand) | isBoosted |
|---|---|---|---|---|
| 1 | Face Wash - Lavender (Aroma Magic ) | false | Face Wash - Lavender (Aroma Magic ) | **true** |
| 2 | Face Wash - Grapefruit (Aroma Magic ) | false | Face Wash - Grapefruit (Aroma Magic ) | **true** |
| 3 | Face Wash - Strawberry (Aroma Magic ) | false | Face Wash - Strawberry (Aroma Magic ) | **true** |
| 4 | Face Wash - White Tea & Chamomile (Aroma Magic ) | false | Face Wash - White Tea & Chamomile (Aroma Magic ) | **true** |
| 5 | Face Wash - Activated Bamboo Charcoal (Aroma Magic ) | false | Face Wash - Activated Bamboo Charcoal (Aroma Magic ) | **true** |

**mode 3 — $vectorSearch** — app 609.2 ms, total_results 200

| # | BEFORE — productName (brand) | isBoosted | AFTER — productName (brand) | isBoosted |
|---|---|---|---|---|
| 1 | Foaming Face Wash (Clean & Clear) | false | Face Wash - White Tea & Chamomile, Everyday Pollution Defence, All Skin Types, No Chemicals, Paraben Free (Aroma Magic ) | **true** |
| 2 | Face Wash - White Tea & Chamomile, Everyday Pollution Defence, All Skin Types, No Chemicals, Paraben Free (Aroma Magic ) | false | Face Wash - Activated Bamboo Charcoal (Aroma Magic ) | **true** |
| 3 | Face Wash - Charcoal, Cleanse, Refresh, Illuminate, Sulfate & Paraben Free (Fizzy Fern) | false | Face Wash - White Tea & Chamomile (Aroma Magic ) | **true** |
| 4 | Pure & Gentle Daily Cleansing Facewash - Ultra Mild, 98% Pure Glycerine (Pears) | false | Face Wash - Lavender (Aroma Magic ) | **true** |
| 5 | Foaming Face Wash (Clean & Clear) | false | Face Wash - Strawberry (Aroma Magic ) | **true** |

**mode 4 — $rankFusion** — app 952.0 ms, total_results 1608

| # | BEFORE — productName (brand) | isBoosted | AFTER — productName (brand) | isBoosted |
|---|---|---|---|---|
| 1 | Foaming Face Wash (Clean & Clear) | false | Foaming Face Wash (Clean & Clear) | false |
| 2 | Foaming Face Wash (Clean & Clear) | false | Face Wash - Lavender (Aroma Magic ) | **true** |
| 3 | Face Wash - Lavender (Aroma Magic ) | false | Foaming Face Wash (Clean & Clear) | false |
| 4 | Face Wash - Strawberry (Aroma Magic ) | false | Face Wash - Strawberry (Aroma Magic ) | **true** |
| 5 | Face Wash - Charcoal, Cleanse, Refresh, Illuminate, Sulfate & Paraben Free (Fizzy Fern) | false | Face Wash - Charcoal, Cleanse, Refresh, Illuminate, Sulfate & Paraben Free (Fizzy Fern) | false |

**mode 5 — $scoreFusion** — app 656.8 ms, total_results 294

| # | BEFORE — productName (brand) | isBoosted | AFTER — productName (brand) | isBoosted |
|---|---|---|---|---|
| 1 | Foaming Face Wash (Clean & Clear) | false | Face Wash - White Tea & Chamomile, Everyday Pollution Defence, All Skin Types, No Chemicals, Paraben Free (Aroma Magic ) | **true** |
| 2 | Face Wash - White Tea & Chamomile, Everyday Pollution Defence, All Skin Types, No Chemicals, Paraben Free (Aroma Magic ) | false | Face Wash - Activated Bamboo Charcoal (Aroma Magic ) | **true** |
| 3 | Face Wash - Charcoal, Cleanse, Refresh, Illuminate, Sulfate & Paraben Free (Fizzy Fern) | false | Face Wash - White Tea & Chamomile (Aroma Magic ) | **true** |
| 4 | Foaming Face Wash (Clean & Clear) | false | Face Wash - Lavender (Aroma Magic ) | **true** |
| 5 | Face Wash - Activated Bamboo Charcoal (Aroma Magic ) | false | Face Wash - Strawberry (Aroma Magic ) | **true** |

### Test C — no-regression, unpadded brand (Q4)

Query `green tea` · rule `[{"name": "Teamonk", "boostLevel": 1}]`

**mode 2 — $search** — app 243.5 ms, total_results 639

| # | BEFORE — productName (brand) | isBoosted | AFTER — productName (brand) | isBoosted |
|---|---|---|---|---|
| 1 | Green Tea - Zoho, Lemongrass (Teamonk) | **true** | Green Tea - Zoho, Lemongrass (Teamonk) | **true** |
| 2 | Green Tea - Ikusei, Cardamom (Teamonk) | **true** | Green Tea - Ikusei, Cardamom (Teamonk) | **true** |
| 3 | Strawberry Green Tea (Teamonk) | **true** | Strawberry Green Tea (Teamonk) | **true** |
| 4 | Nilgiri Green Tea - Taido Ginger, Easy To Digest (Teamonk) | **true** | Nilgiri Green Tea - Taido Ginger, Easy To Digest (Teamonk) | **true** |
| 5 | Avana Darjeeling Green Tea (Teamonk) | **true** | Avana Darjeeling Green Tea (Teamonk) | **true** |

**mode 3 — $vectorSearch** — app 705.1 ms, total_results 200

| # | BEFORE — productName (brand) | isBoosted | AFTER — productName (brand) | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management (Teamonk) | **true** | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management (Teamonk) | **true** |
| 2 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf (Teamonk) | **true** | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf (Teamonk) | **true** |
| 3 | Green Tea - Ikusei, Cardamom (Teamonk) | **true** | Green Tea - Ikusei, Cardamom (Teamonk) | **true** |
| 4 | Strawberry Green Tea (Teamonk) | **true** | Strawberry Green Tea (Teamonk) | **true** |
| 5 | Nilgiris Green Tea - Kozan Spearmint, Helps To Feel Relaxed & Refreshed (Teamonk) | **true** | Nilgiris Green Tea - Kozan Spearmint, Helps To Feel Relaxed & Refreshed (Teamonk) | **true** |

**mode 4 — $rankFusion** — app 892.7 ms, total_results 693

| # | BEFORE — productName (brand) | isBoosted | AFTER — productName (brand) | isBoosted |
|---|---|---|---|---|
| 1 | Green Tea - Ikusei, Cardamom (Teamonk) | **true** | Green Tea - Ikusei, Cardamom (Teamonk) | **true** |
| 2 | Strawberry Green Tea (Teamonk) | **true** | Strawberry Green Tea (Teamonk) | **true** |
| 3 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf (Teamonk) | **true** | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf (Teamonk) | **true** |
| 4 | Green Tea - With Peppermint Leaves, Grown Fresh (Wingreens Farms) | false | Green Tea - With Peppermint Leaves, Grown Fresh (Wingreens Farms) | false |
| 5 | Svastha Green Tea - Promotes Overall Well-Being (Kapiva) | false | Svastha Green Tea - Promotes Overall Well-Being (Kapiva) | false |

**mode 5 — $scoreFusion** — app 741.4 ms, total_results 271

| # | BEFORE — productName (brand) | isBoosted | AFTER — productName (brand) | isBoosted |
|---|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management (Teamonk) | **true** | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management (Teamonk) | **true** |
| 2 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf (Teamonk) | **true** | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf (Teamonk) | **true** |
| 3 | Green Tea - Ikusei, Cardamom (Teamonk) | **true** | Green Tea - Ikusei, Cardamom (Teamonk) | **true** |
| 4 | Strawberry Green Tea (Teamonk) | **true** | Strawberry Green Tea (Teamonk) | **true** |
| 5 | Nilgiris Green Tea - Kozan Spearmint, Helps To Feel Relaxed & Refreshed (Teamonk) | **true** | Nilgiris Green Tea - Kozan Spearmint, Helps To Feel Relaxed & Refreshed (Teamonk) | **true** |

### Test D — control, no amplification

Query `face wash` · rule _none_

**mode 2 — $search** — app 381.9 ms, total_results 1606

| # | BEFORE — productName (brand) | isBoosted | AFTER — productName (brand) | isBoosted |
|---|---|---|---|---|
| 1 | Acne Clearing Face Wash (Qraa Men) | false | Acne Clearing Face Wash (Qraa Men) | false |
| 2 | Foaming Face Wash (Clean & Clear) | false | Foaming Face Wash (Clean & Clear) | false |
| 3 | Foaming Face Wash (Clean & Clear) | false | Foaming Face Wash (Clean & Clear) | false |
| 4 | Face Wash - Lavender (Aroma Magic ) | false | Face Wash - Lavender (Aroma Magic ) | false |
| 5 | Face Wash - Grapefruit (Aroma Magic ) | false | Face Wash - Grapefruit (Aroma Magic ) | false |

**mode 3 — $vectorSearch** — app 779.2 ms, total_results 200

| # | BEFORE — productName (brand) | isBoosted | AFTER — productName (brand) | isBoosted |
|---|---|---|---|---|
| 1 | Foaming Face Wash (Clean & Clear) | false | Foaming Face Wash (Clean & Clear) | false |
| 2 | Face Wash - White Tea & Chamomile, Everyday Pollution Defence, All Skin Types, No Chemicals, Paraben Free (Aroma Magic ) | false | Face Wash - White Tea & Chamomile, Everyday Pollution Defence, All Skin Types, No Chemicals, Paraben Free (Aroma Magic ) | false |
| 3 | Face Wash - Charcoal, Cleanse, Refresh, Illuminate, Sulfate & Paraben Free (Fizzy Fern) | false | Face Wash - Charcoal, Cleanse, Refresh, Illuminate, Sulfate & Paraben Free (Fizzy Fern) | false |
| 4 | Pure & Gentle Daily Cleansing Facewash - Ultra Mild, 98% Pure Glycerine (Pears) | false | Pure & Gentle Daily Cleansing Facewash - Ultra Mild, 98% Pure Glycerine (Pears) | false |
| 5 | Foaming Face Wash (Clean & Clear) | false | Foaming Face Wash (Clean & Clear) | false |

**mode 4 — $rankFusion** — app 971.0 ms, total_results 1608

| # | BEFORE — productName (brand) | isBoosted | AFTER — productName (brand) | isBoosted |
|---|---|---|---|---|
| 1 | Foaming Face Wash (Clean & Clear) | false | Foaming Face Wash (Clean & Clear) | false |
| 2 | Foaming Face Wash (Clean & Clear) | false | Foaming Face Wash (Clean & Clear) | false |
| 3 | Face Wash - Lavender (Aroma Magic ) | false | Face Wash - Lavender (Aroma Magic ) | false |
| 4 | Face Wash - Strawberry (Aroma Magic ) | false | Face Wash - Strawberry (Aroma Magic ) | false |
| 5 | Face Wash - Charcoal, Cleanse, Refresh, Illuminate, Sulfate & Paraben Free (Fizzy Fern) | false | Face Wash - Charcoal, Cleanse, Refresh, Illuminate, Sulfate & Paraben Free (Fizzy Fern) | false |

**mode 5 — $scoreFusion** — app 748.4 ms, total_results 294

| # | BEFORE — productName (brand) | isBoosted | AFTER — productName (brand) | isBoosted |
|---|---|---|---|---|
| 1 | Foaming Face Wash (Clean & Clear) | false | Foaming Face Wash (Clean & Clear) | false |
| 2 | Face Wash - White Tea & Chamomile, Everyday Pollution Defence, All Skin Types, No Chemicals, Paraben Free (Aroma Magic ) | false | Face Wash - White Tea & Chamomile, Everyday Pollution Defence, All Skin Types, No Chemicals, Paraben Free (Aroma Magic ) | false |
| 3 | Face Wash - Charcoal, Cleanse, Refresh, Illuminate, Sulfate & Paraben Free (Fizzy Fern) | false | Face Wash - Charcoal, Cleanse, Refresh, Illuminate, Sulfate & Paraben Free (Fizzy Fern) | false |
| 4 | Foaming Face Wash (Clean & Clear) | false | Foaming Face Wash (Clean & Clear) | false |
| 5 | Face Wash - Activated Bamboo Charcoal (Aroma Magic ) | false | Face Wash - Activated Bamboo Charcoal (Aroma Magic ) | false |

### Secondary observations

* **Mode 3 is highly sensitive even at boost level 1.** In test A, a +0.05 factor moved Aroma Magic
  from one slot in the top 5 to **all five**, displacing the previous rank-1 `Foaming Face Wash`
  (Clean & Clear) entirely. The brand's documents were clustered just below the top, so a 5% lift
  cleared them all past it. Same mechanism as the Q2/level-3 failure in the original baseline, and
  further evidence for rec **L2.1** (bounded amplification) — now that the boost reaches the 288
  previously-unmatched documents, the magnitude problem applies to them too.
* **Mode 4 remains the least responsive to amplification**: only 2 of its top 5 are boosted in
  test A, versus 5 of 5 in modes 2, 3 and 5 — consistent with post-fusion multiplication on raw RRF
  scores being a weaker lever.
* **The brand+category rule (test B) behaved identically to brand-only (test A)** in every mode and
  every count. Expected here, since all Aroma Magic products in this store are in
  `Beauty & Hygiene`, so the category predicate excludes nothing — it confirms the category
  comparison did not *break*, but does not independently exercise it. A brand spanning multiple
  categories would be needed for that.
* **The underlying data is untouched.** The 38 padded brand values remain in staging and still
  surface in API responses as `'Aroma Magic '`. The fix makes matching tolerant; it does not clean
  the catalogue (that would require a write).
* Latency is unaffected, as expected for an expression-level change: mode 2 244–382 ms, mode 3
  606–779 ms, mode 4 893–971 ms, mode 5 657–748 ms — all within the original baseline's ranges.

---

## Post-fix verification — Fix 3 (vector candidate ratio)

Appended **2026-09-15**, after applying Fix 3 from
[`docs/recommendations-pre-refactor.md`](recommendations-pre-refactor.md) (rec **L1.2**). Nothing
above this heading has been modified.

### What changed

`vector_pipeline.py:105-106` hard-coded `num_candidates: int = 200` alongside
`knn_limit: int = 200` — a 1:1 ratio, the degenerate case for HNSW, where the graph search
explores no more candidates than it returns. Now:

```python
num_candidates: int = 500
knn_limit: Optional[int] = None      # derived below
...
if knn_limit is None:
    knn_limit = max(50, limit * 2)   # tracks the requested page size
num_candidates = max(num_candidates, knn_limit)
```

`limit` is the caller's `page_size`, so at the baseline's `page_size=5` the effective parameters
move from `numCandidates=200, limit=200` to `numCandidates=500, limit=50`. The existing log line
now reports both effective values. No other behaviour was touched — in particular
`total_results` semantics were left alone on purpose (rec **L2.4**).

### Method

Mode 3 only. Same fixed parameters as the baseline: `storeObjectId = 684aa28064ff7c785a568ae7`
(`store-030`), `page = 1`, `page_size = 5`, one discarded warm-up then 2 measured reps.
A genuine BEFORE pass was captured with the pre-fix code, then the service was restarted with the
fix for the AFTER pass. Read-only throughout — `aggregate` and `explain` only.

The BEFORE pass reproduced the original baseline's mode 3 top-5 for Q2, Q4 and Q5 exactly,
confirming that Fixes 1 and 2 did not disturb this mode.

### Headline result — accuracy unchanged, DB cost down

| Case | top-5 identical? | DB ms | APP ms | total_results | docsExamined / keysExamined / nReturned |
|---|---|---|---|---|---|
| Q2 partial / misspelled | ✅ **yes, byte-identical** | 278.0 → **255.3** | 628.7 → 659.3 | 200 → **50** | 200 → **50** (all three counters move together) |
| Q4 boosted-brand term | ✅ **yes, byte-identical** | 272.0 → **210.1** | 669.5 → 650.6 | 200 → **50** | 200 → **50** (all three counters move together) |
| Q4 boosted-brand term + Teamonk L1 | ✅ **yes, byte-identical** | 279.9 → **269.0** | 725.8 → 643.0 | 200 → **50** | 200 → **50** (all three counters move together) |
| Q5 semantic, lexically diff. | ✅ **yes, byte-identical** | 309.0 → **271.8** | 723.2 → 642.4 | 200 → **50** | 200 → **50** (all three counters move together) |

Mean DB time **284.7 → 251.6 ms (-11.7%)**; mean APP time 686.8 → 648.8 ms (-5.5%). Index used is
`product_text_vector_index` before and after; as with all `$vectorSearch` explains there is no
classic `IXSCAN`/`COLLSCAN` stage, and `docsExamined`/`keysExamined`/`nReturned` all equal the
retrieval depth.

**The top 5 did not change for any query — not one position, not one score digit.** The recall
half of the hypothesis is *not* confirmed at this catalogue size. See the control experiment below.

### Control experiment — was the over-fetch itself worth anything?

The before/after comparison changes two things at once (`numCandidates` 200→500 *and* retrieval
depth 200→50), so it cannot attribute the DB saving. This control holds `knn_limit` fixed at 50 and
varies `numCandidates` alone, comparing the full returned top-50 by document id:

| Query | nc=200 vs nc=500 | nc=500 vs nc=2000 | documents that appear only at higher nc |
|---|---|---|---|
| Q2 | identical set **and** order | identical set **and** order | 0 at nc=500, 0 at nc=2000 |
| Q4 | identical set **and** order | identical set **and** order | 0 at nc=500, 0 at nc=2000 |
| Q5 | identical set **and** order | identical set **and** order | 0 at nc=500, 0 at nc=2000 |

**At this data size the ANN search is already effectively exact.** Raising `numCandidates` from 200
to 500 — or even to 2000, a 40:1 ratio — returns the identical 50 documents in the identical order
for all three queries. The store pre-filter narrows the candidate space to the 3 914 products
stocked by `store-030`, and HNSW over ~4 k vectors finds the true nearest neighbours regardless of
the candidate budget. There was no lost recall to recover.

Control timings (`knn_limit=50`, median of 2, `page_size=50` so not directly comparable to the
table above): Q2 264.8 / 292.7 / 269.7 ms, Q4 270.4 / 334.7 / 322.1 ms, Q5 334.3 / 326.6 / 322.9 ms
at nc = 200 / 500 / 2000. If anything, a larger candidate pool costs slightly *more* here for no
benefit — so **the measured DB saving comes from the reduced retrieval depth (200 → 50 documents
flowing through `$setWindowFields`, `$sort` and `$facet`), not from the over-fetch.**

### Did the larger pool surface more Teamonk products for amplification?

| Metric | BEFORE | AFTER |
|---|---|---|
| Teamonk documents in the returned top-50, Q4 no amplification | 35 | 35 |
| Teamonk documents flagged `isBoosted`, Q4 + level-1 rule | 39 | 39 |

**No — unchanged (35 and 39).** This followed from the control result: the top-50 by score is the
same set of documents, so the same Teamonk products are available for the boost to act on. The
expectation in rec L1.2 that a larger candidate pool would widen the amplification surface does not
hold at this catalogue size.

### The `total_results` change — documented, not fixed

`total_results` fell from **200 to 50** for every mode 3 query, exactly as anticipated. The `$facet`
`count` branch counts the candidate window, so it has always reported `knn_limit` rather than a
match count; the fix changes `knn_limit`, and the reported number follows. This is the same defect
already recorded in the original baseline summary and tracked as rec **L2.4** — it was deliberately
not addressed here.

Two consequences worth recording:

* `total_pages` at `page_size=5` drops from 40 to 10. Neither figure was ever meaningful, but the
  advertised depth is now shallower.
* **Deep pagination capacity is genuinely reduced at large page sizes.** At `page_size=50` the
  derived `knn_limit` is `max(50, 100) = 100`, against a flat 200 before. A client paging deeply
  through a large page size now exhausts the candidate window sooner. This is a real trade-off of
  deriving depth from page size, and it strengthens the case for resolving L2.4 alongside any
  further tuning here.

### Q2 partial / misspelled — `tomatoe`

no amplification · BEFORE `numCandidates=200, limit=200` → AFTER `numCandidates=500, limit=50`

| # | BEFORE — productName (brand) | score | AFTER — productName (brand) | score | isBoosted |
|---|---|---|---|---|---|
| 1 | Tomato - Local (Loose) (Fresho) | 1.0 | Tomato - Local (Loose) (Fresho) | 1.0 | false |
| 2 | Tomato - Local (Loose) (Fresho) | 0.999517 | Tomato - Local (Loose) (Fresho) | 0.999517 | false |
| 3 | Tomato - Hybrid (Loose) (Fresho) | 0.993149 | Tomato - Hybrid (Loose) (Fresho) | 0.993149 | false |
| 4 | Tomato - Hybrid (Loose) (Fresho) | 0.992756 | Tomato - Hybrid (Loose) (Fresho) | 0.992756 | false |
| 5 | Rings - Tomato Twist (Too Yumm!) | 0.978213 | Rings - Tomato Twist (Too Yumm!) | 0.978213 | false |

`explain` BEFORE: docsExamined 200, keysExamined 200, nReturned 200, index `product_text_vector_index` · AFTER: docsExamined 50, keysExamined 50, nReturned 50, index `product_text_vector_index`

### Q4 boosted-brand term — `green tea`

no amplification · BEFORE `numCandidates=200, limit=200` → AFTER `numCandidates=500, limit=50`

| # | BEFORE — productName (brand) | score | AFTER — productName (brand) | score | isBoosted |
|---|---|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management (Teamonk) | 1.0 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management (Teamonk) | 1.0 | false |
| 2 | Green Tea Mugs - Multicolour (Hot Muggs) | 0.998376 | Green Tea Mugs - Multicolour (Hot Muggs) | 0.998376 | false |
| 3 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf (Teamonk) | 0.995567 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf (Teamonk) | 0.995567 | false |
| 4 | Green Tea - Ikusei, Cardamom (Teamonk) | 0.993504 | Green Tea - Ikusei, Cardamom (Teamonk) | 0.993504 | false |
| 5 | Strawberry Green Tea (Teamonk) | 0.993237 | Strawberry Green Tea (Teamonk) | 0.993237 | false |

`explain` BEFORE: docsExamined 200, keysExamined 200, nReturned 200, index `product_text_vector_index` · AFTER: docsExamined 50, keysExamined 50, nReturned 50, index `product_text_vector_index`

### Q4 boosted-brand term + Teamonk L1 — `green tea`

level-1 rule on `Teamonk` · BEFORE `numCandidates=200, limit=200` → AFTER `numCandidates=500, limit=50`

| # | BEFORE — productName (brand) | score | AFTER — productName (brand) | score | isBoosted |
|---|---|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management (Teamonk) | 1.0 | Nilgiri Green Tea - Yakuso Tulsi, May Help In Weight Management (Teamonk) | 1.0 | **true** |
| 2 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf (Teamonk) | 0.995567 | Nilgiri Green Tea - Taizen Cinnamon, 100% Natural, Loose Leaf (Teamonk) | 0.995567 | **true** |
| 3 | Green Tea - Ikusei, Cardamom (Teamonk) | 0.993504 | Green Tea - Ikusei, Cardamom (Teamonk) | 0.993504 | **true** |
| 4 | Strawberry Green Tea (Teamonk) | 0.993237 | Strawberry Green Tea (Teamonk) | 0.993237 | **true** |
| 5 | Nilgiris Green Tea - Kozan Spearmint, Helps To Feel Relaxed & Refreshed (Teamonk) | 0.993013 | Nilgiris Green Tea - Kozan Spearmint, Helps To Feel Relaxed & Refreshed (Teamonk) | 0.993013 | **true** |

`explain` BEFORE: docsExamined 200, keysExamined 200, nReturned 200, index `product_text_vector_index` · AFTER: docsExamined 50, keysExamined 50, nReturned 50, index `product_text_vector_index`

### Q5 semantic, lexically diff. — `drink that helps me relax before bed`

no amplification · BEFORE `numCandidates=200, limit=200` → AFTER `numCandidates=500, limit=50`

| # | BEFORE — productName (brand) | score | AFTER — productName (brand) | score | isBoosted |
|---|---|---|---|---|---|
| 1 | Melatonin + Tagara Spray - Mint Flavour, Natural Sleep Support (Carbamide Forte) | 1.0 | Melatonin + Tagara Spray - Mint Flavour, Natural Sleep Support (Carbamide Forte) | 1.0 | false |
| 2 | Effervescent Tablets - Melatonin Sleep, Enhances Focus, Stress Relief, Cranberry Flavour (Suprfit) | 0.989389 | Effervescent Tablets - Melatonin Sleep, Enhances Focus, Stress Relief, Cranberry Flavour (Suprfit) | 0.989389 | false |
| 3 | Natural Sleep Aid Supplement Tablets - Helps To Relax (Himalayan Organics) | 0.983254 | Natural Sleep Aid Supplement Tablets - Helps To Relax (Himalayan Organics) | 0.983254 | false |
| 4 | Nilgiris Green Tea - Anicca Chamomile, Helps To Feel Relaxed & Calm (Teamonk) | 0.982318 | Nilgiris Green Tea - Anicca Chamomile, Helps To Feel Relaxed & Calm (Teamonk) | 0.982318 | false |
| 5 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine (Booch) | 0.976276 | Non-Alcoholic Beverage - Low Calorie, Healthy Drink With L-Theanine (Booch) | 0.976276 | false |

`explain` BEFORE: docsExamined 200, keysExamined 200, nReturned 200, index `product_text_vector_index` · AFTER: docsExamined 50, keysExamined 50, nReturned 50, index `product_text_vector_index`

### Secondary observations

* **The fix is still defensible as a forward-looking change, but it is not the accuracy fix L1.2
  predicted.** The 1:1 ratio was a genuine anti-pattern and would degrade recall on a catalogue
  large enough for ANN approximation to bite; at 6 143 documents (3 914 in-store) it simply never
  did. The honest summary is: **no measured accuracy change, ~12% DB-time reduction, and a**
  **`total_results` regression in appearance.**
* **`numCandidates=500` is currently pure overhead** — the control shows it buys nothing and costs
  slightly more than 200. Deriving it from `knn_limit` (e.g. `max(200, knn_limit * 10)`) would keep
  the healthy ratio without over-paying at small scale. Not changed here, as it is outside the
  literal scope of this fix.
* **Q2 and Q5 were chosen as the recall-sensitive queries and both came back unchanged**, which is
  the strongest available evidence that mode 3's failures (e.g. the Q2 level-3 boost inversion in
  the original baseline) are *not* retrieval failures. They are scoring and amplification-magnitude
  failures, which is rec **L2.1**. This fix therefore does not move the needle on them.
* The `_norm_field` helper added by Fix 2 is present in the same file; the two fixes are
  independent and the diff for this entry covers only the candidate-ratio hunks.

---

## Post-fix verification — Fix 4 (aboutTheProduct indexed) + boost sweep

Appended **2026-09-15**, after Florencia rebuilt `product_atlas_search` in the Atlas console with
`aboutTheProduct: {"type": "string"}` added. Confirmed read-only before measuring: index
`status: READY`, `queryable: true`, six mapped fields, `dynamic: false`.

**Two separate things are recorded here.** The index mapping is now **live and permanent**. The
boost values 1.0 and 0.6 were **temporary local code edits**, reverted immediately after
measurement — the committed code still carries **1.8**, and the final value is an open decision
(tracked as Fix #5).

### Method

Same fixed parameters as every previous pass: store `684aa28064ff7c785a568ae7` (`store-030`),
`page = 1`, `page_size = 5`, no Brand Amplification, hybrid weights 0.5/0.5, one discarded warm-up
then 2 measured reps. Read-only: `POST /api/v1/search` only.

For each boost value the `aboutTheProduct` clause was patched in all three text-scoring builders
(`text_pipeline.py:158`, `hybrid_rrf_pipeline.py:176-177`,
`hybrid_score_fusion_pipeline.py:200-201`), the service restarted, and the queries run. Q1–Q5 at
1.8; Q1/Q3/Q5 at 1.0 and 0.6. Q2 and Q4 were run only at 1.8 as a lighter no-regression check,
since earlier fixes already cover them.

The **BEFORE** column throughout is the *original* baseline (Part C, amplification OFF) — captured
before Fixes 1–3 — because this is the first change to touch text scoring.

### Headline: recall jumped, and Q1's exact match never moved

| Query | Mode | total_results BEFORE | AFTER (index live) | rank-1 BEFORE | rank-1 AFTER @1.8 |
|---|---|---|---|---|---|
| Q1 | mode 2 | 160 | **165** | Onion | Onion |
| Q1 | mode 4 | 328 | **329** | Onion | Onion |
| Q1 | mode 5 | 328 | **329** | Onion | Onion |
| Q3 | mode 2 | 71 | **103** | Non-Alcoholic Beverage - Low Calor | Non-Alcoholic Beverage - Low Calor |
| Q3 | mode 4 | 225 | **235** | Non-Alcoholic Beverage - Low Calor | Non-Alcoholic Beverage - Low Calor |
| Q3 | mode 5 | 225 | **235** | Non-Alcoholic Beverage - Low Calor | Non-Alcoholic Beverage - Low Calor |
| Q5 | mode 2 | 1220 | **2706** | Natural Sleep Aid Supplement Table | Natural Sleep Aid Supplement Table |
| Q5 | mode 4 | 1307 | **2729** | Natural Sleep Aid Supplement Table | Natural Sleep Aid Supplement Table |
| Q5 | mode 5 | 361 | **345** | Natural Sleep Aid Supplement Table | Natural Sleep Aid Supplement Table |

Mode 2 recall: Q1 160 → 165, Q3 **71 → 103 (+45%)**, Q5 **1 220 → 2 706 (+122%)**. The field is
live and contributing. **Q1's rank 1 (`Onion`, Fresho) is unchanged in all three modes at all
three boost values** — no weak description match ever displaced the exact name match.

### Q1 `Onion` — did the exact match hold?

The guard query. A 595-character description competing with a 40-character exact name match.

**mode 2 — $search**

| # | BEFORE (pre-index) | score | @ boost 1.8 | score | @ boost 1.0 | score | @ boost 0.6 | score |
|---|---|---|---|---|---|---|---|---|
| 1 | Onion | 1.0 | Onion | 1.0 | Onion | 1.0 | Onion | 1.0 |
| 2 | Onion (Loose) | 0.939582 | Onion (Loose) | 0.954003 | Onion (Loose) | 0.948619 | Onion (Loose) | 0.945425 |
| 3 | Onion Sabudana Papad | 0.655762 | Onion Sabudana Papad | 0.898097 | Onion Sabudana Papad | 0.804752 | Onion Sabudana Papad | 0.749375 |
| 4 | Potato Crisps - Sour Cream and | 0.538016 | Onion Oil Concentrate - Anti H | 0.844584 | Onion Oil Concentrate - Anti H | 0.705349 | Potato Crisps - Sour Cream and | 0.639508 |
| 5 | Onion Oil Concentrate - Anti H | 0.480498 | Potato Crisps - Sour Cream and | 0.799476 | Potato Crisps - Sour Cream and | 0.699073 | Onion Oil Concentrate - Anti H | 0.622747 |

App latency — BEFORE 294.1 ms · 1.8: 181.4 ms · 1.0: 216.1 ms · 0.6: 287.0 ms

**mode 4 — $rankFusion**

| # | BEFORE (pre-index) | score | @ boost 1.8 | score | @ boost 1.0 | score | @ boost 0.6 | score |
|---|---|---|---|---|---|---|---|---|
| 1 | Onion | 0.016393 | Onion | 0.016393 | Onion | 0.016393 | Onion | 0.016393 |
| 2 | Onion (Loose) | 0.016129 | Onion (Loose) | 0.016129 | Onion (Loose) | 0.016129 | Onion (Loose) | 0.016129 |
| 3 | Red Onion Oil With Jojoba, Arg | 0.015512 | Red Onion Oil With Jojoba, Arg | 0.015399 | Red Onion Oil With Jojoba, Arg | 0.015399 | Red Onion Oil With Jojoba, Arg | 0.015399 |
| 4 | Onion Hair Oil With Bhringraj  | 0.015268 | Onion Oil Concentrate - Anti H | 0.015388 | Onion Oil Concentrate - Anti H | 0.015388 | Onion Hair Oil With Bhringraj  | 0.015268 |
| 5 | Onion Oil Concentrate - Anti H | 0.015268 | Onion Hair Oil With Bhringraj  | 0.015268 | Onion Hair Oil With Bhringraj  | 0.015268 | Onion Oil Concentrate - Anti H | 0.015268 |

App latency — BEFORE 768.9 ms · 1.8: 762.7 ms · 1.0: 667.6 ms · 0.6: 741.2 ms

**mode 5 — $scoreFusion**

| # | BEFORE (pre-index) | score | @ boost 1.8 | score | @ boost 1.0 | score | @ boost 0.6 | score |
|---|---|---|---|---|---|---|---|---|
| 1 | Onion | 0.852248 | Onion | 0.852259 | Onion | 0.852258 | Onion | 0.852256 |
| 2 | Onion (Loose) | 0.852136 | Onion (Loose) | 0.852158 | Onion (Loose) | 0.852155 | Onion (Loose) | 0.852152 |
| 3 | Onion Sabudana Papad | 0.842931 | Red Onion Oil With Jojoba, Arg | 0.845702 | Red Onion Oil With Jojoba, Arg | 0.845588 | Red Onion Oil With Jojoba, Arg | 0.845226 |
| 4 | Red Onion Oil With Jojoba, Arg | 0.841862 | Onion Hair Oil For Hair Growth | 0.845068 | Onion Hair Oil For Hair Growth | 0.844923 | Onion Hair Oil For Hair Growth | 0.844414 |
| 5 | Onion Oil Concentrate - Anti H | 0.841495 | Onion Hair Oil With Bhringraj  | 0.844487 | Onion Oil Concentrate - Anti H | 0.844399 | Onion Oil Concentrate - Anti H | 0.844158 |

App latency — BEFORE 747.3 ms · 1.8: 716.1 ms · 1.0: 729.9 ms · 0.6: 700.9 ms

### Q3 `beverages` — generic category term

The query most exposed to description noise: hundreds of products *mention* beverages without being one.

**mode 2 — $search**

| # | BEFORE (pre-index) | score | @ boost 1.8 | score | @ boost 1.0 | score | @ boost 0.6 | score |
|---|---|---|---|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low C | 1.0 | Non-Alcoholic Beverage - Low C | 1.0 | Non-Alcoholic Beverage - Low C | 1.0 | Non-Alcoholic Beverage - Low C | 1.0 |
| 2 | Tea | 0.228609 | Whisky Glass - Elegan | 0.502358 | Tea | 0.364644 | Tea | 0.311336 |
| 3 | Tea | 0.228609 | Tea | 0.471261 | Tea | 0.364644 | Tea | 0.311336 |
| 4 | Tea | 0.228609 | Tea | 0.471261 | Tea | 0.358676 | Tea | 0.307755 |
| 5 | Tea - Natural Care | 0.228609 | Tea | 0.460517 | Whisky Glass - Elegan | 0.279088 | Tea - Natural Care | 0.231374 |

App latency — BEFORE 239.8 ms · 1.8: 261.2 ms · 1.0: 161.3 ms · 0.6: 167.6 ms

**mode 4 — $rankFusion**

| # | BEFORE (pre-index) | score | @ boost 1.8 | score | @ boost 1.0 | score | @ boost 0.6 | score |
|---|---|---|---|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low C | 0.016261 | Non-Alcoholic Beverage - Low C | 0.016261 | Non-Alcoholic Beverage - Low C | 0.016261 | Non-Alcoholic Beverage - Low C | 0.016261 |
| 2 | Black Soft Drink - Max Taste,  | 0.016001 | Candy Coffee Mugs - Multi Colo | 0.014096 | Black Soft Drink - Max Taste,  | 0.015079 | Black Soft Drink - Max Taste,  | 0.015629 |
| 3 | Aamras Mango Fruit Juice | 0.01564 | Penguen Tea/Coffee Mug - Everg | 0.014069 | Aamras Mango Fruit Juice | 0.014719 | Aamras Mango Fruit Juice | 0.015268 |
| 4 | Cold Extracted Juice - Mixed F | 0.015417 | Double Walled Glass Water Bott | 0.01381 | Cold Extracted Juice - Mixed F | 0.014496 | Cold Extracted Juice - Mixed F | 0.015045 |
| 5 | Cold Extracted Juice - Basics, | 0.015207 | Beer Mug - Printed Clear Glass | 0.013374 | Cold Extracted Juice - Basics, | 0.014286 | Cold Extracted Juice - Basics, | 0.014835 |

App latency — BEFORE 669.2 ms · 1.8: 721.8 ms · 1.0: 714.4 ms · 0.6: 770.0 ms

**mode 5 — $scoreFusion**

| # | BEFORE (pre-index) | score | @ boost 1.8 | score | @ boost 1.0 | score | @ boost 0.6 | score |
|---|---|---|---|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low C | 0.847805 | Non-Alcoholic Beverage - Low C | 0.847803 | Non-Alcoholic Beverage - Low C | 0.847803 | Non-Alcoholic Beverage - Low C | 0.847803 |
| 2 | Black Soft Drink - Max Taste,  | 0.813571 | Whisky Glass - Elegan | 0.843139 | Tea | 0.835908 | Tea | 0.829479 |
| 3 | Aamras Mango Fruit Juice | 0.813025 | Penguen Tea/Coffee Mug - Everg | 0.841724 | Tea | 0.834518 | Tea | 0.828089 |
| 4 | Cold Extracted Juice - Mixed F | 0.812824 | Candy Coffee Mugs - Multi Colo | 0.84169 | Tea | 0.833717 | Tea | 0.827259 |
| 5 | Cold Extracted Juice - Basics, | 0.812667 | Tea | 0.841494 | Whisky Glass - Elegan | 0.824321 | Black Soft Drink - Max Taste,  | 0.812649 |

App latency — BEFORE 711.0 ms · 1.8: 720.1 ms · 1.0: 822.0 ms · 0.6: 694.7 ms

### Q5 `drink that helps me relax before bed` — the query this fix was for

Sleep/relax vocabulary lives in descriptions, not product names.

**mode 2 — $search**

| # | BEFORE (pre-index) | score | @ boost 1.8 | score | @ boost 1.0 | score | @ boost 0.6 | score |
|---|---|---|---|---|---|---|---|---|
| 1 | Natural Sleep Aid Supplement T | 1.0 | Natural Sleep Aid Supplement T | 1.0 | Natural Sleep Aid Supplement T | 1.0 | Natural Sleep Aid Supplement T | 1.0 |
| 2 | Nilgiris Green Tea - Anicca Ch | 0.946161 | Nilgiris Green Tea - Anicca Ch | 0.974276 | Nilgiris Green Tea - Anicca Ch | 0.874106 | Nilgiris Green Tea - Anicca Ch | 0.890999 |
| 3 | Nilgiris Green Tea - Anicca Ch | 0.946161 | Heart Design PVC Food Mat/Bed  | 0.838793 | Nilgiris Green Tea - Anicca Ch | 0.858104 | Nilgiris Green Tea - Anicca Ch | 0.890999 |
| 4 | Red Grape Drink | 0.77814 | Nilgiris Green Tea - Anicca Ch | 0.800777 | Nilgiris Green Tea - Anicca Ch | 0.858104 | Nilgiris Green Tea - Anicca Ch | 0.816627 |
| 5 | Nilgiris Green Tea - Yoshin Le | 0.757865 | Nilgiris Green Tea - Anicca Ch | 0.800777 | Heart Design PVC Food Mat/Bed  | 0.709562 | Nilgiris Green Tea - Yoshin Le | 0.7115 |

App latency — BEFORE 405.0 ms · 1.8: 449.0 ms · 1.0: 486.3 ms · 0.6: 419.3 ms

**mode 4 — $rankFusion**

| # | BEFORE (pre-index) | score | @ boost 1.8 | score | @ boost 1.0 | score | @ boost 0.6 | score |
|---|---|---|---|---|---|---|---|---|
| 1 | Natural Sleep Aid Supplement T | 0.016133 | Natural Sleep Aid Supplement T | 0.016133 | Natural Sleep Aid Supplement T | 0.016133 | Natural Sleep Aid Supplement T | 0.016133 |
| 2 | Nilgiris Green Tea - Anicca Ch | 0.015388 | Nilgiris Green Tea - Anicca Ch | 0.015877 | Nilgiris Green Tea - Anicca Ch | 0.015877 | Nilgiris Green Tea - Anicca Ch | 0.015625 |
| 3 | Nilgiris Green Tea - Anicca Ch | 0.014315 | Non-Alcoholic Beverage - Low C | 0.015155 | Non-Alcoholic Beverage - Low C | 0.014449 | Nilgiris Green Tea - Anicca Ch | 0.014315 |
| 4 | Nilgiris Green Tea - Anicca Ch | 0.014089 | Chamomile Tea Bags | 0.015152 | Nilgiris Green Tea - Anicca Ch | 0.014187 | Nilgiris Green Tea - Anicca Ch | 0.014089 |
| 5 | Red Grape Drink | 0.01391 | Nilgiris Green Tea - Anicca Ch | 0.014063 | Nilgiris Green Tea - Anicca Ch | 0.013961 | Non-Alcoholic Beverage - Low C | 0.013716 |

App latency — BEFORE 1092.1 ms · 1.8: 2808.1 ms · 1.0: 2719.8 ms · 0.6: 2638.1 ms

**mode 5 — $scoreFusion**

| # | BEFORE (pre-index) | score | @ boost 1.8 | score | @ boost 1.0 | score | @ boost 0.6 | score |
|---|---|---|---|---|---|---|---|---|
| 1 | Natural Sleep Aid Supplement T | 0.848466 | Natural Sleep Aid Supplement T | 0.848466 | Natural Sleep Aid Supplement T | 0.848493 | Natural Sleep Aid Supplement T | 0.848466 |
| 2 | Nilgiris Green Tea - Anicca Ch | 0.848376 | Nilgiris Green Tea - Anicca Ch | 0.848382 | Nilgiris Green Tea - Anicca Ch | 0.84839 | Nilgiris Green Tea - Anicca Ch | 0.848382 |
| 3 | Non-Alcoholic Beverage - Low C | 0.84511 | Non-Alcoholic Beverage - Low C | 0.847841 | Non-Alcoholic Beverage - Low C | 0.847813 | Non-Alcoholic Beverage - Low C | 0.847743 |
| 4 | Melatonin 10Mg Capsule - Helps | 0.845026 | Chamomile Tea Bags | 0.847759 | Chamomile Tea Bags | 0.847741 | Chamomile Tea Bags | 0.84705 |
| 5 | Nilgiris Green Tea - Anicca Ch | 0.84419 | Melatonin 10Mg Capsule - Helps | 0.845613 | Melatonin 10Mg Capsule - Helps | 0.845531 | Melatonin 10Mg Capsule - Helps | 0.845385 |

App latency — BEFORE 720.0 ms · 1.8: 799.3 ms · 1.0: 745.1 ms · 0.6: 718.7 ms

### Q2 and Q4 — no-regression check at 1.8 only

| Query | Mode | total_results BEFORE → AFTER | rank 1 AFTER | top-5 all relevant? |
|---|---|---|---|---|
| Q2 | mode 2 | 10 → 10 | Tomato - Hybrid (Loose) | yes — four tomatoes + a tomato snack |
| Q2 | mode 4 | 200 → 200 | Tomato - Local (Loose) | yes — unchanged from baseline |
| Q2 | mode 5 | 200 → 200 | Tomato - Local (Loose) | yes — unchanged from baseline |
| Q4 | mode 2 | 639 → 786 | Green Tea - Zoho, Lemongrass | yes — all green teas |
| Q4 | mode 4 | 693 → 825 | Strawberry Green Tea | **no** — `Green Tea Mugs` at rank 4 |
| Q4 | mode 5 | 271 → 263 | Nilgiri Green Tea - Yakuso Tulsi | **no** — `Green Tea Mugs` at rank 2 |

Q2 is unaffected — `tomatoe` has no meaningful description surface, and its top 5 is identical to
the pre-index baseline in all three modes. Q4 gains recall (639 → 786 in mode 2) but **`Green Tea
Mugs` now intrudes into the hybrid top 5** — glassware whose description discusses green tea. Same
failure mode as Q3 below.

### Tie analysis

| Query / mode | BEFORE | @1.8 | @1.0 | @0.6 |
|---|---|---|---|---|
| Q1 / mode 4 | 0.015268 ×2 | none | none | 0.015268 ×2 |
| Q2 / mode 2 | 1.0 ×5 | 1.0 ×5 | _not run_ | _not run_ |
| Q2 / mode 4 | none | none | _not run_ | _not run_ |
| Q2 / mode 5 | none | none | _not run_ | _not run_ |
| Q3 / mode 2 | 0.228609 ×4 | 0.471261 ×2 | 0.364644 ×2 | 0.311336 ×2 |
| Q4 / mode 2 | 1.0 ×2 | none | _not run_ | _not run_ |
| Q4 / mode 4 | none | 0.014786 ×2 | _not run_ | _not run_ |
| Q4 / mode 5 | none | none | _not run_ | _not run_ |
| Q5 / mode 2 | 0.946161 ×2 | 0.800777 ×2 | 0.858104 ×2 | 0.890999 ×2 |

* **Previously-tied scores now broken:** Q3 / mode 2 had a **three-way** tie at `0.228609` in the
  pre-index baseline; at every boost value it is now a **two-way** tie. Adding a second scoring
  signal genuinely separated one of the three identical `Tea` entries.
* **Q2 / mode 2's five-way tie at exactly `1.0` survives untouched** at 1.8. It is a
  window-max normalization artefact (rec **L2.5**), not a field-coverage problem — `tomatoe`
  matches nothing in the descriptions, so the new field cannot break the tie.
* **New ties introduced:** Q4 / mode 4 at 1.8 (`0.014786` ×2) and Q1 / mode 4 at 0.6
  (`0.015268` ×2 — though the pre-index baseline had a tie at the identical value, so this is the
  same pre-existing collision resurfacing, not a new one).
* Ties are *fewer* at lower boost in mode 2 for Q3/Q5 only in the sense that the tied values drift;
  the count stays at one two-way group throughout. The boost does not fix or worsen tie behaviour.

### Precision damage at 1.8 — the decisive finding

Indexing the field added recall everywhere. At **boost 1.8** it also pulled in a specific class of
false positive: **products whose description discusses a beverage without being one.**

| Query / mode | Intruder at boost 1.8 | Its rank at 1.8 | at 1.0 | at 0.6 |
|---|---|---|---|---|
| Q3 / mode 2 | `Whisky Glass - Elegan` (Lyra) | **2** | 5 | gone from top 5 |
| Q3 / mode 4 | `Candy Coffee Mugs`, `Penguen Tea/Coffee Mug`, `Double Walled Glass Water Bottle`, `Beer Mug` | **2, 3, 4, 5** | all gone | all gone |
| Q3 / mode 5 | `Whisky Glass - Elegan`, `Penguen Tea/Coffee Mug`, `Candy Coffee Mugs` | **2, 3, 4** | 5 (glass only) | gone from top 5 |
| Q4 / mode 4 | `Green Tea Mugs - Multicolour` (Hot Muggs) | **4** | _not run_ | _not run_ |
| Q4 / mode 5 | `Green Tea Mugs - Multicolour` | **2** | _not run_ | _not run_ |
| Q5 / mode 2 | `Heart Design PVC Food Mat/Bed Server` (Kuber) | **3** | 5 | gone from top 5 |

**Q3 / mode 4 at boost 1.8 is the worst single result of this sweep**: four of the top five results
for `beverages` are drinking vessels. The pre-index baseline for that same query returned actual
beverages (Booch, Pepsi, Paper Boat, two Raw Pressery juices). **At 1.0 and 0.6 the correct
beverages return and the glassware disappears entirely.**

This is the effect L1.1 warned about, now measured rather than predicted: a 595-character average
description matches many queries weakly, and at 1.8 — the second-highest weight in the clause
ladder, above `brand` (1.2), `category` (1.1) and `subCategory` (1.0) — those weak matches
accumulate enough score to outrank genuine matches.

### Genuine gains that survive at every boost value

Set against the damage, the field earns its place:

* **Q5 surfaces products it previously could not.** `Chamomile Tea Bags` (TGL Co.) and
  `Melatonin 10Mg Capsule - Helps To Sleep Well` are **new** to the top 5 versus the pre-index
  baseline — neither product name contains any query term, so they were reachable only through the
  description. They hold at 1.8, 1.0 **and** 0.6.
* **Q5 recall more than doubled** in mode 2 (1 220 → 2 706) and mode 4 (1 307 → 2 729).
* **Q3 recall +45%** (71 → 103 in mode 2).
* At 0.6, Q5 / mode 2's entire top 5 is relevant (sleep aid + four chamomile/relaxation teas),
  where the pre-index baseline had `Red Grape Drink` at rank 4.

### A latency regression worth flagging separately

| Query / mode | app latency BEFORE | AFTER @1.8 | @1.0 | @0.6 |
|---|---|---|---|---|
| Q5 / mode 4 (`$rankFusion`) | 1 092 ms | **2 808 ms** | 2 720 ms | 2 638 ms |
| Q5 / mode 2 | 405 ms | 449 ms | 486 ms | 419 ms |
| Q5 / mode 5 (`$scoreFusion`) | 720 ms | 799 ms | 745 ms | 719 ms |

**Mode 4 on Q5 went from ~1.1 s to ~2.7 s — a 2.5× regression, and it is boost-independent.** The
cause is structural, not the boost: `hybrid_rrf_pipeline.py`'s text arm has **no `$limit`**, so it
now feeds 2 729 ranked candidates into `$rankFusion` instead of 1 307. `$scoreFusion` caps its text
arm at `$limit: 200` and barely moved (720 → 799 ms).

This is exactly the asymmetry documented as rec **L2.6** (symmetrize hybrid candidate limits). It
was a P1 tidiness item on the strength of a timing difference; it is now a measured 1.7-second
regression on a real query. **L2.6 should be promoted to P0 and fixed before the boost value is
finalized**, since capping the text arm will change the fused ranking and therefore the right boost.

### Mode 5 is almost boost-insensitive

Q5 / mode 5 returns the **identical top 5 in the identical order at 1.8, 1.0 and 0.6**, with scores
differing in the fourth decimal (0.848466 / 0.848493 / 0.848466 at rank 1). Q3 / mode 5 shifts only
at rank 5. `$scoreFusion`'s sigmoid normalization compresses the text arm's contribution so hard
that a 3× change in field boost is nearly invisible — the same saturation recorded in the Fix #1
verification. **The boost decision effectively only governs modes 2 and 4**, which is itself an
argument for resolving rec **L2.5** (score normalization contract).

### Recommendation: 0.6

| Criterion | 1.8 | 1.0 | 0.6 |
|---|---|---|---|
| Q1 exact match holds at rank 1 | ✅ | ✅ | ✅ |
| Q3 free of glassware in top 5 | ❌ (4 of 5 in mode 4) | ⚠️ (1 at rank 5) | ✅ |
| Q5 free of irrelevant items in top 5 | ❌ (PVC mat at rank 3) | ⚠️ (rank 5) | ✅ |
| Q5 keeps newly-surfaced relevant items | ✅ | ✅ | ✅ |
| Recall gain retained | ✅ | ✅ | ✅ (identical — recall is set by the mapping, not the boost) |

**0.6 is the only value tested where every checked query's top 5 is free of description-driven
false positives while keeping the full recall gain.** Recall is a property of the index mapping,
not the boost, so lowering the boost costs nothing in coverage — it only changes how much a weak
description match can outrank a strong name match.

0.6 also restores a sensible clause ladder: `productName` 3.0 ≫ `brand` 1.2 > `category` 1.1 >
`subCategory` 1.0 > **`aboutTheProduct` 0.6**. The description becomes a corroborating signal and a
tiebreaker — which, per the
[embedding-source investigation](recommendations-pre-refactor.md#follow-up-investigation--embedding-source-quality),
is the only place description content influences ranking at all, since the stored vectors
substantially under-represent it.

**Caveats I would not paper over:**

* **1.0 vs 0.6 is a narrow call.** The difference is largely whether one false positive sits at
  rank 5 or falls off the page. If you would rather change the committed value as little as
  possible, 1.0 captures most of the benefit. I prefer 0.6 because it is the only value with a
  *clean* top 5 on every query checked.
* **This sweep tested three points on one dimension, with five queries, one store, amplification
  off.** It is not a tuning exercise on a held-out query set. 0.6 is the best-supported of three
  candidates, not a proven optimum.
* **The L2.6 fix will invalidate part of this.** Capping mode 4's text arm changes which documents
  reach fusion, so mode 4's boost sensitivity should be re-checked afterwards. Modes 2 and 5 are
  unaffected by that change.
* **Boost values 1.0 and 0.6 were never committed.** The code carries 1.8; the three pipeline files
  were restored via `git checkout` and verified byte-identical to their pre-sweep blob hashes.

---

## Post-fix verification — Fix 5 (hybrid candidate-limit symmetry)

Appended **2026-09-15**, after applying rec **L2.6**, promoted P1 → P0 by the Fix #4 boost sweep
which measured a 2.5× latency regression traceable to this asymmetry. Nothing above this heading
has been modified.

### What changed

`hybrid_rrf_pipeline.py` fused an **uncapped** `$search` arm against a 200-document
`$vectorSearch` arm, while `hybrid_score_fusion_pipeline.py` already capped its text arm at 200.
Three hunks, one file:

* two module-level constants next to `BOOST_MAP` — `FUSION_ARM_LIMIT = 200` and
  `VECTOR_NUM_CANDIDATES = 500` — replacing the inline magic numbers;
* `{"$limit": FUSION_ARM_LIMIT}` appended to the text arm;
* the vector arm now reads both constants instead of literals.

No behavioural change to the vector arm (same 500/200 values), and
`hybrid_score_fusion_pipeline.py` was deliberately left alone — sharing one constant across both
files would mean either importing between pipeline modules or editing `utils.py`, i.e. a second
file. Noted as a follow-up rather than done here.

### Method

Same fixed parameters as every previous pass (`store-030`, `page = 1`, `page_size = 5`, no
amplification, weights 0.5/0.5), but **3 measured reps** this time rather than 2, since latency is
the headline metric. A genuine BEFORE pass was captured with the uncapped code, then the service
was restarted with the fix. Read-only throughout.

### 1. Is the latency regression resolved? Yes — and then some

| Query / mode | original pre-index baseline | BEFORE (uncapped, index live) | AFTER (capped) | vs regression | vs original |
|---|---|---|---|---|---|
| **Q5 / mode 4** | 1 092 ms | **2911.2 ms** | **725.6 ms** | **−75%** | **−34%** |
| Q3 / mode 4 | — | 731.3 ms | 730.3 ms | -0% | — |
| Q4 / mode 4 | — | 849.1 ms | 724.1 ms | -15% | — |
| Q3 / mode 5 (control, untouched) | — | 709.5 ms | 712.3 ms | +0% | — |
| Q4 / mode 5 (control, untouched) | — | 701.0 ms | 726.7 ms | +4% | — |
| Q5 / mode 5 (control, untouched) | — | 810.8 ms | 747.5 ms | -8% | — |

Q5 / mode 4 raw reps — BEFORE [2680.2, 2911.2, 3118.5] ms · AFTER [724.5, 725.6, 733.0] ms.

**The regression is gone: 2 911 ms → 726 ms, a 4.0× improvement.** It lands *below* the original
pre-index baseline of 1 092 ms, because the text arm is now capped at 200 where it previously fed
1 307 documents even before `aboutTheProduct` was indexed. Mode 5 — untouched by this fix — is flat
within noise, confirming the change is the cause and not ambient variance.

Q3 and Q4 barely move (−0% and −15%): their text arms matched 103 and 786 documents, so only Q4
was being capped at all, and 786 was not enough to hurt. **The fix matters precisely for broad
queries**, which is where it was hurting.

### 2. How much did the ranking change? Not at all

| Query / mode | top-5 identical before/after? | total_results BEFORE → AFTER |
|---|---|---|
| Q3 / mode 4 | ✅ **byte-identical** | 235 → **235** |
| Q4 / mode 4 | ✅ **byte-identical** | 825 → **263** |
| Q5 / mode 4 | ✅ **byte-identical** | 2729 → **345** |

**Capping the text arm at 200 changed no mode-4 ranking whatsoever** — same products, same order,
same scores, for all three queries. Every document that mattered was already inside the top 200 of
the text arm; the extra 2 500 candidates on Q5 contributed nothing but latency.

`total_results` fell for the broad queries (Q4 825 → 263, Q5 2 729 → 345) because the `$facet`
count reflects the fused candidate window, which is now bounded. Q3 is unchanged at 235 — its
text arm only matched 103 documents, below the cap. This is the same `total_results` semantics
issue tracked as rec **L2.4**; the number is still a candidate count, not a match count. It has,
however, become *consistent between the two hybrid modes* — see below.

### 3. Mode 4 vs mode 5 comparability — partly achieved

The point of symmetrizing was to make the two fusion strategies legitimately comparable. Measured
on Q4 (`green tea`):

| | BEFORE | AFTER |
|---|---|---|
| mode 4 `total_results` | 825 | **263** |
| mode 5 `total_results` | 263 | 264 |
| top-5 set overlap (m4 vs m5) | 3/5 | 2/5 |
| top-5 position agreement | 1/5 | 1/5 |
| app latency m4 vs m5 | 849.1 vs 701.0 ms | 724.1 vs 726.7 ms |

**Structurally: yes.** Both modes now draw from the same arm depths, and their `total_results`
converged from *825 vs 263* to **263 vs 264** on Q4, and *2 729 vs 345* to **345 vs 345** on Q5.
Latency converged too (849/701 ms → 724/727 ms). A side-by-side demo of `$rankFusion` versus
`$scoreFusion` is now an honest comparison of *fusion strategy* rather than of two different
candidate pools.

**On ranking: no, and I should not oversell it.** Top-5 set overlap between the two modes on Q4 went
from 3/5 to 2/5 — it did not improve, and position agreement stayed at 1/5. Mode 4's
ranking did not change at all, and mode 5's rank 5 shifted only through its own run-to-run
variance. The two modes still disagree because `$scoreFusion`'s sigmoid normalization compresses
its top-5 into a ~6e-4 score band while `$rankFusion` works on raw reciprocal ranks — a scoring
difference (rec **L2.5**), not a candidate-pool difference. **This fix removed the illegitimate
source of disagreement; the legitimate one remains.**

### 4. Does this change the Fix #4 boost conclusions? No — and it adds evidence for 0.6

Because capping alters what reaches `$rankFusion`, the mode-4 half of the boost sweep was re-run
with the cap in place (Q3 and Q5 at 1.8 / 1.0 / 0.6, temporary local edits, reverted).

| Query / mode 4 | @1.8 capped | @1.0 capped | @0.6 capped | same as uncapped sweep? |
|---|---|---|---|---|
| **Q3** top-5 character | 4 of 5 are drinking vessels (mugs, beer mug, water bottle) | clean — all actual beverages | clean — all actual beverages | ✅ identical at every value |
| **Q5** top-5 character | all relevant (sleep aid, chamomile ×2, Booch, chamomile) | all relevant | all relevant | ✅ identical at every value |

**The false-positive pattern is entirely boost-driven, not candidate-pool-driven.** Q3 / mode 4 at
boost 1.8 returns the same four drinking vessels whether the text arm is capped at 200 or
uncapped; at 1.0 and 0.6 they vanish in both cases. Capping changes *how many* candidates are
ranked, not *how* a weak description match scores against a strong name match.

**One new data point that strengthens the case for 0.6.** Q4 / mode 4, which the original sweep
only ran at 1.8, was covered here at all three values:

| Q4 / mode 4 | top 5 |
|---|---|
| @1.8 | Strawberry Green Tea, Svastha Green Tea - Promot, Nilgiri Green Tea - Taizen, Green Tea Mugs - Multicolo, Green Tea - With Peppermin |
| @1.0 | Strawberry Green Tea, Green Tea - Ikusei, Cardam, Svastha Green Tea - Promot, Green Tea - With Peppermin, Nilgiri Green Tea - Taizen |
| @0.6 | Green Tea - Ikusei, Cardam, Strawberry Green Tea, Green Tea - With Peppermin, Svastha Green Tea - Promot, Nilgiri Green Tea - Taizen |

`Green Tea Mugs - Multicolour` sits at **rank 4 at boost 1.8** and is **gone from the top 5 at both
1.0 and 0.6**, replaced by actual teas. That is a third query (after Q3 and Q5) where 0.6 removes a
description-driven false positive at no cost.

**Verdict: 0.6 remains the recommendation, now with Q4 mode-4 evidence behind it as well.** The
caveat from Fix #4 that 'the L2.6 fix will invalidate part of this' turned out to be unfounded —
worth recording, since I raised it.

### Detail — mode 4 top 5, before vs after (boost 1.8 throughout)

**Q3 — `beverages`**

| # | BEFORE (uncapped) | score | AFTER (capped at 200) | score |
|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low Calorie,  (Booch) | 0.016261 | Non-Alcoholic Beverage - Low Calorie,  (Booch) | 0.016261 |
| 2 | Candy Coffee Mugs - Multi Colour (Claycraft) | 0.014096 | Candy Coffee Mugs - Multi Colour (Claycraft) | 0.014096 |
| 3 | Penguen Tea/Coffee Mug - Evergreen (Pasabahce) | 0.014069 | Penguen Tea/Coffee Mug - Evergreen (Pasabahce) | 0.014069 |
| 4 | Double Walled Glass Water Bottle - Pla (DP) | 0.01381 | Double Walled Glass Water Bottle - Pla (DP) | 0.01381 |
| 5 | Beer Mug - Printed Clear Glass, Multip (Indigifts) | 0.013374 | Beer Mug - Printed Clear Glass, Multip (Indigifts) | 0.013374 |

**Q4 — `green tea`**

| # | BEFORE (uncapped) | score | AFTER (capped at 200) | score |
|---|---|---|---|---|
| 1 | Strawberry Green Tea (Teamonk) | 0.015385 | Strawberry Green Tea (Teamonk) | 0.015385 |
| 2 | Svastha Green Tea - Promotes Overall W (Kapiva) | 0.014786 | Svastha Green Tea - Promotes Overall W (Kapiva) | 0.014786 |
| 3 | Nilgiri Green Tea - Taizen Cinnamon, 1 (Teamonk) | 0.014786 | Nilgiri Green Tea - Taizen Cinnamon, 1 (Teamonk) | 0.014786 |
| 4 | Green Tea Mugs - Multicolour (Hot Muggs) | 0.014315 | Green Tea Mugs - Multicolour (Hot Muggs) | 0.014315 |
| 5 | Green Tea - With Peppermint Leaves, Gr (Wingreens Farm) | 0.014185 | Green Tea - With Peppermint Leaves, Gr (Wingreens Farm) | 0.014185 |

**Q5 — `drink that helps me relax before bed`**

| # | BEFORE (uncapped) | score | AFTER (capped at 200) | score |
|---|---|---|---|---|
| 1 | Natural Sleep Aid Supplement Tablets - (Himalayan Orga) | 0.016133 | Natural Sleep Aid Supplement Tablets - (Himalayan Orga) | 0.016133 |
| 2 | Nilgiris Green Tea - Anicca Chamomile, (Teamonk) | 0.015877 | Nilgiris Green Tea - Anicca Chamomile, (Teamonk) | 0.015877 |
| 3 | Non-Alcoholic Beverage - Low Calorie,  (Booch) | 0.015155 | Non-Alcoholic Beverage - Low Calorie,  (Booch) | 0.015155 |
| 4 | Chamomile Tea Bags (TGL Co.) | 0.015152 | Chamomile Tea Bags (TGL Co.) | 0.015152 |
| 5 | Nilgiris Green Tea - Anicca Chamomile, (Teamonk) | 0.014063 | Nilgiris Green Tea - Anicca Chamomile, (Teamonk) | 0.014063 |

### Secondary observations

* **The uncapped arm was pure waste.** Identical rankings with 2 500 fewer candidates on Q5 means
  the extra depth bought nothing at any point — not after `aboutTheProduct` was indexed, and not
  before it either.
* **`FUSION_ARM_LIMIT = 200` is now a single named knob** for mode 4's fusion depth, where
  previously the value appeared twice as a literal and the text arm had no value at all. Mode 5
  still carries its own inline `$limit: 200`; unifying the two across files would need `utils.py`
  or a cross-module import, which is outside this fix's one-file scope.
* **Mode 4 and mode 5 `total_results` now agree** (263 vs 264, 345 vs 345). Both remain candidate
  counts rather than match counts — rec **L2.4** is still open — but they are at least the *same
  kind of wrong* in both modes now, which makes the demo's side-by-side numbers defensible.
* **Boost values 1.0 and 0.6 were never committed.** `text_pipeline.py` and
  `hybrid_score_fusion_pipeline.py` were verified byte-identical to their pre-sweep blob hashes,
  and `hybrid_rrf_pipeline.py` carries only the three L2.6 hunks with the boost back at 1.8.

---

## Confirmation — Fix 6 (aboutTheProduct boost committed at 0.6)

Appended **2026-09-15**. Short confirmation note only — the evidence for choosing 0.6 is already
recorded in the Fix 4 boost sweep and the Fix 5 re-check above. This pass verifies that the
**committed** code reproduces what those temporary sweep edits measured.

Committed state at time of measurement: `aboutTheProduct` boost **0.6** in all three text-scoring
builders, text arm capped at `FUSION_ARM_LIMIT = 200` (Fix 5), `product_atlas_search` live with
`aboutTheProduct` mapped (Fix 4). Same fixed parameters as every prior pass.

### Reproducibility check

| Case | vs Fix 4 sweep @0.6 | vs Fix 5 capped @0.6 | |
|---|---|---|---|
| Q1 / mode 2 | ✅ identical | — |  |
| Q1 / mode 4 | ✅ identical | — |  |
| Q1 / mode 5 | ✅ identical | — |  |
| Q3 / mode 2 | ✅ identical | — |  |
| Q3 / mode 4 | ✅ identical | ✅ identical | sweep predates the Fix 5 cap |
| Q3 / mode 5 | ✅ identical | ✅ identical |  |
| Q4 / mode 2 | — | — | first measurement at 0.6 |
| Q4 / mode 4 | — | ✅ identical |  |
| Q4 / mode 5 | — | ✅ identical |  |
| Q5 / mode 2 | ✅ identical | — |  |
| Q5 / mode 4 | ✅ identical | ✅ identical | sweep predates the Fix 5 cap |
| Q5 / mode 5 | ✅ identical | ✅ identical |  |

**11 of 12 cells reproduce the earlier sweeps exactly** — same products, same order, same scores.
The twelfth (Q4 / mode 2) was never measured at 0.6 before; its top 5 is five genuine green teas
(`Green Tea - Zoho`, `Rakshan`, `Ikusei`, `Svastha`, `Strawberry`), consistent with the pattern.

Note that the mode-4 cells match **both** the pre-cap Fix 4 sweep and the post-cap Fix 5 re-check,
which independently re-confirms the Fix 5 finding that capping the text arm changes no ranking.

### Final committed-state top 5

<details><summary><b>Q1</b> — <code>Onion</code></summary>

| # | mode 2 | score | mode 4 | score | mode 5 | score |
|---|---|---|---|---|---|---|
| 1 | Onion | 1.0 | Onion | 0.016393 | Onion | 0.852256 |
| 2 | Onion (Loose) | 0.945425 | Onion (Loose) | 0.016129 | Onion (Loose) | 0.852152 |
| 3 | Onion Sabudana Papad | 0.749375 | Red Onion Oil With Jojoba, Arg | 0.015399 | Red Onion Oil With Jojoba, Arg | 0.845226 |
| 4 | Potato Crisps - Sour Cream and | 0.639508 | Onion Hair Oil With Bhringraj  | 0.015268 | Onion Hair Oil For Hair Growth | 0.844414 |
| 5 | Onion Oil Concentrate - Anti H | 0.622747 | Onion Oil Concentrate - Anti H | 0.015268 | Onion Oil Concentrate - Anti H | 0.844158 |

App latency and totals — mode 2 166.4 ms / 165 results · mode 4 729.8 ms / 329 results · mode 5 721.0 ms / 329 results

</details>

<details><summary><b>Q3</b> — <code>beverages</code></summary>

| # | mode 2 | score | mode 4 | score | mode 5 | score |
|---|---|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low C | 1.0 | Non-Alcoholic Beverage - Low C | 0.016261 | Non-Alcoholic Beverage - Low C | 0.847803 |
| 2 | Tea | 0.311336 | Black Soft Drink - Max Taste,  | 0.015629 | Tea | 0.829479 |
| 3 | Tea | 0.311336 | Aamras Mango Fruit Juice | 0.015268 | Tea | 0.828089 |
| 4 | Tea | 0.307755 | Cold Extracted Juice - Mixed F | 0.015045 | Tea | 0.827259 |
| 5 | Tea - Natural Care | 0.231374 | Cold Extracted Juice - Basics, | 0.014835 | Black Soft Drink - Max Taste,  | 0.812649 |

App latency and totals — mode 2 162.8 ms / 103 results · mode 4 656.5 ms / 235 results · mode 5 719.6 ms / 235 results

</details>

<details><summary><b>Q4</b> — <code>green tea</code></summary>

| # | mode 2 | score | mode 4 | score | mode 5 | score |
|---|---|---|---|---|---|---|
| 1 | Green Tea - Zoho, Lemongrass | 1.0 | Green Tea - Ikusei, Cardamom | 0.015749 | Nilgiri Green Tea - Yakuso Tul | 0.848689 |
| 2 | Rakshan Green Tea - Supports S | 0.937785 | Strawberry Green Tea | 0.015385 | Green Tea Mugs - Multicolour | 0.848548 |
| 3 | Green Tea - Ikusei, Cardamom | 0.911358 | Green Tea - With Peppermint Le | 0.014719 | Nilgiri Green Tea - Taizen Cin | 0.8483 |
| 4 | Svastha Green Tea - Promotes O | 0.909617 | Svastha Green Tea - Promotes O | 0.014662 | Green Tea - Ikusei, Cardamom | 0.848119 |
| 5 | Strawberry Green Tea | 0.880974 | Nilgiri Green Tea - Taizen Cin | 0.014347 | Strawberry Green Tea | 0.848095 |

App latency and totals — mode 2 228.7 ms / 786 results · mode 4 759.2 ms / 270 results · mode 5 711.3 ms / 270 results

</details>

<details><summary><b>Q5</b> — <code>drink that helps me relax before bed</code></summary>

| # | mode 2 | score | mode 4 | score | mode 5 | score |
|---|---|---|---|---|---|---|
| 1 | Natural Sleep Aid Supplement T | 1.0 | Natural Sleep Aid Supplement T | 0.016133 | Natural Sleep Aid Supplement T | 0.848466 |
| 2 | Nilgiris Green Tea - Anicca Ch | 0.890999 | Nilgiris Green Tea - Anicca Ch | 0.015625 | Nilgiris Green Tea - Anicca Ch | 0.848382 |
| 3 | Nilgiris Green Tea - Anicca Ch | 0.890999 | Nilgiris Green Tea - Anicca Ch | 0.014315 | Non-Alcoholic Beverage - Low C | 0.847743 |
| 4 | Nilgiris Green Tea - Anicca Ch | 0.816627 | Nilgiris Green Tea - Anicca Ch | 0.014089 | Chamomile Tea Bags | 0.84705 |
| 5 | Nilgiris Green Tea - Yoshin Le | 0.7115 | Non-Alcoholic Beverage - Low C | 0.013716 | Melatonin 10Mg Capsule - Helps | 0.845385 |

App latency and totals — mode 2 395.5 ms / 2706 results · mode 4 673.8 ms / 358 results · mode 5 825.9 ms / 358 results

</details>

### One residual issue this fix does not solve

**Q4 / mode 5 still returns `Green Tea Mugs - Multicolour` at rank 2 at boost 0.6.** Mode 4 at the
same boost has no mug in its top 5, and mode 2 has none either — only `$scoreFusion` retains it.
This is the boost-insensitivity documented in Fix 4: sigmoid normalization compresses mode 5's top
five into a ~6e-4 score band (0.848689 → 0.848095 here), so a 3× change in field boost cannot
reorder it. Lowering the boost further would not fix it either.

The fix for that case is rec **L2.5** (single score normalization contract), not a boost value.
Recording it here so the Layer 1 / Layer 2 P0 work is not mistaken for having cleared every
description-driven false positive.

---

## Post-fix verification — Fix 7 (score normalization contract, L2.5)

Appended **2026-09-15**. Two changes in one fix, deliberately distinguished because only one of
them is allowed to move rankings:

* **L2.5a — `$scoreFusion` input normalization `sigmoid` → `minMaxScaler`.** Fixes the fusion.
  **Changes mode 5's ranking, by design.**
* **L2.5b — one shared max-normalization helper** (`utils.max_normalize_stages`) applied in modes
  2, 3, 4 and 5. Strictly monotonic, so it must not reorder anything anywhere.

**No new API fields.** Response keys verified identical before and after: 13 keys in both cases.
Mode 1 keeps `score: null` — prefix regex has no relevance concept.

### Why sigmoid was broken (the mechanism)

Raw Lucene scores in this catalogue run ~9–12, and `sigmoid(10) ≈ 0.99995`. Every text candidate
therefore normalized to ≈1.0, so the text arm contributed a near-constant to every document and
**stopped discriminating entirely** — mode 5 degenerated into a copy of mode 3. This was confirmed
read-only before any code changed, by exercising the existing `normalization` builder parameter:

| `$scoreFusion` normalization | Q4 top-5 spread | `Green Tea Mugs` rank | agrees with text arm | with vector arm |
|---|---|---|---|---|
| `sigmoid` (old default) | 5.94e-4 | **2** | 2/5 | **5/5, identical order** |
| **`minMaxScaler`** (new default) | 6.78e-2 | **absent** | 4/5 | 2/5 |
| `none` | 1.10 | absent | **5/5, identical order** | 2/5 |

`none` is the mirror failure — unnormalized Lucene (~9.76) dwarfs cosine (~1.0), so the *vector*
arm stops contributing instead. Only `minMaxScaler` lets both arms carry signal.

### 1. Acceptance test — Q4 mode 5, `Green Tea Mugs`

| # | BEFORE (`sigmoid`) | score | AFTER (`minMaxScaler`) | score |
|---|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, May  (Teamonk) | 0.848689 | Green Tea - Ikusei, Cardamom (Teamonk) | 1.0 |
| 2 | Green Tea Mugs - Multicolour (Hot Muggs) | 0.848548 | Strawberry Green Tea (Teamonk) | 0.97741 |
| 3 | Nilgiri Green Tea - Taizen Cinnamon, 1 (Teamonk) | 0.8483 | Svastha Green Tea - Promotes Overall W (Kapiva) | 0.960393 |
| 4 | Green Tea - Ikusei, Cardamom (Teamonk) | 0.848119 | Green Tea - With Peppermint Leaves, Gr (Wingreens Far) | 0.932599 |
| 5 | Strawberry Green Tea (Teamonk) | 0.848095 | Rakshan Green Tea - Supports Strong Im (Kapiva) | 0.925526 |

✅ **`Green Tea Mugs - Multicolour` is gone from the top 5**, replaced by five genuine green teas.
The top-5 score spread widens from **5.9e-4 to 7.4e-2 (≈125×)**, so the values are now legible at
the 5 decimal places the product card renders.

### 2. Order preservation — modes 1–4 (the L2.5b regression check)

| Query | mode 1 | mode 2 | mode 3 | mode 4 |
|---|---|---|---|---|
| Q1 | ✅ identical | ✅ identical | ✅ identical | ✅ identical |
| Q2 | ✅ identical | ✅ identical | ✅ identical | ✅ identical |
| Q3 | ✅ identical | ✅ identical | ✅ identical | ✅ identical |
| Q4 | ✅ identical | ✅ identical | ⚠️ see note | ✅ identical |
| Q5 | ✅ identical | ✅ identical | ✅ identical | ✅ identical |

**24 of 25 mode-1-to-4 cells are byte-identical in product order.** The one exception is
**Q4 / mode 3**, and it is not caused by this fix:

| # | BEFORE | score | AFTER | score |
|---|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, Ma | 1.0 | Nilgiri Green Tea - Yakuso Tulsi, Ma | 1.0 |
| 2 | Green Tea Mugs - Multicolour | 0.998357 | Green Tea Mugs - Multicolour | 0.998376 |
| 3 | Nilgiri Green Tea - Taizen Cinnamon, | 0.99563 | Nilgiri Green Tea - Taizen Cinnamon, | 0.995567 |
| 4 | Green Tea - Ikusei, Cardamom | 0.993919 | Green Tea - Ikusei, Cardamom | 0.993504 |
| 5 | Nilgiris Green Tea - Kozan Spearmint | 0.993328 | Strawberry Green Tea | 0.993237 |

Ranks 1–4 are the same products in the same order; only rank 5 swaps between two documents
separated by **9e-5** (`Kozan Spearmint` 0.993328 vs `Strawberry Green Tea` 0.993237). The rank-2
and rank-3 *scores* also differ slightly between the two passes (0.998357 vs 0.998376), which can
only come from `$vectorSearch` returning slightly different raw scores — max-normalization is
monotonic and cannot reorder. Two confirmations:

* Four consecutive repeat runs on the **same** post-fix code return `0.998376` every time — the
  variance was *between* the two passes, not introduced by the change.
* The AFTER value `0.998376` **matches the original pre-refactor baseline exactly**; the BEFORE
  pass was the outlier.

This is the same ANN run-to-run jitter recorded in Fix #2 (≤3.4e-4).

### 3. Mode 5 — no longer a vector-only copy

Top-5 set overlap of mode 5 against each pure arm. `*` marks an ordering *identical* to the vector
arm, position for position:

| Query | BEFORE vs mode 2 | BEFORE vs mode 3 | AFTER vs mode 2 | AFTER vs mode 3 | |
|---|---|---|---|---|---|
| Q1 | 3/5 | 4/5 | 4/5 | 3/5 | blended (3/5 → 4/5 text) |
| Q2 | 3/5 | 3/5* | 3/5 | 3/5* | **still an exact vector copy** — see note |
| Q3 | 2/5 | 2/5 | 1/5 | 3/5 | blended (2/5 → 1/5 text) |
| Q4 | 2/5 | 4/5 | 4/5 | 2/5 | blended (2/5 → 4/5 text) |
| Q5 | 2/5 | 3/5 | 3/5 | 3/5 | blended (2/5 → 3/5 text) |

**Q1, Q3, Q4 and Q5 all stopped being vector copies.** Text agreement rose for Q1 (3→4), Q4 (2→4)
and Q5 (2→3).

**Q2 is an honest exception and stays an exact vector copy.** For `tomatoe` every text candidate
has the *identical* raw Lucene score (8.983116 — `fuzzy: {maxEdits: 2}` scores all `tomato*`
matches the same). min-max of a constant series is degenerate, so the text arm contributes a
constant again and the vector arm decides the order. That is a property of the query, not of the
normalization — **no normalization choice can fix it**, and it is the same root cause as Q2's
five-way score tie.

**Q3 moved the other way** (text 2/5 → 1/5, vector 2/5 → 3/5). The fix makes the arms *actually
blend*; it does not bias toward text. For `beverages` the blend happens to favour the vector arm.

### 4. Weight tests re-run (Fix #1's saturation finding was measured under sigmoid)

| Case | target | top-5 spread BEFORE → AFTER | exactly matches target? |
|---|---|---|---|
| Q2 `w=1.0/0.0` | mode 2 (text) | 0.000e+00 → **0.000e+00** | BEFORE True → AFTER **True** |
| Q2 `w=0.0/1.0` | mode 3 (vector) | 3.901e-03 → **1.763e-01** | BEFORE True → AFTER **True** |
| Q4 `w=1.0/0.0` | mode 2 (text) | 0.000e+00 → **1.503e-01** | BEFORE True → AFTER **True** |
| Q4 `w=0.0/1.0` | mode 3 (vector) | 1.193e-03 → **7.021e-02** | BEFORE False → AFTER **True** |

Fix #1's conclusion **holds and is strengthened**: all four weight configurations still resolve to
the correct pure arm, and now with usable score separation. The most telling cell is
**Q4 `w=1.0/0.0`**, which previously had a spread of **exactly 0.0** — every result scored the same
under sigmoid, i.e. even the pure-text case was fully saturated — and now spreads over 0.150 while
still matching mode 2 at 5/5. **Q4 `w=0.0/1.0` also newly matches mode 3 exactly** (it did not
before).

### 5. Score range sanity

| Check | Result |
|---|---|
| exact `0.0` anywhere unexpected | ✅ none in any of the 29 measured cells |
| mode 4 no longer raw RRF | ✅ `0.0137–0.0164` → **`0.8502–1.0000`** |
| all-identical score bands | ⚠️ 2 cells remain, both on Q2 — see below |
| response keys unchanged | ✅ 13 keys before and after |

Mode 4 range by query, before → after:

| Query | BEFORE (raw `$rankFusion`) | AFTER (normalized) |
|---|---|---|
| Q1 | 0.015268 – 0.016393 | 0.931352 – 1.000000 |
| Q2 | 0.015889 – 0.016393 | 0.969231 – 1.000000 |
| Q3 | 0.014835 – 0.016261 | 0.912302 – 1.000000 |
| Q4 | 0.014347 – 0.015749 | 0.910963 – 1.000000 |
| Q5 | 0.013716 – 0.016133 | 0.850196 – 1.000000 |

The two remaining flat bands are **Q2 / mode 2** and **Q2 / mode 5 at `w=1.0/0.0`**, both exactly
`1.0` across all five rows. Both are the same genuine raw-score tie: all six `tomatoe` matches
carry Lucene score `8.983116`. Normalization cannot separate identical inputs — this needs a
deterministic tiebreaker, which is separate work and **not** a normalization defect. Correcting an
earlier claim: the original baseline attributed this tie to window-max normalization, which was
wrong.

### Detail — mode 5 top 5, before vs after, all five queries

<details><summary><b>Q1</b> — <code>Onion</code> (totals 329 → 329)</summary>

| # | BEFORE (`sigmoid`) | score | AFTER (`minMaxScaler`) | score |
|---|---|---|---|---|
| 1 | Onion (Fresho) | 0.852256 | Onion (Fresho) | 1.0 |
| 2 | Onion (Loose) (Fresho) | 0.852152 | Onion (Loose) (Fresho) | 0.967118 |
| 3 | Red Onion Oil With Jojoba, Argan & B (Qraa Men) | 0.845226 | Onion Sabudana Papad (DNV) | 0.559061 |
| 4 | Onion Hair Oil For Hair Growth & Hai (Spruce Shave ) | 0.844414 | Red Onion Oil With Jojoba, Argan & B (Qraa Men) | 0.548422 |
| 5 | Onion Oil Concentrate - Anti Hairfal (Beardo) | 0.844158 | Onion Oil Concentrate - Anti Hairfal (Beardo) | 0.525579 |

</details>

<details><summary><b>Q2</b> — <code>tomatoe</code> (totals 200 → 200)</summary>

| # | BEFORE (`sigmoid`) | score | AFTER (`minMaxScaler`) | score |
|---|---|---|---|---|
| 1 | Tomato - Local (Loose) (Fresho) | 0.850298 | Tomato - Local (Loose) (Fresho) | 1.0 |
| 2 | Tomato - Local (Loose) (Fresho) | 0.850255 | Tomato - Local (Loose) (Fresho) | 0.998047 |
| 3 | Tomato - Hybrid (Loose) (Fresho) | 0.849686 | Tomato - Hybrid (Loose) (Fresho) | 0.972281 |
| 4 | Tomato - Hybrid (Loose) (Fresho) | 0.849651 | Tomato - Hybrid (Loose) (Fresho) | 0.970694 |
| 5 | Rings - Tomato Twist (Too Yumm!) | 0.848348 | Rings - Tomato Twist (Too Yumm!) | 0.911853 |

</details>

<details><summary><b>Q3</b> — <code>beverages</code> (totals 235 → 235)</summary>

| # | BEFORE (`sigmoid`) | score | AFTER (`minMaxScaler`) | score |
|---|---|---|---|---|
| 1 | Non-Alcoholic Beverage - Low Calorie (Booch) | 0.847803 | Non-Alcoholic Beverage - Low Calorie (Booch) | 1.0 |
| 2 | Tea (Red Label) | 0.829479 | Red Grape Drink (Quencha) | 0.535438 |
| 3 | Tea (Red Label) | 0.828089 | Black Soft Drink - Max Taste, Zero S (Pepsi) | 0.486473 |
| 4 | Tea (Red Label) | 0.827259 | Aamras Mango Fruit Juice (Paper Boat) | 0.443213 |
| 5 | Black Soft Drink - Max Taste, Zero S (Pepsi) | 0.812649 | Cold Extracted Juice - Mixed Fruit,  (Raw Pressery) | 0.427253 |

</details>

<details><summary><b>Q4</b> — <code>green tea</code> (totals 270 → 270)</summary>

| # | BEFORE (`sigmoid`) | score | AFTER (`minMaxScaler`) | score |
|---|---|---|---|---|
| 1 | Nilgiri Green Tea - Yakuso Tulsi, Ma (Teamonk) | 0.848689 | Green Tea - Ikusei, Cardamom (Teamonk) | 1.0 |
| 2 | Green Tea Mugs - Multicolour (Hot Muggs) | 0.848548 | Strawberry Green Tea (Teamonk) | 0.97741 |
| 3 | Nilgiri Green Tea - Taizen Cinnamon, (Teamonk) | 0.8483 | Svastha Green Tea - Promotes Overall (Kapiva) | 0.960393 |
| 4 | Green Tea - Ikusei, Cardamom (Teamonk) | 0.848119 | Green Tea - With Peppermint Leaves,  (Wingreens Far) | 0.932599 |
| 5 | Strawberry Green Tea (Teamonk) | 0.848095 | Rakshan Green Tea - Supports Strong  (Kapiva) | 0.925526 |

</details>

<details><summary><b>Q5</b> — <code>drink that helps me relax before bed</code> (totals 358 → 358)</summary>

| # | BEFORE (`sigmoid`) | score | AFTER (`minMaxScaler`) | score |
|---|---|---|---|---|
| 1 | Natural Sleep Aid Supplement Tablets (Himalayan Org) | 0.848466 | Natural Sleep Aid Supplement Tablets (Himalayan Org) | 1.0 |
| 2 | Nilgiris Green Tea - Anicca Chamomil (Teamonk) | 0.848382 | Nilgiris Green Tea - Anicca Chamomil (Teamonk) | 0.86273 |
| 3 | Non-Alcoholic Beverage - Low Calorie (Booch) | 0.847743 | Nilgiris Green Tea - Anicca Chamomil (Teamonk) | 0.682171 |
| 4 | Chamomile Tea Bags (TGL Co.) | 0.84705 | Nilgiris Green Tea - Anicca Chamomil (Teamonk) | 0.665932 |
| 5 | Melatonin 10Mg Capsule - Helps To Sl (Himalayan Org) | 0.845385 | Non-Alcoholic Beverage - Low Calorie (Booch) | 0.602729 |

</details>

### Secondary observations

* **The helper removed real duplication**: net −50 lines across four builders, replacing four
  hand-rolled `$setWindowFields` copies with one documented definition. Modes 2 and 3 keep
  normalizing exactly the field they did before (`originalScore` and the post-boost
  `adjustedScore`), which is why their ordering is untouched — deliberately *not* changing what
  gets normalized in mode 3, since that would entangle this fix with **L2.1**.
* **`minMaxScaler` is window-dependent by construction** — min and max come from the candidate
  set, so mode 5's scores will shift if that window changes. Fix #5's `FUSION_ARM_LIMIT` bounds it,
  which makes this more stable than it would have been before that fix.
* **Mode 4's `score` semantics changed but its ranking did not**, in all five queries. Its scores
  now live in the same [0,1] space as every other mode, so the product card's badge is comparable
  when switching modes — previously mode 4 displayed `0.01639` next to mode 2's `1.00000`.
* **`score` is rendered in the UI** (`ProductCard.jsx:63-65`, `ProductCardSimplify.jsx:113-115`) as
  a badge at `toFixed(5)`. `ProductInventorySlice.js` contains `score` only inside mock fixture
  data and never reads it, so no frontend change was required. One latent issue remains: both cards
  guard with `{score && …}`, so a legitimate `0.0` would hide the badge. Not triggered by anything
  measured here, but a `score != null` guard would be more correct.

---

## Post-fix verification — Fix 8 (total_results semantics, L2.4)

Appended **2026-09-15**. Scoped down from the original L2.4 recommendation after a read-only
investigation established that **most of it was not a bug**.

### What the investigation found first

**Modes 1 and 2 already report a true match count.** Their `$facet` count branch has no `$limit`
ahead of it, so it counts the entire match set. Cross-checked against `$searchMeta`:

| Query | mode 2 `$facet` total | `$searchMeta count` | agree? |
|---|---|---|---|
| Q1 | 165 | 165 | ✅ |
| Q2 | 10 | 10 | ✅ |
| Q3 | 103 | 103 | ✅ |
| Q4 | 786 | 786 | ✅ |
| Q5 | 2706 | 2706 | ✅ |

Mode 1 likewise — `$facet` returns 6 and 13 for Q1/Q4, matching `countDocuments` exactly.

**So the originally-proposed option (b) — a second round-trip for a true count — was both
unnecessary and expensive.** Measured cost of an extra count call: **136–145 ms**, because every
Atlas operation pays a ~130 ms network floor here. As a share of the search that is **+91% on Q2**,
+60% on Q4, +31% on Q5 — nearly doubling the fastest query to recompute a number already correct.

**And for modes 3/4/5 a true count does not exist.** `$searchMeta` cannot run against a vector
index:

```
OperationFailure: Cannot execute $search over vectorSearch index
```

Nor is there a match set to count: kNN returns top-k by definition, and all **3 914** in-store
documents have *some* cosine similarity. Reporting 3 914 would also have broken pagination —
LeafyGreen would offer 196 pages at `page_size=20`, all but the first 10 empty.

**Correcting an earlier claim:** the original baseline said mode 3 "advertises" pages that turn out
empty. That was wrong. `ceil(200/5) = 40` pages for 200 retrievable results is exactly right, and
page 41 was never offered.

### What was actually wrong, and what changed

The real defect was that mode 3's retrieval depth — and therefore the user-visible result count —
was **derived from `page_size`** by Fix #3 (`max(50, page_size * 2)`). `vector_pipeline.py` now
uses a fixed `VECTOR_RETRIEVAL_DEPTH = 200`, matching `FUSION_ARM_LIMIT` in the hybrid builders.
The semantics are documented in `schemas.py`'s `SearchResponse` field descriptions and in the
module docstrings of all three semantic pipelines. `total_pages` was left in place as agreed.

### 1. Mode 3 — total stable, ranking untouched

| Query | total BEFORE | total AFTER | pages @ps=5 B→A | top-5 identical? | app ms B → A |
|---|---|---|---|---|---|
| Q1 | 50 | **200** | 10 → 40 | ✅ yes | 654 → 701 |
| Q2 | 50 | **200** | 10 → 40 | ✅ yes | 606 → 619 |
| Q3 | 50 | **200** | 10 → 40 | ✅ yes | 541 → 684 |
| Q4 | 50 | **200** | 10 → 40 | ✅ yes | 688 → 702 |
| Q5 | 50 | **200** | 10 → 40 | ✅ yes | 659 → 687 |

**Top-5 is identical for all five queries** — this changes retrieval *depth*, not what ranks at the
top. Latency rose modestly (mean ~630 → ~679 ms, +8%; worst case Q3 541 → 684 ms) because 200
rather than 50 documents now flow through `$setWindowFields`, `$sort` and `$facet`. That is the
price of the deeper, stable window.

### 2. Modes 4 and 5 — unaffected, as predicted

| Query | mode 4 total B → A | top-5 same | mode 5 total B → A | top-5 same |
|---|---|---|---|---|
| Q1 | 329 → 329 | ✅ | 329 → 329 | ✅ |
| Q2 | 200 → 200 | ✅ | 200 → 200 | ✅ |
| Q3 | 235 → 235 | ✅ | 235 → 235 | ✅ |
| Q4 | 270 → 270 | ✅ | 270 → 270 | ✅ |
| Q5 | 358 → 358 | ✅ | 358 → 358 | ✅ |

Both hybrid modes already bounded their arms with `FUSION_ARM_LIMIT`, so nothing moved.

### 3. Page-size sensitivity — the defect removed

| `page_size` | mode 3 total BEFORE | pages | mode 3 total AFTER | pages | mode 4 (control) B → A |
|---|---|---|---|---|---|
| 5 | 50 | 10 | **200** | 40 | 270 → 270 |
| 10 | 50 | 5 | **200** | 20 | 271 → 271 |
| 20 | 50 | 3 | **200** | 10 | 270 → 270 |
| 50 | 100 | 2 | **200** | 4 | 270 → 270 |
| 100 | 200 | 2 | **200** | 2 | 271 → 270 |

Distinct mode-3 totals across page sizes: **BEFORE `{50, 100, 200}` → AFTER `{200}`**. The
user-visible "of N items" label no longer depends on the page-size control.

### Pagination contract — checked explicitly

At the production `page_size = 20`, mode 3 now advertises `total_results = 200`, 10 pages. Every
one of those 10 pages was requested individually:

| Check | Result |
|---|---|
| pages 1–10, documents returned | 20 on every page |
| pages returning zero documents | **none** |
| page 11 (one beyond the advertised range) | 0 documents, by design — never offered by the UI |

**The one visible change, stated plainly:** at `page_size = 20`, mode 3 goes from "of 50 items" /
3 pages to **"of 200 items" / 10 pages**. All 10 are fully populated, so pagination *behaviour*
is unchanged — but the offered depth is larger. This was the accepted trade-off when the fixed-200
option was chosen over pinning at 50; the tail of those 200 is low-similarity filler drawn from
3 914 in-store products.

### The 'fewer than 200' branch could not be exercised

`total_results` should report `min(200, matching documents)`, since kNN cannot return more than the
filtered set contains. **No store in staging is small enough to test this** — the smallest is
`store-047` with 384 products, and it duly reports 200. The behaviour is structural rather than
verified.

### Secondary observations

* **`total_pages` is dead weight and was left alone.** The frontend never reads it
  (`lib/api.js:81` forwards only `total_results`, as `totalItems`); LeafyGreen's `<Pagination>`
  recomputes page count internally as `Math.ceil(numTotalItems / itemsPerPage)`. Removing it would
  change the payload shape, which is out of scope.
* **`total_results` is user-visible**, not just internal: LeafyGreen renders it as the
  "1 – 20 of N items" label and uses it to bound the forward arrow. That is why its stability
  matters at all.
* **The page-size dropdown is currently inert.** `ProductList.jsx:40` passes
  `itemsPerPageOptions={[8, 16, 20]}` but there is no `onItemsPerPageOptionChange` handler, and
  `lib/api.js:29` sends the constant `PAGINATION_PER_PAGE = 20`. So the defect this fix removes was
  latent rather than active — it would have surfaced the moment that control was wired up.
* **`VECTOR_RETRIEVAL_DEPTH` duplicates `FUSION_ARM_LIMIT`'s value** in a second module. A single
  shared constant in `utils.py` would be the natural consolidation, but that file was outside this
  fix's stated scope.

---

## Post-fix verification — Fix 9 (rank-space Brand Amplification, L2.1)

Appended **2026-09-15**. Replaces the score-multiplier amplification in modes 3, 4 and 5 with a
single rank-space rule. Mode 2 is untouched — its native Lucene `score.boost.value` already works
correctly. Mode 1 remains disabled (HTTP 400 on `brandAmplification`).

### The model

```
preRank    = pre-boost position ($setWindowFields + $documentNumber over the shared score)
F          = {low: 4, medium: 10, high: 25}
targetRank = max(1, ceil(preRank / F))   for a boosted document
           = preRank                     otherwise
order      = (targetRank asc, preRank asc)
```

Rank space rather than score space because a multiplier's effect depends entirely on how tightly a
mode's scores are packed, and the packing differs wildly — Lucene spans ~0.4–18.7 on this
catalogue, cosine ~0.75–0.84, raw RRF ~0.014–0.018. The same `high` setting was therefore a no-op
on one query and put an unrelated oolong tea at **rank 1** for `tomatoe` on another. Rank is
comparable across modes with no calibration.

**The `(targetRank, preRank)` tiebreak turns out to do real protective work** — see criterion (a).

### Method

Q1–Q5 × modes 3/4/5 × levels off/low/medium/high, plus the `Aroma Magic` regression case, at
**`page_size = 20`** (the production value, not the 5 used in earlier fixes). Read-only:
`POST /api/v1/search` only. 66 configurations.

### (a) `tomatoe` — hard floor holds, and the accepted trade-off did not materialise

| Mode | off | low | medium | high | boosted in top-5, any level | rank-1 product |
|---|---|---|---|---|---|---|
| mode 3 | — | — | 12 | **6** | 0 | `Tomato - Local (Loose)` |
| mode 4 | — | — | 12 | **6** | 0 | `Tomato - Local (Loose)` |
| mode 5 | — | — | 12 | **6** | 0 | `Tomato - Local (Loose)` |

✅ **No boosted document reaches rank 1 at any level in any mode** — the hard requirement. A tomato
holds rank 1 in all 12 configurations.

**Better than the accepted trade-off:** we agreed a boosted-but-irrelevant document could enter the
top 5 at `high`. It didn't — the best Teamonk document lands at **rank 6**, just outside. The
mechanism is worth understanding, because it is the tiebreak rather than the bound doing the work:
Teamonk's pre-boost rank is 106, so `ceil(106 / 25) = 5`. But the genuinely-relevant document at
`preRank 5` also has `targetRank 5`, and `(targetRank, preRank)` sorts it first — so the boosted
document is pushed to position 6. In general a boosted document cannot displace the documents
above its own `targetRank`, so entering the top 5 at `high` requires `preRank ≤ 100`.

**The margin is thin, and worth recording honestly: 106 against a threshold of 100.** A slightly
stronger spurious semantic match would have landed inside the top 5. The bound is real but it is
not a large safety margin on this query.

### (b) `green tea` — strictly monotonic, all three modes

| Mode | off | low | medium | high | monotonic & increasing? |
|---|---|---|---|---|---|
| mode 3 | 4 | 4 | 5 | 5 | ✅ yes |
| mode 4 | 3 | 4 | 5 | 5 | ✅ yes |
| mode 5 | 2 | 4 | 5 | 5 | ✅ yes |

Boosted documents in the top 5. Mode 5 is the clearest demo: **2 → 4 → 5 → 5**.

### (c) `beverages` — monotonic climb, never #1 at low or medium

| Mode | off | low | medium | high | monotonic? | not #1 at low/medium? |
|---|---|---|---|---|---|---|
| mode 3 | — | — | — | **—** | ✅ | ✅ |
| mode 4 | — | 18 | 8 | **4** | ✅ | ✅ |
| mode 5 | — | — | 16 | **7** | ✅ | ✅ |

Best Teamonk rank. Mode 4 climbs **18 → 8 → 4** and mode 5 **— → 16 → 7**, so the brand becomes
visibly more prominent at each level while never taking the top slot at low or medium. At `high`
mode 4 reaches rank 4 — inside the top 5, which is the intended "strong promotion" feel for a
brand that is plausibly relevant.

**Mode 3 is a no-op at every level**, unchanged from the original baseline: Teamonk is absent from
the entire 200-document vector window for `beverages`, so there is nothing to promote. No
amplification model can fix that without unioning the lexical match set into mode 3's candidates,
which would turn "pure vector" into a hybrid.

### (d) `Aroma Magic` — Fix #2 regression check passes

Query `face wash`, the case that exercised the padded-brand fix:

| Mode | off | low | high |
|---|---|---|---|
| mode 3 | rank 2, 0 flagged | rank 2, 9 flagged | rank 2, 13 flagged |
| mode 4 | rank 5, 0 flagged | rank 3, 7 flagged | rank 2, 12 flagged |
| mode 5 | rank 5, 0 flagged | rank 3, 7 flagged | rank 2, 12 flagged |

The brand with stray trailing whitespace still matches and still amplifies — 0 → 7–9 → 12–13
documents flagged on a 20-row page, with the best rank improving from 5 to 2 in the hybrid modes.

### (e) `Onion` — exact match holds rank 1

| Mode | amplification off | amplification high |
|---|---|---|
| mode 3 | `Onion` | `Onion` ✅ |
| mode 4 | `Onion` | `Onion` ✅ |
| mode 5 | `Onion` | `Onion` ✅ |

### (f) `score` is never multiplied by the boost factor

Same document, same query, same mode — amplification **off** versus **high** — for documents that
were *not* reordered:

| Mode | Query | Document | score (off) | score (high) | identical? |
|---|---|---|---|---|---|
| mode 3 | Q1 | Onion | 1.0 | 1.0 | ✅ yes |
| mode 3 | Q4 | Green Tea Mugs - Multicolour | 0.998376 | 0.998376 | ✅ yes |
| mode 3 | Q5 | Melatonin + Tagara Spray - Mint Fl | 1.0 | 1.0 | ✅ yes |
| mode 4 | Q1 | Onion | 1.0 | 1.0 | ✅ yes |
| mode 4 | Q5 | Natural Sleep Aid Supplement Table | 1.0 | 1.0 | ✅ yes |
| mode 5 | Q1 | Onion | 1.0 | 1.0 | ✅ yes |
| mode 5 | Q5 | Natural Sleep Aid Supplement Table | 1.0 | 1.0 | ✅ yes |

**7 of 7 non-boosted documents carry a byte-identical score with amplification on
and off.** The `score` field is the engine's own max-normalized value and contains none of our
amplification arithmetic — a change from the previous model, where modes 3/4/5 multiplied the
displayed score by `(1 + 0.05|0.10|0.15)`. Amplification is now visible only through the ordering
and the `isBoosted` badge, so a boosted document may legitimately show a *lower* score than the one
beneath it. That contrast is the intended explainability.

### Secondary observations

* **The three divergent `BOOST_MAP`s are gone**, replaced by one `AMPLIFICATION_FACTORS` in
  `utils.amplification_stages`. Net **−92 lines** across the four pipeline files. Mode 2 keeps its
  own `BOOST_MAP` (1.5/2.0/2.5) because it feeds Lucene's native boost, which is a different
  mechanism and works correctly.
* **`$documentNumber` accepts only a single-element `sortBy`** — `{score: -1, _id: 1}` fails with
  `Location5371602`. The helper therefore emits an explicit `$sort {score: -1, _id: 1}` first, for a
  deterministic total order, and then windows on `{score: -1}` alone. Documents with byte-identical
  scores still get a stable pre-rank in practice, though the ordering among exact ties is not
  guaranteed by the spec.
* **Amplification-off paths are untouched**: with no active rules the helper emits only
  `$set isBoosted: false` and the original `$sort`, so it adds no `$setWindowFields` cost and
  reproduces prior behaviour exactly.
* **Mode 3 amplification is now visible where it previously over-reacted.** In Fix #2 a level-1
  rule moved Aroma Magic from one slot to all five of the top 5; here low gives 9 flagged of 20 and
  high gives 13, a graduated response rather than a cliff.

---

## Post-fix verification — Fix 10 (mode 2 isBoosted flag under category-scoped rules)

Appended **2026-09-15**. A pre-existing mode 2 defect, surfaced by Fix #9's category-scoping
verification. Not a Fix #9 regression — `text_pipeline.py`'s flag logic was byte-identical to
`HEAD` when the bug was found.

### The bug

`_brand_amp_should_clauses` added every rule's brand to the unscoped `boosted_brands` list
*before* checking whether the rule was category-scoped:

```python
if brand not in boosted_brands:
    boosted_brands.append(brand)    # ran for scoped rules too
if not categories:
    ...
```

The `isBoosted` projection then tests `$in [normalized($brand), boosted_brands]` as the first arm
of an `$or`, so **any** document of that brand satisfied it regardless of category. The *ranking*
was always correct — a scoped rule's `should` clause uses `compound.must` on `brand` with a
`filter` on `category` — so this was a flag-only defect: mode 2 reported documents as boosted that
it had never actually boosted.

Same class of bug as Fix #2 (ranking right, flag wrong), and exactly the gap Fix #2's entry flagged
as untested: *"the category comparison is confirmed not-broken but not independently exercised"* —
because every Aroma Magic product in that store shares one category.

### The fix

Move the `boosted_brands` append inside the `if not categories:` branch, so brand-only rules
populate it and scoped rules rely solely on `brand_cat_pairs` — which the `$or`'s second arm
already checks via the `brand::category` concat. This mirrors the logic the rewritten
`utils.amplification_stages()` uses for modes 3/4/5.

### Method

The exact test that found the bug: query `green tea`, **mode 2**, store `store-030`,
`page_size = 50` (wide enough to hold Teamonk products from both categories). Genuine before and
after passes. Read-only.

### Acceptance — scoped rule `Teamonk` + `categories: ["Beverages"]`

| | in-`Beverages` flagged | out-of-category flagged | total flagged in page |
|---|---|---|---|
| BEFORE | 14/14 | **14/14** ❌ | 28 |
| AFTER | 14/14 | **0/14** ✅ | 14 |

✅ **Out-of-category Teamonk products now report `isBoosted: false`**, while all 14 in-category
ones still report `true`. Individual documents that flipped:

| Document (category `Gourmet & World Food`) | before | after |
|---|---|---|
| Strawberry Green Tea | `True` | **`False`** |
| Avana Darjeeling Green Tea | `True` | **`False`** |
| Ashwagandha Green Tea - Boosts Immunity | `True` | **`False`** |
| Ashwagandha Green Tea - Boosts Immunity | `True` | **`False`** |
| Pineapple Green Tea - Helps To Detox | `True` | **`False`** |

### Regression — Fix #2's brand-only rule (no `categories`)

| | Teamonk documents in page | flagged |
|---|---|---|
| BEFORE | 37 | 37/37 ✅ |
| AFTER | 37 | 37/37 ✅ |

Unscoped rules are unaffected — all 37 matching Teamonk products still flag `true`, and **0**
non-Teamonk documents are flagged.

### Ranking untouched

| Configuration | product order identical? | scores identical? | total_results |
|---|---|---|---|
| scoped rule | ✅ yes | ✅ yes | 786 → 786 |
| brand-only rule | ✅ yes | ✅ yes | 786 → 786 |
| no amplification | ✅ yes | ✅ yes | 786 → 786 |

The fix changes only which documents carry the flag. Order, scores and totals are byte-identical
in all three configurations, which is the expected result for a projection-only change.

### Secondary observations

* **Why this went unnoticed for so long:** it needs a brand whose products span more than one
  category *and* a rule scoped to one of them. Fix #2 used `Aroma Magic`, whose products in this
  store are all `Beauty & Hygiene`, so brand-only and scoped rules produced identical output.
  Teamonk spans `Beverages` and `Gourmet & World Food`, which is what exposed it.
* **User-visible impact before the fix:** `ProductCard.jsx:61,67` keys both the lime card highlight
  and the "Boosted" badge off `isBoosted === true`, so a merchandiser scoping a rule to
  `Beverages` saw Gourmet teas presented as boosted in mode 2 — a misleading explainability signal
  in exactly the panel built to demonstrate the feature.
* **Modes 3, 4 and 5 were already correct** after Fix #9: their `$switch` branches require brand
  **and** category, and `isBoosted` derives from the same factor, so the flag cannot disagree with
  the ranking. Verified at 0 out-of-category flags in all three during Fix #9's check.
* **The log line's meaning shifts slightly:** `boostedBrands=%d` now counts only brands with
  unscoped rules, with scoped ones counted under `brandCatPairs`. That is more accurate, but a
  reader comparing old and new logs should know the denominator changed.
