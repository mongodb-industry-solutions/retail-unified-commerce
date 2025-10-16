## ADR: Brand Amplification – Level Mapping and Pipeline Application

**Date:** 2025-10  

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
| **Text (Atlas Search)** | Applied natively inside `$search.compound.should` via `score.boost.value`. | `low → ×1.5`, `medium → ×2.0`, `high → ×2.5`. | Boosting is fully integrated in Lucene’s scoring model, influencing term-level relevance during ranking. |
| **Vector (Atlas Lucene)** | Post-processing multiplier applied to `$meta: vectorSearchScore`. | `low → +5%`, `medium → +10%`, `high → +15%` → `finalScore = base × (1 + factor)`. | `$vectorSearch` doesn’t support internal boosts. The operator retrieves top-k results by similarity (e.g., dotProduct) — filtered by store — then the multiplier is applied in `$set`. |
| **Hybrid (RRF / ScoreFusion)** | Boost applied *after fusion* to maintain consistency between text and vector scores. | Same factors as vector: `+5% / +10% / +15%`. | `$rankFusion` and `$scoreFusion` combine results from text and vector searches differently: <br> • **RRF** ranks by reciprocal document order (rank-based). <br> • **ScoreFusion** merges numeric scores using a weighted average or expression. |

UI input → `"low" | "medium" | "high"`  
Builder translation → `{1, 2, 3}`  
Pipeline application → numeric factor via `BOOST_MAP`.

This unified model ensures predictable amplification behavior across search modes and makes every rule **traceable** from the query to the final ranked output.

---

### 3. Text Pipeline (Atlas Search)  

The text pipeline uses `$search.compound` (see [Atlas Search compound operator docs](https://www.mongodb.com/docs/atlas/atlas-search/compound/)) with three main components:

1. **filter:** Limits results to the selected store (`inventorySummary.storeObjectId`). This does **not** affect score calculation.  
2. **must:** Executes the user query across weighted fields (`productName`, `aboutTheProduct`, `brand`, `category`, `subCategory`) with field boosts from ×3.0 to ×1.0.  
3. **should:** Injects brand amplification rules dynamically using `BOOST_MAP`:
   - Brand-only → e.g., `brand == "Teamonk"` → ×2.5 (high).  
   - Brand + Category → e.g., `brand == "Plum"` + `category == "Face Care"` → ×2.0 (medium).  

#### Boost Value Strategy

The base query applies weighted field-level boosts (e.g. `productName ×3.0`, `brand ×1.2`, etc.) to reflect semantic importance.

To avoid interference with these core weights, brand amplification levels are capped below the maximum field boost:

- `low` → ×1.5  
- `medium` → ×2.0  
- `high` → ×2.5

This separation guarantees that amplification **elevates visibility** of relevant branded products without **overruling the primary query relevance**.

Even a high boost (×2.5) remains lower than `productName`'s ×3.0, preserving the dominance of strong lexical matches.

#### Normalization and Boost Value Ranges

All text-based results are normalized to the [0, 1] range using `$setWindowFields`, where each document’s score is divided by the maximum raw score observed in the set:

```js
score = originalScore / maxScore
```

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
- [Reciprocal Rank Fusion (RRF)](https://www.mongodb.com/docs/manual/reference/operator/aggregation/rankFusion/)  
- [Score Fusion ($scoreFusion)](https://www.mongodb.com/docs/manual/reference/operator/aggregation/scoreFusion/)  

---

### 5. Brand Amplification Rules (Vector & Hybrid)

In vector and hybrid pipelines, amplification rules are **constructed dynamically** based on configuration received from the API layer.

#### How Rules Are Built

The builder translates each brand amplification rule into conditional branches using `$switch`:

```js
boostFactor = {
  $switch: {
    branches: [
      {
        case: { $and: [{ $eq: ["$brand", "Acme"] }, { $eq: ["$category", "Skincare"] }] },
        then: 0.10 // Level 2 (medium)
      },
      {
        case: { $eq: ["$brand", "Acme"] },
        then: 0.05 // Level 1 (low)
      }
    ],
    default: 0
  }
}
```

Each document is evaluated against these branches, producing a deterministic `boostFactor`.

#### How Rules Are Applied

Once `boostFactor` is computed:
```js
boostedScore = baseScore * (1 + boostFactor)
isBoosted = boostFactor > 0
```

- For **Vector Search**, `baseScore` = `$meta: "vectorSearchScore"`.  
- For **Hybrid (RRF/ScoreFusion)**, `baseScore` = the combined fusion score (`rrfScore` or fused numeric score).  

This method ensures the boost is **proportional and non-destructive**:  
documents keep their semantic relevance ordering, but boosted entries gain slight promotion.

#### Example
| Brand | Category | Base Score | Rule | Final Score | isBoosted |
|:-------|:----------|:------------|:------|:-------------|:------------|
| Acme | Skincare | 0.72 | Level 2 (0.10) | 0.72 × 1.10 = **0.792** | ✅ |
| Acme | Haircare | 0.70 | Level 1 (0.05) | 0.70 × 1.05 = **0.735** | ✅ |
| Other | Skincare | 0.69 | — | 0.69 × 1.00 = **0.690** | ❌ |

---

### 6. Summary  

By implementing brand amplification **inside the pipelines**, we achieve:  
- Full visibility of scoring logic (`BOOST_MAP`, boosts, and filters).  
- Consistent mapping across text, vector, and hybrid modes.  
- Safe, bounded amplification that preserves ranking stability.  
- Clear correspondence between UI input and query-level behavior.

MongoDB’s `$search`, `$vectorSearch`, and `$scoreFusion` stages together enable a flexible hybrid ranking model where **boost rules are first-class citizens** of the data pipeline — not hidden in application code.