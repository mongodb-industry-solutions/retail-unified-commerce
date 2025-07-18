# app/infrastructure/mongodb/search_repository.py
"""
MongoSearchRepository
=====================

A thin façade that implements the **SearchRepository** port.  
Actual aggregation stages live in `pipelines/*_pipeline.py`.

Why this split?
---------------
* Keeps this file short and readable.
* Each pipeline is unit‑testable in isolation.
* Future optimisations (e.g. caching) can wrap the builder only.
"""

from __future__ import annotations

import logging
from typing import List, Dict, Tuple, Optional

from motor.motor_asyncio import AsyncIOMotorCollection

from app.application.ports import SearchRepository
from app.infrastructure.mongodb.client import MongoClient
from app.infrastructure.mongodb.utils import filter_inventory_summary
from app.infrastructure.mongodb.pipelines import (
    build_keyword_pipeline,
    build_text_pipeline,
    build_vector_pipeline,
    build_hybrid_rrf_pipeline,
)
from app.shared.exceptions import InfrastructureError

# --------------------------------------------------------------------------- #
# Logging set‑up (library style: leave handler choice to the application root)
# --------------------------------------------------------------------------- #
logger = logging.getLogger("advanced-search-ms.mongo-repo")


class MongoSearchRepository(SearchRepository):
    """Delegates the heavy lifting to the aggregation‑pipeline builders."""

    # --------------------------------------------------------------------- #
    # Construction
    # --------------------------------------------------------------------- #
    def __init__(
        self,
        collection: AsyncIOMotorCollection,
        index_name_text: str,
        index_name_vector: str,
        embedding_field: str,
        mongo_client_helper: MongoClient,
    ) -> None:
        self.col          = collection
        self.text_index   = index_name_text
        self.vector_index = index_name_vector
        self.vector_field = embedding_field
        self._vec_helper  = mongo_client_helper
        logger.info("[infra/search_repository] MongoSearchRepository initialised")

    # --------------------------------------------------------------------- #
    # Option 1 – keyword search
    # --------------------------------------------------------------------- #
    async def search_keyword(
        self, query: str, store_object_id: str, page: int, page_size: int
    ) -> Tuple[List[Dict], int]:
        skip     = (page - 1) * page_size
        pipeline = build_keyword_pipeline(query, store_object_id, skip, page_size)
        return await self._run_pipeline(pipeline, store_object_id)

    # --------------------------------------------------------------------- #
    # Option 2 – Atlas Search text index
    # --------------------------------------------------------------------- #
    async def search_atlas_text(
        self, query: str, store_object_id: str, page: int, page_size: int
    ) -> Tuple[List[Dict], int]:
        skip     = (page - 1) * page_size
        pipeline = build_text_pipeline(
            query=query,
            store_object_id=store_object_id,
            text_index=self.text_index,
            skip=skip,
            limit=page_size,
        )
        return await self._run_pipeline(pipeline, store_object_id)

    # --------------------------------------------------------------------- #
    # Option 3 – Lucene k‑NN vector search
    # --------------------------------------------------------------------- #
    async def search_by_vector(
        self, embedding: List[float], store_object_id: str, page: int, page_size: int
    ) -> Tuple[List[Dict], int]:
        skip     = (page - 1) * page_size
        pipeline = build_vector_pipeline(
            embedding=embedding,
            store_object_id=store_object_id,
            vector_index=self.vector_index,
            vector_field=self.vector_field,
            skip=skip,
            limit=page_size,
            # in_stock=None                     # ⇠ set True/False to force filter
        )
        return await self._run_pipeline(pipeline, store_object_id)

    # --------------------------------------------------------------------- #
    # Option 4 – Hybrid Reciprocal‑Rank Fusion
    # --------------------------------------------------------------------- #
    async def search_hybrid_rrf(
        self,
        query: str,
        embedding: List[float],
        store_object_id: str,
        page: int,
        page_size: int,
        weight_vector: Optional[float] = None,
        weight_text: Optional[float] = None,
    ) -> Tuple[List[Dict], int]:
        skip     = (page - 1) * page_size
        weights  = {
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
        )
        return await self._run_pipeline(pipeline, store_object_id)

    # --------------------------------------------------------------------- #
    # Helper – execute pipeline & post‑process docs
    # --------------------------------------------------------------------- #
    async def _run_pipeline(
        self, pipeline: List[Dict], store_object_id: str
    ) -> Tuple[List[Dict], int]:
        """Run the aggregation and shape the output for the API layer."""
        try:
            cursor = self.col.aggregate(pipeline, maxTimeMS=6_000)
            root   = (await cursor.to_list(length=1))[0] if cursor else {}

            # 🔬  Log raw docs & scores – invaluable when tuning search quality
           # logger.info(
           #    "[infra/search_repository] Raw pipeline docs: %s",
            #   root.get("docs", []),
           # )

            docs  = [
                filter_inventory_summary(doc, store_object_id)
                for doc in root.get("docs", [])
            ]
            total = int(root.get("total", 0))

            return docs, total
        except Exception as exc:  # pragma: no cover
            logger.error("[infra] Aggregation failed: %s", exc)
            raise InfrastructureError(str(exc)) from exc
