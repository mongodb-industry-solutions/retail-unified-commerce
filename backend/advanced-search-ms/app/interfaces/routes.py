# app/interfaces/routes.py
# app/interfaces/routes.py
"""
API layer (FastAPI router).

Why
---
* Validates the HTTP payload (Pydantic).
* Chooses the correct search use-case and executes it.
* Maps domain objects to JSON, sets HTTP status codes.
* Adds structured logging for observability.
"""

from __future__ import annotations

import logging
import time
from math import ceil
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

# ── Application use-cases ──────────────────────────────────────────────
from app.application.use_cases.keyword_search_use_case import KeywordSearchUseCase
from app.application.use_cases.atlas_text_search_use_case import (
    AtlasTextSearchUseCase,
)
from app.application.use_cases.vector_search_use_case import VectorSearchUseCase
from app.application.use_cases.hybrid_rrf_use_case import HybridRRFSearchUseCase

# ── Ports helpers injected via FastAPI DI ──────────────────────────────
from app.infrastructure.mongodb.search_repository import MongoSearchRepository
from app.infrastructure.voyage_ai.client import VoyageClient

# ✅ UPDATED: Import dependencies from shared.dependencies
from app.shared import dependencies

logger = logging.getLogger("advanced-search-ms.api")
router = APIRouter()


# ─────────────────────────  Schema  ────────────────────────────────────
class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, example="organic onions")
    storeId: str = Field(..., description="MongoDB ObjectId of the target store")
    option: int = Field(
        ...,
        ge=1,
        le=4,
        description="""
            1 = keyword / regex search
            2 = Atlas Search (text)
            3 = Lucene vector search
            4 = Hybrid search (RRF text + vector)
        """,
    )
    page: int = Field(1, ge=1)
    page_size: int = Field(10, ge=1, le=50)


# ─────────────────────────  Route  ─────────────────────────────────────
@router.post("/search", summary="Product search (4 strategies)")
async def search(
    req: SearchRequest,
    repo: MongoSearchRepository = Depends(dependencies.get_repo),  # ✅ inject repo
    voyage: VoyageClient = Depends(dependencies.get_embedder),     # ✅ inject embedder
) -> Dict[str, Any]:
    """
    Executes one of four search strategies, controlled by `option`.

    * **1** – keyword / regex  
    * **2** – Atlas text (`$search`)  
    * **3** – pure vector (`$vectorSearch`)  
    * **4** – hybrid RRF (text + vector)
    """
    t0 = time.perf_counter()
    logger.info(
        "Search | q=%r opt=%d store=%s page=%d size=%d",
        req.query,
        req.option,
        req.storeId,
        req.page,
        req.page_size,
    )

    # ------------------------------------------------------------------ #
    # Pick use-case based on requested option
    # ------------------------------------------------------------------ #
    match req.option:
        case 1:
            use_case = KeywordSearchUseCase(repo)
        case 2:
            use_case = AtlasTextSearchUseCase(repo)
        case 3:
            use_case = VectorSearchUseCase(repo, voyage)
        case 4:
            use_case = HybridRRFSearchUseCase(repo, voyage)
        case _:
            # Should be unreachable thanks to Pydantic validation.
            raise HTTPException(status_code=400, detail="Invalid option")

    # ------------------------------------------------------------------ #
    # Execute
    # ------------------------------------------------------------------ #
    status = 500
    try:
        result = await use_case.execute(
            query=req.query,
            store_id=req.storeId,
            page=req.page,
            page_size=req.page_size,
        )
        status = 200
        return {
            "page": req.page,
            "page_size": req.page_size,
            "total_results": result["total"],
            "total_pages": ceil(result["total"] / req.page_size) if result["total"] else 0,
            "products": [p.dict() for p in result["products"]],
        }

    except Exception as exc:
        logger.exception("Search failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    finally:
        elapsed = (time.perf_counter() - t0) * 1000
        logger.info("Search completed | status=%d latency=%.1f ms", status, elapsed)