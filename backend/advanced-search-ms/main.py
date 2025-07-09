# main.py
"""
FastAPI bootstrap.

* Creates singletons (Mongo, Search-repository, VoyageAI embedder).
* Exposes them through FastAPI dependency-injection.
* Mounts the router and handles graceful shutdown.
"""

import logging
from fastapi import FastAPI, Depends, HTTPException

from app.shared.config import get_settings
from app.infrastructure.mongodb.client import MongoClient
from app.infrastructure.mongodb.search_repository import MongoSearchRepository
from app.infrastructure.voyage_ai.client import VoyageClient
from app.shared import dependencies

# ───── logging ──────────────────────────────────────────────────────────────
logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s – %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("advanced-search-ms")

# ───── FastAPI instance ─────────────────────────────────────────────────────
app = FastAPI()

# ───── import router *after* dependencies exist ─────────────────────────────
from app.interfaces.routes import router as search_router  # noqa: E402

# ───── lifecycle hooks ──────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_resources() -> None:
    """Create shared resources once at service start-up."""
    settings = get_settings()
    logger.info("Bootstrapping resources…")

    # Mongo connection -------------------------------------------------------
    dependencies.mongo_client = MongoClient(
        uri=settings.MONGODB_URI,
        database=settings.MONGODB_DATABASE,
        collection=settings.PRODUCTS_COLLECTION,
        index_name=settings.SEARCH_VECTOR_INDEX,
        embedding_field=settings.EMBEDDING_FIELD_NAME,
    )

    # Repository combines all four search strategies -------------------------
    dependencies.search_repo = MongoSearchRepository(
        collection=dependencies.mongo_client.collection,
        mongo_client_helper=dependencies.mongo_client,
        index_name_text=settings.SEARCH_TEXT_INDEX,
        index_name_vector=settings.SEARCH_VECTOR_INDEX,
        embedding_field=settings.EMBEDDING_FIELD_NAME,
    )

    # VoyageAI embedder ------------------------------------------------------
    dependencies.voyage_client = VoyageClient(
        api_key=settings.VOYAGE_API_KEY,
        base_url=settings.VOYAGE_API_URL,
        model=settings.VOYAGE_MODEL,
    )

    logger.info("✅  MongoDB, SearchRepository and VoyageAI clients ready")

@app.on_event("shutdown")
async def shutdown_resources() -> None:
    """Close network connections gracefully."""
    if dependencies.mongo_client:
        dependencies.mongo_client.client.close()
    logger.info("MongoDB connection closed")

# ───── mount router ─────────────────────────────────────────────────────────
app.include_router(
    search_router,
    prefix="/api/v1",
    dependencies=[
        Depends(dependencies.get_repo),
        Depends(dependencies.get_embedder),
    ],
)

# ───── health check ─────────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
async def health_check():
    """Ping MongoDB cluster; used by liveness/readiness probes."""
    try:
        dependencies.mongo_client.client.admin.command("ping")
        return {"status": "ok"}
    except Exception:
        logger.exception("Health check failed – cannot ping MongoDB")
        raise HTTPException(status_code=503, detail="DB connection failed")
 