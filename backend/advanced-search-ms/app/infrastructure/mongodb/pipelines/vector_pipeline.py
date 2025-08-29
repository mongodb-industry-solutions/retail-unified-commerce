# app/infrastructure/mongodb/pipelines/vector_pipeline.py
"""
MongoDB aggregation‑pipeline builder for *option 3* – Lucene k‑NN **vector search**.
==============================================================================

This pipeline:
• Performs a k‑NN vector search using the Lucene engine ($vectorSearch).
• Projects only the needed fields via PRODUCT_FIELDS (+ score).
• Filters products by target store and optionally by stock status.
• Paginates results and returns total count using $facet.

"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Union

from bson import ObjectId

from app.infrastructure.mongodb.utils import PRODUCT_FIELDS

logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())


def build_vector_pipeline(
    embedding: List[float],
    store_object_id: Union[str, ObjectId],
    *,
    vector_index: str,
    vector_field: str,
    skip: int = 0,
    limit: int = 20,
    in_stock: Optional[bool] = None,
    num_candidates: int = 200,
    knn_limit: int = 200,
    projection_fields: Optional[Dict[str, int]] = None,
) -> List[Dict[str, Any]]:
    """
    Build aggregation pipeline for Lucene vector search with optional in‑stock filter.

    Parameters
    ----------
    embedding         : Vector embedding to search with.
    store_object_id   : Target store's ObjectId or string.
    vector_index      : Lucene index name.
    vector_field      : Field name containing the embedding.
    skip              : Pagination offset.
    limit             : Pagination limit.
    in_stock          : Optional filter to only return in‑stock products.
    num_candidates    : Number of candidates to retrieve before limiting.
    knn_limit         : Maximum number of k‑NN results.
    projection_fields : Optional projection dict; defaults to PRODUCT_FIELDS.
    """

    # ── Validation ─────────────────────────────────────────────────────────
    if not isinstance(store_object_id, ObjectId):
        store_object_id = ObjectId(store_object_id)

    if skip < 0 or limit <= 0:
        raise ValueError("'skip' must be ≥ 0 and 'limit' must be > 0")

    logger.info(
        "[infra/mongodb/pipelines/VECTOR] 🔎 Vector search | store=%s | skip=%d | limit=%d | in_stock=%s",
        store_object_id, skip, limit, in_stock
    )

    # ── Dynamic filter (store + optional stock) ────────────────────────────
    filter_conditions: Dict[str, Any] = {
        "inventorySummary.storeObjectId": store_object_id
    }
    if in_stock is not None:
        filter_conditions["inventorySummary.inStock"] = in_stock

    logger.info("[infra/mongodb/pipelines/VECTOR] 🧩 Filter conditions: %s", filter_conditions)

    # ── Projection dict (single source of truth) ───────────────────────────
    projection = {**(projection_fields or PRODUCT_FIELDS), "score": 1}
    logger.info("[infra/mongodb/pipelines/VECTOR] 🧾 Final projection fields: %s", list(projection.keys()))

    # ── Aggregation pipeline stages ───────────────────────────────────────
    pipeline: List[Dict[str, Any]] = [
        # 1) Lucene k‑NN search with optional filter
        {
            "$vectorSearch": {
                "index": vector_index,
                "path": vector_field,
                "queryVector": embedding,
                "numCandidates": num_candidates,
                "limit": knn_limit,
                "filter": filter_conditions, # Dynamic filter used inside $vectorSearch to restrict results to a specific store, and optionally limit to in‑stock products if specified.

            }
        },
        # 2) Promote similarity score (correct meta for $vectorSearch)
        {"$set": {"score": {"$meta": "vectorSearchScore"}}},
        # 3) Facet: paginated docs + total count
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
        # 4) Flatten: add total field and drop internal count
        {"$unwind": {"path": "$count", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        {"$project": {"count": 0}},
    ]

    logger.info("[infra/mongodb/pipelines/VECTOR] ✅ Vector pipeline built with %d stages", len(pipeline))

    return pipeline
