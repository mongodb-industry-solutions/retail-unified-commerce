# 🛍️ Store Associate App Demo – From Data Silos to Smart Service with MongoDB Atlas

This README helps developers understand the purpose, structure, and deployment process of this unified commerce demo.

---

## 🔎 Overview

This demo showcases a store associate application built on **MongoDB Atlas**, designed to streamline **product discovery** and **inventory visibility** as part of a **unified commerce strategy**.

Unified commerce connects all sales channels, data, and backend systems into a single, real-time platform—delivering a complete view of the business and enabling consistent, personalized customer experiences.

Powered by MongoDB’s flexible document model, the app unifies product and inventory data into one operational layer. From classic search to semantic and hybrid search—including geospatial queries to check nearby store availability—this experience demonstrates how unified commerce becomes actionable by giving store associates accurate data to serve with speed, clarity, and confidence.

---

## 🎯 Demo Goals

- **Unify operational data using MongoDB’s document model**
  - The `products` collection embeds `inventorySummary` per store.
  - Inventory updates happen in a separate collection and are synced into product documents in real time using **Atlas Triggers**.

- **Showcase advanced, intelligent product discovery with MongoDB Atlas:**
  - Regular search (regex)
  - Full-text search using Atlas Search
  - Semantic vector search (via Voyage AI embeddings)
  - Hybrid search (RRF fusion of text and vector results)
  - Boost promotions to align with sales goals
  - Geospatial queries to find nearby availability
  - Image-based product search using multimodal embeddings

- **Demonstrate modular architecture using Clean Architecture**
  - API, business logic, and infrastructure are separated in the advanced search microservice.
  - Easily swap embedding providers (e.g., OpenAI, Bedrock).
  - Extend with new ranking logic or integration points (e.g., GraphQL, chatbots).

---

## 🧱 Architecture Overview

| Component | Description |
|----------|-------------|
| **Frontend (Next.js)** | Mini-monolith app that handles UI, routing, and basic MongoDB queries. Manages geospatial logic locally (e.g., finding stores with stock nearby) and delegates advanced product search to the microservice. |
| **Advanced Search Microservice (Python)** | Cleanly architected FastAPI service that performs 4 types of search and coordinates query embeddings with Voyage AI. |
| **MongoDB Atlas** | Core operational data layer with 3 collections: `products`, `inventory`, and `stores`. Includes triggers for syncing inventory updates and simulating daily stock changes. |
| **Embeddings & AI Integration** | Embeddings are generated via **Voyage AI** and stored in MongoDB. The same model is used at query time to ensure consistency. The architecture supports swapping in other providers. |

👉 This README guides deployment of the full experience.  
👉 For technical deep dives, see the [Frontend README](./frontend/README.md) and [Advanced Search Microservice README](./backend/advanced-search-ms/README.md).

🗒️ _Tip_: Check the `docs/adr/` folder for architectural rationales and design choices.

---

## 🗂 Folder Structure

```bash
retail-unified-commerce/
├── frontend/               # Next.js app
├── backend/
│   └── advanced-search-ms/  # FastAPI-based search service
├── docs/                  # ADRs, helper scripts, license info
├── docker-compose.yml     # Orchestrates services
└── Makefile               # Dev commands
```

---

## 🐳 Getting Started – Run the Full Demo Locally

### 🔧 Prerequisites

- [MongoDB Atlas account](https://www.mongodb.com/cloud/atlas/register) (Free Tier works)
- Demo dataset (in `./docs/files/`):
  - `retail-unified-commerce.products.json`
  - `retail-unified-commerce.inventory.json`
  - `retail-unified-commerce.stores.json`
- Index definitions (in `./setup/search-indexes/`)
- `.env` files for:
  - `frontend/`
  - `backend/advanced-search-ms/`
- A [Voyage AI API key](https://www.voyageai.com/) added to the backend `.env`
- Installed tools:
  - Docker + Docker Compose
  - Node.js v20 (if running frontend separately)
  - Python 3.11 + Poetry (if running backend separately)

---

### 📥 Load Demo Data into MongoDB Atlas

Using [MongoDB Compass](https://www.mongodb.com/products/compass):

1. Connect to your Atlas cluster.
2. Create a database named `retail-unified-commerce`.
3. Create each collection (`products`, `inventory`, `stores`) and import the matching JSON files from `./docs/files/`.

---

### 🔍 Create Search Indexes

In the **Search Indexes** tab of your Atlas cluster, create:

- Full-text Search Index: `product_atlas_search.json`
- Vector Search Index: `product_vector_index.json`

Find these in: `./setup/search-indexes/`

---

### 🚀 Start Locally with Docker Compose

```bash
git clone https://github.com/mongodb-industry-solutions/retail-unified-commerce.git
cd retail-unified-commerce
make build
```

#### Common Commands

| Action                     | Command       |
|---------------------------|---------------|
| Build & start             | `make build`  |
| Start (no rebuild)        | `make start`  |
| Stop all containers       | `make stop`   |
| Clean containers/images   | `make clean`  |
| View all logs             | `make logs`   |

#### Frontend Commands

| Action         | Command            |
|----------------|--------------------|
| Build frontend | `make front-build` |
| Start frontend | `make front-up`    |
| Stop frontend  | `make front-stop`  |
| View logs      | `make front-logs`  |

#### Backend Commands

| Action         | Command            |
|----------------|--------------------|
| Build backend  | `make back-build`  |
| Start backend  | `make back-up`     |
| Stop backend   | `make back-stop`   |
| View logs      | `make back-logs`   |

---

## 🧠 Why MongoDB for Unified Commerce

MongoDB Atlas is a powerful **Operational Data Layer (ODL)** for unified commerce. It simplifies how retailers consolidate, serve, and act on critical data across channels.

### Key Advantages

- **Flexible document model**  
  Model rich retail data—like store-level inventory or media—in a single document.

- **Built-in advanced search**  
  Power full-text, semantic, hybrid, and image-based search **without** separate systems.

- **AI-ready architecture**  
  Store embeddings, stream updates with Triggers, and build intelligent, responsive apps.

- **Simplified architecture**  
  Eliminate ETL complexity with native triggers, Change Streams, and **Online Archive**.  
  Run analytics or AI workloads on **isolated nodes** without affecting performance.

---

## 🌟 What’s Next: Native AI Simplicity

MongoDB will soon offer native support for automatic embedding generation and reranking—making intelligent search and recommendations even easier to build.

👉 _Read more in [this blog post](#)_.

---

## 👥 Authors

**Use Case & Implementation**
- Prashant Juttukonda – Principal  
- Rodrigo Leal – Principal  
- Genevieve Broadhead – Global Lead, Retail Solutions

**Technical Design & Development**
- Angie Guemes – Developer & Maintainer  
- Florencia Arin – Developer & Maintainer

---

## 📚 Related Demo Content Package

- 🎥 YouTube Video – _coming soon_
- 📄 Solution Library – _coming soon_
- 📝 Blog – _coming soon_

⭐ If you found this useful, consider giving the repo a star!

---

## 📄 License

© 2025 MongoDB. All rights reserved.  
This demo is for educational purposes only. Commercial use is prohibited without written permission from MongoDB.
