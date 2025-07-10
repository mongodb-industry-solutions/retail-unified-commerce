# app/infrastructure/mongodb/search_repository.py
"""
MongoSearchRepository
---------------------

Concrete adapter implementing the `SearchRepository` port with four
independent search strategies:

1. Plain keyword (`$match` + case-insensitive regex).
2. Atlas Search `$search` text index.
3. Lucene `$vectorSearch` (delegates to MongoClient helper).
4. Hybrid Reciprocal-Rank-Fusion (RRF) using `$rankFusion`.

All queries are scoped to a single store by filtering
`inventorySummary.storeObjectId == <store_object_id>`.

Key implementation notes:
* This repository **never maps docs → domain objects**; use-cases handle that.
* Pagination is 1-based (`page=1` → first chunk).
* Excludes embedding fields in final results to reduce payload size.

July 2025
"""

from __future__ import annotations

import logging
from typing import Dict, List, Tuple

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorCollection

from app.application.ports import SearchRepository
from app.shared.exceptions import InfrastructureError
from app.infrastructure.mongodb.client import MongoClient

logger = logging.getLogger("advanced-search-ms.mongo-repo")

# ---------------------------------------------------------------------------#
# 🎯 Projection: exclude embeddings to reduce payload
# ---------------------------------------------------------------------------#
PRODUCT_FIELDS = {
    "_id": 1,
    "productName": 1,
    "brand": 1,
    "price": 1,
    "quantity": 1,
    "category": 1,
    "subCategory": 1,
    "absoluteUrl": 1,
    "aboutTheProduct": 1,
    "imageUrlS3": 1,
    "inventorySummary": 1,
    # ❌ embeddings intentionally excluded
}

