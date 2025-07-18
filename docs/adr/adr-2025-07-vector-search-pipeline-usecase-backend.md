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

### 🔑 Why Clean Architecture matters here

✅ **Separation of Concerns**

By isolating **embedding logic in the Infrastructure layer**, our Application layer (use cases) stays agnostic to *which AI provider we use*.

✔️ If in the future we:

- **Change provider** (e.g. from Voyage AI to OpenAI or Bedrock)  
- **Use multiple embedding services** (e.g. one for short text, another for images)  
- **Implement an in-house embedding service**

👉 **We only swap or extend the adapter**, without touching the application orchestration or business logic.

---

### 📝 Detailed Pipeline (Option 3)

# Embedding Step

Calls `VoyageClient.create_embedding()`

Returns a dense vector (e.g. 768 floats).

📖 *This happens in the **Infrastructure layer**, called by the **Application layer (use case)**.*

---

# Vector Search in MongoDB

The repository runs:
```js
    $vectorSearch:
      index: product_text_vector_index
      path: textEmbeddingVector
      queryVector: <embedding>
      numCandidates: 200
      limit: 200
```
✅ Finds top 200 products by semantic similarity.

---

# Filter by Store

Ensures results only include products available in the requested store:
```js
    $match:
      inventorySummary:
        $elemMatch:
          storeObjectId: ObjectId(store_object_id)
```
---

# Pagination and Count

A `$facet` stage:

- Returns `docs` (paged slice)
- Calculates `count` for total hits

✅ Keeps the API response identical to Options 1 and 2.

---

### 📈 Consequences

| ✅ Pros | ⚠️ Cons |
|---------|--------|
| Real semantic search UX. | Adds embedding latency (300-500ms). |
| Easy to swap AI providers (Clean Architecture). | Requires external API management. |
| Supports multiple embedding strategies in the future. | Slight cost per embedding call. |

---
