# ADR: Vector Search Use Case with Voyage AI Embeddings

**Date:** July 2025

---

## 🎯 Context

We want our demo microservice to showcase **semantic search** capabilities by integrating:

- **Voyage AI** (to create embeddings)  
- **MongoDB Atlas Vector Search** (to find similar products)

---

## 🔍 Problem

Traditional keyword search fails when customers use natural language queries like:

> *“vegan chocolate without nuts”*

They may not use exact product names or categories. We need:

1. **Embeddings** – numerical representations capturing meaning beyond keywords.  
2. **k-NN vector search** – to find products with similar semantics, even if words differ.

---

## 💡 Decision

### 🛠️ Clean Architecture Flow

| Layer | Responsibility | Implementation |
|-------|----------------|----------------|
| **Application (Use Case)** | Orchestrates the embedding and DB query. | `VectorSearchUseCase._run_repo_query()` |
| **Infrastructure (Adapter)** | Calls Voyage AI to create embeddings. | `VoyageClient.create_embedding()` |
| **Domain** | N/A (no business logic here). | – |
| **Infrastructure (DB Adapter)** | Runs `$vectorSearch` in Atlas. | `MongoSearchRepository.search_by_vector()` |

---

## 🧠 Lucene k-NN Vector Search Pipeline — Step-by-Step Guide

## 🔍 Overview

This pipeline powers **option 3** of our advanced search API using **MongoDB Atlas Lucene Vector Search**. It efficiently returns relevant product results based on semantic similarity, filters by store and optional stock status, and paginates responses.

It is defined in:

```
app/infrastructure/mongodb/pipelines/vector_pipeline.py
```
### 🔧 Aggregation Pipeline for Vector Search

This pipeline powers semantic product search using MongoDB Atlas' `$vectorSearch` stage and returns paginated results with total hits.

```js
pipeline = [
  // 1. Lucene k-NN search with optional store and stock filter
  {
    $vectorSearch: {
      index: vector_index,
      path: vector_field,
      queryVector: embedding,
      numCandidates: num_candidates,
      limit: knn_limit,
      filter: filter_conditions,
    }
  },

  // 2. Promote the Lucene similarity score as a normal field
  { $set: { score: { $meta: "vectorSearchScore" } } },

  // 3. Use $facet to paginate and count in parallel
  {
    $facet: {
      docs: [
        { $project: projection },
        { $skip: skip },
        { $limit: limit },
      ],
      count: [{ $count: "total" }]
    }
  },

  // 4. Flatten count result and clean up output
  { $unwind: { path: "$count", preserveNullAndEmptyArrays: true } },
  { $addFields: { total: { $ifNull: ["$count.total", 0] } } },
  { $project: { count: 0 } }
]
```
---

## ⚙️ Pipeline Breakdown

| Stage     | Description                           | Details |
| --------- | ------------------------------------- | ------- |
| **1. **`` | Performs Lucene vector k-NN retrieval |         |

````jsonc
{
  index: "<vector_index>",
  path: "<vector_field>",
  queryVector: <embedding>,
  numCandidates: 200,
  limit: 200,
  filter: {
    "inventorySummary.storeObjectId": ObjectId("<store_id>"),
    "inventorySummary.inStock": <optional_bool>
  }
}
``` |
| **2. `$set` (`score`)** | Promotes the Lucene similarity score to a regular field so it survives `$facet` |
| **3. `$facet`** | Splits the pipeline into two branches: one paginates results, the other counts total hits |
| **4. `$unwind` + `$addFields`** | Flattens the result and ensures `total = 0` if no hits |
| **5. `$project` (`count`=0)** | Hides the internal `count` doc, output is clean: `{ docs: [...], total: <int> }` |

---

## 🧹 Projection Strategy

All pipelines share a **centralized projection definition**:  
```python
from app.infrastructure.mongodb.utils import PRODUCT_FIELDS
````

At runtime, it is merged with:

```python
{"score": 1}
```

to preserve Lucene relevance scores in the final results.

---

## ⚖️ Configurable Parameters

| Parameter                     | Purpose                                 | Default  |
| ----------------------------- | --------------------------------------- | -------- |
| `embedding`                   | The 1024-dimensional query vector       | —        |
| `vector_index`                | Lucene index to use                     | required |
| `vector_field`                | Field in documents holding embeddings   | required |
| `store_object_id`             | Filter results to a specific store      | required |
| `in_stock`                    | Optional filter on product availability | None     |
| `skip`, `limit`               | Pagination controls                     | 0, 20    |
| `num_candidates`, `knn_limit` | Control recall vs performance trade-off | 200, 200 |

---

## 🌟 Highlights

- ⚡ **Fast similarity search** over millions of embeddings
- 🧼 **Clean, reusable output** with pagination & total hits
- 🧩 **Composable**: works with hybrid pipelines and re-ranking
- 🧠 Designed for real-time retail use cases

---

