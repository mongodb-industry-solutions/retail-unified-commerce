# app/shared/dependencies.py
"""
Dependency injection helpers.

Purpose:
---------
Expose singleton clients (MongoDB, Voyage AI, SearchRepository) as FastAPI dependencies,
decoupling app logic from instantiation details.
"""

from app.infrastructure.mongodb.client import MongoClient
from app.infrastructure.mongodb.search_repository import MongoSearchRepository
from app.infrastructure.voyage_ai.client import VoyageClient

# Singletons instantiated in main.py
mongo_client: MongoClient | None = None
search_repo: MongoSearchRepository | None = None
voyage_client: VoyageClient | None = None

def get_mongo() -> MongoClient:
    if not mongo_client:
        raise RuntimeError("MongoClient not initialized")
    return mongo_client

def get_repo() -> MongoSearchRepository:
    if not search_repo:
        raise RuntimeError("SearchRepository not initialized")
    return search_repo

def get_embedder() -> VoyageClient:
    if not voyage_client:
        raise RuntimeError("VoyageClient not initialized")
    return voyage_client
