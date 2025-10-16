## ADR: Brand Amplification: Level Mapping and Pipeline Application  

**Date:** 2025-10-16  

---

### 1. Context  

Brand Amplification was added to highlight preferred brands or categories in search results — for example, to simulate marketing campaigns, partnerships, or brand prioritization.

The boost logic is defined **directly inside MongoDB aggregation pipelines**, where Atlas Search and Vector Search compute relevance.  
Each pipeline declares a `BOOST_MAP` dictionary that maps abstract levels (`1 | 2 | 3`) to numeric multipliers, making it easy to inspect and adjust amplification without leaving the query definition.

This design ensures that:  
- All boost logic is visible and editable directly in the aggregation pipeline.  
- The UI can control amplification intensity (`low`, `medium`, `high`).  
- The same abstraction works across text, vector, and hybrid searches.  
- No external post-processing modifies the final scores.  

---

### 2. Decision  

We adopted a consistent three-level mapping of brand amplification intensity, applied according to the type of search.  

| Search Type | How Boost Is Applied | Mapping Logic | Notes |
|:-------------|:--------------------|:--------------|:------|
| **Text (Atlas Search)** | Applied natively inside `$search.compound.should` via `score.boost.value`. | `low → ×1.5`, `medium → ×2.0`, `high → ×2.5`. | Boosting is fully integrated in Lucene’s scoring model, influencing term-level relevance during ranking. See [Atlas Search compound operator docs](https://www.mongodb.com/docs/atlas/atlas-search/compound/). |
| **Vector (Atlas Lucene)** | Post-processing multiplier applied to `$meta: vectorSearchScore`. | `low → +5%`, `medium → +10%`, `high → +15%` → `finalScore = base × (1 + factor)`. | `$vectorSearch` doesn’t support internal boosts. The operator retrieves top-k results by similarity (e.g., dotProduct) — filtered by store — then the multiplier is applied in `$set`. See [MongoDB Vector Search](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-overview/). |
| **Hybrid (RRF / ScoreFusion)** | Boost applied *after fusion* to maintain consistency between text and vector scores. | Same factors as vector: `+5% / +10% / +15%`. | `$rankFusion` and `$scoreFusion` combine results from text and vector searches differently: <br> • **RRF** ranks by reciprocal document order (rank-based). <br> • **ScoreFusion** merges numeric scores using a weighted average or expression. See [Rank Fusion](https://www.mongodb.com/docs/atlas/atlas-vector-search/rank-fusion/) and [Score Fusion](https://www.mongodb.com/docs/atlas/atlas-vector-search/score-fusion/). |

UI input → `"low" | "medium" | "high"`  
Builder translation → `{1, 2, 3}`  
Pipeline application → numeric factor via `BOOST_MAP`.

This unified model ensures predictable amplification behavior across search modes and makes every rule **traceable** from the query to the final ranked output.

---

### 3. Text Pipeline (Atlas Search)  

The text pipeline uses `$search.compound` with three main components:

1. **filter:** Limits results to the selected store (`inventorySummary.storeObjectId`). This does **not** affect score calculation.  
2. **must:** Executes the user query across weighted fields (`productName`, `aboutTheProduct`, `brand`, `category`, `subCategory`) with field boosts from ×3.0 to ×1.0.  
3. **should:** Injects brand amplification rules dynamically using `BOOST_MAP`:
   - Brand-only → e.g., `brand == "Teamonk"` → ×2.5 (high).  
   - Brand + Category → e.g., `brand == "Plum"` + `category == "Face Care"` → ×2.0 (medium).  

The pipeline then:
- Logs `originalScore` = `$meta: "searchScore"`.  
- Normalizes scores with `$setWindowFields` → `score = originalScore / maxScore`.  
- Projects an `isBoosted` flag for documents matching amplification rules.  

See [Atlas Search `$meta: searchScore`](https://www.mongodb.com/docs/atlas/atlas-search/scoring/#std-label-scoring-details).

---

### 4. Vector & Hybrid Pipelines  

#### 4.1 Vector Search  

`$vectorSearch` computes similarity using embeddings and a similarity function such as `dotProduct` or `cosine`.  
The engine returns a numeric score reflecting the proximity in embedding space. Because it doesn’t expose term-level boosting, we apply amplification externally:

```js
{
  $set: {
    score: { $multiply: ["$vectorScore", { $add: [1, "$boostFactor"] }] }
  }
}
```

This ensures the store filter (`inventorySummary.storeObjectId`) is respected first, and amplification happens safely on the already-ranked subset.  

See [MongoDB Vector Search reference](https://www.mongodb.com/docs/atlas/atlas-vector-search/).

---

#### 4.2 Hybrid Search (RRF vs ScoreFusion)  

MongoDB supports two hybrid ranking techniques that combine text and vector results:

| Method | Basis | When to Use | Normalization |
|:-------|:-------|:-------------|:---------------|
| **Reciprocal Rank Fusion (RRF)** | Rank-based: computes `1 / (rank + 60)` per document, weighted by pipeline importance. | When you want stable, order-driven blending (great for demos comparing modalities). | Uses document positions; independent of absolute score ranges. |
| **ScoreFusion** | Score-based: combines raw numeric scores using averaging or custom expressions. | When score magnitudes matter, or you want proportional blending (e.g., weight vector = 0.6, text = 0.4). | Supports built-in normalization modes: `none`, `sigmoid`, or `minMaxScaler`. Default: `sigmoid`. |

Example normalization from MongoDB docs:
```js
"input": { "normalization": "sigmoid" }
```
This rescales text and vector scores to the [0,1] range before weighting, ensuring cross-modality comparability.  

Official docs:  
- [Reciprocal Rank Fusion (RRF)](https://www.mongodb.com/docs/atlas/atlas-vector-search/rank-fusion/)  
- [Score Fusion ($scoreFusion)](https://www.mongodb.com/docs/atlas/atlas-vector-search/score-fusion/)  

---

### 5. Summary  

By implementing brand amplification **inside the pipelines**, we achieve:  
- Full visibility of scoring logic (`BOOST_MAP`, boosts, and filters).  
- Consistent mapping across text, vector, and hybrid modes.  
- Safe, bounded amplification that preserves ranking stability.  
- Clear correspondence between UI input and query-level behavior.

MongoDB’s `$search`, `$vectorSearch`, and `$scoreFusion` stages together enable a flexible hybrid ranking model where **boost rules are first-class citizens** of the data pipeline — not hidden in application code.

