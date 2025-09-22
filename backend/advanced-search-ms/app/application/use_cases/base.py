# app/application/use_cases/base.py

"""
Abstract base class for all search use-cases.

Responsibilities
----------------
1. Validate / massage inputs.
2. Delegate to the infrastructure repository (and embedder when required).
3. Map raw MongoDB documents → `Product` domain objects.

New (Brand Amplification)
-------------------------
• Supports optional `brand_amplification` input (list of {name, boostLevel}).
• Converts raw dicts → Domain DTOs (`BrandAmplification`) before passing down.
• Concrete use cases can decide whether to use or ignore this feature.

Educational Logs
----------------
- Logs entry into `execute()` with query, pagination, store context,
  and brand amplification count if provided.
- Catches and rethrows InfrastructureError as UseCaseError.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Dict, List, Tuple, Optional

from app.application.ports import EmbeddingProvider, SearchRepository
from app.domain.product import Product
from app.domain.brand_amplification import BrandAmplification
from app.shared.exceptions import UseCaseError, InfrastructureError

logger = logging.getLogger("advanced-search-ms.usecase")


class SearchUseCase(ABC):
    """Template Method base class for search use-cases."""

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
        brand_amplification: Optional[List[Dict]] = None,
        **kwargs,  # e.g., weight_vector / weight_text for hybrid
    ) -> Dict:
        """
        Orchestrates the full search flow and returns a serializable response payload.

        - Normalizes brand amplification input to Domain DTOs.
        - Delegates to concrete _run_repo_query() with all args.
        """
        logger.info(
            "🔍 [USECASE base] execute() | query=%r store=%s page=%d size=%d",
            query, store_object_id, page, page_size,
        )

        brand_amp_objs: Optional[List[BrandAmplification]] = None
        if brand_amplification:
            try:
                brand_amp_objs = [BrandAmplification(**b) for b in brand_amplification]
                logger.info(
                    "✨ [USECASE base] Brand amplification received: %d brands",
                    len(brand_amp_objs),
                )
            except Exception as exc:
                logger.error("❌ [USECASE base] Invalid brandAmplification input: %s", exc)
                raise UseCaseError(f"Invalid brandAmplification input: {exc}") from exc

        try:
            raw_docs, total = await self._run_repo_query(
                query=query,
                store_object_id=store_object_id,
                page=page,
                page_size=page_size,
                brand_amplification=brand_amp_objs,  # pass to child
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
        brand_amplification: Optional[List[BrandAmplification]] = None,
        **kwargs,
    ) -> Tuple[List[Dict], int]:
        """
        Abstract method to be implemented by concrete use cases.

        Parameters
        ----------
        brand_amplification : optional list of BrandAmplification

        """
        ...
