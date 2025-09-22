# app/infrastructure/mongodb/search_repository.py
"""
MongoSearchRepository – Infrastructure Adapter (MongoDB)
=======================================================

What this class does
--------------------
Implements the `SearchRepository` application port using MongoDB/Atlas. It translates
high-level search operations (keyword, text, vector, hybrid) into concrete aggregation
pipelines by delegating to specialized *pipeline builders* under
`app/infrastructure/mongodb/pipelines/`.

**This adapter does not hold business rules**. It focuses on I/O details and data shaping:
- Assembles skip/limit for pagination.
- Supplies Mongo-specific identifiers (index names, vector field).
- Passes through “strategy knobs” (weights, fusion mode, brand amplification) to builders.
- Executes the aggregation with Motor (async).
- Performs minimal post-processing on the result documents.

Why it matters in this demo
---------------------------
This is an educational repository: logs are intentionally verbose to show the flow
end-to-end (inputs, strategy, pagination, totals). The adapter guarantees a stable
shape for the upstream layers:
- If a pipeline does not project `isBoosted`, this adapter defaults it to **False**,
  so the API layer consistently exposes the field.
- For hybrid RRF, if Mongo exposes a fused score under `scoreDetails.value`,
  we mirror it into the flat `score` field to keep the domain/API response uniform.

"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence, Tuple

from motor.motor_asyncio import AsyncIOMotorCollection

from app.application.ports import SearchRepository  # application port (contract)
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
    Concrete MongoDB implementation of the `SearchRepository` port.

    Notes for maintainers:
    - Keep this class thin. If logic grows, prefer pushing it into the pipeline
      builders (aggregation layout) or the application layer (use case orchestration).
    - Ensure method signatures stay aligned with `app/application/ports.py`.
    """

    def __init__(
        self,
        collection: AsyncIOMotorCollection,
        index_name_text: str,
        index_name_vector: str,
        embedding_field: str,
    ) -> None:
        """
        Parameters
        ----------
        collection : AsyncIOMotorCollection
            MongoDB collection where products live.
        index_name_text : str
            Atlas Search text index name.
        index_name_vector : str
            Atlas Lucene `$vectorSearch` index name.
        embedding_field : str
            Field name holding vector embeddings (e.g., 'textEmbeddingVector').
        """
        self.col = collection
        self.text_index = index_name_text
        self.vector_index = index_name_vector
        self.vector_field = embedding_field

        logger.info(
            "[INFRA/MongoDB/SearchRepo] ✅ Initialised | text_index=%s | vector_index=%s",
            self.text_index,
            self.vector_index,
        )

    # ───────────────────────────── option 1 ─────────────────────────────
    async def search_keyword(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        """
        Keyword / regex search on product name (no brand amplification).

        Returns a tuple (docs, total) where `docs` includes the projection defined
        by `PRODUCT_FIELDS` and the pipeline builder.
        """
        logger.info("[INFRA] 🔎 Keyword | q=%r | store=%s | page=%d | size=%d",
                    query, store_object_id, page, page_size)

        skip = (page - 1) * page_size
        pipeline = build_keyword_pipeline(
            query=query,
            store_object_id=store_object_id,
            skip=skip,
            limit=page_size,
            projection_fields=PRODUCT_FIELDS,
        )
        return await self._run_pipeline(pipeline, store_object_id)

    # ───────────────────────────── option 2 ─────────────────────────────
    async def search_atlas_text(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
        *,
        brand_amplification: Optional[Sequence[Dict]] = None,
    ) -> Tuple[List[Dict], int]:
        """
        Full-text search using Atlas `$search`.

        Parameters
        ----------
        brand_amplification : Optional[Sequence[Dict]]
            List of brand specs `{name, boostLevel}`. Pipeline builder decides how to
            reflect this in the `$search` stage (boosting + optional `isBoosted` projection).
        """
        logger.info(
            "[INFRA] 🔎 Atlas text | q=%r | store=%s | page=%d | size=%d | brandAmp=%d",
            query, store_object_id, page, page_size, len(brand_amplification or []),
        )

        skip = (page - 1) * page_size
        pipeline = build_text_pipeline(
            query=query,
            store_object_id=store_object_id,
            text_index=self.text_index,
            skip=skip,
            limit=page_size,
            projection_fields=PRODUCT_FIELDS,
            brand_amplification=brand_amplification,  # passthrough
        )
        return await self._run_pipeline(pipeline, store_object_id)

    # ───────────────────────────── option 3 ─────────────────────────────
    async def search_by_vector(
        self,
        embedding: List[float],
        store_object_id: str,
        page: int,
        page_size: int,
        *,
        brand_amplification: Optional[Sequence[Dict]] = None,
    ) -> Tuple[List[Dict], int]:
        """
        Semantic k-NN search via Atlas Lucene `$vectorSearch`.

        Parameters
        ----------
        brand_amplification : Optional[Sequence[Dict]]
            List of brand specs `{name, boostLevel}`. Builder may apply a secondary boost
            and/or project `isBoosted` based on `product.brand`.
        """
        logger.info(
            "[INFRA] 🔎 Vector | store=%s | page=%d | size=%d | brandAmp=%d",
            store_object_id, page, page_size, len(brand_amplification or []),
        )

        skip = (page - 1) * page_size
        pipeline = build_vector_pipeline(
            embedding=embedding,
            store_object_id=store_object_id,
            vector_index=self.vector_index,
            vector_field=self.vector_field,
            skip=skip,
            limit=page_size,
            projection_fields=PRODUCT_FIELDS,
            brand_amplification=brand_amplification,  # passthrough
        )
        return await self._run_pipeline(pipeline, store_object_id)

    # ───────────────────────────── option 4 ─────────────────────────────
    async def search_hybrid_rrf(
        self,
        query: str,
        embedding: List[float],
        store_object_id: str,
        page: int,
        page_size: int,
        *,
        weight_vector: Optional[float] = None,
        weight_text: Optional[float] = None,
        fusion_mode: Optional[str] = None,  # "rrf" | "scoreFusion"
        brand_amplification: Optional[Sequence[Dict]] = None,
    ) -> Tuple[List[Dict], int]:
        """
        Hybrid search (text + vector) with Reciprocal Rank Fusion or score fusion.

        Parameters
        ----------
        weight_vector, weight_text : Optional[float]
            Optional weighting knobs; builder may normalize/default as needed.
        fusion_mode : Optional[str]
            `"rrf"` (default) or `"scoreFusion"`.
        brand_amplification : Optional[Sequence[Dict]]
            Optional list of `{name, boostLevel}` specs.
        """
        logger.info(
            "[INFRA] 🔎 Hybrid | q=%r | store=%s | page=%d | size=%d | mode=%s | brandAmp=%d",
            query, store_object_id, page, page_size, fusion_mode or "rrf(default)",
            len(brand_amplification or []),
        )

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
            fusion_mode=fusion_mode,                 # passthrough
            brand_amplification=brand_amplification, # passthrough
            skip=skip,
            limit=page_size,
            projection_fields=PRODUCT_FIELDS,
        )
        return await self._run_pipeline(pipeline, store_object_id)

    # ───────────────────────────── execution ─────────────────────────────
    async def _run_pipeline(
        self,
        pipeline: List[Dict],
        store_object_id: str,
    ) -> Tuple[List[Dict], int]:
        """
        Execute the aggregation, filter inventory by store, and perform minimal shaping.

        Shaping performed here (kept intentionally small and documented):
        - **`score` fallback**: for hybrid, if the pipeline exposes a fused score under
          `scoreDetails.value`, mirror it into the flat `score` field when the latter is
          missing/zero. This keeps API responses consistent across strategies.
        - **`isBoosted` default**: if a pipeline does not project `isBoosted`, we set it to
          `False` explicitly to honor the public API schema contract.

        If MongoDB improves metadata projection for `$rankFusion` (e.g., stable access to the
        final score via `$project`), we can push the score shaping entirely into the pipeline
        and drop the fallback below.
        """
        try:
            logger.debug("[INFRA] ▶️ Aggregation…")
            cursor = self.col.aggregate(pipeline, maxTimeMS=6_000)
            root = (await cursor.to_list(length=1))[0] if cursor else {}

            # Both docs and total are shaped by the pipeline contract
            docs = [
                filter_inventory_summary(doc, store_object_id)
                for doc in root.get("docs", [])
            ]
            total = int(root.get("total", 0))

            logger.info("[INFRA] ✅ %d doc(s) returned | total=%d", len(docs), total)

            # Mirror fused score (if present) into flat `score`
            for doc in docs:
                sd: Dict[str, Any] | None = doc.get("scoreDetails")
                if sd and isinstance(sd, dict):
                    fused = sd.get("value")
                    if fused is not None and (doc.get("score") in (None, 0, 0.0)):
                        doc["score"] = round(float(fused), 4)

                # Guarantee isBoosted in the outgoing shape
                if "isBoosted" not in doc:
                    doc["isBoosted"] = False

            return docs, total

        except Exception as exc:
            logger.error("[INFRA] 💥 Aggregation failed: %s", exc)
            raise InfrastructureError(str(exc)) from exc