class MongoSearchRepository(SearchRepository):
    """MongoDB Atlas implementation of the SearchRepository port."""

    def __init__(
        self,
        collection: AsyncIOMotorCollection,
        index_name_text: str,
        index_name_vector: str,
        embedding_field: str,
        mongo_client_helper: MongoClient,
        rrf_weight_vector: float = 0.7,
        rrf_weight_text: float = 0.3,
    ) -> None:
        self.col = collection
        self.text_index = index_name_text
        self.vector_index = index_name_vector
        self.vector_field = embedding_field
        self._vec_helper = mongo_client_helper
        self.rrf_weights = {
            "vectorPipeline": rrf_weight_vector,
            "textPipeline": rrf_weight_text,
        }

    # --------------------------------------------------------------------- #
    # OPTION 1 – Simple keyword / regex                                     #
    # --------------------------------------------------------------------- #

    async def search_keyword(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        logger.info("🔎 [search_keyword] Starting keyword search | Query=%r StoreObjectId=%s", query, store_object_id)

        skip = (page - 1) * page_size

        pipeline = [
            {
                "$match": {
                    "inventorySummary": {
                        "$elemMatch": {
                            "storeObjectId": ObjectId(store_object_id)
                        }
                    },
                    "productName": {"$regex": query, "$options": "i"},
                }
            },
            {"$project": PRODUCT_FIELDS},
            {"$facet": {
                "docs": [
                    {"$skip": skip},
                    {"$limit": page_size},
                ],
                "count": [{"$count": "total"}],
            }},
            {"$unwind": {"path": "$count", "preserveNullAndEmptyArrays": True}},
            {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        ]

        try:
            agg = self.col.aggregate(pipeline, maxTimeMS=4000)
            root_doc = (await agg.to_list(length=1))[0] if agg else {}
            logger.info("✅ [search_keyword] Total results: %d", root_doc.get("total", 0))
            if root_doc.get("docs"):
                logger.info("📄 [search_keyword] First returned doc: %r", root_doc["docs"][0])
            else:
                logger.warning("⚠️ [search_keyword] No documents found.")
            return root_doc.get("docs", []), int(root_doc.get("total", 0))

        except Exception as exc:
            logger.error("💥 [search_keyword] Keyword search failed: %s", exc)
            raise InfrastructureError(exc) from exc

    # --------------------------------------------------------------------- #
    # OPTION 2 – Atlas full-text `$search`                                  #
    # --------------------------------------------------------------------- #

        # --------------------------------------------------------------------- #
    # OPTION 2 – Atlas full-text `$search` with fuzzy, synonyms, boosting   #
    # --------------------------------------------------------------------- #

    async def search_atlas_text(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        logger.info("🔎 [search_atlas_text] Starting Atlas text search | Query=%r StoreObjectId=%s", query, store_object_id)

        skip = (page - 1) * page_size

        pipeline = [
            {
                "$search": {
                    "index": self.text_index,
                    "compound": {
                        "should": [
                            {
                                "text": {
                                    "query": query,
                                    "path": "productName",
                                    "score": {"boost": {"value": 3}},  # 🔥 High boost
                                    "fuzzy": {"maxEdits": 2},  # ✅ Typo tolerance
                                    "synonyms": "default_synonyms",  # 📝 Your defined synonyms mapping
                                }
                            },
                            {
                                "text": {
                                    "query": query,
                                    "path": ["brand", "category", "subCategory"],
                                    "score": {"boost": {"value": 1}},  # Lower boost
                                    "fuzzy": {"maxEdits": 2},
                                    "synonyms": "default_synonyms",
                                }
                            }
                        ]
                    }
                }
            },
            {"$match": {"inventorySummary.storeObjectId": ObjectId(store_object_id)}},
            {"$project": {**PRODUCT_FIELDS, "score": {"$meta": "searchScore"}}},
            {"$facet": {
                "docs": [
                    {"$skip": skip},
                    {"$limit": page_size},
                ],
                "count": [{"$count": "total"}],
            }},
            {"$unwind": {"path": "$count", "preserveNullAndEmptyArrays": True}},
            {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        ]

        try:
            logger.info("▶️ [search_atlas_text] Executing aggregation pipeline in MongoDB")
            agg = self.col.aggregate(pipeline, maxTimeMS=4000)
            root_doc = (await agg.to_list(length=1))[0] if agg else {}

            logger.info("✅ [search_atlas_text] Aggregation completed | Total results: %d", root_doc.get("total", 0))
            if root_doc.get("docs"):
                logger.info("📄 [search_atlas_text] First returned doc: %r", root_doc["docs"][0])
            else:
                logger.warning("⚠️ [search_atlas_text] No documents found for this query.")

            return root_doc.get("docs", []), int(root_doc.get("total", 0))

        except Exception as exc:
            logger.error("💥 [search_atlas_text] Atlas text search failed: %s", exc)
            raise InfrastructureError(exc) from exc

    # --------------------------------------------------------------------- #
    # OPTION 3 – Lucene `$vectorSearch` (delegated to MongoClient helper)   #
    # --------------------------------------------------------------------- #

    async def search_by_vector(
        self,
        embedding: List[float],
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        logger.info("🔎 [search_by_vector] Starting vector search | StoreObjectId=%s", store_object_id)

        raw_docs, total = await self._vec_helper.search_by_vector(
            embedding, page, page_size
        )
        logger.info("✅ [search_by_vector] Raw docs retrieved: %d Total hits: %d", len(raw_docs), total)

        # Filter by store_object_id
        docs = [
            {k: v for k, v in d.items() if k in PRODUCT_FIELDS}
            for d in raw_docs
            if any(
                inv.get("storeObjectId") == store_object_id
                for inv in d.get("inventorySummary", [])
            )
        ]
        logger.info("🔄 [search_by_vector] Filtered docs (matching store): %d", len(docs))
        if docs:
            logger.info("📄 [search_by_vector] First filtered doc: %r", docs[0])
        else:
            logger.warning("⚠️ [search_by_vector] No docs after store filter.")
        return docs, total

    # --------------------------------------------------------------------- #
    # OPTION 4 – Hybrid RRF search                                          #
    # --------------------------------------------------------------------- #

    async def search_hybrid_rrf(
        self,
        query: str,
        embedding: List[float],
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        logger.info("🔎 [search_hybrid_rrf] Starting hybrid RRF search | Query=%r StoreObjectId=%s", query, store_object_id)

        skip = (page - 1) * page_size

        pipeline = [
            {
                "$rankFusion": {
                    "input": {
                        "pipelines": {
                            "vectorPipeline": [
                                {
                                    "$vectorSearch": {
                                        "index": self.vector_index,
                                        "path": self.vector_field,
                                        "queryVector": embedding,
                                        "numCandidates": 200,
                                        "limit": 200,
                                    }
                                }
                            ],
                            "textPipeline": [
                                {
                                    "$search": {
                                        "index": self.text_index,
                                        "text": {
                                            "query": query,
                                            "path": ["productName", "brand", "aboutTheProduct"],
                                        },
                                    }
                                },
                                {"$limit": 200},
                            ],
                        }
                    },
                    "combination": {"weights": self.rrf_weights},
                    "scoreDetails": True,
                }
            },
            {"$match": {"inventorySummary.storeObjectId": ObjectId(store_object_id)}},
            {"$project": {**PRODUCT_FIELDS, "score": {"$meta": "searchScore"}}},
            {"$facet": {
                "docs": [
                    {"$skip": skip},
                    {"$limit": page_size},
                ],
                "count": [{"$count": "total"}],
            }},
            {"$unwind": {"path": "$count", "preserveNullAndEmptyArrays": True}},
            {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        ]

        try:
            agg = self.col.aggregate(pipeline, maxTimeMS=6000)
            root_doc = (await agg.to_list(length=1))[0] if agg else {}
            logger.info("✅ [search_hybrid_rrf] Total results: %d", root_doc.get("total", 0))
            if root_doc.get("docs"):
                logger.info("📄 [search_hybrid_rrf] First returned doc: %r", root_doc["docs"][0])
            else:
                logger.warning("⚠️ [search_hybrid_rrf] No documents found.")
            return root_doc.get("docs", []), int(root_doc.get("total", 0))

        except Exception as exc:
            logger.error("💥 [search_hybrid_rrf] Hybrid RRF search failed: %s", exc)
            raise InfrastructureError(exc) from exc
