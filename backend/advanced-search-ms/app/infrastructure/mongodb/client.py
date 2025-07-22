# app/infrastructure/mongodb/client.py

"""
MongoDB Client Adapter for Infrastructure Layer
===============================================

This module wraps the Motor async MongoDB client.

🧩 Responsibilities:
--------------------
• Establishes and maintains a connection pool to MongoDB Atlas
• Exposes the main product collection for search
• Stores index and embedding configuration metadata
• Performs early health validation on startup

🏗️ Clean Architecture Role:
---------------------------
Acts as an **infrastructure adapter**, consumed by repositories
in the infrastructure layer and injected into application services.
"""

import logging
from typing import List, Dict, Tuple

from motor.motor_asyncio import AsyncIOMotorClient
from tenacity import retry, stop_after_attempt, wait_exponential, before_log

from app.shared.exceptions import InfrastructureError

logger = logging.getLogger("advanced-search-ms.infra")


class MongoClient:
    """
    Infrastructure adapter for MongoDB Atlas access and configuration.
    """

    def __init__(
        self,
        uri: str,
        database: str,
        collection: str,
        embedding_field: str,
        index_name: str,
    ):
        """
        Initializes the async MongoDB client and verifies connectivity.

        Args:
            uri: MongoDB connection string (with credentials and cluster info)
            database: Target database name
            collection: Name of the collection containing product documents
            embedding_field: Field used for Atlas Vector Search
            index_name: Atlas Search index used for Lucene k-NN queries
        """
        logger.info("🔧 [mongo_client] Initializing MongoClient...")
        logger.info("📦 Connecting to MongoDB: db='%s' collection='%s' index='%s'",
                    database, collection, index_name)

        # Create async client with connection pool
        self.client = AsyncIOMotorClient(
            uri,
            maxPoolSize=50,
            minPoolSize=10,
            serverSelectionTimeoutMS=5000,
            tls=True,
        )

        # Store references
        self.database = self.client[database]
        self.collection = self.database[collection]
        self.embedding_field = embedding_field
        self.index_name = index_name

        # Health check (fail fast if cluster unreachable)
        try:
            self.client.admin.command("ping")
            logger.info("✅ [mongo_client] Connection to MongoDB verified")
        except Exception as e:
            logger.error("❌ [mongo_client] MongoDB ping failed: %s", e)
            raise InfrastructureError("MongoDB connection failed at startup") from e

        # Final metadata log
        logger.info("✅ [mongo_client] Ready to perform vector search with:")
        logger.info("   ├─ Embedding field: '%s'", self.embedding_field)
        logger.info("   └─ Search index:    '%s'", self.index_name)
