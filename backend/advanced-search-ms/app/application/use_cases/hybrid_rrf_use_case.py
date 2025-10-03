# app/application/use_cases/hybrid_rrf_use_case.py
"""
Use-case: Hybrid search with Reciprocal Rank Fusion (text + vector) or score fusion.

Flow
----
1) Create an embedding for the incoming query.
2) Delegate to `SearchRepository.search_hybrid_rrf()` passing:
   - embedding
   - weights (vector/text) — default to 0.5 if omitted
   - fusion_mode ("rrf" | "scoreFusion") if provided
   - brand_amplification (list[{name, boostLevel}]) if provided
3) Return (products, total) with the same contract as other modes.

Why here?
---------
- Application decides sensible defaults (weights) and just passes through
  fusion/boost knobs to Infrastructure, where the Mongo pipeline is built.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Tuple, Optional, Sequence

from app.application.ports import SearchRepository, EmbeddingProvider, BrandAmpSpec
from app.application.use_cases.base import SearchUseCase

logger = logging.getLogger("advanced-search-ms.usecase.hybrid")

DEFAULT_WEIGHT = 0.5  # Business default when caller omits weights


class HybridRRFSearchUseCase(SearchUseCase):
    """Combines semantic (vector) and lexical (text) relevance via fusion (RRF/scoreFusion)."""

    async def _run_repo_query(
        self,
        *,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
        weight_vector: Optional[float] = None,
        weight_text: Optional[float] = None,
        fusion_mode: Optional[str] = None,  # "rrf" | "scoreFusion" (validated upstream at Interfaces)
        brand_amplification: Optional[Sequence[BrandAmpSpec]] = None,
    ) -> Tuple[List[Dict], int]:
        # 1) Ensure we have an embedder
        assert self.embedder, "Hybrid search requires an EmbeddingProvider instance"

        # 2) Embed the query
        embedding: List[float] = await self.embedder.create_embedding(query)
        logger.info(
            "[HYBRID] Created embedding (len=%d) | store=%s page=%d size=%d",
            len(embedding), store_object_id, page, page_size
        )

        # 3) Decide effective weights (use defaults if missing)
        w_vec = weight_vector if weight_vector is not None else DEFAULT_WEIGHT
        w_txt = weight_text   if weight_text   is not None else DEFAULT_WEIGHT

        # (Optional) lightweight sanity clamp to [0,1] without being strict here.
        # Validation dura ya ocurre en Interfaces; acá solo evitamos valores locos.
        w_vec = max(0.0, min(1.0, w_vec))
        w_txt = max(0.0, min(1.0, w_txt))

        logger.info(
            "[HYBRID] Fusion params → mode=%s | weights: vector=%.2f text=%.2f",
            fusion_mode or "rrf(default)", w_vec, w_txt
        )
        if brand_amplification:
            logger.info(
                "[HYBRID] Brand amplification: %d brand(s) received",
                len(brand_amplification)
            )

        # 4) Delegate to repository (Mongo pipeline + fusion happens there)
        products, total = await self.repo.search_hybrid_rrf(
            query=query,
            embedding=embedding,
            store_object_id=store_object_id,
            page=page,
            page_size=page_size,
            weight_vector=w_vec,
            weight_text=w_txt,
            fusion_mode=fusion_mode,
            brand_amplification=brand_amplification,
        )

        logger.info("[HYBRID] Retrieved %d products (total=%d)", len(products), total)
        return products, total
