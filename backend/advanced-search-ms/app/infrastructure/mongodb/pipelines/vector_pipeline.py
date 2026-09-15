# app/infrastructure/mongodb/pipelines/vector_pipeline.py
"""
Pipeline builder for *option 3* — Atlas Lucene k-NN vector search with Brand Amplification.

Flow
----
1) `$vectorSearch` pre-filtered by store (and stock, if provided).
2) Log raw similarity (`originalScore`) and compute amplification:
     boostLevel → factor: 1 → +0.05, 2 → +0.10, 3 → +0.15
     adjustedScore = originalScore × (1 + boostFactor)
     isBoosted = boostFactor > 0
3) Normalize a single final `score` in [0..1].
4) Sort by `score` and paginate with `$facet`.

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
computation (`originalScore`, `adjustedScore`, `boostFactor`, `maxScore`)
are not exposed.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence, Union

from bson import ObjectId
from app.infrastructure.mongodb.utils import PRODUCT_FIELDS, max_normalize_stages

logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())


def _norm_field(field: str) -> Dict[str, Any]:
    """
    Whitespace/case-insensitive form of a document field, used only for
    Brand Amplification rule matching.

    Catalogue `brand` values are not normalized (38 brands carry stray leading or
    trailing whitespace), so an exact `$eq` against a trimmed rule name silently
    matched nothing. Compare both sides in the same normalized form instead.
    """
    return {"$toLower": {"$trim": {"input": {"$ifNull": [field, ""]}}}}

# Retrieval depth for `$vectorSearch`, fixed and independent of `page_size`.
# Matches FUSION_ARM_LIMIT in the two hybrid builders so all three semantic modes
# retrieve the same depth. Deliberately NOT derived from `page_size`: mode 3 reports
# this value as `total_results` (kNN has no match count), so deriving it from page
# size would make the user-visible result count move when the page-size control
# changes — the frontend renders it as "1 - N of <total> items". See rec L2.4.
VECTOR_RETRIEVAL_DEPTH = 200

# Abstract boost levels → additive factors (applied multiplicatively)
# adjustedScore = originalScore * (1 + factor)
BOOST_MAP: Dict[int, float] = {
    1: 0.05,  # low
    2: 0.10,  # medium
    3: 0.15,  # high
}


def _brand_amp_switch_branches(
    specs: Optional[Sequence[Dict[str, Any]]],
) -> Dict[str, Any]:
    """
    Build `$switch.branches` for computing `boostFactor`,
    plus helper arrays for logging/flags.
    """
    if not specs:
        return {"branches": [], "boostedBrands": [], "brandCategoryPairs": []}

    branches: List[Dict[str, Any]] = []
    boosted_brands: List[str] = []
    brand_cat_pairs: List[str] = []

    for spec in specs:
        brand = (spec.get("name") or "").strip()
        level = int(spec.get("boostLevel", 0))
        factor = float(BOOST_MAP.get(level, 0.0))
        categories = [
            c.strip()
            for c in (spec.get("categories") or [])
            if isinstance(c, str) and c.strip()
        ]

        if not brand or factor <= 0.0:
            continue

        if brand not in boosted_brands:
            boosted_brands.append(brand)

        if not categories:
            # Brand-only rule
            branches.append({"case": {"$eq": [_norm_field("$brand"), brand.lower()]}, "then": factor})
        else:
            # Brand + category rules (one per category)
            for cat in categories:
                brand_cat_pairs.append(f"{brand}::{cat}")
                branches.append({
                    "case": {
                        "$and": [
                            {"$eq": [_norm_field("$brand"), brand.lower()]},
                            {"$eq": [_norm_field("$category"), cat.lower()]},
                        ]
                    },
                    "then": factor,
                })

    return {
        "branches": branches,
        "boostedBrands": boosted_brands,
        "brandCategoryPairs": brand_cat_pairs,
    }


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

    # Prepare brand-amp branches and log counters
    amp = _brand_amp_switch_branches(brand_amplification)
    branches = amp["branches"]
    boosted_brands = amp["boostedBrands"]
    brand_cat_pairs = amp["brandCategoryPairs"]

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

    # Compute boostFactor via $switch
    if branches:
        stages.append({"$set": {"boostFactor": {"$switch": {"branches": branches, "default": 0}}}})
    else:
        stages.append({"$set": {"boostFactor": 0}})

    # Adjust, normalize, cleanup, sort
    stages.extend([
        {"$set": {
            "adjustedScore": {"$multiply": ["$originalScore", {"$add": [1, "$boostFactor"]}]},
            "isBoosted": {"$gt": ["$boostFactor", 0]},
        }},
        # Shared score contract (see utils.max_normalize_stages). Normalizes the
        # post-amplification score, exactly as before, so ordering is unchanged.
        *max_normalize_stages("adjustedScore"),
        # Remove internals so they don't leak to the response
        {"$unset": ["boostFactor", "originalScore", "adjustedScore"]},
        {"$sort": {"score": -1, "_id": 1}},
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
        "[VECTOR] built | stages=%d | boostedBrands=%d | brandCatPairs=%d",
        len(pipeline), len(boosted_brands), len(brand_cat_pairs),
    )
    return pipeline
