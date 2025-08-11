# Advanced Search Microservice

> **Product Discovery with MongoDB Atlas & Voyage AI – keyword, full-text, vector, and hybrid RRF search in one endpoint.**  
> 🖼 **Image-based search — Coming Soon!**

This [microservice](../../docs/adr/adr-2025-07-advanced-search-microservice-backend-isolation.md/) powers the **Product Discovery** feature in the Unified Commerce demo.  
Clients send a **free-text query** scoped to a **store**, and choose one of four search strategies.  
The response is a paginated list of relevant products with a **relevance score**.

-   [Clean Architecture](../../docs/adr/adr-2025-07-clean-architecture-advanced-search-ms.md/) (domain → application → infrastructure → interface).
- MongoDB Atlas Lucene `$vectorSearch` **and** `$search` text indexes.
- Reciprocal Rank Fusion to blend vector & text results.
- Voyage AI embeddings (`voyage‑3‑large`).
- Fully async stack (FastAPI + Motor + httpx) on Python 3.11.

---

## 1 – Search Strategies (Text-Based)

| Option | Use Case Class           | Engine / Technique                                     | Typical Use Case | Notes |
| ------ | ------------------------ | ------------------------------------------------------ | ---------------- | ----- |
| **1**  | `KeywordSearchUseCase`   | Simple regex / prefix match on `productName`           | Exact SKU / name match | No weights |
| **2**  | `AtlasTextSearchUseCase` | Atlas Lucene `$search` full-text index                 | Keyword search with stemming, fuzziness, synonyms | No weights |
| **3**  | `VectorSearchUseCase`    | Lucene `$vectorSearch` (k-NN, cosine similarity)       | Semantic / natural-language queries | No weights |
| **4**  | `HybridRRFSearchUseCase` | `$rankFusion` blending options 2 & 3                   | Combine keyword relevance + semantic meaning | Supports `weightVector` & `weightText` |

> **Dynamic weights in option 4:**  
> The client can send extra parameters (`weightVector`, `weightText`) to fine-tune the influence of each search type at runtime.

> All strategies are **store-scoped** (MongoDB `stores` doc `_id`), so results only include products available in the selected store.  
> **Image Search** will be added as a new option in a future release.

---

## 2 – Environment Variables

```dotenv
# MongoDB Atlas
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/
MONGODB_DATABASE=retail-unified-commerce
PRODUCTS_COLLECTION=products
VECTOR_INDEX_NAME=product_text_vector_index
TEXT_INDEX_NAME=product_atlas_search
EMBEDDING_FIELD_NAME=textEmbeddingVector

# Voyage AI
VOYAGE_API_URL=https://api.voyageai.com/v1
VOYAGE_API_KEY=<your-token>
VOYAGE_MODEL=voyage-3-large
```

---

## 3 – Example Requests

### Option 4 (Hybrid RRF) with weights

```http
POST /api/v1/search
Content-Type: application/json

{
  "query": "green tea skin care",
  "storeObjectId": "684aa28064ff7c785a568aca",
  "option": 4,
  "page": 1,
  "page_size": 20,
  "weightVector": 0.5,
  "weightText": 0.5
}
```

- If `weightVector` and `weightText` are omitted, defaults to **0.5 / 0.5**.
- Values are normalized if they do not sum to `1`.

### Option 1 (Keyword)
```http
POST /api/v1/search
Content-Type: application/json

{
  "query": "matcha",
  "storeObjectId": "684aa28064ff7c785a568aca",
  "option": 1,
  "page": 1,
  "page_size": 20
}
```

### Option 2 (Full‑text)
```http
POST /api/v1/search
Content-Type: application/json

{
  "query": "green tea cleanser",
  "storeObjectId": "684aa28064ff7c785a568aca",
  "option": 2,
  "page": 1,
  "page_size": 20
}
```

### Option 3 (Vector)
```http
POST /api/v1/search
Content-Type: application/json

{
  "query": "gentle antioxidant cleanser",
  "storeObjectId": "684aa28064ff7c785a568aca",
  "option": 3,
  "page": 1,
  "page_size": 20
}
```

---
## 4 – Option 4: Hybrid Search (RRF) – Details

**Goal:** deliver a single ranked list that balances **keyword relevance** (Atlas `$search`) and **semantic similarity** (vector search) using **Reciprocal Rank Fusion (RRF)**.

**Request parameters (option 4):**
- `weightVector` *(float 0..1)* – influence of the vector pipeline.  
- `weightText` *(float 0..1)* – influence of the text pipeline.  
- Defaults: `0.5` / `0.5`. Values are used as-is (no auto-normalization).

![Hybrid Search (RRF) ](../../docs/images/hybrid_search.png)
**How it works (high level):**
1. Generate an embedding for `query` via Voyage AI (`voyage-3-large`).
2. Execute **two** searches scoped to `storeObjectId`:
   - **Vector**: `$vectorSearch` over `EMBEDDING_FIELD_NAME` (cosine similarity).
   - **Text**: `$search` full-text query over relevant fields.
3. Fuse both result lists with **RRF** using the provided weights to produce a single ranking and a numeric `score` per product.

> **Tips:**  
> - Explore / Discover: Favor semantics → `weightVector=0.6–0.8`.  
> - Precise search / Known catalog: Favor text → `weightText=0.6–0.8`.

---
## 5 – Example Response

```jsonc
{
  "total_results": 141,
  "total_pages": 8,
  "products": [
    {
      "id": "685bfe2d3d832cf7e16155f7",
      "productName": "Green Tea Quick Face Detox Kit",
      "brand": "MCaffeine",
      "price": {
        "amount": 25.79,
        "currency": "USD"
      },
      "quantity": "5 pcs",
      "category": "Beauty & Hygiene",
      "subCategory": "Face Care",
      "absoluteUrl": "https://www.bigbasket.com/pd/40193676/mcaffeine-green-tea-quick-face-detox-kit-5-pcs/",
      "aboutTheProduct": "The Green Tea Quick Face Detox Kit is ideal for you if you’re looking for a complete detox of your face...",
      "imageUrlS3": "https://retail-unified-commerce.s3.amazonaws.com/products/685bfe2d3d832cf7e16155f7.png",
      "inventorySummary": [
        {
          "storeObjectId": "684aa28064ff7c785a568aca",
          "storeId": "store-001",
          "sectionId": "S02",
          "aisleId": "I21",
          "shelfId": "SH211",
          "inStock": true,
          "nearToReplenishmentInShelf": false
        }
      ],
      "score": 0.0148
    }
  ]
}
```
---

## 5 – Running Locally

### Prerequisites

* Python 3.11
* [Poetry](https://python-poetry.org/)

### Backend Only (Poetry)

```bash
# 1) Navigate to the microservice
cd backend/advanced-search-ms

# 2) Create environment & install dependencies
poetry env use python3.11
poetry install

# 3) Configure environment variables
cp .env.example .env
# -> Fill in MongoDB credentials and VOYAGE_API_KEY

# 4) Start the dev server
poetry run uvicorn main:app --reload --port 8000
```

Verify:

* **API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
* **Health Check**: [http://localhost:8000/health](http://localhost:8000/health)

---

### Backend + Frontend Together with Docker and Makefile

To run the microservice together with the frontend, follow the steps in the [main project README](../../README.md).

---

