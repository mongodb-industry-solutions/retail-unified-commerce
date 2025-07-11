# ADR-SEARCH-KEYWORD-PIPELINE.md

## Title: Keyword Search Pipeline Design in Product Search Use-Case

### Date
July 2025

---

### Context

In our **Advanced Product Search microservice**, we implemented a **keyword-based search use-case** to allow users to find products by name within a specific store’s inventory efficiently.

The solution leverages MongoDB’s aggregation framework to:

- **Filter** products available in a specific store.
- **Search** products using case-insensitive regex on `productName`.
- **Paginate results**.
- **Retrieve the total hit count** in a single database call.

---

### Decision

We designed a pipeline with these stages:

1. **`$match`:**  
   Filters products where `inventorySummary` has at least one item with `storeObjectId` matching the requested store, and where `productName` matches the query using case-insensitive regex.

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

        pipeline = [
            {
                "$match": {
                    "inventorySummary": {
                        "$elemMatch": {
                            "storeObjectId": ObjectId(store_object_id)
                        }
                    },
                    "productName": {"$regex": query, "$options": "i"},
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
---

### Rationale

✔️ **Efficiency:** Using `$facet` avoids two separate database queries for pagination and counting.  
✔️ **Performance:** `$project` ensures only necessary fields are retrieved, reducing data transfer size.  
✔️ **Scalability:** `$elemMatch` efficiently filters embedded arrays (`inventorySummary`).  
✔️ **Maintainability:** Keeping this logic within the repository maintains clean separation from the domain and application layers.

---

### Consequences

✅ **Positive:**
- Faster response times by reducing multiple round-trips to the database.
- Lower payload size improves frontend performance.
- Clear, reusable implementation for similar search use-cases.

⚠️ **Negative:**
- Regex search may not leverage indexes fully, affecting performance on large datasets.  
- Requires proper indexing and usage monitoring in production.

---

