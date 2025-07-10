# app/application/use_cases/keyword_search_use_case.py

from typing import List, Dict, Tuple

from app.application.ports import SearchRepository
from app.application.use_cases.base import SearchUseCase
import logging

logger = logging.getLogger("advanced-search-ms.usecase.keyword")


class KeywordSearchUseCase(SearchUseCase):
    """Delegates to `SearchRepository.search_keyword()`."""

    async def _run_repo_query(
        self,
        *,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        logger.info("🔍 [USECASE keyword] Inside KeywordSearchUseCase._run_repo_query()")
        logger.info("📥 [USECASE keyword] Inputs: query=%r store_object_id=%s page=%d page_size=%d",
                    query, store_object_id, page, page_size)

        result = await self.repo.search_keyword(
            query=query,
            store_object_id=store_object_id,
            page=page,
            page_size=page_size,
        )
        logger.info("✅ [USECASE keyword] Repository call completed in KeywordSearchUseCase")
        return result

