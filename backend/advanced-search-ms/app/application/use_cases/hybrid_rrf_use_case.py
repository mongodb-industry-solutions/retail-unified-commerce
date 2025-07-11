# app/application/use_cases/hybrid_rrf_use_case.py
"""
Use-case: Hybrid Reciprocal-Rank-Fusion (text + vector).

Algorithm
---------
1. Create the embedding of `query`.
2. Call repository's `search_hybrid_rrf()` which:
   • runs `$search` *and* `$vectorSearch`,
   • fuses ranks via MongoDB `$rankFusion` (weighted RRF),
   • filters by `storeObjectId`,
   • returns combined, de-duplicated list.

This use-case orchestrates the flow – heavy lifting is in the repository.

Clean Architecture
-------------------
• **Application Layer (Use Case)** – orchestrates embedding + DB call
• **Infrastructure Layer** – external AI (VoyageClient) + MongoDB pipelines
"""

from __future__ import annotations

import logging
from typing import Dict, List, Tuple

from app.application.ports import EmbeddingProvider, SearchRepository
from app.application.use_cases.base import SearchUseCase

logger = logging.getLogger("advanced-search-ms.usecase.hybrid")

# --------------------------------------------------------------------------- #
# ⚙️  HybridRRFSearchUseCase                                                  #
# --------------------------------------------------------------------------- #
class HybridRRFSearchUseCase(SearchUseCase):
    """Combines semantic and lexical relevance using Reciprocal Rank Fusion."""

    async def _run_repo_query(
        self,
        *,
        query: str,
        store_object_id: str,  # ✅ renamed to match repository method
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        """
        Orchestrates hybrid search:
        - Embeds the query
        - Calls the hybrid RRF pipeline in the repository

        Returns
        -------
        Tuple[List[Dict], int]
            A paginated list of products and total count.
        """
        assert self.embedder, "Hybrid search requires an EmbeddingProvider"

        # -------------------- 1️⃣ Embed the query ------------------------- #
        logger.info("[USECASE hybrid] 🔄 Embedding query for RRF: %r", query)
        embedding: List[float] = await self.embedder.create_embedding(query)

        # -------------------- 2️⃣ Repository call ------------------------- #
        logger.info(
            "[USECASE hybrid] ▶️ Calling repo.search_hybrid_rrf | "
            "StoreObjectId=%s Page=%s PageSize=%s",
            store_object_id,
            page,
            page_size,
        )
        products, total = await self.repo.search_hybrid_rrf(
            query=query,
            embedding=embedding,
            store_object_id=store_object_id,
            page=page,
            page_size=page_size,
        )

        # -------------------- 3️⃣ Return results ------------------------- #
        logger.info(
            "[USECASE hybrid] ✅ Retrieved %s products (total=%s)",
            len(products),
            total,
        )
        return products, total
