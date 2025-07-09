# app/application/use_cases/keyword_search_use_case.py
"""
Use-case: simple keyword / regex search.
"""

from typing import List, Dict, Tuple

from app.application.ports import SearchRepository
from app.application.use_cases.base import SearchUseCase


class KeywordSearchUseCase(SearchUseCase):
    """Delegates to `SearchRepository.search_keyword()`."""

    async def _run_repo_query(
        self,
        *,
        query: str,
        store_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        return await self.repo.search_keyword(
            query=query,
            store_object_id=store_id,
            page=page,
            page_size=page_size,
        )
