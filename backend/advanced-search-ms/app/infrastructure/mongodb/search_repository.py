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
`inventorySummary.storeObjectId == <store_object_id>` and
return only that store's inventorySummary object.

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
from app.infrastructure.mongodb.client import MongoClient
from app.shared.exceptions import InfrastructureError

logger = logging.getLogger("advanced-search-ms.mongo-repo")

# --------------------------------------------------------------------------- #
# 🎯 Projection: exclude embeddings to reduce payload                        #
# --------------------------------------------------------------------------- #
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
}


def filter_inventory_summary(doc: Dict, store_object_id: str) -> Dict:
    """
    Filters the inventorySummary array to include only the entry for the given store_object_id.
    """
    logger.info(
        "[infra/search_repository] Filtering inventorySummary for storeObjectId=%s",
        store_object_id,
    )
    if "inventorySummary" in doc:
        filtered = [
            inv
            for inv in doc["inventorySummary"]
            if str(inv.get("storeObjectId")) == str(store_object_id)
        ]
        doc["inventorySummary"] = filtered
    return doc


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
        logger.info("[infra/search_repository] MongoSearchRepository initialized.")

    # --------------------------------------------------------------------- #
    # OPTION 1 – Simple keyword / prefix regex                              #
    # --------------------------------------------------------------------- #

    async def search_keyword(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        logger.info(
            "[infra/search_repository] search_keyword | Query=%r StoreObjectId=%s",
            query,
            store_object_id,
        )
        skip = (page - 1) * page_size

        pipeline = [
            {
                "$match": {
                    "inventorySummary": {
                        "$elemMatch": {
                            "storeObjectId": ObjectId(store_object_id)
                        }
                    },
                    "productName": {"$regex": f"^{query}", "$options": "i"},
                }
            },
            {"$project": PRODUCT_FIELDS},
            {
                "$facet": {
                    "docs": [
                        {"$skip": skip},
                        {"$limit": page_size},
                    ],
                    "count": [{"$count": "total"}],
                }
            },
            {"$unwind": {"path": "$count", "preserveNullAndEmptyArrays": True}},
            {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        ]

        try:
            agg = self.col.aggregate(pipeline, maxTimeMS=4000)
            root_doc = (await agg.to_list(length=1))[0] if agg else {}
            docs = [
                filter_inventory_summary(d, store_object_id)
                for d in root_doc.get("docs", [])
            ]
            return docs, int(root_doc.get("total", 0))
        except Exception as exc:
            logger.error("[infra/search_repository] search_keyword failed: %s", exc)
            raise InfrastructureError(exc) from exc

    # ------------------------------------------------------------------ #
    # OPTION 2 – Atlas full-text `$search`                               #
    # ------------------------------------------------------------------ #

    async def search_atlas_text(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        logger.info(
            "[infra/search_repository] search_atlas_text | Query=%r StoreObjectId=%s",
            query,
            store_object_id,
        )
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
                                    "score": {"boost": {"value": 3}},
                                    "fuzzy": {"maxEdits": 2},
                                }
                            },
                            {
                                "text": {
                                    "query": query,
                                    "path": ["brand", "category", "subCategory"],
                                    "score": {"boost": {"value": 1}},
                                    "fuzzy": {"maxEdits": 2},
                                }
                            },
                        ]
                    },
                }
            },
            {
                "$match": {  # ← filtra por la tienda exacta dentro del array
                    "inventorySummary": {
                        "$elemMatch": {
                            "storeObjectId": ObjectId(store_object_id)
                        }
                    }
                }
            },
            {
                "$facet": {
                    "docs": [
                        {
                            "$project": {
                                **PRODUCT_FIELDS,
                                "score": {"$meta": "searchScore"},
                            }
                        },
                        {"$skip": skip},
                        {"$limit": page_size},
                    ],
                    "count": [{"$count": "total"}],
                }
            },
            {"$unwind": {"path": "$count", "preserveNullAndEmptyArrays": True}},
            {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        ]

        try:
            agg = self.col.aggregate(pipeline, maxTimeMS=4000)
            root_doc = (await agg.to_list(length=1))[0] if agg else {}
            docs = [
                filter_inventory_summary(d, store_object_id)
                for d in root_doc.get("docs", [])
            ]
            return docs, int(root_doc.get("total", 0))
        except Exception as exc:
            logger.error("[infra/search_repository] search_atlas_text failed: %s", exc)
            raise InfrastructureError(exc) from exc


       # ------------------------------------------------------------------ #
    # OPTION 3 – Lucene `$vectorSearch`                                  #
    # ------------------------------------------------------------------ #

    async def search_by_vector(
        self,
        embedding: List[float],
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> Tuple[List[Dict], int]:
        logger.info(
            "[infra/search_repository] search_by_vector | StoreObjectId=%s",
            store_object_id,
        )

        skip = (page - 1) * page_size

        pipeline = [
            {
                "$vectorSearch": {
                    "index": self.vector_index,
                    "path":  self.vector_field,
                    "queryVector": embedding,
                    "numCandidates": 200,  # recall
                    "limit":        200   # initial cut
                    # "similarity": "cosine"  # if cluster >= 7.2
                }
            },
            {
                "$match": {  # Filtra productos realmente disponibles en la tienda
                    "inventorySummary": {
                        "$elemMatch": {
                            "storeObjectId": ObjectId(store_object_id)
                        }
                    }
                }
            },
            {
                "$facet": {
                    "docs": [
                        {
                            "$project": {
                                **PRODUCT_FIELDS,
                                "score": {"$meta": "searchScore"},
                            }
                        },
                        {"$skip": skip},
                        {"$limit": page_size},
                    ],
                    "count": [ { "$count": "total" } ]
                }
            },
            { "$unwind":   { "path": "$count", "preserveNullAndEmptyArrays": True } },
            { "$addFields": { "total": { "$ifNull": ["$count.total", 0] } } },
        ]

        try:
            agg = self.col.aggregate(pipeline, maxTimeMS=4500)
            root_doc = (await agg.to_list(length=1))[0] if agg else {}
            docs = [
                filter_inventory_summary(d, store_object_id)
                for d in root_doc.get("docs", [])
            ]
            return docs, int(root_doc.get("total", 0))
        except Exception as exc:
            logger.error("[infra/search_repository] search_by_vector failed: %s", exc)
            raise InfrastructureError(exc) from exc

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
        logger.info(
            "[infra/search_repository] search_hybrid_rrf | Query=%r StoreObjectId=%s",
            query,
            store_object_id,
        )
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
                                            "path": [
                                                "productName",
                                                "brand",
                                                "aboutTheProduct",
                                            ],
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
            {
                "$match": {
                    "inventorySummary.storeObjectId": ObjectId(store_object_id)
                }
            },
            {
                "$project": {
                    **PRODUCT_FIELDS,
                    "score": {"$meta": "searchScore"},
                }
            },
            {
                "$facet": {
                    "docs": [
                        {"$skip": skip},
                        {"$limit": page_size},
                    ],
                    "count": [{"$count": "total"}],
                }
            },
            {"$unwind": {"path": "$count", "preserveNullAndEmptyArrays": True}},
            {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        ]

        try:
            agg = self.col.aggregate(pipeline, maxTimeMS=6000)
            root_doc = (await agg.to_list(length=1))[0] if agg else {}
            docs = [
                filter_inventory_summary(d, store_object_id)
                for d in root_doc.get("docs", [])
            ]
            return docs, int(root_doc.get("total", 0))
        except Exception as exc:
            logger.error("[infra/search_repository] search_hybrid_rrf failed: %s", exc)
            raise InfrastructureError(exc) from exc
