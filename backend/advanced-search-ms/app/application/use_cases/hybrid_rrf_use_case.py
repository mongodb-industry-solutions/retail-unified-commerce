# app/application/use_cases/hybrid_rrf_use_case.py
"""
Use-case: Hybrid Reciprocal-Rank-Fusion (text + vector).

Algorithm
---------
1. Create the embedding of `query`.
2. Call repository's `search_hybrid_rrf()` which:
   • runs `$search` *and* `$vectorSearch`,
   • fuses ranks via MongoDB `$rankFusion` (weighted RRF),
   • filters by `storeId`,
   • returns combined, de-duplicated list.

The use-case itself is therefore thin – the heavy lifting lives in the repo.
"""

import logging
from typing import Dict, List, Tuple

from app.application.ports import EmbeddingProvider, SearchRepository
from app.application.use_cases.base import SearchUseCase

logger = logging.getLogger("advanced-search-ms.usecase")


class HybridRRFSearchUseCase(SearchUseCase):
    """Combines semantic and lexical relevance with RRF."""

    async def _run_repo_query(
        self,
        *,
        query: str,
        store_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        assert self.embedder, "Hybrid search requires an EmbeddingProvider"
        embedding: List[float] = await self.embedder.create_embedding(query)

        return await self.repo.search_hybrid_rrf(
            query=query,
            embedding=embedding,
            store_object_id=store_id,
            page=page,
            page_size=page_size,
        )
