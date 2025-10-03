# app/interfaces/routes.py

"""
API layer (FastAPI router).

Why
---
* Validates the HTTP payload (Pydantic).
* Chooses the correct search use-case and executes it.
* Maps domain objects to JSON, sets HTTP status codes.
* Adds structured logging for observability.
*
* Updated for API version 2 (v2):
* - Validates business rules for brandAmplification:
*     • Not allowed if option == 1
*     • boostLevel must be in [1..3]
*     • (New) if present, categories must be a list of non-empty strings
* - Logs new fields: fusionMode, weights, brandAmpCount (+ categories stats)
* - Preserves existing behavior for options 1-4
"""

from __future__ import annotations

import os
import time
import logging
from math import ceil

from fastapi import APIRouter, Depends, HTTPException

# Application use-cases
from app.application.use_cases.keyword_search_use_case import KeywordSearchUseCase
from app.application.use_cases.atlas_text_search_use_case import AtlasTextSearchUseCase
from app.application.use_cases.vector_search_use_case import VectorSearchUseCase
from app.application.use_cases.hybrid_rrf_use_case import HybridRRFSearchUseCase

# Ports / Dependencies
from app.infrastructure.mongodb.search_repository import MongoSearchRepository
from app.infrastructure.voyage_ai.client import VoyageClient

# Pydantic schemas
from app.interfaces.schemas import SearchRequest, SearchResponse, ProductOut
from app.shared import dependencies

logger = logging.getLogger("advanced-search-ms.api")
router = APIRouter()

@router.post(
    "/search",
    response_model=SearchResponse,
    summary="Product search (4 strategies, supports Brand Amplification in options 2-4)"
)
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

    Supports optional `brandAmplification` in options 2-4;  
    Optional `fusionMode`, `weightText`, `weightVector` for option 4.  
    """

    t0 = time.perf_counter()

    # Pre-calc brand amplification metrics for observability
    _amp_list = req.brandAmplification or []
    _amp_with_categories = sum(1 for b in _amp_list if getattr(b, "categories", None))
    _amp_categories_total = sum(len(getattr(b, "categories", []) or []) for b in _amp_list)

    logger.info(
        "🚀 [INTERFACES/routes] Received request | query=%r option=%d storeObjectId=%s page=%d page_size=%d "
        "brandAmpCount=%d brandAmpWithCats=%d brandAmpCatsTotal=%d fusionMode=%s weightText=%s weightVector=%s",
        req.query,
        req.option,
        req.storeObjectId,
        req.page,
        req.page_size,
        len(_amp_list),
        _amp_with_categories,
        _amp_categories_total,
        req.fusionMode,
        req.weightText,
        req.weightVector,
    )

    # Business rule: brandAmplification not allowed for option 1
    if req.option == 1 and req.brandAmplification is not None:
        raise HTTPException(
            status_code=400,
            detail={"error": {
                "code": "INVALID_OPTION_FOR_BRAND_AMP",
                "message": "brandAmplification is only supported for options {2,3,4}"
            }}
        )

    # Validation: boostLevel range + categories
    if req.brandAmplification is not None:
        for b in req.brandAmplification:
            if not (1 <= b.boostLevel <= 3):
                raise HTTPException(
                    status_code=400,
                    detail={"error": {"code": "INVALID_BOOST_LEVEL", "message": "boostLevel must be one of [1,2,3]"}}
                )
            cats = getattr(b, "categories", None)
            if cats is not None:
                if not isinstance(cats, list):
                    raise HTTPException(
                        status_code=400,
                        detail={"error": {"code": "INVALID_BRAND_AMP_CATEGORIES", "message": "categories must be a list of strings"}}
                    )
                if any((not isinstance(c, str) or not c.strip()) for c in cats):
                    raise HTTPException(
                        status_code=400,
                        detail={"error": {"code": "INVALID_BRAND_AMP_CATEGORIES", "message": "each category must be a non-empty string"}}
                    )

    logger.info("📌 [INTERFACES/routes] Selecting use-case based on option=%d", req.option)

    match req.option:
        case 1:
            use_case = KeywordSearchUseCase(repo)
            logger.info("✅ [INTERFACES/routes] KeywordSearchUseCase initialized")
        case 2:
            use_case = AtlasTextSearchUseCase(repo)
            logger.info("✅ [INTERFACES/routes] AtlasTextSearchUseCase initialized")
        case 3:
            use_case = VectorSearchUseCase(repo, voyage)
            logger.info("✅ [INTERFACES/routes] VectorSearchUseCase initialized")
        case 4:
            use_case = HybridRRFSearchUseCase(repo, voyage)
            logger.info("✅ [INTERFACES/routes] HybridRRFSearchUseCase initialized")
        case _:
            logger.error("❌ [INTERFACES/routes] Invalid option received, raising HTTPException")
            raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_OPTION", "message": "option must be one of [1,2,3,4]"}})

    status = 500
    try:
        logger.info("▶️ [INTERFACES/routes] Calling use-case.execute() to enter application layer")

        # 🚩 FIX: Always forward brandAmplification → brand_amplification
        extra_kwargs = {}
        if req.brandAmplification is not None:
            extra_kwargs["brand_amplification"] = [b.dict() for b in req.brandAmplification]

        if req.option == 4:
            result = await use_case.execute(
                query=req.query,
                store_object_id=req.storeObjectId,
                page=req.page,
                page_size=req.page_size,
                weight_vector=req.weightVector,
                weight_text=req.weightText,
                fusion_mode=req.fusionMode,
                **extra_kwargs,
            )
        else:
            result = await use_case.execute(
                query=req.query,
                store_object_id=req.storeObjectId,
                page=req.page,
                page_size=req.page_size,
                **extra_kwargs,
            )

        logger.info("✅ [INTERFACES/routes] Use-case execution completed, returned to route handler")

        status = 200
        mongo_uri = os.getenv("MONGODB_URI", "")
        return SearchResponse(
            total_results=result["total"],
            total_pages=ceil(result["total"] / req.page_size) if result["total"] else 0,
            products=[ProductOut(**p.dict()) for p in result["products"]],
            deployment="atlas" if ".mongodb.net" in mongo_uri else "enterprise"
        )

    except HTTPException as http_exc:
        logger.warning("⚠️ [INTERFACES/routes] HTTPException thrown: %s", http_exc.detail)
        raise
    except Exception as exc:
        logger.exception("💥 [INTERFACES/routes] Search failed with unexpected exception: %s", exc)
        raise HTTPException(status_code=500, detail={"error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred. Please try again later."}}) from exc
    finally:
        elapsed = (time.perf_counter() - t0) * 1000
        _result = locals().get("result", None)
        total = (_result or {}).get("total") if isinstance(_result, dict) else None
        total_pages = ceil(total / req.page_size) if total else 0

        logger.info(
            "🌟 [INTERFACES/routes] Search completed | status=%d latency=%.1f ms total_results=%s total_pages=%s brandAmpCount=%d brandAmpWithCats=%d brandAmpCatsTotal=%d",
            status,
            elapsed,
            (total if total is not None else "n/a"),
            total_pages,
            len(_amp_list),
            _amp_with_categories,
            _amp_categories_total,
        )
