# app/infrastructure/mongodb/pipelines/hybrid_rrf_pipeline.py

"""
Pipeline builder for option 4 – Hybrid Reciprocal Rank Fusion (RRF).
"""

from typing import List, Dict
from bson import ObjectId
from app.infrastructure.mongodb.utils import PRODUCT_FIELDS

def build_hybrid_rrf_pipeline(
    query: str,
    embedding: List[float],
    store_object_id: str,
    text_index: str,
    vector_index: str,
    vector_field: str,
    weights: Dict[str, float],
    skip: int,
    limit: int,
) -> List[Dict]:
    return [
        {
            "$rankFusion": {
                "input": {
                    "pipelines": {
                        "vectorPipeline": [
                            {
                                "$vectorSearch": {
                                    "index": vector_index,
                                    "path":  vector_field,
                                    "queryVector": embedding,
                                    "numCandidates": 200,
                                    "limit": 200,
                                }
                            }
                        ],
                        "textPipeline": [
                            {
                                "$search": {
                                    "index": text_index,
                                    "compound": {
                                        "should": [
                                            {
                                                "text": {
                                                    "query": query,
                                                    "path": "productName",
                                                    "score": {"boost": {"value": 0.8}},
                                                    "fuzzy": {"maxEdits": 2},
                                                }
                                            },
                                            {
                                                "text": {
                                                    "query": query,
                                                    "path": ["brand", "category", "subCategory"],
                                                    "score": {"boost": {"value": 0.2}},
                                                    "fuzzy": {"maxEdits": 2},
                                                }
                                            },
                                        ]
                                    },
                                }
                            },
                            {"$limit": 200},
                        ],
                    }
                },
                "combination": {"weights": weights},
                "scoreDetails": True,
            }
        },
        {
            "$match": {
                "inventorySummary.storeObjectId": ObjectId(store_object_id)
            }
        },
        {
            "$project": {**PRODUCT_FIELDS, "score": {"$meta": "searchScore"}}
        },
        {
            "$facet": {
                "docs":  [{"$skip": skip}, {"$limit": limit}],
                "count": [{"$count": "total"}],
            }
        },
        {"$unwind":   {"path": "$count", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
    ]
