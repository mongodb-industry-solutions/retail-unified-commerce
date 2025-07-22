# ADR-SEARCH-KEYWORD-PIPELINE.md

## Title: Keyword Search Pipeline Design in Product Search Use-Case

**Date:** July 2025

### Context

In our **Advanced Product Search microservice**, implemented within the **infrastructure/search_repository layer**, we provide a **keyword-based search use-case** to allow users to find products by name efficiently within a specific store’s inventory.

The initial solution leveraged MongoDB’s aggregation framework to:

- **Filter** products available in a specific store.
- **Search** products using case-insensitive regex on `productName`.
- **Paginate results**.
- **Retrieve the total hit count** in a single database call.

However, we observed performance concerns with general substring regex searches. To address this, we updated the pipeline to use a **prefix regex (`^query`)** approach, which performs significantly faster by allowing index utilization.

Additionally, in the updated implementation, we **filter the `inventorySummary` array** to include only the relevant store’s data before returning results. This ensures the frontend receives only the inventory context it requested, keeping responses minimal and clean.

We maintain this implementation to **compare traditional regex-based search performance with Atlas Search capabilities**, highlighting the value of full-text, fuzzy, and vector search features for business stakeholders and demos.

---

### Decision

We designed a pipeline with these stages:

1. **`$match`:**  
   Filters products where `inventorySummary` has at least one item with `storeObjectId` matching the requested store, and where `productName` matches the **query as a prefix**, using case-insensitive regex (`^query`).

2. **`$project`:**  
   Projects only the necessary fields (`PRODUCT_FIELDS`), excluding heavy data like embeddings to keep responses lightweight.

3. **`$facet`:**  
   Splits into two sub-pipelines:
   - `docs`: retrieves paginated results using `$skip` and `$limit`.
   - `count`: calculates the total number of matched products using `$count`.

4. **`$unwind`:**  
   Flattens the `count` array into a single field.

5. **`$addFields`:**  
   Ensures a `total` field is always returned, defaulting to 0 if no results are found.

6. **Filter inventorySummary (Python post-processing):**  
   After retrieving results from MongoDB, the repository filters each document’s `inventorySummary` array to include only the entry matching the requested `storeObjectId`, ensuring responses remain minimal and store-scoped.

Example (simplified) pipeline snippet:
```js
pipeline = [
    {
        "$match": {
            "inventorySummary": {
                "$elemMatch": {
                    "storeObjectId": ObjectId(store_object_id)
                }
            },
            # ✅ Using prefix regex for better index utilization
            "productName": {"$regex": f"^{query}", "$options": "i"},
        }
    },
    {"$project": PRODUCT_FIELDS},
    {"$facet": {
        "docs": [
            {"$skip": skip},
            {"$limit": page_size},
        ],
        "count": [{"$count": "total"}],
    }},
    {"$unwind": {"path": "$count", "preserveNullAndEmptyArrays": True}},
    {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
]
```
---

### Rationale

✔️ **Efficiency:** Using `$facet` avoids two separate database queries for pagination and counting.  
✔️ **Performance:** Using prefix regex (`^query`) allows MongoDB to leverage indexes, improving search performance over general substring regex.  
✔️ **Scalability:** `$elemMatch` efficiently filters embedded arrays (`inventorySummary`).  
✔️ **Maintainability:** Keeping this logic within the repository maintains clean separation from the domain and application layers.  
✔️ **Comparative Value:** Keeps a baseline regex-based search to demonstrate and compare the benefits of Atlas Search text, vector, and hybrid queries in demos and performance benchmarks.

---

### Notes

- Better performance with prefix regex compared to general regex searches.
- Enables direct comparison of classic regex search vs. Atlas Search in demos and technical discussions.
- Regex search, even with prefixes, is still limited compared to full-text indexes for linguistic and typo-aware search.
- Requires proper indexing on `productName` to be effective.
- May not handle advanced ranking, synonyms, or fuzzy matching as Atlas Search does.
