# app/infrastructure/mongodb/pipelines/keyword_pipeline.py
"""
Pipeline builder for option 1 – plain regex keyword search.
"""

from typing import List, Dict
from bson import ObjectId
from app.infrastructure.mongodb.utils import PRODUCT_FIELDS

def build_keyword_pipeline(
    query: str,
    store_object_id: str,
    skip: int,
    limit: int,
) -> List[Dict]:
    # NOTE: very cheap prefix regex – no ranking, no fuzziness
    return [
        {
            "$match": {
                "inventorySummary": {
                    "$elemMatch": {"storeObjectId": ObjectId(store_object_id)}
                },
                "productName": {"$regex": f"^{query}", "$options": "i"},
            }
        },
        {"$project": PRODUCT_FIELDS},
        {
            "$facet": {
                "docs":   [{"$skip": skip}, {"$limit": limit}],
                "count":  [{"$count": "total"}],
            }
        },
        {"$unwind":   {"path": "$count", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
    ]
