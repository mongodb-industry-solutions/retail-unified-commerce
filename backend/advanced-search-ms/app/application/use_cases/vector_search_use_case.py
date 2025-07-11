# app/application/use_cases/vector_search_use_case.py
"""
Use-case: full-text semantic search via Atlas Lucene **$vectorSearch** (plain k-NN).

Flow
----
1.  Create an embedding for the user query.
2.  Call the repository's `search_by_vector()` so the DB does the heavy work.
3.  Return paged products + total count, same contract as other search modes.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Tuple

from app.application.ports import EmbeddingProvider, SearchRepository
from app.application.use_cases.base import SearchUseCase

logger = logging.getLogger("advanced-search-ms.usecase.vector")

# --------------------------------------------------------------------------- #
# ⚙️  VectorSearchUseCase                                                     #
# --------------------------------------------------------------------------- #
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
        logger.info(
            "[USECASE vector] ▶️ Delegating to repo.search_by_vector | "
            "StoreObjectId=%s Page=%s PageSize=%s",
            store_object_id,
            page,
            page_size,
        )
        products, total = await self.repo.search_by_vector(
            embedding=embedding,
            store_object_id=store_object_id,
            page=page,
            page_size=page_size,
        )

        # -------------------- 3️⃣ Return results ------------------------- #
        logger.info(
            "[USECASE vector] ✅ Retrieved %s products (total=%s)",
            len(products),
            total,
        )
        return products, total
