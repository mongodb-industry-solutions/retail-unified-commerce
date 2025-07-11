# ADR: Implementing Rich Full-Text Search Use Case with Atlas Search


Showcase **MongoDB Atlas Search** capabilities in Option 2 by delivering:

- **Relevance** (boost key fields)  
- **Typo tolerance** (fuzzy matching)  
- **Scoped results** (filter by store)  
- **Consistent paging** (same API shape as other options)  

---

## 🔍 Background

Our demo’s Option 1 used simple regex. While it works, it doesn’t:

- Rank by field importance  
- Handle user typos gracefully  
- Leverage Atlas’s text-indexing power  

Option 2 will use Atlas Search to unlock these features.
---

## 📑 Aggregation Pipeline Explained

pipeline = [
  {
    $search: {
      index: self.text_index,
      compound: {
        should: [
          // 1) Exact product name matches, highest weight
          {
            text: {
              query:   query,
              path:    "productName",
              score:   { boost: { value: 3 } },
              fuzzy:   { maxEdits: 2 }
            }
          },
          // 2) Secondary fields (brand, category…), lower weight
          {
            text: {
              query:   query,
              path:    ["brand", "category", "subCategory"],
              score:   { boost: { value: 1 } },
              fuzzy:   { maxEdits: 2 }
            }
          }
        ]
      }
    }
  },
  // Filter to the requested store inside the inventorySummary array
  {
    $match: {
      inventorySummary: {
        $elemMatch: { storeObjectId: ObjectId(store_object_id) }
      }
    }
  },
  // Split into “docs” (paginated results) and “count” (total hits)
  {
    $facet: {
      docs: [
        { $project: { **PRODUCT_FIELDS, score: { $meta: "searchScore" } } },
        { $skip: skip },
        { $limit: page_size }
      ],
      count: [ { $count: "total" } ]
    }
  },
  // Unwind and default total to zero if no hits
  { $unwind:     { path: "$count", preserveNullAndEmptyArrays: true } },
  { $addFields:  { total: { $ifNull: ["$count.total", 0] } } }
];


### Why this Pipeline?
* **Relevance** – Boosting `productName` ensures customer-facing names dominate ranking, while secondary fields still contribute matches.  
* **Typo Tolerance** – `fuzzy.maxEdits 2` lets users misspell (“milkk”) yet retrieve correct items.  
* **Store Scoping** – `$elemMatch` mirrors Option 1’s logic, preventing cross-store leakage.  
* **Stable Contract** – Retaining `$facet` keeps the API response shape unchanged, simplifying frontend logic.  
* **Operational Simplicity** – No synonym mappings or custom analyzers required, minimising Atlas admin tasks.

### Stage-by-Stage

1- $search

What? Runs Atlas Search over your collection.

Why? Leverages inverted indexes for lightning-fast, relevance-scored text queries.

Key Options:

*compound.should: Try multiple match strategies, whichever scores highest wins.

*text.path: Choose which fields to search (productName vs. metadata).

*score.boost: Weight productName higher so “organic milk” outranks “milk jug.”

*fuzzy.maxEdits: Tolerate up to two typos (“milkk” still matches “milk”).

2- $match + $elemMatch

What? Filters the array inventorySummary.

Why? Ensure we only show products available in the specific store. This mirrors Option 1 logic but in a post-search filter.

3- $facet

What? Creates two parallel pipelines:

docs: Your paginated product slice.

count: Total number of matching documents.

Why? Keeps API response shape consistent:
{
  "products": [...],
  "total_results": 42,
  "total_pages": 3
}

Benefit: Frontend doesn’t need special casing for Option 2.

4- $unwind + $addFields

What? Turns the count array into a single field and defaults to 0 if empty.

Why? Guarantee total is always a number, even when there are no hits.

---

Atlas Search Demo: Highlights built-in full-text power of MongoDB Atlas without third-party search services.

Business Value: Better UX → higher conversion. Typo tolerance and intelligent ranking keep customers engaged.

Operational Simplicity: No custom analyzers, no external synonym configs, no extra services.

Integrate vector search in hybrid mode (Option 4) to showcase semantic discovery.

### Why We Excluded `aboutTheProduct` from `$search`

We deliberately chose **not** to include the `aboutTheProduct` field in our Atlas `$search` pipeline.

**Reason:**  
This field typically contains long, descriptive marketing text or explanatory content. Including it in the full-text search index would shift our search results toward matches on generic phrases instead of precise product names, brands, or categories.

For this specific use case — where shoppers expect **precise, clear matches** on product names or key attributes — adding `aboutTheProduct` would introduce noise and unexpected hits, making the ranking less predictable.

Instead, we keep this field for:
- Display in the product details,
- Semantic search later (Option 3 & 4) where vector embeddings make sense,
- Contextual enrichments, but not for strict keyword-driven lookups.


