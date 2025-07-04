"""
API layer (FastAPI router).

Purpose
-------
• Validates incoming requests (Pydantic).  
• Chooses the correct use-case and executes it.  
• Maps domain responses into HTTP JSON and status codes.  
• Adds structured logging for observability.

Why
---
Keeping all HTTP-specific code in one place makes the rest of the
application framework-agnostic and easy to test.

How
---
Uses FastAPI dependency injection to grab the singleton Mongo/Voyage
clients that `main.py` initialises at startup.
"""

import logging
import time
from math import ceil
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.application.use_cases.vector_search_use_case import VectorSearchUseCase
from app.application.use_cases.vector_search_rerank_use_case import (
    VectorSearchRerankUseCase,
)
from app.shared.exceptions import InfrastructureError, UseCaseError
from main import get_mongo, get_voyage

logger = logging.getLogger("advanced-search-ms.api")
router = APIRouter()


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, example="organic onions")
    option: int = Field(
        ...,
        ge=1,
        le=2,
        description="1 = vector search, 2 = vector search + Voyage re-rank",
    )
    page: int = Field(1, ge=1)
    page_size: int = Field(10, ge=1, le=50)


@router.post("/search", summary="Semantic product search")
async def search(
    req: SearchRequest,
    mongo=Depends(get_mongo),
    voyage=Depends(get_voyage),
) -> Dict[str, Any]:
    """
    Execute a semantic search.

    • *option = 1* → plain vector search (Atlas Lucene).  
    • *option = 2* → vector search + VoyageAI re-ranking.

    The response includes the similarity `score` for transparency.
    """
    t0 = time.perf_counter()
    logger.info(
        "Received search | query=%r option=%d page=%d size=%d",
        req.query,
        req.option,
        req.page,
        req.page_size,
    )

    # Choose the appropriate use-case ---------------------------------------
    if req.option == 1:
        use_case = VectorSearchUseCase(mongo, voyage)
    else:
        base_case = VectorSearchUseCase(mongo, voyage)
        use_case = VectorSearchRerankUseCase(base_case, voyage)

    status = 500  # pessimistic default
    try:
        result = await use_case.execute(req.query, req.page, req.page_size)
        status = 200
        return {
            "page": req.page,
            "page_size": req.page_size,
            "total_results": result["total"],
            "total_pages": ceil(result["total"] / req.page_size),
            # NOTE: each product dict now includes `score`
            "products": [p.dict() for p in result["products"]],
        }

    except UseCaseError as exc:
        logger.error("UseCaseError: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    except InfrastructureError as exc:
        logger.error("InfrastructureError: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    finally:
        elapsed = (time.perf_counter() - t0) * 1000
        logger.info("Search completed | status=%d latency=%.2f ms", status, elapsed)
