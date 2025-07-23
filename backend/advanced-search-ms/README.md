# Advanced Search Microservice

> **Multimodal product search with MongoDB Atlas & Voyage AI – supports keyword, full‑text, vector and hybrid RRF in one endpoint.**

This service exposes ``. Clients send a free‑text query plus a *store* scope and choose one of four strategies; the service returns a paginated set of matching products, each with a relevance **score**.

- Clean Architecture (domain → application → infrastructure → interface).
- MongoDB Atlas Lucene `$vectorSearch` **and** `$search` text indexes.
- Reciprocal Rank Fusion to blend vector & text results.
- Voyage AI embeddings (`voyage‑3‑large`).
- Fully async stack (FastAPI + Motor + httpx) on Python 3.11.

---

## 1 – Search Strategies

| Option | Use‑case class           | Engine / technique                           |
| ------ | ------------------------ | -------------------------------------------- |
| **1**  | `KeywordSearchUseCase`   | Simple regex / prefix match on `productName` |
| **2**  | `AtlasTextSearchUseCase` | Atlas Lucene `$search` full‑text index       |
| **3**  | `VectorSearchUseCase`    | Lucene `$vectorSearch` (k‑NN, cosine)        |
| **4**  | `HybridRRFSearchUseCase` | `$rankFusion` – blends 2 & 3 with RRF        |

All strategies are scoped to a single **store** (= MongoDB `stores` doc id) so the client only sees local inventory.

---

## 2 – Architecture Overview

| Layer              | Folder               | Responsibility                                      |
| ------------------ | -------------------- | --------------------------------------------------- |
| **Domain**         | `app/domain`         | Immutable business entities (`Product` …)           |
| **Application**    | `app/application`    | Use‑cases & ports – *no I/O code*                   |
| **Infrastructure** | `app/infrastructure` | Mongo & Voyage adapters implementing the ports      |
| **Interface**      | `app/interfaces`     | FastAPI router, request validation, error mapping   |
| **Shared**         | `app/shared`         | Config, exceptions, logging helpers                 |

```text
advanced-search-ms/
├─ main.py                      # FastAPI entry‑point & DI
├─ .env.example                 # Template for secrets
├─ pyproject.toml               # Poetry deps (Python 3.11)
├─ app/
  ├─ domain/
  ├─ application/
  ├─ infrastructure/
  ├─ interfaces/
  └─ shared/

```

### Request Flow (option‑4 example)

1. Client → `` with JSON `{query, storeId, option:4, page, page_size}`.
2. Router picks `HybridRRFSearchUseCase`.
3. Use‑case
   1. calls **Voyage AI** → embedding
   2. runs `$vectorSearch` *and* `$search` pipelines via `MongoSearchRepository`
   3. delegates to `$rankFusion` with weights *(0.7 vector / 0.3 text)*
4. Mongo returns documents with fused ``.
5. Use‑case maps each raw doc → `Product` domain model.
6. Router serialises to JSON → 200.

---

## 3 – Environment

Copy `.env.example` → `.env` and fill:

```dotenv
# MongoDB Atlas
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/
MONGODB_DATABASE=retail-unified-commerce
PRODUCTS_COLLECTION=products
SEARCH_INDEX_NAME=product_text_vector_index   # for $vectorSearch
TEXT_INDEX_NAME=product_text_search_index     # for $search
EMBEDDING_FIELD_NAME=textEmbeddingVector

# Voyage AI
VOYAGE_API_URL=https://api.voyageai.com/v1
VOYAGE_API_KEY=<your-token>
VOYAGE_MODEL=voyage-3-large
```

---

## 4 – Local Setup

```bash
cd backend/advanced-search-ms
brew install python@3.11 poetry   # macOS example
poetry env use python3.11
poetry install
cp .env.example .env              # then add secrets

# Run dev server
poetry run uvicorn main:app --reload
```

Visit [**http://localhost:8000/docs**](http://localhost:8000/docs) for interactive Swagger UI.

---

## 5 – MongoDB Indexes

### 5.1 Vector Index (Lucene `$vectorSearch`)

```jsonc
{
  "name": "product_text_vector_index",
  "definition": {
    "mappings": {
      "dynamic": false,
      "fields": {
        "textEmbeddingVector": {
          "type": "knnVector",
          "dimensions": 1024,
          "similarity": "cosine"
        }
      }
    }
  }
}
```

### 5.2 Text Index (Atlas Search `$search`)

```jsonc
{
  "name": "product_text_search_index",
  "definition": {
    "mappings": {
      "dynamic": true
    }
  }
}
```

### 5.3 Hybrid `$rankFusion` example

See *MongoDB docs → Atlas Search → Hybrid Search* for a ready‑made pipeline that our repo executes programmatically.

---

## 6 – API Example

```http
POST /api/v1/search
Content-Type: application/json
{
  "query": "organic onions",
  "storeObjectId": "64efd523c8c0a5d13ba4fd12",
  "option": 4,
  "page": 1,
  "page_size": 20
}
```

Response (truncated):

```json
{
  "page": 1,
  "page_size": 5,
  "total_results": 42,
  "total_pages": 9,
  "products": [
    {
      "id": "...",
      "productName": "Organic Brown Onion 1 kg",
      "score": 0.84,
      "price": {"amount": 2.19, "currency": "USD"},
      "inventorySummary": [{"storeId": "64efd523…", "inStock": true}]
    }
  ]
}
```

---

## 7 – Operational Notes

| Concern          | Detail                                                               |
| ---------------- | -------------------------------------------------------------------- |
| **Health‑check** | `GET /health` issues `db.admin.command("ping")` for k8s/LB probes.   |
| **Retries**      | Tenacity 3× exp back‑off on Mongo & Voyage calls.                    |
| **Timeouts**     | Mongo aggregate `maxTimeMS=4000`; outbound HTTP 5 s via httpx.       |
| **Logging**      | JSON structured (`api`, `usecase`, `infra`), INFO‑level by default.  |
| **Metrics**      | Latency & hit counts emitted via standard logger – pluggable to APM. |

---

> *Happy querying!* 🎉

