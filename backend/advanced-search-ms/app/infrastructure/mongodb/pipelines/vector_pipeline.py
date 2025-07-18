# app/infrastructure/mongodb/pipelines/vector_pipeline.py

"""
MongoDB aggregation‑pipeline builder for *option 3* – Lucene k‑NN **vector search**.
==============================================================================

✱ What changed & why?
---------------------
* **NEW `$set` stage just after `$vectorSearch`**  
  We copy the similarity score returned by Atlas Search into a regular
  field (`score`) before running `$facet`.  `$meta: "searchScore"` *cannot* be
  referenced inside the sub‑pipelines of a `$facet`, so the old version
  silently dropped it.
* The `$facet → docs` bucket now simply keeps that `score` field
  instead of trying to re‑inject the meta‑operator.

The rest of the pipeline (filter, pagination, optional `in_stock`, etc.)
is unchanged.

Author  / Maintainer
--------------------
Data & Search team – July 2025
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Union

from bson import ObjectId

from app.infrastructure.mongodb.utils import PRODUCT_FIELDS

logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())  # library‑style logging (no handler by default)


# ---------------------------------------------------------------------------
# Public helper
# ---------------------------------------------------------------------------


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
) -> List[Dict[str, Any]]:
    """Create an aggregation pipeline for vector search with pagination.

    Parameters
    ----------
    (See previous version – signature unchanged)
    """

    # ---------------------------------------------------------------------
    # Normalise and validate input
    # ---------------------------------------------------------------------
    if not isinstance(store_object_id, ObjectId):
        store_object_id = ObjectId(store_object_id)
    if skip < 0 or limit <= 0:
        raise ValueError("'skip' must be ≥ 0 and 'limit' must be > 0")

    logger.debug(
        "Building vector pipeline | store=%s skip=%d limit=%d in_stock=%s",
        store_object_id,
        skip,
        limit,
        in_stock,
    )

    # ------------------------------------------------------------------
    # Dynamic filter (store + optional stock level)
    # ------------------------------------------------------------------
    filter_conditions: Dict[str, Any] = {
        "inventorySummary.storeObjectId": store_object_id,
    }
    if in_stock is not None:
        filter_conditions["inventorySummary.inStock"] = in_stock

    # ------------------------------------------------------------------
    # Aggregation pipeline
    # ------------------------------------------------------------------
    pipeline: List[Dict[str, Any]] = [
        # 1) Lucene k‑NN search with in‑pipeline filter
        {
            "$vectorSearch": {
                "index": vector_index,
                "path": vector_field,
                "queryVector": embedding,
                "numCandidates": num_candidates,
                "limit": knn_limit,
                "filter": filter_conditions,
            }
        },
        # 2) Promote the meta‑score to a *real* field so it survives `$facet`
        {"$set": {"score": {"$meta": "searchScore"}}},
        # 3) Facet: paginated docs + total count
        {
            "$facet": {
                "docs": [
                    {
                        "$project": {
                            **PRODUCT_FIELDS,
                            "score": 1,  # already materialised
                        }
                    },
                    {"$skip": skip},
                    {"$limit": limit},
                ],
                "count": [{"$count": "total"}],
            }
        },
        # 4) Flatten the result: { docs: [...], total: <int> }
        {"$unwind": {"path": "$count", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        {"$project": {"count": 0}},
    ]

    logger.debug("Vector pipeline built successfully – %d stage(s)", len(pipeline))
    return pipeline
