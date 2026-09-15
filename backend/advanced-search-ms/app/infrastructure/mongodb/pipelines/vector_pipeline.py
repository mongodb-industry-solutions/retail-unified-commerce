# app/infrastructure/mongodb/pipelines/vector_pipeline.py
"""
Pipeline builder for *option 3* — Atlas Lucene k-NN vector search with Brand Amplification.

Flow
----
1) `$vectorSearch` pre-filtered by store (and stock, if provided).
2) Max-normalize the raw similarity into a single `score` in [0..1].
3) Apply Brand Amplification as a **rank-space reorder** (see
   `utils.amplification_stages`): a boosted document at pre-boost rank r moves to
   `ceil(r / F)` with F = 4 / 10 / 25 for low / medium / high. The score itself is
   never multiplied by the boost — amplification changes order, not numbers.
4) Paginate with `$facet`.

`total_results` semantics
-------------------------
The `$facet` count branch counts what reaches it, which for a kNN pipeline is the
retrieval depth rather than a match count: Atlas Vector Search has no discrete
match-count concept comparable to a b-tree COUNT, because every filtered document
has *some* similarity to the query vector. `total_results` therefore reports
`VECTOR_RETRIEVAL_DEPTH` (or fewer, when the store holds fewer documents), which is
exactly the number of results a client can page through. Modes 1 and 2 report a
true match count; modes 3, 4 and 5 report retrieval depth. See rec L2.4.

Response shape
--------------
Only a single `score` is projected (normalized). Internal fields used for
computation (`originalScore`, and the helpers' internal rank fields)
are not exposed.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence, Union

from bson import ObjectId
from app.infrastructure.mongodb.utils import (
    PRODUCT_FIELDS,
    amplification_stages,
    max_normalize_stages,
)

logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())


# Retrieval depth for `$vectorSearch`, fixed and independent of `page_size`.
# Matches FUSION_ARM_LIMIT in the two hybrid builders so all three semantic modes
# retrieve the same depth. Deliberately NOT derived from `page_size`: mode 3 reports
# this value as `total_results` (kNN has no match count), so deriving it from page
# size would make the user-visible result count move when the page-size control
# changes — the frontend renders it as "1 - N of <total> items". See rec L2.4.
VECTOR_RETRIEVAL_DEPTH = 200

def build_vector_pipeline(
    embedding: List[float],
    store_object_id: Union[str, ObjectId],
    *,
    vector_index: str,
    vector_field: str,
    skip: int = 0,
    limit: int = 20,
    in_stock: Optional[bool] = None,
    num_candidates: int = 500,
    knn_limit: Optional[int] = None,
    projection_fields: Optional[Dict[str, int]] = None,
    brand_amplification: Optional[Sequence[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    Build the Atlas Lucene vector-search pipeline with optional Brand Amplification.

    Parameters
    ----------
    embedding : list[float]
    store_object_id : str | ObjectId
    vector_index : str
    vector_field : str
    skip, limit : int
    in_stock : bool | None
    num_candidates : int
        Size of the ANN candidate pool explored by HNSW. Must comfortably exceed
        `knn_limit`, otherwise the graph search returns no more than it retrieves and
        recall degrades (the previous 200/200 default was exactly that degenerate case).
    knn_limit : int | None
        How many neighbours `$vectorSearch` returns. Defaults to
        `VECTOR_RETRIEVAL_DEPTH` (200), fixed and independent of `page_size`, because
        this value is what mode 3 reports as `total_results`.
    projection_fields : dict | None
    brand_amplification : list[dict] | None  # [{ name, boostLevel(1..3), categories?: string[] }]
    """
    # Validate store id & pagination
    try:
        store_oid = store_object_id if isinstance(store_object_id, ObjectId) else ObjectId(store_object_id)
    except Exception as exc:
        raise ValueError("store_object_id must be a valid ObjectId") from exc
    if skip < 0 or limit <= 0:
        raise ValueError("'skip' must be ≥ 0 and 'limit' must be > 0")

    # Fixed retrieval depth (see VECTOR_RETRIEVAL_DEPTH); over-fetch the ANN candidate
    # pool so HNSW explores meaningfully more than it returns.
    if knn_limit is None:
        knn_limit = VECTOR_RETRIEVAL_DEPTH
    num_candidates = max(num_candidates, knn_limit)

    logger.info(
        "[VECTOR] store=%s | skip=%d | limit=%d | numCandidates=%d | knnLimit=%d | in_stock=%s | brandAmp=%d",
        store_oid, skip, limit, num_candidates, knn_limit, in_stock,
        len(brand_amplification or []),
    )

    # Pre-filter in $vectorSearch for perf
    vs_filter: Dict[str, Any] = {"inventorySummary.storeObjectId": store_oid}
    if in_stock is not None:
        vs_filter["inventorySummary.inStock"] = in_stock

    # Base projection (always include final score)
    projection = dict(projection_fields or PRODUCT_FIELDS)
    projection.update({"score": 1})

    # ---- Stages ---------------------------------------------------------
    stages: List[Dict[str, Any]] = [
        {
            "$vectorSearch": {
                "index": vector_index,
                "path": vector_field,
                "queryVector": embedding,
                "numCandidates": num_candidates,
                "limit": knn_limit,
                "filter": vs_filter,
            }
        },
        # Log raw score (not projected)
        {"$set": {"originalScore": {"$meta": "vectorSearchScore"}}},
    ]

    stages.extend([
        # Score contract: the engine's own value, max-normalized. Never multiplied by
        # amplification — see utils.amplification_stages.
        *max_normalize_stages("originalScore"),
        # Brand Amplification as a rank-space reorder.
        *amplification_stages(brand_amplification),
        {"$unset": "originalScore"},
    ])

    # Final projection + pagination
    docs_projection: Dict[str, Any] = {
        "id": {"$toString": "$_id"},
        **projection,
        "inventorySummary": {
            "$filter": {
                "input": "$inventorySummary",
                "as": "inv",
                "cond": {"$eq": ["$$inv.storeObjectId", store_oid]},
            }
        },
        "score": {"$round": ["$score", 6]},
        "isBoosted": 1,
    }

    finalize: List[Dict[str, Any]] = [
        {
            "$facet": {
                "docs": [
                    {"$project": docs_projection},
                    {"$skip": skip},
                    {"$limit": limit},
                ],
                "count": [{"$count": "total"}],
            }
        },
        {"$unwind": {"path": "$count", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        {"$project": {"count": 0}},
    ]

    pipeline = stages + finalize

    logger.info(
        "[VECTOR] built | stages=%d | brandAmpRules=%d (rank-space reorder)",
        len(pipeline), len(brand_amplification or []),
    )
    return pipeline
