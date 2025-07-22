# app/application/use_cases/hybrid_rrf_use_case.py
"""
Use‑case: Hybrid Reciprocal Rank Fusion (text + vector).

Flow
----
1. Create an embedding for the incoming query.
2. Delegate to `SearchRepository.search_hybrid_rrf()` passing the embedding and RRF weights.
3. Return a list of products (domain objects) plus total hits.

Business rule: if caller omits `weight_vector` / `weight_text`, default to **0.5**.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Tuple, Optional

from app.application.ports import EmbeddingProvider, SearchRepository
from app.application.use_cases.base import SearchUseCase

logger = logging.getLogger("advanced-search-ms.usecase.hybrid")

DEFAULT_WEIGHT = 0.5  # business default when caller does not specify weights


class HybridRRFSearchUseCase(SearchUseCase):
    """Combines semantic (vector) and lexical (text) relevance via RRF."""

    async def _run_repo_query(
        self,
        *,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
        weight_vector: Optional[float] = None,
        weight_text: Optional[float] = None,
    ) -> Tuple[List[Dict], int]:
        # Ensure an embedder is available
        assert self.embedder, "Hybrid search requires an EmbeddingProvider instance"

        # 1️⃣  Embed the query
        embedding: List[float] = await self.embedder.create_embedding(query)
        logger.info("[HYBRID] Generated embedding (length=%d) for query", len(embedding))

        # 2️⃣  Determine weights (apply defaults when missing)
        w_vec = weight_vector if weight_vector is not None else DEFAULT_WEIGHT
        w_txt = weight_text   if weight_text   is not None else DEFAULT_WEIGHT
        logger.info("[HYBRID] Using RRF weights | vector=%.2f text=%.2f", w_vec, w_txt)

        # 3️⃣  Call repository
        products, total = await self.repo.search_hybrid_rrf(
            query=query,
            embedding=embedding,
            store_object_id=store_object_id,
            page=page,
            page_size=page_size,
            weight_vector=w_vec,
            weight_text=w_txt,
        )
        return products, total
