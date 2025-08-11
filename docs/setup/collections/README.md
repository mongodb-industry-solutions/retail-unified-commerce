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

![Product Document example](docs/images/product_document.png)

### Importing Data

1. Go to your MongoDB Atlas cluster → **Browse Collections**.
2. Create each collection in your target database.
3. Use the **Import** feature to upload the relevant JSON into each collection.



## 3.🧠 Data Modeling

**Relational vs. MongoDB — Two approaches. Two mindsets.**

### In relational databases
- You model entities and relationships first — using strict normalization (Third Normal Form).  
  There’s essentially one “right” way to model the data.
- Then you write the queries (the workload).
- You avoid duplication and rely on joins.
- ✏️ The schema is rigid and expensive to change.

### In MongoDB
- 🍃 You start by analyzing the workload — estimating data size and measuring read/write operations.
- 🍃 You identify and quantify relationships — embedding or referencing as appropriate.
- 🍃 You apply schema design patterns for peak performance.
- ✏️ The schema is flexible and evolves without friction.

---

### Workload & Scale Assumptions for This Demo

- **Entities**: products, stores, inventory.
- **Read paths**: product discovery (text + vector search) with **store-aware filters** (availability, replenishment flags).
- **Write paths**: frequent stock updates (per store) flowing into a canonical inventory store.
- **Scale**:
  - **Real scenario**: ~**6,000 products** × **50 stores**.
  - **Sample dataset** (for easy sharing/reproducibility): **200 products** × **50 stores**.
- **Access pattern**: users **search by product** but **act based on local store context** (is it in stock here? where is it located?).

---

### Modeling Decisions

1) **`inventory` = canonical, write-optimized source of truth**  
   - Holds authoritative per-store stock details and signals (e.g., shelf/backroom, replenishment flags).
   - Optimized for **high-frequency writes** and bulk ingestion.

2) **`products` = read-optimized, search-friendly documents**  
   - Holds product core attributes and **a minimal per-store summary** under `inventorySummary[]`.
   - This summary is **denormalized** (materialized fields inside the document) and kept in sync from `inventory` via **Atlas Trigger** events.
   - Goal: serve **single-document reads** for product discovery + store filtering without runtime joins/lookups.

3) **`stores` = geospatial and operational context**  
   - Location (`Point`), layout (sections/aisles/shelves), hours, time zone — enabling geospatial and in-store navigation use cases.

> **Pattern used:** **Extended Reference Pattern**  
> We **preserve references** (`storeId`, `productId`) as the link to canonical data, while **materializing only the fields needed for fast reads** in `products.inventorySummary`.  
> Here we use materialized fields within the product document, kept fresh by triggers/change streams.

---

### Why an Embedded Store-Level Summary in `products`?

- **Product discovery is global; action is local.** Users find items by name/brand/category/semantics, then need local availability and in-store location immediately.
- Embedding a **tiny, filtered summary per store** enables:
  - **Fast filtering** with `$elemMatch` and targeted indexes (`inventorySummary.storeId`, flags).
  - **Simple, low-latency reads** for UI and APIs (no `$lookup` on the hot path).

---

### 📐 Sizing-Quick recommendation & further resources

This schema is validated around **~50 stores per product**. If you need to scale further, **watch next:**
- Adapt the model → https://youtu.be/YsaOcUDUJKY?si=aPvZ2OoVpQoghR2y&t=408  
- Modeling strategies → https://youtu.be/3GHZd0zv170?si=BXPsy_jvOUMNMRZT&t=867

---

### Operational Flow (High Level)

1. **Writes** land in `inventory` (canonical).  
2. An **Atlas Trigger** listens to inserts/updates and **projects only the required fields** into the matching `products.inventorySummary` entry (upsert behavior).
3. Search-time queries hit `products` with **full-text/vector** + **store filters** for low-latency responses.
4. Heavy ingestion and search are isolated (read from secondaries if desired) to avoid contention.

---

## 4. ⚡ Atlas Indexing Best Practices

For best performance:

- **Text & Vector Search:**
  - See [`search-index.json`](../indexes/search-index.json)
  - See [`vector-index.json`](../indexes/vector-index.json)
- **Inventory Filtering:**
  - Add a compound index on `inventorySummary.storeId` (and, if useful, `inventorySummary.inStock` or `inventorySummary.nearToReplenishmentInShelf`).

---

## 5. ⚙️ Real-Time Inventory → Product Sync

![mongodbatlas](docs/images/mongodbatlas.png)

A **single Atlas Trigger** keeps `products.inventorySummary` always in sync with the canonical `inventory` collection.

- **How:** Trigger listens to insert/update/replace on `inventory`, rewrites only relevant summary data into the matching product.


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

