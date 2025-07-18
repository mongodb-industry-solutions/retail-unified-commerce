# app/infrastructure/mongodb/pipelines/text_pipeline.py

"""
Pipeline builder for option 2 – Atlas Search text index.
Scores are calibrated so the **maximum** possible relevance is 1.0.
"""

from typing import List, Dict
from bson import ObjectId
from app.infrastructure.mongodb.utils import PRODUCT_FIELDS

def build_text_pipeline(
    query: str,
    store_object_id: str,
    text_index: str,
    skip: int,
    limit: int,
) -> List[Dict]:
    return [
        {
            "$search": {
                "index": text_index,
                "compound": {
                    "should": [
                        {   # productName – primary intent
                            "text": {
                                "query": query,
                                "path": "productName",
                                "score": {"boost": {"value": 0.8}},
                                "fuzzy": {"maxEdits": 2},
                            }
                        },
                        {   # brand – secondary
                            "text": {
                                "query": query,
                                "path": "brand",
                                "score": {"boost": {"value": 0.1}},
                                "fuzzy": {"maxEdits": 1},
                            }
                        },
                        {   # category / subCategory – light influence
                            "text": {
                                "query": query,
                                "path": "category",
                                "score": {"boost": {"value": 0.06}},
                                "fuzzy": {"maxEdits": 1},
                            }
                        },
                        {
                            "text": {
                                "query": query,
                                "path": "subCategory",
                                "score": {"boost": {"value": 0.04}},
                                "fuzzy": {"maxEdits": 1},
                            }
                        },
                    ]
                },
            }
        },
        {
            "$match": {
                "inventorySummary": {
                    "$elemMatch": {"storeObjectId": ObjectId(store_object_id)}
                }
            }
        },
        {
            "$facet": {
                "docs": [
                    {"$project": {**PRODUCT_FIELDS, "score": {"$meta": "searchScore"}}},
                    {"$skip": skip},
                    {"$limit": limit},
                ],
                "count": [{"$count": "total"}],
            }
        },
        {"$unwind":   {"path": "$count", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
    ]
