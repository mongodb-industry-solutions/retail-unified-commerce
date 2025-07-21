# app/infrastructure/mongodb/pipelines/text_pipeline.py
"""
Pipeline builder for *option 2* – Atlas Search **text index**.

Key traits
----------
* Uses `$search` with a compound query (productName, brand, category…).
* Normalises scores – Atlas guarantees max relevance ≤ 1.0.
* Copies `$meta: "searchScore"` into a real `score` field **before** `$facet`
  (meta‑fields vanish inside sub‑pipelines).
* Paginates and returns `{ docs: [...], total: N }`.

Author / Maintainer – Data & Search team, July 2025
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from bson import ObjectId

from app.infrastructure.mongodb.utils import PRODUCT_FIELDS

logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())


# --------------------------------------------------------------------------- #
# Public builder                                                              #
# --------------------------------------------------------------------------- #
def build_text_pipeline(
    query: str,
    store_object_id: str,
    text_index: str,
    skip: int,
    limit: int,
    *,
    projection_fields: Optional[Dict[str, int]] = None,
) -> List[Dict[str, Any]]:
    """
    Build an Atlas‑Search text pipeline with store filtering and pagination.

    Parameters
    ----------
    query            : Raw search string.
    store_object_id  : Store filter (hex string or ObjectId).
    text_index       : Atlas Search index name.
    skip, limit      : Pagination window.
    projection_fields: Custom projection dict; defaults to PRODUCT_FIELDS.
    """

    # ── Validation ─────────────────────────────────────────────────────────
    try:
        store_oid = ObjectId(store_object_id)
    except Exception as exc:
        raise ValueError("store_object_id must be a valid ObjectId") from exc

    if skip < 0 or limit <= 0:
        raise ValueError("'skip' must be ≥ 0 and 'limit' must be > 0")

    logger.info(
        "[TEXT] 🔎 Atlas Search | q='%s' | store=%s | skip=%d | limit=%d",
        query, store_oid, skip, limit
    )

    projection = {**(projection_fields or PRODUCT_FIELDS), "score": 1}
    logger.info("[TEXT] 🧾 Projection fields: %s", list(projection.keys()))

    # ── Aggregation pipeline ──────────────────────────────────────────────
    pipeline: List[Dict[str, Any]] = [
        # 1) Atlas Search compound query (prefix fuzzy boosts)
        {
            "$search": {
                "index": text_index,
                "compound": {
                    "should": [
                        {   # productName – strongest signal
                            "text": {
                                "query": query,
                                "path":  "productName",
                                "score": {"boost": {"value": 0.8}},
                                "fuzzy": {"maxEdits": 2},
                            }
                        },
                        {   # brand – moderate
                            "text": {
                                "query": query,
                                "path":  "brand",
                                "score": {"boost": {"value": 0.1}},
                                "fuzzy": {"maxEdits": 1},
                            }
                        },
                        {   # category – low weight
                            "text": {
                                "query": query,
                                "path":  "category",
                                "score": {"boost": {"value": 0.06}},
                                "fuzzy": {"maxEdits": 1},
                            }
                        },
                        {   # subCategory – very low
                            "text": {
                                "query": query,
                                "path":  "subCategory",
                                "score": {"boost": {"value": 0.04}},
                                "fuzzy": {"maxEdits": 1},
                            }
                        },
                    ]
                },
            }
        },

        # 2) Promote Atlas relevance into a normal field
        {"$set": {"score": {"$meta": "searchScore"}}},

        # 3) Filter by store (inventorySummary array)
        {
            "$match": {
                "inventorySummary": {
                    "$elemMatch": {"storeObjectId": store_oid}
                }
            }
        },

        # 4) Facet: paginate & count
        {
            "$facet": {
                "docs": [
                    {"$project": projection},
                    {"$skip": skip},
                    {"$limit": limit},
                ],
                "count": [{"$count": "total"}],
            }
        },

        # 5) Flatten and default total=0
        {"$unwind":   {"path": "$count", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        {"$project":  {"count": 0}},
    ]

    logger.info("[TEXT] ✅ Text pipeline built with %d stages", len(pipeline))
    return pipeline
