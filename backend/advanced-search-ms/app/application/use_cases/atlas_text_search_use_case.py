# app/application/use_cases/atlas_text_search_use_case.py
"""
Use-case: Atlas `$search` full-text query.

Why
----
This use-case performs a full-text search using MongoDB Atlas Search.

How it works
------------
Implements the `_run_repo_query()` hook from the `SearchUseCase` template method base class.
It delegates the search execution to the repository's `search_atlas_text()` method.

Logs are added for didactic clarity during development and debugging.
"""

import logging
from typing import List, Dict, Tuple

from app.application.ports import SearchRepository
from app.application.use_cases.base import SearchUseCase
from app.shared.exceptions import InfrastructureError

logger = logging.getLogger("advanced-search-ms.usecase.atlas-text")


class AtlasTextSearchUseCase(SearchUseCase):
    """Delegates to `SearchRepository.search_atlas_text()`."""

    async def _run_repo_query(
        self,
        *,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:

        logger.info("🔍 [USECASE atlas_text] Starting _run_repo_query() in AtlasTextSearchUseCase")
        logger.info("📥 [USECASE atlas_text] Inputs: query=%r store_object_id=%s page=%d page_size=%d",
                    query, store_object_id, page, page_size)

        try:
            # Call the repository method to perform Atlas full-text search
            result = await self.repo.search_atlas_text(
                query=query,
                store_object_id=store_object_id,
                page=page,
                page_size=page_size,
            )
            logger.info("✅ [USECASE atlas_text] Repository call completed successfully")
            return result

        except InfrastructureError as exc:
            logger.error("💥 [USECASE atlas_text] Infrastructure error during Atlas text search: %s", exc)
            raise
