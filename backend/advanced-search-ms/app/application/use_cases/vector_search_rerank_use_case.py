# app/application/use_cases/vector_search_rerank_use_case.py
"""
Use-case: Vector search + VoyageAI re-rank.

Steps
-----
1. Delegate initial k-NN retrieval to `VectorSearchUseCase`.
2. Build a plain-text representation of each candidate product.
3. Call Voyage AI `/rerank` to get **index / score** pairs.
4. Attach `score` to the corresponding `Product` instances,
   sort products DESC, return paginated result.

Raises
------
UseCaseError – if Voyage re-rank fails (already retried at infra layer).
"""

from __future__ import annotations

import logging
from typing import List, Dict, Any

from app.application.use_cases.vector_search_use_case import VectorSearchUseCase
from app.application.ports import EmbeddingProvider
from app.shared.exceptions import UseCaseError
from app.domain.product import Product

logger = logging.getLogger("advanced-search-ms.usecase")


class VectorSearchRerankUseCase:
    """Compose base vector search with semantic re-ranking."""

    def __init__(
        self,
        base_search: VectorSearchUseCase,
        embedder: EmbeddingProvider,  # i.e. VoyageClient
    ) -> None:
        self.base_search = base_search
        self.embedder = embedder

    # ------------------------------------------------------------------ #
    #  Public API                                                         #
    # ------------------------------------------------------------------ #

    async def execute(
        self,
        query: str,
        page: int,
        page_size: int,
    ) -> Dict[str, Any]:
        """
        Return `{products: list[Product], total: int}` with `score` populated.

        Re-ranking is always applied to **this page only**.
        """
        # 1. initial recall
        initial = await self.base_search.execute(query, page, page_size)
        products: List[Product] = initial["products"]

        # 2. build plain-text docs (simple – product name + category)
        docs_text: List[str] = [
            f"{p.productName} {p.category or ''} {p.subCategory or ''}".strip()
            for p in products
        ]

        try:
            # 3. Voyage rerank → [{'index': i, 'score': s}, …]  (already sorted)
            ranked = await self.embedder.rerank(
                query=query,
                documents=docs_text,
                top_k=len(docs_text),
            )
        except Exception as exc:
            logger.error(f"Re-rank error: {exc}")
            raise UseCaseError(f"Re-rank failed: {exc}") from exc

        # 4. attach score & sort
        for item in ranked:
            idx = item["index"]
            score = item["score"]
            products[idx].score = score  # type: ignore[attr-defined]

        products_sorted = sorted(products, key=lambda p: p.score or 0.0, reverse=True)

        return {
            "products": products_sorted,
            "total": initial["total"],
        }
