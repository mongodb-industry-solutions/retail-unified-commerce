# main.py
"""
Entry-point for the FastAPI application.

Purpose: Bootstraps the web server, mounts routers, and manages startup/shutdown events.
Why: Centralizes configuration, connection lifecycle, and route inclusion to keep app modular.
"""

import logging

from fastapi import FastAPI, Depends, HTTPException

from app.shared.config import get_settings
from app.infrastructure.mongodb.client import MongoClient
from app.infrastructure.voyage_ai.client import VoyageClient

# ───────────────────── logging ────────────────────────────────────────────────
logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s – %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("advanced-search-ms")

# ───────────────────── app instance & singletons ─────────────────────────────
app = FastAPI()

mongo_client: MongoClient | None = None
voyage_client: VoyageClient | None = None

# ───────────────────── dependency helpers ────────────────────────────────────
def get_mongo() -> MongoClient:
    """Return the singleton Mongo client (injected by FastAPI)."""
    return mongo_client  # type: ignore[return-value]

def get_voyage() -> VoyageClient:
    """Return the singleton Voyage AI client (injected by FastAPI)."""
    return voyage_client  # type: ignore[return-value]

# ───────────────────── import router *after* deps are defined ────────────────
from app.interfaces.routes import router as search_router  # noqa: E402  (late import)

# ───────────────────── lifecycle events ──────────────────────────────────────
@app.on_event("startup")
async def startup_resources() -> None:
    """Initialize shared resources once at service start."""
    settings = get_settings()
    logger.info(f"VOYAGE_API_URL loaded ▶ {settings.VOYAGE_API_URL!r}")
    global mongo_client, voyage_client

    mongo_client = MongoClient(
        settings.MONGODB_URI,
        settings.MONGODB_DATABASE,
        settings.PRODUCTS_COLLECTION,
        settings.SEARCH_INDEX_NAME,
        settings.EMBEDDING_FIELD_NAME,
    )
    voyage_client = VoyageClient(
        settings.VOYAGE_API_KEY,
        settings.VOYAGE_API_URL,
        settings.VOYAGE_MODEL,
    )
    logger.info("Initialized MongoDB and Voyage AI clients")

@app.on_event("shutdown")
async def shutdown_resources() -> None:
    """Clean up resources on shutdown."""
    if mongo_client:
        mongo_client.client.close()
    logger.info("Closed MongoDB client connection")

# ───────────────────── mount router ──────────────────────────────────────────
app.include_router(
    search_router,
    prefix="/api/v1",
    dependencies=[Depends(get_mongo), Depends(get_voyage)],
)

# ───────────────────── health check ──────────────────────────────────────────
@app.get("/health", tags=["health"])
async def health_check():
    """Simple ping-pong DB check."""
    try:
        mongo_client.client.admin.command("ping")  # type: ignore[attr-defined]
        return {"status": "ok"}
    except Exception:
        logger.error("Health check failed: cannot ping MongoDB")
        raise HTTPException(status_code=503, detail="DB connection failed")
