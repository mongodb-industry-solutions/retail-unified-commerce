# app/application/use_cases/base.py
"""
Abstract base class for all search use-cases.

Why
----
Each concrete use-case does the same three high-level steps:

1. Validate / massage inputs.
2. Call the appropriate repository method (and embedder if needed).
3. Map raw MongoDB documents → `Product` domain objects.

Keeping the shared logic here removes duplication.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Dict, List, Tuple

from app.application.ports import EmbeddingProvider, SearchRepository
from app.domain.product import Product
from app.shared.exceptions import UseCaseError, InfrastructureError

logger = logging.getLogger("advanced-search-ms.usecase")


class SearchUseCase(ABC):
    """
    Template Method base class.

    Concrete subclasses only need to implement `_run_repo_query()`.
    """

    def __init__(
        self,
        repo: SearchRepository,
        embedder: EmbeddingProvider | None = None,
    ) -> None:
        self.repo = repo
        self.embedder = embedder  # optional – not needed for keyword/text

    async def execute(
        self,
        query: str,
        store_object_id: str,  # 🔧 changed to store_object_id for consistency
        page: int,
        page_size: int,
    ) -> Dict:
        """
        Orchestrates the full search flow and returns a serialisable dict
        with `products` (domain objects) and `total` hit count.
        """
        logger.info("🔍 [USECASE base] Starting execute() in base use-case")
        logger.info("📥 [USECASE base] Inputs: query=%r store_object_id=%s page=%d page_size=%d",
                    query, store_object_id, page, page_size)

        try:
            logger.info("▶️ [USECASE base] Calling _run_repo_query() to enter infrastructure layer")
            raw_docs, total = await self._run_repo_query(
                query=query,
                store_object_id=store_object_id,
                page=page,
                page_size=page_size,
            )
            logger.info("✅ [USECASE base] Repository query completed successfully")

        except InfrastructureError as exc:
            logger.error("💥 [USECASE base] Infrastructure error: %s", exc)
            raise UseCaseError(str(exc)) from exc

        logger.info("🔄 [USECASE base] Mapping raw MongoDB docs to Product domain objects")
        products: List[Product] = [Product.from_mongo(d) for d in raw_docs]
        logger.info("🏁 [USECASE base] Mapping completed, returning results to route")

        return {"products": products, "total": total}

    # --------------------------------------------------------------------- #
    # Template hook implemented by concrete subclasses
    # --------------------------------------------------------------------- #

    @abstractmethod
    async def _run_repo_query(
        self,
        *,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        """Run the repository method that corresponds to the strategy."""
