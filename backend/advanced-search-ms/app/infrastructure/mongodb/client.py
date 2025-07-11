# app/infrastructure/mongodb/client.py
"""
MongoDB Atlas Vector Search client (Lucene engine).

• Keeps a singleton `AsyncIOMotorClient` with tuned pool sizes.

"""

import logging
from typing import List, Dict, Tuple

from motor.motor_asyncio import AsyncIOMotorClient
from tenacity import retry, stop_after_attempt, wait_exponential, before_log

from app.shared.exceptions import InfrastructureError

logger = logging.getLogger("advanced-search-ms.infra")

# --------------------------------------------------------------------------- #
# ⚙️ MongoClient – Infrastructure Adapter
# --------------------------------------------------------------------------- #
class MongoClient:
    def __init__(
        self,
        uri: str,
        database: str,
        collection: str,
        embedding_field: str,
        index_name: str,
    ):
        """
        Initializes the MongoDB async client with a connection pool.

        Clean Architecture:
        • This is the **Infrastructure Layer Adapter**, isolated from domain logic.
        • Called by Repositories in Infrastructure Layer, used by Application Layer Use Cases.

        Args:
            uri: MongoDB connection string.
            database: Target database name.
            collection: Target collection name.
            embedding_field: Field name for vector embeddings.
            index_name: Lucene vector search index name.
        """
        logger.info(
            "[infra/mongo_client] 🔧 Initializing MongoClient | "
            "Database=%s Collection=%s Index=%s",
            database,
            collection,
            index_name,
        )

        self.client = AsyncIOMotorClient(
            uri,
            maxPoolSize=50,
            minPoolSize=10,
            serverSelectionTimeoutMS=5_000,
            tls=True,
        )
        self.collection = self.client[database][collection]
        self.embedding_field = embedding_field
        self.index_name = index_name

        logger.info(
            "[infra/mongo_client] ✅ MongoClient initialized successfully | "
            "Connected to database=%s collection=%s",
            database,
            collection,
        )

        logger.info(
            "[infra/mongo_client] 📦 Ready to perform vector search operations "
            "with embedding field '%s' and index '%s'",
            embedding_field,
            index_name,
        )
