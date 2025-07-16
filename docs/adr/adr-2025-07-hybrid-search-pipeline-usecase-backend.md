# ADR-014: Hybrid Search with Reciprocal Rank Fusion (Option 4)


Our demo microservice showcases four search options.  
**Option 4** implements **Hybrid Search**, combining:

- **Atlas Full-Text Search** (keyword-based relevance)
- **Vector Search** (semantic embeddings similarity)

The combination uses **Reciprocal Rank Fusion (RRF)** to produce a unified, de-duplicated ranking of products.

---

## 🔍 Problem

- **Keyword search alone** cannot capture user intent beyond exact words.
- **Vector search alone** may return semantically similar but commercially irrelevant items (e.g. substitutes rather than the precise brand searched).
- Retail search often benefits from **hybrid approaches**, balancing business priorities and customer expectations.

---

## 💡 Decision

### 🛠️ Clean Architecture Flow

| Layer | Responsibility | Implementation |
|-------|----------------|----------------|
| **Application (Use Case)** | Orchestrates embedding + hybrid RRF pipeline call. | `HybridRRFSearchUseCase._run_repo_query()` |
| **Infrastructure (AI Adapter)** | Generates the query embedding. | `VoyageClient.create_embedding()` |
| **Infrastructure (DB Adapter)** | Runs `$search`, `$vectorSearch`, and `$rankFusion`. | `MongoSearchRepository.search_hybrid_rrf()` |

---

### 🔑 Why this design?

✅ **Separation of Concerns**

- **Embedding logic** stays in the Infrastructure adapter (VoyageClient).  
- **Hybrid pipeline orchestration** stays in the Application layer (use case).  
- **Database logic** stays in the Infrastructure repository.

This ensures:

✔️ We can change the embedding provider (Voyage, Bedrock, OpenAI) without touching the use case logic.  
✔️ We can tweak MongoDB search pipelines without impacting how embeddings are generated.  
✔️ The use case remains thin, testable, and focused on orchestration.

---

### ✨ Pipeline Overview (Option 4)

1. **Embedding step**

    - Calls `VoyageClient.create_embedding(query)`.  
    - Returns a dense vector representing query meaning.

2. **MongoDB Hybrid RRF**

    The repository runs:
```js
        $rankFusion:
          input:
            pipelines:
              vectorPipeline:
                - $vectorSearch
              textPipeline:
                - $search
          combination:
            weights:
              vectorPipeline: 0.7
              textPipeline: 0.3
          scoreDetails: true
```
✅ This fuses the two result sets using **weighted reciprocal ranks**, combining:

- **Semantic similarity** (vector pipeline)  
- **Exact and fuzzy keyword matches** (text pipeline)

---

3. **Filter by store**

    Filters results to only include products in the requested store:
```js
        $match:
          inventorySummary:
            $elemMatch:
              storeObjectId: ObjectId(store_object_id)
```
---

4. **Pagination and count**

Uses a `$facet` stage to:

- Return `docs` (paged slice)  
- Calculate `count` (total hits)

✅ Ensures the API response shape is consistent across all search options.

---

### 💡  Insight about Hybrid Search Dynamic Weight Distribution Strategies

How we **distribute the weight between semantic (vector) and text (keyword) pipelines** in Hybrid Search directly impacts **search relevance and user experience**.

---

### ⚙️ **Approach 1 – Simple Programmatic Logic**

We can implement **basic heuristics** directly in code:

- **Short queries (1-2 words)** → likely precise intent  
  ➔ Prioritize **text search** for exact matches.

- **Longer queries (3+ words)** → users express meaning or context  
  ➔ Prioritize **semantic search** to capture intent beyond keywords.

🔧 *This approach is quick to implement and aligns with typical user behavior patterns.*

---

### 🧪 **Approach 2 – Data-Driven Weight Tuning**

Beyond heuristics, it is valuable to:

- **Experiment with different weight distributions** (e.g. 0.7 vector / 0.3 text vs. 0.5 / 0.5)
- Measure performance against your **specific catalog and user queries** to determine the **optimal balance** for:

  - Click-through rates (CTR)
  - Conversion rates
  - User satisfaction and relevance perception

✅ *Testing and tuning weights ensures Hybrid Search aligns with your data richness and business goals.*

---

### 🤖 **Approach 3 – AI Agent Orchestration**

We can go even further by integrating an **AI agent as an intermediate layer** between the frontend and our Advanced Search microservice.

This agent would:

1. **Interpret the user query**, analyzing intent and language complexity.  
2. **Decide dynamically**:

   - Which search strategy to call (Option 1, 2, 3, or Hybrid Search).  
   - What weight distribution to set in Hybrid Search for **optimal results**.

🔗 *Example flow:*

- User query ➔ Agent interprets ➔ Sets weights ➔ Calls Hybrid Search endpoint with parameters ➔ Returns results to user.

---

### 🎯 **Key Takeaway**

✅ We can implement **dynamic weight distribution** via:

- Simple query-based heuristics  
- Data-driven tuning experiments  
- AI agent orchestration for real-time intent-based decisions

Together, these approaches ensure our search system **adapts intelligently to each user query**, maximizing relevance, satisfaction, and business impact.

---

