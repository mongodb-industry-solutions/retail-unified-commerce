# Advanced Search Microservice (`advanced-search-ms`)

## Overview

`advanced-search-ms` is a Python microservice that provides advanced search capabilities using vector search and re-ranking. It converts user queries into embeddings via Voyage AI and performs searches on MongoDB Atlas. The service supports two modes:

1. **Vector Search**: Retrieves results based on vector similarity.
2. **Vector Search + Re-Rank**: Applies an additional re-ranking step using Voyage AI.

The service follows Clean Architecture principles and is packaged with Poetry  for easy setup and deployment.

---

## Repository Structure

```plaintext
advanced-search-ms/
├── app/                      # Application source code
│   ├── domain/               # Domain models
│   │   └── product.py
│   ├── application/          # Business use cases
│   │   └── use_cases/
│   │       ├── vector_search_use_case.py
│   │       └── vector_search_rerank_use_case.py
│   ├── infrastructure/       # External integrations
│   │   ├── mongodb/
│   │   │   └── client.py
│   │   └── voyage_ai/
│   │       └── client.py
│   ├── interfaces/           # API layer (FastAPI routes)
│   │   └── routes.py
│   └── shared/               # Config and utilities
│       └── config.py
├── main.py                   # FastAPI entrypoint
├── .env                      # Environment variables
├── Dockerfile                # Docker image build
├── pyproject.toml            # Poetry dependencies

```

---

## Architecture Overview

| Layer              | Folder               | Responsibility                                     |
| ------------------ | -------------------- | -------------------------------------------------- |
| **Domain**         | `app/domain`         | Pure business entities (`Product`).    |
| **Application**    | `app/application`    | Use‑cases, ports (interfaces) – *no* I/O.          |
| **Infrastructure** | `app/infrastructure` | Mongo & Voyage adapters that implement the ports.  |
| **Interface**      | `app/interfaces`     | FastAPI routes, request validation, error mapping. |
| **Shared**         | `app/shared`         | Cross‑cutting utils: config, exceptions.           |

---

## Request Flow (happy‑path)

1. **POST /api/v1/search** with JSON `{query, option, page, page_size}`.
2. Route chooses
   - *option 1*: **VectorSearchUseCase** → MongoDB Lucene k‑NN.
   - *option 2*: **VectorSearchUseCase** + **VoyageAI rerank**.
3. Mongo returns docs **with a **``** field** (similarity 0‑1).
4. Use‑case maps each doc → `Product` (domain) including `score`.
5. Route serialises domain objects and returns 200 JSON payload.

---

## Environment

Copy `.env.example` → `.env` and fill in:

```dotenv
# MongoDB Atlas
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/
MONGODB_DATABASE=retail-unified-commerce
PRODUCTS_COLLECTION=products
SEARCH_INDEX_NAME=product_text_vector_index
EMBEDDING_FIELD_NAME=textEmbeddingVector

# Voyage AI
VOYAGE_API_URL=https://api.voyageai.com/v1
VOYAGE_API_KEY=<your-token>
VOYAGE_MODEL=voyage-3-large
```

> **Tip** – keep `.env` out of VCS.

---

## Local Setup

```bash
brew install python@3.11 poetry  # macOS example
poetry env use python3.11
poetry install
cp .env.example .env  # add secrets

# Run dev server
poetry run uvicorn main:app --reload
```

Open [http://localhost:8000/docs](http://localhost:8000/docs) for interactive Swagger UI.

---

## Creating Vector Index

1. Atlas UI → **Search & Vector Search** → *Create Vector Index*.
2. Choose `products` collection & paste JSON above.
3. Build completes in a few minutes -> dimensions: 1024 / similarity: cosine

---

## API Example

```http
POST /api/v1/search
Content-Type: application/json
{
  "query": "organic onions",
  "option": 1,
  "page": 1,
  "page_size": 3
}
```

Response (truncated):

```json
{
  "page": 1,
  "page_size": 3,
  "total_results": 17,
  "total_pages": 6,
  "products": [
    {
      "id": "...",
      "productName": "Onion",
      "score": 0.83,
      ...
    }
  ]
}
```

*If **`option=2`**, results are re‑ranked by VoyageAI for better semantic relevance.*

---

## Operational Notes

- **Health‑check** → `GET /health` pings Mongo for orchestrator probes.
- **Logging** → JSON‑structured; layers include `api`, `usecase`, `infra`.
- **Retries** → Tenacity (3× exponential) wraps Mongo & Voyage calls.
- **Timeouts** → HTTP 5 s; Mongo aggregate `maxTimeMS=4000`.

---