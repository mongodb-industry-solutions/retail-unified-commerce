# app/application/use_cases/vector_search_use_case.py
"""
Use-case: Atlas Lucene `$vectorSearch` (plain k-NN).
"""

import logging
from typing import Dict, List, Tuple

from app.application.ports import EmbeddingProvider, SearchRepository
from app.application.use_cases.base import SearchUseCase

logger = logging.getLogger("advanced-search-ms.usecase")


class VectorSearchUseCase(SearchUseCase):
    """Creates an embedding then calls `search_by_vector()`."""

    async def _run_repo_query(
        self,
        *,
        query: str,
        store_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        assert self.embedder, "Vector search requires an EmbeddingProvider"

        # 1️⃣ embed
        embedding: List[float] = await self.embedder.create_embedding(query)

        # 2️⃣ delegate to repo
        return await self.repo.search_by_vector(
            embedding=embedding,
            store_object_id=store_id,
            page=page,
            page_size=page_size,
        )
