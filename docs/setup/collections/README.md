# 🗃️ Collections Setup Guide

This guide explains how to set up the necessary MongoDB Atlas collections to run the demo. It includes instructions to import sample data, configure indexes and triggers, and understand the underlying document models.

---

## 1. 🏗️ Create the Database

Before importing the datasets, create your MongoDB database. You can name it `retail-unified-commerce` (recommended), or choose your own—just be sure to update your `.env` file accordingly:

---

## 2. 📦 Import Demo Collections

You’ll find three sample `.json` files:

- [`products`](./retail-unified-commerce.products.json)
- [`inventory`](./retail-unified-commerce.inventory.json)
- [`stores`](./retail-unified-commerce.stores.json)

### Import via Atlas UI

1. Go to your Atlas cluster → **Browse Collections**.
2. Create collections inside your target database.
3. Click **"Import"** in each collection and upload the corresponding JSON file.

---

## 3. 🧠 Understanding the Data Model

MongoDB’s flexible document model lets us design for performance and real-world access patterns. The model in this demo reflects a unified retail data strategy that supports intelligent search, store operations, and real-time insights.

### `products` Collection

Each product document is enriched with:

- `embeddingText`: : Main field for generating vector embeddings. Combines the product’s description - aboutTheProduct field -, brand, category, subcategory, and quantity for richer semantic search.
- `imageUrlS3`: Product image used for image-based embeddings (multimodal search)
- `inventorySummary`: An **embedded array** of store-level inventory records

This structure applies the **"Extended Reference"** pattern and MongoDB’s core modeling principle: *"What you read together, store together."* It ensures **high-performance access** by co-locating inventory info directly with the product document.

The embedded `inventorySummary` is kept in sync with the transactional `inventory` collection using an **Atlas Trigger**. This trigger listens for updates in `inventory`, transforms relevant fields into a simplified embedded view, and updates the matching `product` document in real time.

This design offers the best of both worlds:

- Normalized `inventory` for efficient writes and stock updates
- Embedded `inventorySummary` in `products` for fast, read-optimized search

> In unified commerce, product discovery often depends on store-specific inventory data—whether you're filtering by availability, location, or restock predictions. Since not all products are stocked at all stores, embedding a filtered summary of inventory per store directly in each product document allows for:
>
> - Fast and localized queries (e.g., *find snacks with stock nearby*)
> - Eliminating the need for costly joins during search
> - A natural way to expose store-level context in discovery flows
>
> This model supports a key retail pattern: **you search by product, but act by inventory.**

> ✅ MongoDB can easily filter store-level data using `$elemMatch` and real-time sync keeps product data fresh and queryable without additional joins.

> 🧠 Learn more: [Data Modeling Course – MongoDB University (Free)](https://learn.mongodb.com/courses/data-modeling)

### `stores` Collection

Each store document includes:

- Geolocation as a `Point` object (`coordinates` + `address`, `city`)
- Store layout (`sections` → `aisles` → `shelves`), enabling future planogram insights
- `openHours` and `timeZone` metadata, supporting customer-facing operations

This structure supports **geospatial queries** (e.g., find stores near the user) and intelligent navigation.

### `inventory` Collection

This is the **source-of-truth for store inventory** with rich stock dynamics:

- `storeInventory[]`: Array with store-specific data such as quantities, thresholds, predictions
- Denormalized fields like `location` and `storeName` simplify access
- Fields like `restockFrequencyDays`, `predictedStockDepletion` simulate retail operations

This decoupling allows the system to ingest high-frequency updates without bloating the `products` collection.

Together, the three collections enable:

- Real-time search across product + store
- Operational insights per location
- Search strategies like hybrid text/vector/geospatial ranking

> This model is just one example of how MongoDB supports intelligent, real-time operational data for unified commerce. By embedding only what’s needed and syncing live updates from source collections, you enable efficient discovery, responsive interfaces, and rich cross-store logic.

---

## 4. 🧹 Configure Atlas Indexes

Indexes are required for full-text, vector, and geospatial queries. Follow the guides:

- [`search-index.json`](../indexes/search-index.json)
- [`vector-index.json`](../indexes/vector-index.json)

📄 Index definition files are located in [`docs/setup/indexes/`](../indexes/).

---

## 5. ⚙️ Real‑Time Atlas Triggers

MongoDB Atlas Triggers let you react to database changes *as they happen.* In this demo we use **a single collection‑level trigger** to keep every product’s `inventorySummary` in sync with the transactional `inventory` collection—no polling, no cron‑jobs, and **no runtime joins**.

### 🛠️ Inventory ➜ Product Sync (Extended‑Reference pattern)

| Goal | Keep the lightweight `inventorySummary` array inside each product always fresh so discovery queries can filter by local availability without an extra lookup. |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |

**Why this matters**

- Product search is the entry point, *but shoppers act on store inventory.* Embedding a *condensed* view of stock per store inside the product (⚙️ the **Extended‑Reference** design pattern) gives millisecond reads while heavy‑write updates still hit the normalized `inventory` collection.
- MongoDB’s change streams + Atlas Triggers turn that pattern into a real‑time materialized view—zero dev‑ops overhead.

```text
Trigger type   : Collection
Database / Coll: <your_db>.inventory (e.g. retail-unified-commerce.inventory)
Operations     : Insert, Update, Replace
Full Doc Lookup: ON
Options        : Auto‑Resume = ON, Event Ordering = ON
```

| File                            | Purpose                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory_sync.js`             | Production‑grade trigger function. Condenses each changed `inventory` document into a minimal array of `{ storeId, sectionId, aisleId, shelfId, inStock, nearToReplenishmentInShelf }` and rewrites the matching product. |
| `daily_inventory_simulation.js` | **Optional** helper that randomly tweaks stock levels so you can watch the trigger in action.                                                                                                                             |

**Deployment (2 minutes)**

1. In Atlas → **Triggers** → **Add Trigger** → **Collection Trigger**.
2. Select your *inventory* collection; choose *Insert / Update / Replace*; enable *Full Document Lookup*.
3. Paste `` into the code editor and save.
4. (Optional) add the projection shown in the file header to limit field payload.

> ⚡ Result: every inventory change writes a brand‑new `inventorySummary` array into the related product—*exactly* what search and GraphQL resolvers need.

#### Pattern in one sentence

> **Read‑Optimized View inside the authoritative document**—*what you read together, store together*, kept fresh by the source‑of‑truth via change streams.

---

## 📚 Dataset Source

The original dataset used to build this demo is publicly available and free to use under its license terms:

- [Big Basket Products Dataset on Kaggle](https://www.kaggle.com/datasets/chinmayshanbhag/big-basket-products)

This dataset was enriched with additional semantic metadata, embeddings (text and image), and store-level inventory simulation to support search and discovery scenarios for unified commerce.

---

✅ All set! Now return to the [root README](../../../README.md) to continue the setup and run the apps.

