# app/infrastructure/mongodb/search_repository.py
"""
MongoSearchRepository
=====================

Clean‑Architecture adapter that turns **application‑layer requests**
into MongoDB aggregation pipelines, executes them, and returns
domain‑friendly structures.

Key responsibilities
--------------------
1. 🗂  **Pipeline selection** – chooses the right builder (keyword, text,
   vector, hybrid‑RRF) based on the use‑case.
2. ⚙️  **Configuration injection** – passes index names, vector field,
   paging, weights, etc., to each builder.
3. ⏱  **Pagination logic** – computes `skip` & `limit` once, reuses it.
4. 🧹  **Post‑processing** – filters `inventorySummary` so each store only
   sees its own stock (privacy + payload reduction).

Why keep pipelines in `pipelines/*`?
------------------------------------
* **Single responsibility** – this repo focuses on orchestration;
  builders focus on aggregation syntax.
* **Unit testing** – pipelines become pure functions that can be tested
  without hitting MongoDB.
* **Re‑usability** – the same builder can be embedded in a hybrid RRF
  pipeline, cached, or benchmarked in isolation.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorCollection

from app.application.ports import SearchRepository
from app.infrastructure.mongodb.client import MongoClient
from app.infrastructure.mongodb.utils import (
    PRODUCT_FIELDS,           # 🔖 single source‑of‑truth projection
    filter_inventory_summary  # 🧹 strip other stores' stock info
)
from app.infrastructure.mongodb.pipelines import (
    build_keyword_pipeline,
    build_text_pipeline,
    build_vector_pipeline,
    build_hybrid_rrf_pipeline,
)
from app.shared.exceptions import InfrastructureError

logger = logging.getLogger("advanced-search-ms.mongo-repo")


# --------------------------------------------------------------------------- #
# 🏗  Repository implementation                                               #
# --------------------------------------------------------------------------- #
class MongoSearchRepository(SearchRepository):
    """
    Concrete adapter behind the SearchRepository port (Clean Architecture).

    It delegates *heavy* work to dedicated pipeline builders; this class only
    orchestrates parameters, runs the aggregation, and applies final shaping.
    """

    # --------------------------------------------------------------------- #
    # Construction                                                          #
    # --------------------------------------------------------------------- #
    def __init__(
        self,
        collection: AsyncIOMotorCollection,
        index_name_text: str,
        index_name_vector: str,
        embedding_field: str,
        mongo_client_helper: MongoClient,
    ) -> None:
        self.col           = collection
        self.text_index    = index_name_text
        self.vector_index  = index_name_vector
        self.vector_field  = embedding_field
        self._vec_helper   = mongo_client_helper

        logger.info(
            "[SearchRepo] ✅ Initialised | text_index=%s | vector_index=%s",
            self.text_index, self.vector_index
        )

    # --------------------------------------------------------------------- #
    # Option 1 – Keyword / regex search                                     #
    # --------------------------------------------------------------------- #
    async def search_keyword(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        logger.info("[SearchRepo] 🔎 Keyword search | q='%s' | store=%s", query, store_object_id)

        skip = (page - 1) * page_size
        pipeline = build_keyword_pipeline(
            query=query,
            store_object_id=store_object_id,
            skip=skip,
            limit=page_size,
            projection_fields=PRODUCT_FIELDS,
        )
        return await self._run_pipeline(pipeline, store_object_id)

    # --------------------------------------------------------------------- #
    # Option 2 – Atlas Search text index                                    #
    # --------------------------------------------------------------------- #
    async def search_atlas_text(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        logger.info("[SearchRepo] 🔎 Text search | q='%s' | store=%s", query, store_object_id)

        skip = (page - 1) * page_size
        pipeline = build_text_pipeline(
            query=query,
            store_object_id=store_object_id,
            text_index=self.text_index,
            skip=skip,
            limit=page_size,
            projection_fields=PRODUCT_FIELDS,
        )
        return await self._run_pipeline(pipeline, store_object_id)

    # --------------------------------------------------------------------- #
    # Option 3 – Lucene vector search                                       #
    # --------------------------------------------------------------------- #
    async def search_by_vector(
        self,
        embedding: List[float],
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        logger.info("[SearchRepo] 🔎 Vector search | store=%s", store_object_id)

        skip = (page - 1) * page_size
        pipeline = build_vector_pipeline(
            embedding=embedding,
            store_object_id=store_object_id,
            vector_index=self.vector_index,
            vector_field=self.vector_field,
            skip=skip,
            limit=page_size,
            projection_fields=PRODUCT_FIELDS,
        )
        return await self._run_pipeline(pipeline, store_object_id)

    # --------------------------------------------------------------------- #
    # Option 4 – Hybrid Reciprocal Rank Fusion                              #
    # --------------------------------------------------------------------- #
    async def search_hybrid_rrf(
        self,
        query: str,
        embedding: List[float],
        store_object_id: str,
        page: int,
        page_size: int,
        weight_vector: Optional[float] = None,
        weight_text: Optional[float]   = None,
    ) -> Tuple[List[Dict], int]:
        logger.info("[SearchRepo] 🔎 Hybrid RRF | q='%s' | store=%s", query, store_object_id)

        skip    = (page - 1) * page_size
        weights = {
            "vectorPipeline": weight_vector or 5.0,
            "textPipeline":   weight_text   or 5.0,
        }

        pipeline = build_hybrid_rrf_pipeline(
            query=query,
            embedding=embedding,
            store_object_id=store_object_id,
            text_index=self.text_index,
            vector_index=self.vector_index,
            vector_field=self.vector_field,
            weights=weights,
            skip=skip,
            limit=page_size,
            projection_fields=PRODUCT_FIELDS,
        )
        return await self._run_pipeline(pipeline, store_object_id)

    # --------------------------------------------------------------------- #
    # 🔄 Shared helper – run aggregation & post‑process                     #
    # --------------------------------------------------------------------- #
    async def _run_pipeline(
        self,
        pipeline: List[Dict],
        store_object_id: str,
    ) -> Tuple[List[Dict], int]:
        """
        Executes the given aggregation pipeline and:

        1. Converts the cursor to a single root doc
        2. Removes other stores' inventory rows (`filter_inventory_summary`)
        3. Returns `(docs, total)` for the application layer
        """
        try:
            logger.debug("[SearchRepo] ▶️ Executing aggregation…")
            cursor = self.col.aggregate(pipeline, maxTimeMS=6_000)
            root   = (await cursor.to_list(length=1))[0] if cursor else {}

            # 👀 Optional deep‑debug
            # logger.debug("[SearchRepo] Raw docs: %s", root.get("docs", [])[:2])

            docs  = [
                filter_inventory_summary(doc, store_object_id)
                for doc in root.get("docs", [])
            ]
            total = int(root.get("total", 0))

            logger.info("[SearchRepo] ✅ Returned %d docs | total=%d", len(docs), total)
            return docs, total

        except Exception as exc:  # pragma: no cover
            logger.error("[SearchRepo] 💥 Aggregation failed: %s", exc)
            raise InfrastructureError(str(exc)) from exc
