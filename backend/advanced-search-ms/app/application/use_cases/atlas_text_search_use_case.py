# app/application/use_cases/atlas_text_search_use_case.py
"""
Use-case: Atlas `$search` full-text query.
"""

from typing import List, Dict, Tuple

from app.application.ports import SearchRepository
from app.application.use_cases.base import SearchUseCase


class AtlasTextSearchUseCase(SearchUseCase):
    """Delegates to `SearchRepository.search_atlas_text()`."""

    async def _run_repo_query(
        self,
        *,
        query: str,
        store_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        return await self.repo.search_atlas_text(
            query=query,
            store_object_id=store_id,
            page=page,
            page_size=page_size,
        )
