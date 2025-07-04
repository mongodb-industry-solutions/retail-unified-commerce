# app/application/use_cases/vector_search_use_case.py
"""
Use case for plain vector search.

Purpose: Encapsulates the business flow for vector-only search.
Why: Isolates embedding and DB logic from HTTP layer for testability.
How: Calls EmbeddingProvider and SearchRepository, logs events, and maps to domain objects.
"""

import logging
from typing import Dict
from app.application.ports import EmbeddingProvider, SearchRepository
from app.shared.exceptions import InfrastructureError, UseCaseError
from app.domain.product import Product

logger = logging.getLogger("advanced-search-ms.usecase")

class VectorSearchUseCase:
    def __init__(self, repo: SearchRepository, embedder: EmbeddingProvider):
        self.repo = repo
        self.embedder = embedder

    async def execute(self, query: str, page: int, page_size: int) -> Dict:
        try:
            embedding = await self.embedder.create_embedding(query)
            raw_results, total = await self.repo.search_by_vector(embedding, page, page_size)
        except InfrastructureError as e:
            logger.error(f"Infrastructure error in vector search: {e}")
            raise UseCaseError(f"Search failed: {e}") from e

        if not raw_results:
            logger.warning(f"No results found for query={query!r}")

        products = [Product.from_mongo(doc) for doc in raw_results]
        return {"products": products, "total": total}