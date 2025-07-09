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

All queries are *scoped to a single store* by filtering
`inventorySummary.storeId == <store_object_id>`.

Returned tuple: (page_results: list[dict], total_hits: int)

Implementation notes:
* This repository **never** maps docs → domain objects; use-cases handle that.
* Pagination is 1-based (`page=1` → first chunk).
"""

from __future__ import annotations

import logging
from typing import Dict, List, Tuple

from motor.motor_asyncio import AsyncIOMotorCollection

from app.application.ports import SearchRepository
from app.shared.exceptions import InfrastructureError
from app.infrastructure.mongodb.client import MongoClient

logger = logging.getLogger("advanced-search-ms.mongo-repo")


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
    # OPTION 1 – simple keyword / regex                                     #
    # --------------------------------------------------------------------- #

    async def search_keyword(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        skip = (page - 1) * page_size

        pipeline = [
            {
                "$match": {
                    "inventorySummary.storeId": store_object_id,
                    "productName": {"$regex": query, "$options": "i"},
                }
            },
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
            return root_doc.get("docs", []), int(root_doc.get("total", 0))

        except Exception as exc:
            logger.error("Keyword search failed: %s", exc)
            raise InfrastructureError(exc) from exc

    # --------------------------------------------------------------------- #
    # OPTION 2 – Atlas full-text `$search`                                  #
    # --------------------------------------------------------------------- #

    async def search_atlas_text(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        skip = (page - 1) * page_size

        search_stage = {
            "$search": {
                "index": self.text_index,
                "text": {
                    "query": query,
                    "path": ["productName", "brand", "aboutTheProduct"],
                },
            }
        }

        pipeline = [
            search_stage,
            {"$match": {"inventorySummary.storeId": store_object_id}},
            {"$facet": {
                "docs": [
                    {"$skip": skip},
                    {"$limit": page_size},
                    {"$addFields": {"score": {"$meta": "searchScore"}}},
                ],
                "count": [{"$count": "total"}],
            }},
            {"$unwind": {"path": "$count", "preserveNullAndEmptyArrays": True}},
            {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        ]

        try:
            agg = self.col.aggregate(pipeline, maxTimeMS=4000)
            root_doc = (await agg.to_list(length=1))[0] if agg else {}
            return root_doc.get("docs", []), int(root_doc.get("total", 0))

        except Exception as exc:
            logger.error("Atlas text search failed: %s", exc)
            raise InfrastructureError(exc) from exc

    # --------------------------------------------------------------------- #
    # OPTION 3 – Lucene `$vectorSearch` (delegated)                         #
    # --------------------------------------------------------------------- #

    async def search_by_vector(
        self,
        embedding: List[float],
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        raw_docs, total = await self._vec_helper.search_by_vector(
            embedding, page, page_size
        )

        docs = [
            d for d in raw_docs if any(
                inv["storeId"] == store_object_id for inv in d.get("inventorySummary", [])
            )
        ]
        return docs, total

    # --------------------------------------------------------------------- #
    # OPTION 4 – Hybrid search (RRF)                                        #
    # --------------------------------------------------------------------- #

    async def search_hybrid_rrf(
        self,
        query: str,
        embedding: List[float],
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
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
            {"$match": {"inventorySummary.storeId": store_object_id}},
            {"$facet": {
                "docs": [
                    {"$skip": skip},
                    {"$limit": page_size},
                    {"$addFields": {"score": {"$meta": "searchScore"}}},
                ],
                "count": [{"$count": "total"}],
            }},
            {"$unwind": {"path": "$count", "preserveNullAndEmptyArrays": True}},
            {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        ]

        try:
            agg = self.col.aggregate(pipeline, maxTimeMS=6000)
            root_doc = (await agg.to_list(length=1))[0] if agg else {}
            return root_doc.get("docs", []), int(root_doc.get("total", 0))

        except Exception as exc:
            logger.error("Hybrid RRF search failed: %s", exc)
            raise InfrastructureError(exc) from exc
