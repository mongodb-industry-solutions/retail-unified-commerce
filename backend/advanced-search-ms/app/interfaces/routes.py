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

from fastapi import APIRouter, Depends, HTTPException

# ── Application use-cases ──────────────────────────────────────────────────────────
from app.application.use_cases.keyword_search_use_case import KeywordSearchUseCase
from app.application.use_cases.atlas_text_search_use_case import AtlasTextSearchUseCase
from app.application.use_cases.vector_search_use_case import VectorSearchUseCase
from app.application.use_cases.hybrid_rrf_use_case import HybridRRFSearchUseCase

# ── Ports helpers injected via FastAPI DI ────────────────────────────────────────────
from app.infrastructure.mongodb.search_repository import MongoSearchRepository
from app.infrastructure.voyage_ai.client import VoyageClient

# ── Pydantic schemas ────────────────────────────────────────────────────────────────
from app.interfaces.schemas import SearchRequest, SearchResponse, ProductOut
from app.shared import dependencies

logger = logging.getLogger("advanced-search-ms.api")
router = APIRouter()

# ────────────────────────────────  Route  ────────────────────────────────
@router.post("/search", response_model=SearchResponse, summary="Product search (4 strategies)")
async def search(
    req: SearchRequest,
    repo: MongoSearchRepository = Depends(dependencies.get_repo),
    voyage: VoyageClient = Depends(dependencies.get_embedder),
) -> SearchResponse:
    """
    Executes one of four search strategies, controlled by `option`.

    * **1** – keyword / regex  
    * **2** – Atlas text (`$search`)  
    * **3** – pure vector (`$vectorSearch`)  
    * **4** – hybrid RRF (text + vector)  
        → Optional fields: `weightVector`, `weightText`
    """
    t0 = time.perf_counter()
    logger.info(
        "🚀 [ROUTE] Received request in API layer | query=%r option=%d storeObjectId=%s page=%d page_size=%d",
        req.query,
        req.option,
        req.storeObjectId,
        req.page,
        req.page_size,
    )

    logger.info("📌 [ROUTE] Selecting use-case based on option=%d", req.option)

    match req.option:
        case 1:
            use_case = KeywordSearchUseCase(repo)
            logger.info("✅ [ROUTE] KeywordSearchUseCase initialized")
        case 2:
            use_case = AtlasTextSearchUseCase(repo)
            logger.info("✅ [ROUTE] AtlasTextSearchUseCase initialized")
        case 3:
            use_case = VectorSearchUseCase(repo, voyage)
            logger.info("✅ [ROUTE] VectorSearchUseCase initialized")
        case 4:
            use_case = HybridRRFSearchUseCase(repo, voyage)
            logger.info("✅ [ROUTE] HybridRRFSearchUseCase initialized")
        case _:
            logger.error("❌ [ROUTE] Invalid option received, raising HTTPException")
            raise HTTPException(status_code=400, detail="Invalid option")

    status = 500
    try:
        logger.info("▶️ [ROUTE] Calling use-case.execute() to enter application layer")

        match req.option:
            case 4:
                result = await use_case.execute(
                    query=req.query,
                    store_object_id=req.storeObjectId,
                    page=req.page,
                    page_size=req.page_size,
                    weight_vector=req.weightVector,
                    weight_text=req.weightText,
                )
            case _:
                result = await use_case.execute(
                    query=req.query,
                    store_object_id=req.storeObjectId,
                    page=req.page,
                    page_size=req.page_size,
                )

        logger.info("✅ [ROUTE] Use-case execution completed, returned to route handler")

        status = 200
        return SearchResponse(
            total_results=result["total"],
            total_pages=ceil(result["total"] / req.page_size) if result["total"] else 0,
            products=[ProductOut(**p.dict()) for p in result["products"]],
        )

    except Exception as exc:
        logger.exception("💥 [ROUTE] Search failed with exception: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    finally:
        elapsed = (time.perf_counter() - t0) * 1000
        logger.info("🌟 [ROUTE] Search completed | status=%d latency=%.1f ms", status, elapsed)