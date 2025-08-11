# Search Indexes (Atlas Search & Vector) – Setup Guide

> This guide complements:
> - **Root README** (overview, Docker startup)
> - **Collections Setup Guide** (`docs/setup/collections/README.md`) – modeling and triggers  
> Here we focus exclusively on **creating** the search indexes and ensuring configuration alignment.

---

## What You Will Create

- **Text index (Atlas Search):** `product_atlas_search`  
  - Fields: `brand`, `category`, `productName`, `subCategory`  
  - Store filter via `inventorySummary.storeObjectId` (ObjectId)

- **Vector index (Vector Search):** `product_text_vector_index`  
  - Vector: `textEmbeddingVector` with **1024** dimensions, `similarity: cosine`  
  - Filters: `inventorySummary.storeObjectId`, `inventorySummary.inStock`

> Names must match the configuration fields in your example environment files.

---

## Pre-flight Checklist (2 min)

- [ ] Database is `retail-unified-commerce`.  
- [ ] The `products` collection contains:  
  `brand`, `category`, `productName`, `subCategory`,  
  `inventorySummary.storeObjectId` (**ObjectId**), `inventorySummary.inStock` (**boolean**),  
  `textEmbeddingVector` (**array of 1024 floats**).  
- [ ] Query embedding model matches the one used for `textEmbeddingVector` (e.g., `voyage-3-large`).

---

## 1) Create **Atlas Search** (Text)

In Atlas → **Data Services → Search → Create Search Index**  
Select **DB** `retail-unified-commerce` and **Collection** `products`.  
**Name:** `product_atlas_search` → **JSON Editor** → paste the content from:

📄 [`docs/indexes/search-index.json`](search-index.json)

---

## 2) Create **Vector Search**

Create a **Vector Search** index in the same collection.  
**Name:** `product_text_vector_index` → paste the content from:

📄 [`docs/indexes/vector-index.json`](vector-index.json)

> If your embeddings are not 1024 dimensions, adjust `numDimensions` or regenerate embeddings.

---

## 3) Relevant Configuration Fields

These fields define which index names the applications will use:

- **Frontend** → [`frontend/.env.example`](../../frontend/.env.example)  
  SEARCH_INDEX=product_atlas_search

- **Backend** → [`backend/advanced-search-ms/.env.example`](../../backend/advanced-search-ms/.env.example)  
  SEARCH_TEXT_INDEX=product_atlas_search  
  SEARCH_VECTOR_INDEX=product_text_vector_index

---

