# app/application/use_cases/keyword_search_use_case.py

from typing import List, Dict, Tuple, Optional
import logging

from app.application.ports import SearchRepository
from app.application.use_cases.base import SearchUseCase
from app.domain.brand_amplification import BrandAmplification

logger = logging.getLogger("advanced-search-ms.usecase.keyword")


class KeywordSearchUseCase(SearchUseCase):
    """
    Use case for Option 1 (keyword / regex).

    Notes
    -----
    • Brand Amplification is NOT supported for this strategy.
      If provided, it is intentionally ignored (we log it for observability).
    """

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
        logger.info("🔍 [USECASE keyword] _run_repo_query()")
        logger.info(
            "📥 [USECASE keyword] Inputs: query=%r store_object_id=%s page=%d page_size=%d",
            query, store_object_id, page, page_size
        )

        if brand_amplification:
            # Explicitly document behavior so callers/devs know it's ignored here.
            logger.info(
                "ℹ️ [USECASE keyword] brandAmplification provided (%d item(s)) "
                "but Option 1 does not support it — ignoring.",
                len(brand_amplification),
            )

        result = await self.repo.search_keyword(
            query=query,
            store_object_id=store_object_id,
            page=page,
            page_size=page_size,
        )
        logger.info("✅ [USECASE keyword] Repository call completed")
        return result
