# app/infrastructure/mongodb/client.py
"""
MongoDB Atlas Vector Search client (Lucene engine).

• Runs `$vectorSearch` for semantic k-NN retrieval.
• Appends a `score` field (`$meta: "vectorSearchScore"`) to each hit.
• Keeps a singleton `AsyncIOMotorClient` with tuned pool sizes.
• Protects calls with Tenacity retry logic.
• Returns `(page_results, total_hits)`.
"""

import logging
from typing import List, Dict, Tuple

from motor.motor_asyncio import AsyncIOMotorClient
from tenacity import retry, stop_after_attempt, wait_exponential, before_log

from app.shared.exceptions import InfrastructureError

logger = logging.getLogger("advanced-search-ms.infra")


class MongoClient:
    def __init__(
        self,
        uri: str,
        database: str,
        collection: str = "products",
        index_name: str = "product_text_vector_index",
        embedding_field: str = "textEmbeddingVector",
    ):
        # ---- connection pool (singleton) ----
        self.client = AsyncIOMotorClient(
            uri,
            maxPoolSize=50,
            minPoolSize=10,
            serverSelectionTimeoutMS=5_000,
            tls=True,
        )
        self.collection = self.client[database][collection]
        self.index_name = index_name
        self.embedding_field = embedding_field

    # ---------- Vector search ---------- #

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=0.1, max=1),
        before=before_log(logger, logging.WARNING),
    )
    async def search_by_vector(
        self,
        embedding: List[float],
        page: int = 1,
        page_size: int = 10,
    ) -> Tuple[List[Dict], int]:
        """
        Execute a vector search and return (page_results, total_hits).

        • `score` is injected via `$addFields`.
        • Two pipelines are required because `$vectorSearch` can't share
          a `$count` stage.
        """
        skip = (page - 1) * page_size

        # -- pipeline for paginated results (includes score) --
        results_pipeline = [
            {
                "$vectorSearch": {
                    "index": self.index_name,
                    "path": self.embedding_field,
                    "queryVector": embedding,
                    "numCandidates": 200,           # tune for recall / latency
                    "limit": skip + page_size,      # fetch enough docs, then page
                }
            },
            # Expose similarity score so upper layers can return it
            {"$addFields": {"score": {"$meta": "vectorSearchScore"}}},
            {"$skip": skip},
            {"$limit": page_size},
        ]

        # -- pipeline for total-hit count --
        total_pipeline = [
            {
                "$vectorSearch": {
                    "index": self.index_name,
                    "path": self.embedding_field,
                    "queryVector": embedding,
                    "numCandidates": 200,
                    "limit": 1,
                }
            },
            {"$count": "total"},
        ]

        try:
            # ---------- page results ----------
            page_cursor = self.collection.aggregate(results_pipeline, maxTimeMS=4_000)
            results = await page_cursor.to_list(length=page_size)

            # ---------- total hits ----------
            total_cursor = self.collection.aggregate(total_pipeline, maxTimeMS=4_000)
            total_doc = await total_cursor.to_list(length=1)
            total = total_doc[0]["total"] if total_doc else 0

            return results, total

        except Exception as e:  # pragma: no cover
            logger.error(f"MongoDB vector search error: {e}")
            raise InfrastructureError(f"MongoDB search failed: {e}") from e
