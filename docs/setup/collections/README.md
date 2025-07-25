# 🗃️ Collections Setup Guide

This guide will walk you through the best-practice setup for the MongoDB Atlas collections powering the unified commerce demo. You'll learn not only *how* to import, index, and connect your data—but also *why* the underlying schema is modeled this way to maximize search performance and operational efficiency in a multi-store retail scenario.

---

## 1. 🏗️ Database Setup

Start by creating a MongoDB database. We recommend naming it `retail-unified-commerce` (update your `.env` if you choose a different name).

---

## 2. 📦 Import Demo Collections

Three sample `.json` files are provided:

- [`products`](./retail-unified-commerce.products.json)
- [`inventory`](./retail-unified-commerce.inventory.json)
- [`stores`](./retail-unified-commerce.stores.json)

### Importing Data

1. Go to your MongoDB Atlas cluster → **Browse Collections**.
2. Create each collection in your target database.
3. Use the **Import** feature to upload the relevant JSON into each collection.

---

## 3. 🧠 Data Model: Design Rationale

This demo follows a modern, **retail-oriented schema** that optimizes for intelligent product discovery, store operations, and scalable search. The data model is built on MongoDB’s flexible document approach, aligning with the *Extended Reference Pattern*—a hybrid strategy that materializes just enough data for high-speed queries while preserving a normalized source of truth.

#### **`products` Collection**


- **What it stores:** Core product details, semantic enrichment (embeddings), and a summary of per-store inventory.
- **Key fields:**
  - `embeddingText`: Composite field for vector search (built from product description -aboutTheProduct field-, brand, category, subcategory, and quantity).
  - `imageUrlS3`: Product image for multimodal search.
  - `inventorySummary`: Embedded array with **only the essential inventory info per store**.

> This *summary* is maintained in sync with the transactional `inventory` collection via an Atlas Trigger (real-time sync, no polling). You get:
>
> - A **write-optimized **`` collection for ingesting updates.
> - A **read-optimized **`` collection, perfect for instant search, store filtering, and UI/API responses.

#### **Why embed a summary?**

- In retail, you **search by product, but act by local inventory** (availability, replenishment, etc).
- Embedding a filtered summary for each store lets you:
  - Query “products in stock near me” without joins/lookups.
  - Present store-level context in discovery flows.
  - Accelerate search with `$elemMatch` and targeted indexes.

> **Scalability note:**\
> This model is proven efficient for up to \~100 stores per product and thousands of products—ideal for demos and mid-sized deployments. If scaling to hundreds of stores per product, consider limiting the embedded summary to relevant stores or alternative patterns.

#### **Pattern Used: Extended Reference Pattern**

- [MongoDB Docs: Extended Reference Pattern](https://www.mongodb.com/blog/post/6-rules-of-thumb-for-mongodb-schema-design-part-1)
- A materialized, always-fresh summary inside the read-optimized document, powered by triggers/change streams.
- **Not** a pure reference (which would require runtime joins) nor full embedding (which would duplicate all inventory).

---

### **`stores` Collection**

- Stores geospatial metadata (`Point`), layout (sections/aisles/shelves), open hours, and time zone.
- Enables:
  - **Geospatial queries** (find stores near a point)
  - Intelligent routing/navigation in apps
  - Planogram and layout insights

---

### **`inventory` Collection**

- **Source of truth** for all stock data.
- Each document tracks one product’s inventory *across* multiple stores:
  - `storeInventory[]`: Array per store, with shelf/backroom qty, replenishment flags, and predictive fields.
  - Denormalized `storeName` and `location` for speed.
  - Designed for high-frequency updates, event ingestion, and analytics.

> **Why decouple?**\
> Heavy writes go to `inventory` (normalized, lean, fast for bulk ingest), while only the *summary* needed for search is pushed to `products`.

---

## 4. ⚡ Atlas Indexing Best Practices

For best performance:

- **Text & Vector Search:**
  - See [`search-index.json`](../indexes/search-index.json)
  - See [`vector-index.json`](../indexes/vector-index.json)
- **Inventory Filtering:**
  - Add a compound index on `inventorySummary.storeId` (and any flag commonly filtered).
- **Geospatial:**
  - Index `stores.location` as `2dsphere` for proximity searches.

📁 Find index definitions in [`docs/setup/indexes/`](../indexes/).

---

## 5. ⚙️ Real-Time Inventory → Product Sync

A **single Atlas Trigger** keeps `products.inventorySummary` always in sync with the canonical `inventory` collection.

- **Pattern:** Materialized View / Extended Reference Pattern
- **How:** Trigger listens to insert/update/replace on `inventory`, rewrites only relevant summary data into the matching product.

```text
Trigger type   : Collection
Collection     : <your_db>.inventory
Ops            : Insert, Update, Replace
Full Doc Lookup: ON
Options        : Auto-Resume = ON, Event Ordering = ON
```

| File                            | What it does                                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory_sync.js`             | Production-ready trigger: condenses `inventory` changes into `{ storeId, sectionId, aisleId, shelfId, inStock, nearToReplenishmentInShelf }` and updates the product. |
| `daily_inventory_simulation.js` | *(Optional)* Helper to simulate dynamic inventory and see the trigger in action.                                                                                      |

**Why?**

- No polling, no complex join logic, instant reflection of inventory in the product catalog.
- **Workload isolation:** Search-intensive apps can read from secondary replicas (“read-only”), ensuring search is fast even during heavy updates.

---

## 6. 📚 Dataset Source

- [Big Basket Products Dataset on Kaggle](https://www.kaggle.com/datasets/chinmayshanbhag/big-basket-products)\
  Enriched for this demo with semantic metadata, vector embeddings, and simulated multi-store inventory.

---

> ✅ Collections are ready!\
> Next step: Go back to the [root README](../../../README.md) to continue the app setup and explore the unified commerce demo.

