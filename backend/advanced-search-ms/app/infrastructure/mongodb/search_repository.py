# app/infrastructure/mongodb/search_repository.py
"""
MongoSearchRepository – Infrastructure Adapter
==============================================

This file implements the MongoDB adapter for the SearchRepository port, as per Clean Architecture principles.

Purpose:
-----------
• Translates high-level search operations (keyword, text, vector, hybrid) into MongoDB aggregation pipelines.
• Delegates the actual pipeline syntax to specialized builders in `pipelines/`.
• Uses the Motor async client (`AsyncIOMotorCollection`) to execute queries against MongoDB Atlas.
• Applies lightweight post-processing (e.g., inventory filtering) before returning results to the application layer.

Architectural Role:
-----------------------
This class lives in the **infrastructure layer**. It does NOT contain business logic—it focuses on:
• Wiring MongoDB-specific execution (indexes, vector fields, pagination)
• Providing clean, backend-ready data to the application layer
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorCollection

from app.application.ports import SearchRepository
from app.infrastructure.mongodb.client import MongoClient
from app.infrastructure.mongodb.utils import (
    PRODUCT_FIELDS,
    filter_inventory_summary,
)
from app.infrastructure.mongodb.pipelines import (
    build_keyword_pipeline,
    build_text_pipeline,
    build_vector_pipeline,
    build_hybrid_rrf_pipeline,
)
from app.shared.exceptions import InfrastructureError

logger = logging.getLogger("advanced-search-ms.mongo-repo")


class MongoSearchRepository(SearchRepository):
    """
    Concrete adapter behind the SearchRepository port (Clean Architecture).

    It delegates *heavy* work to dedicated pipeline builders; this class only
    orchestrates parameters, runs the aggregation, and applies final shaping.
    """

    def __init__(
        self,
        collection: AsyncIOMotorCollection,
        index_name_text: str,
        index_name_vector: str,
        embedding_field: str,
    ) -> None:
        self.col = collection
        self.text_index = index_name_text
        self.vector_index = index_name_vector
        self.vector_field = embedding_field

        logger.info(
            "[INFRA/MongoDB/SearchRepo] ✅ Initialised | text_index=%s | vector_index=%s",
            self.text_index,
            self.vector_index,
        )

    async def search_keyword(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        logger.info("[INFRA/MongoDB/SearchRepo] 🔎 Keyword search | q='%s' | store=%s", query, store_object_id)

        skip = (page - 1) * page_size
        pipeline = build_keyword_pipeline(
            query=query,
            store_object_id=store_object_id,
            skip=skip,
            limit=page_size,
            projection_fields=PRODUCT_FIELDS,
        )
        return await self._run_pipeline(pipeline, store_object_id)

    async def search_atlas_text(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        logger.info("[INFRA/MongoDB/SearchRepo] 🔎 Text search | q='%s' | store=%s", query, store_object_id)

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

    async def search_by_vector(
        self,
        embedding: List[float],
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        logger.info("[INFRA/MongoDB/SearchRepo] 🔎 Vector search | store=%s", store_object_id)

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
        logger.info("[INFRA/MongoDB/SearchRepo] 🔎 Hybrid RRF | q='%s' | store=%s", query, store_object_id)

        skip = (page - 1) * page_size
        weights = {
            "vectorPipeline": weight_vector,
            "textPipeline": weight_text,
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

    async def _run_pipeline(
        self,
        pipeline: List[Dict],
        store_object_id: str,
    ) -> Tuple[List[Dict], int]:
        """
    Executes the aggregation pipeline, filters inventory rows, and
    for Hybrid RRF results, copies the fused score from scoreDetails.value
    into the flat `score` field expected by the domain layer.

    Note:
    We tried extracting the fused score directly in the pipeline using
    `$project`, but `$scoreDetails.details.value` often returns null,
    possibly due to how $rankFusion populates metadata.

    As a workaround, we set the score here in Python post-aggregation.
    Ideally, MongoDB should expose this value cleanly for projection,
    or $rankFusion could allow aliasing the final score directly.

    TODO:
    Revisit once MongoDB improves $rankFusion metadata projection
    (e.g., allow accessing `.value` reliably or setting an alias).  
    """

        try:
            logger.debug("[INFRA/MongoDB/SearchRepo] ▶️ Executing aggregation…")
            cursor = self.col.aggregate(pipeline, maxTimeMS=6_000)
            root = (await cursor.to_list(length=1))[0] if cursor else {}

            docs = [
                filter_inventory_summary(doc, store_object_id)
                for doc in root.get("docs", [])
            ]
            total = int(root.get("total", 0))

            logger.info("[INFRA/MongoDB/SearchRepo] ✅ Returned %d docs | total=%d", len(docs), total)

            # If available, set score = scoreDetails.value (fallback if score is null/zero)
            for doc in docs:
                sd: Dict[str, Any] | None = doc.get("scoreDetails")
                if sd and isinstance(sd, dict):
                    fused = sd.get("value")
                    if fused is not None and (doc.get("score") in (None, 0, 0.0)):
                        doc["score"] = round(float(fused) , 4)

                    logger.info(
                        "[RRF] Document %s → fused=%.4f | score=%s",
                        doc.get("_id"),
                        fused if sd else -1,
                        doc["score"],
                    )

            return docs, total

        except Exception as exc:
            logger.error("[INFRA/MongoDB/SearchRepo] 💥 Aggregation failed: %s", exc)
            raise InfrastructureError(str(exc)) from exc
