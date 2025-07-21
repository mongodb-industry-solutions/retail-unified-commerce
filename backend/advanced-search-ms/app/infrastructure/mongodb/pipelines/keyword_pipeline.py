# app/infrastructure/mongodb/pipelines/keyword_pipeline.py
"""
Pipeline builder for *option 1* – plain **regex / prefix keyword search**.

Key traits
----------
* Cheap prefix regex on `productName` – no ranking, no fuzziness.
* Always filters by the caller’s `storeObjectId`.
* Paginates with `$facet` and returns `{ docs: [...], total: N }`.
* Uses the shared `PRODUCT_FIELDS` projection (overrideable).

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
def build_keyword_pipeline(
    query: str,
    store_object_id: str,
    skip: int,
    limit: int,
    *,
    projection_fields: Optional[Dict[str, int]] = None,
) -> List[Dict[str, Any]]:
    """
    Build an aggregation pipeline for *simple* keyword searches.

    Parameters
    ----------
    query            : Raw string typed by the user (prefix‑matched).
    store_object_id  : Store to filter inventory by (string or ObjectId hex).
    skip, limit      : Pagination window.
    projection_fields: Custom projection dict; falls back to PRODUCT_FIELDS.

    Returns
    -------
    List[Dict[str, Any]] – ready‑to‑run aggregation pipeline.
    """

    # ── Validation ─────────────────────────────────────────────────────────
    try:
        store_oid = ObjectId(store_object_id)
    except Exception as exc:  # invalid hex
        raise ValueError("store_object_id must be a valid ObjectId") from exc

    if skip < 0 or limit <= 0:
        raise ValueError("'skip' must be ≥ 0 and 'limit' must be > 0")

    logger.info(
        "[KEYWORD] 🔎 Prefix search | q='%s' | store=%s | skip=%d | limit=%d",
        query, store_oid, skip, limit
    )

    projection = projection_fields or PRODUCT_FIELDS
    logger.info("[KEYWORD] 🧾 Projection fields: %s", list(projection.keys()))

    # ── Aggregation pipeline ──────────────────────────────────────────────
    pipeline: List[Dict[str, Any]] = [
        # 1) Match store + prefix regex on productName
        {
            "$match": {
                "inventorySummary": {
                    "$elemMatch": {"storeObjectId": store_oid}
                },
                "productName": {"$regex": f"^{query}", "$options": "i"},
            }
        },
        # 2) Apply unified projection
        {"$project": projection},
        # 3) Facet: paginated docs + total count
        {
            "$facet": {
                "docs":   [
                    {"$skip": skip},
                    {"$limit": limit},
                ],
                "count":  [{"$count": "total"}],
            }
        },
        # 4) Flatten and default total=0 when no matches
        {"$unwind":   {"path": "$count", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        {"$project":  {"count": 0}},
    ]

    logger.info("[KEYWORD] ✅ Keyword pipeline built with %d stages", len(pipeline))
    return pipeline
