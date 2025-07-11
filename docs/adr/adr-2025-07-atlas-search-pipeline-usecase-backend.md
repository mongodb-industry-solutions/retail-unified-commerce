# ADR: Implementing Atlas Search Pipeline in Product Search Use Case

- **ID**: adr-2025-07-atlas-search-pipeline-usecase-backend
- **Date**: July 2025
- **Status**: Accepted
- **Context**: Backend – advanced-search-ms

## 🎯 Context

We needed to implement **robust, typo-tolerant, semantically rich product search** within the advanced search microservice. Requirements included:

- Tolerance to user typos (fuzzy search).
- Synonyms support for multilingual and alternate keyword searches.
- Boosting relevance of product name over other fields (brand, category, subCategory).
- Efficient retrieval scoped to the selected store only.

MongoDB Atlas Search provides a powerful `$search` aggregation stage enabling these features without external search engines.

---

## 💡 Decision

We implemented **Option 2** (`search_atlas_text`) in `MongoSearchRepository` using an Atlas Search pipeline with:

✅ **Compound query** to combine boosted relevance across fields.  
✅ **Fuzzy search (`maxEdits=2`)** for typo tolerance.  
✅ **Synonyms mapping** (`"default_synonyms"`) to expand user queries with predefined synonyms.  
✅ **Boost configuration** giving:
- **High weight (3x)** to `productName`.
- **Lower weight (1x)** to `brand`, `category`, and `subCategory`.

### Pipeline snippet


pipeline = [
    {
        "$search": {
            "index": self.text_index,
            "compound": {
                "should": [
                    {
                        "text": {
                            "query": query,
                            "path": "productName",
                            "score": {"boost": {"value": 3}},
                            "fuzzy": {"maxEdits": 2},
                            "synonyms": "default_synonyms",
                        }
                    },
                    {
                        "text": {
                            "query": query,
                            "path": ["brand", "category", "subCategory"],
                            "score": {"boost": {"value": 1}},
                            "fuzzy": {"maxEdits": 2},
                            "synonyms": "default_synonyms",
                        }
                    }
                ]
            }
        }
    },
    {"$match": {"inventorySummary.storeObjectId": ObjectId(store_object_id)}},
    {"$project": {**PRODUCT_FIELDS, "score": {"$meta": "searchScore"}}},
    ...
]
---

## ✨ Rationale

This approach:

- **Improves UX** by forgiving minor typos in search terms.
- **Expands results intelligently** with synonyms (e.g. "chips" ~ "crisps").
- **Prioritises productName** to show direct matches first.
- **Avoids external dependencies**, keeping search native within MongoDB Atlas.

---

## 🔍 Consequences

✅ More relevant results with minimal user frustration.  
✅ No infrastructure complexity (Atlas Search is fully managed).  
⚠️ Slightly higher resource usage per query due to fuzzy matching and synonyms expansion (acceptable given the business value).

---

## 👩‍🏫 Didactic Note

This design follows the **Repository Pattern** (hiding database details) combined with the **Template Method Pattern** in use cases, ensuring clean separation of concerns while supporting multiple search strategies with minimal duplication.

---

## 🔗 Related

- MongoDB Atlas Search documentation: [Compound + Fuzzy + Synonyms](https://www.mongodb.com/docs/atlas/atlas-search/compound/)

---

## ❓ Additional Notes on Indexes

✔️ **Atlas Search does not use standard MongoDB indexes** (`db.collection.createIndex`). It uses **Atlas Search Indexes**, Lucene-based indexes managed within Atlas.  
✔️ The index must exist with configured synonyms if used, and it is selected in the query with `"index": self.text_index`.  
✔️ Fuzzy queries are more computationally expensive than exact text matches, but Atlas manages scalability.  
✔️ Reindexing is required when changing index configurations (paths, synonyms).  
✔️ Performance and cost depend on pipeline complexity and data volume indexed.

---