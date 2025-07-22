# app/application/use_cases/base.py
"""
Abstract base class for all search use‑cases.

Responsibilities
----------------
1. Validate / massage inputs.
2. Delegate to the infrastructure repository (and embedder when required).
3. Map raw MongoDB documents → `Product` domain objects.

Keeping this logic here avoids duplication across concrete use‑cases.

Educational Logs
----------------
- Logs entry into `execute()` with query and pagination context.
- Catches and rethrows InfrastructureError as UseCaseError.
- Allows `**kwargs` for flexibility (e.g., hybrid RRF weights) without impacting other use cases.
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
    """Template Method base class for search use‑cases."""

    def __init__(self, repo: SearchRepository, embedder: EmbeddingProvider | None = None) -> None:
        self.repo = repo
        self.embedder = embedder  # optional – only needed for vector / hybrid flows

    async def execute(
        self,
        *,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
        **kwargs,  # Allows optional inputs like weight_vector / weight_text (for hybrid)
    ) -> Dict:
        """
        Orchestrates the full search flow and returns a serializable response payload.

        Logs:
        - Entry log showing query, pagination and store context.
        - Catches infra errors and rethrows them as UseCaseError (clean separation).
        - Calls `_run_repo_query()` to delegate to the concrete implementation.
        """
        logger.info("🔍 [USECASE base] execute() | query=%r store=%s page=%d size=%d",
                    query, store_object_id, page, page_size)
        try:
            raw_docs, total = await self._run_repo_query(
                query=query,
                store_object_id=store_object_id,
                page=page,
                page_size=page_size,
                **kwargs,
            )
        except InfrastructureError as exc:
            logger.error("💥 [USECASE base] Infrastructure error: %s", exc)
            raise UseCaseError(str(exc)) from exc

        products: List[Product] = [Product.from_mongo(d) for d in raw_docs]
        logger.info("📦 [USECASE base] Parsed %d product(s) from raw documents", len(products))
        return {"products": products, "total": total}

    # ------------------------------------------------------------------ #
    #            Hook to be implemented by concrete subclasses           #
    # ------------------------------------------------------------------ #
    @abstractmethod
    async def _run_repo_query(
        self,
        *,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
        **kwargs,
    ) -> Tuple[List[Dict], int]:
        """
        Abstract method to be implemented by concrete use-cases.
        Allows injection of optional fields via `**kwargs` for extensibility.

        Example:
        - Hybrid RRF use case uses `weight_vector` and `weight_text`.
        - Other use cases safely ignore extra kwargs.
        """
        ...
