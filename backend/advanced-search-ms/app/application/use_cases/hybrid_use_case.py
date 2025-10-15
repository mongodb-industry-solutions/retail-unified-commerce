# app/application/use_cases/hybrid_use_case.py
"""
Use-case: Hybrid search combining lexical (text) and semantic (vector) signals.

Flow
----
1) Create an embedding for the incoming query via the configured EmbeddingProvider.
2) Delegate to `SearchRepository.search_hybrid_rrf()` passing:
   - embedding
   - weights (vector/text) — default to 0.5 when omitted
   - fusion_mode: "rrf" (default) or "scoreFusion"
   - brand_amplification (list[{name, boostLevel, categories?}]) if provided
3) Return (products, total) with the same contract as other modes.

Design notes
------------
- This use case does not own the fusion logic. It just validates/shapes inputs
  and forwards knobs to Infrastructure. The Mongo pipeline builder decides how
  to implement "rrf" vs "scoreFusion".
- Brand amplification is validated at the base use-case level and forwarded as
  plain dicts to Infra (which expects app-local specs / TypedDicts).
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

from app.application.use_cases.base import SearchUseCase

logger = logging.getLogger("advanced-search-ms.usecase.hybrid")

DEFAULT_WEIGHT = 0.5  # Business default for both signals


class HybridSearchUseCase(SearchUseCase):
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
        fusion_mode: Optional[str] = None,  # "rrf" | "scoreFusion"
        # NOTE: base.execute() validates brand amplification and forwards plain dicts
        brand_amplification: Optional[List[Dict]] = None,
        **_: Dict,  # swallow any extra kwargs to remain forward-compatible
    ) -> Tuple[List[Dict], int]:
        # 1) Ensure we have an embedder and create the embedding
        assert self.embedder, "Hybrid search requires an EmbeddingProvider instance"
        embedding: List[float] = await self.embedder.create_embedding(query)
        logger.info(
            "[HYBRID] Created embedding (len=%d) | store=%s page=%d size=%d",
            len(embedding), store_object_id, page, page_size
        )

        # 2) Effective weights with sane defaults and soft clamp
        w_vec = DEFAULT_WEIGHT if weight_vector is None else max(0.0, min(1.0, float(weight_vector)))
        w_txt = DEFAULT_WEIGHT if weight_text   is None else max(0.0, min(1.0, float(weight_text)))

        # 3) Normalize fusion mode (default to "rrf")
        mode = (fusion_mode or "rrf").strip()
        if mode not in ("rrf", "scoreFusion"):
            logger.warning("[HYBRID] Unknown fusion_mode=%r. Falling back to 'rrf'.", mode)
            mode = "rrf"

        logger.info("[HYBRID] Fusion params → mode=%s | weights: vector=%.2f text=%.2f", mode, w_vec, w_txt)

        # Brand amplification logging (already validated in base use case)
        if brand_amplification:
            logger.info("[HYBRID] Brand amplification: %d rule(s) received", len(brand_amplification))
        else:
            logger.info("[HYBRID] No brand amplification provided")

        # 4) Delegate to repository (Mongo pipeline + fusion happens there)
        products, total = await self.repo.search_hybrid(
            query=query,
            embedding=embedding,
            store_object_id=store_object_id,
            page=page,
            page_size=page_size,
            weight_vector=w_vec,
            weight_text=w_txt,
            fusion_mode=mode,                      # <-- pass-through; branching is in Infra
            brand_amplification=brand_amplification,
        )

        logger.info("[HYBRID] Retrieved %d products (total=%d)", len(products), total)
        return products, total
