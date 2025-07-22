# main.py
"""
FastAPI bootstrap for Advanced Search Microservice.
===================================================

This script wires together the core infrastructure of the app.

🧩 Responsibilities:
--------------------
• Initializes shared resources (MongoDB, SearchRepository, VoyageAI)
• Exposes them via FastAPI dependency-injection
• Mounts the search router
• Handles graceful shutdown

🚦 Key components:
-------------------
• MongoClient – MongoDB Atlas connection
• MongoSearchRepository – delegates to different search pipelines
• VoyageClient – generates semantic embeddings
• CORSMiddleware – allows frontend calls
• Health check – verifies DB availability
"""

import logging
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.shared.config import get_settings
from app.infrastructure.mongodb.client import MongoClient
from app.infrastructure.mongodb.search_repository import MongoSearchRepository
from app.infrastructure.voyage_ai.client import VoyageClient
from app.shared import dependencies

# ───── Logging setup ────────────────────────────────────────────────────────
logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s – %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("advanced-search-ms")

# ───── FastAPI instance + CORS ──────────────────────────────────────────────
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins or restrict to frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ───── Router import (after resources exist) ────────────────────────────────
from app.interfaces.routes import router as search_router  # noqa: E402

# ───── Startup – Dependency injection ───────────────────────────────────────
@app.on_event("startup")
async def startup_resources() -> None:
    """Create shared resources once at service startup."""
    settings = get_settings()
    logger.info("🚀 Bootstrapping shared services...")

    # Log config context (safe fields only)
    logger.info("📦 MongoDB config → db: %s | collection: %s",
                settings.MONGODB_DATABASE,
                settings.PRODUCTS_COLLECTION)
    logger.info("🔍 Atlas Search indexes → text: %s | vector: %s",
                settings.SEARCH_TEXT_INDEX,
                settings.SEARCH_VECTOR_INDEX)
    logger.info("🧠 Voyage model: %s", settings.VOYAGE_MODEL)

    # MongoDB Client
    logger.info("🔌 Connecting to MongoDB...")
    dependencies.mongo_client = MongoClient(
        uri=settings.MONGODB_URI,
        database=settings.MONGODB_DATABASE,
        collection=settings.PRODUCTS_COLLECTION,
        index_name=settings.SEARCH_VECTOR_INDEX,
        embedding_field=settings.EMBEDDING_FIELD_NAME,
    )
    logger.info("✅ MongoDB client ready")

    # Search Repository
    logger.info("⚙️ Initializing SearchRepository...")
    dependencies.search_repo = MongoSearchRepository(
        collection=dependencies.mongo_client.collection,
        index_name_text=settings.SEARCH_TEXT_INDEX,
        index_name_vector=settings.SEARCH_VECTOR_INDEX,
        embedding_field=settings.EMBEDDING_FIELD_NAME,
    )
    logger.info("✅ SearchRepository ready")

    # Voyage Client
    logger.info("🌐 Connecting to VoyageAI...")
    dependencies.voyage_client = VoyageClient(
        api_key=settings.VOYAGE_API_KEY,
        base_url=settings.VOYAGE_API_URL,
        model=settings.VOYAGE_MODEL,
    )
    logger.info("✅ VoyageAI client ready")

    logger.info("🏁 Startup complete – ready to accept requests")

# ───── Shutdown hook ────────────────────────────────────────────────────────
@app.on_event("shutdown")
async def shutdown_resources() -> None:
    """Close connections gracefully."""
    if dependencies.mongo_client:
        logger.info("🛑 Closing MongoDB connection...")
        dependencies.mongo_client.client.close()
        logger.info("✅ MongoDB connection closed")

# ───── Mount search routes ──────────────────────────────────────────────────
app.include_router(
    search_router,
    prefix="/api/v1",
    dependencies=[
        Depends(dependencies.get_repo),
        Depends(dependencies.get_embedder),
    ],
)

# ───── Health Check endpoint ────────────────────────────────────────────────
@app.get("/health", tags=["health"])
async def health_check():
    """
    Health check endpoint for liveness/readiness probes.

    - Verifies MongoDB is reachable
    - Confirms core dependencies are initialized
    """
    try:
        dependencies.mongo_client.client.admin.command("ping")
        return {
            "status": "ok",
            "mongodb": "reachable",
            "voyage": "configured",
            "version": "1.0.0",  # Optional: extract from settings or env
        }
    except Exception:
        logger.exception("❌ Health check failed – cannot reach MongoDB")
        raise HTTPException(status_code=503, detail="DB connection failed")
