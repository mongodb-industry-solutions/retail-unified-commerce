# app/application/use_cases/vector_search_use_case.py
"""
Use-case: semantic search via Atlas Lucene `$vectorSearch` (k-NN).

Flow
----
1) Create an embedding for the user query.
2) Call the repository's `search_by_vector()` so MongoDB does the heavy work.
3) Return paged products + total count.

Brand Amplification
-------------------
• Supported in Option 3.
• Accepts a list of {name, boostLevel} and passes it to Infra.
• Infra can translate this into a score multiplier and/or set `isBoosted`.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Tuple, Optional

from app.application.ports import EmbeddingProvider, SearchRepository
from app.application.use_cases.base import SearchUseCase
from app.domain.brand_amplification import BrandAmplification

logger = logging.getLogger("advanced-search-ms.usecase.vector")


class VectorSearchUseCase(SearchUseCase):
    """
    Creates an embedding from the raw text query and delegates to the
    repository’s `$vectorSearch` pipeline. Keeps the same pagination /
    response shape as the other search options.
    """

    async def _run_repo_query(
        self,
        *,
        query: str,
        store_object_id: str,  # ← match parameter name expected downstream
        page: int,
        page_size: int,
        brand_amplification: Optional[List[BrandAmplification]] = None,
        **kwargs,
    ) -> Tuple[List[Dict], int]:
        """
        Parameters
        ----------
        query : str
            Raw user search text.
        store_object_id : str
            Store identifier used to scope inventory (filtered in the pipeline).
        page : int
            1-based page number.
        page_size : int
            Documents per page.
        brand_amplification : Optional[List[BrandAmplification]]
            Optional boost rules to prioritize certain brands.

        Returns
        -------
        Tuple[List[Dict], int]
            A list of product docs and the total number of hits.
        """
        # -------------------- 1️⃣ Embed the query ------------------------- #
        assert self.embedder, "Vector search requires an EmbeddingProvider"
        logger.info("[USECASE vector] 🔄 Embedding query: %r", query)
        embedding: List[float] = await self.embedder.create_embedding(query)

        # -------------------- 2️⃣ Repository call ------------------------- #
        if brand_amplification:
            logger.info(
                "🏷️ [USECASE vector] Brand amplification: %s",
                [{"name": b.name, "boostLevel": b.boostLevel} for b in brand_amplification],
            )
        else:
            logger.info("🏷️ [USECASE vector] No brand amplification provided")

        logger.info(
            "[USECASE vector] ▶️ Delegating to repo.search_by_vector | "
            "StoreObjectId=%s Page=%s PageSize=%s",
            store_object_id, page, page_size,
        )

        products, total = await self.repo.search_by_vector(
            embedding=embedding,
            store_object_id=store_object_id,
            page=page,
            page_size=page_size,
            brand_amplification=brand_amplification,  # ← pass-through to Infra
        )

        # -------------------- 3️⃣ Return results ------------------------- #
        logger.info("[USECASE vector] ✅ Retrieved %s products (total=%s)", len(products), total)
        return products, total
