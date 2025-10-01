# app/application/use_cases/atlas_text_search_use_case.py
"""
Use-case: Atlas `$search` full-text query.

Why
----
This use case performs a full-text search using MongoDB Atlas Search.

How it works
------------
Implements the `_run_repo_query()` hook from the `SearchUseCase` base class.
Delegates to the repository's `search_atlas_text()` method.

Brand Amplification (legacy + categories)
----------------------------------------
• Supported in Option 2.
• Accepts a list of {name, boostLevel, categories?} and passes it down to the repository.
• The repository (Infra) translates this into Atlas Search boosts and/or sets `isBoosted`.
"""

import logging
from typing import List, Dict, Tuple, Optional

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
        brand_amplification: Optional[List[Dict]] = None,
        **kwargs,
    ) -> Tuple[List[Dict], int]:

        logger.info("🔍 [USECASE atlas_text] _run_repo_query()")
        logger.info(
            "📥 [USECASE atlas_text] Inputs: query=%r store=%s page=%d size=%d",
            query, store_object_id, page, page_size
        )

        if brand_amplification:
            # Just log as list of dicts (already normalized in base use case)
            logger.info(
                "🏷️ [USECASE atlas_text] Brand amplification: %s",
                brand_amplification
            )
        else:
            logger.info("🏷️ [USECASE atlas_text] No brand amplification provided")

        try:
            # Pass brand amplification to infra so it can translate it into Atlas boosts
            result = await self.repo.search_atlas_text(
                query=query,
                store_object_id=store_object_id,
                page=page,
                page_size=page_size,
                brand_amplification=brand_amplification,  # dict passthrough
            )
            logger.info("✅ [USECASE atlas_text] Repository call completed successfully")
            return result

        except InfrastructureError as exc:
            logger.error("💥 [USECASE atlas_text] Infrastructure error during Atlas text search: %s", exc)
            raise
