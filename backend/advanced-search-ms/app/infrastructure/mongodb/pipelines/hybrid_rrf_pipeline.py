# app/infrastructure/mongodb/pipelines/hybrid_rrf_pipeline.py
"""
Hybrid Search with $rankFusion and Post-Fusion Brand Amplification
==================================================================

Purpose
-------
Build a hybrid search pipeline that:
1) Runs a full-text `$search` pipeline and a semantic `$vectorSearch` pipeline,
   both scoped to the active store and using business-relevant field boosts.
2) Fuses both ranked lists using `$rankFusion` (Reciprocal Rank Fusion),
   yielding a single ranking and an RRF score per document.
3) Applies Brand Amplification *after fusion* by multiplying the RRF score
   with a factor derived from brand (and optionally category) rules.
4) Sorts by the post-boost score and returns a clean projection:
   product fields, store-filtered inventory, final `score`, and `isBoosted`,
   plus a total count via `$facet`.

Why this design
---------------
• `$rankFusion` provides principled, engine-agnostic fusion for text and vector.
• Post-fusion amplification keeps business controls auditable and orthogonal to
  engine scoring.
• The API surface remains simple and stable (`score`, `isBoosted`).
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence

from bson import ObjectId
from app.infrastructure.mongodb.utils import PRODUCT_FIELDS

logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())

# Multiplicative factors per amplification level (applied post-fusion).
BOOST_MAP: Dict[int, float] = {1: 0.05, 2: 0.10, 3: 0.15}


def _brand_amp_switch_branches(
    specs: Optional[Sequence[Dict[str, Any]]]
) -> Dict[str, Any]:
    """
    Build `$switch.branches` for brand/category amplification and return
    helper lists for observability.

    Each spec:
      {
        "name": "Brand X",
        "boostLevel": 2,             # -> 0.10
        "categories": ["Skincare"]   # optional; empty => brand-wide
      }
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

        # Brand-wide rule
        if not categories:
            branches.append({"case": {"$eq": ["$brand", brand]}, "then": factor})
        else:
            # Brand + category-specific rules
            for cat in categories:
                brand_cat_pairs.append(f"{brand}::{cat}")
                branches.append({
                    "case": {"$and": [
                        {"$eq": ["$brand", brand]},
                        {"$eq": ["$category", cat]},
                    ]},
                    "then": factor,
                })

    return {
        "branches": branches,
        "boostedBrands": boosted_brands,
        "brandCategoryPairs": brand_cat_pairs,
    }


def build_hybrid_rrf_pipeline(
    *,
    query: str,
    embedding: List[float],
    store_object_id: str,
    text_index: str,
    vector_index: str,
    vector_field: str,
    weights: Dict[str, Optional[float]],  # {"vectorPipeline": float, "textPipeline": float}
    brand_amplification: Optional[Sequence[Dict[str, Any]]] = None,
    skip: int,
    limit: int,
    projection_fields: Optional[Dict[str, int]] = None,
) -> List[Dict[str, Any]]:
    """
    Build a hybrid pipeline using `$rankFusion` (RRF) and *post-fusion*
    Brand Amplification by multiplicative factor.
    """
    # --- Parameters & weights ---
    try:
        store_oid = ObjectId(store_object_id)
    except Exception as exc:
        raise ValueError("store_object_id must be a valid ObjectId") from exc

    # Non-negative fusion weights used directly by `$rankFusion`.
    w_vec = max(0.0, float(weights.get("vectorPipeline") or 1.0))
    w_txt = max(0.0, float(weights.get("textPipeline") or 1.0))

    amp = _brand_amp_switch_branches(brand_amplification)
    branches = amp["branches"]
    boosted_brands = amp["boostedBrands"]
    brand_cat_pairs = amp["brandCategoryPairs"]

    base_proj = dict(projection_fields or PRODUCT_FIELDS)

    logger.info(
        "[HYBRID/RRF] store=%s | skip=%d | limit=%d | w_text=%.3f | w_vec=%.3f | brandAmpRules=%d (post-fusion multiply)",
        store_oid, skip, limit, w_txt, w_vec, len(brand_amplification or []),
    )

    # --- Input pipelines for fusion (selection + ranked) ---
    # Text: field-level boosts reflect business relevance; scoped to store.
    text_pipeline: List[Dict[str, Any]] = [
        {
            "$search": {
                "index": text_index,
                "compound": {
                    "filter": [
                        {"equals": {"path": "inventorySummary.storeObjectId", "value": store_oid}}
                    ],
                    "must": [
                        {
                            "compound": {
                                "should": [
                                    {"text": {"query": query, "path": "productName",
                                              "fuzzy": {"maxEdits": 2},
                                              "score": {"boost": {"value": 3.0}}}},
                                    {"text": {"query": query, "path": "aboutTheProduct",
                                              "score": {"boost": {"value": 1.8}}}},
                                    {"text": {"query": query, "path": "brand",
                                              "score": {"boost": {"value": 1.2}}}},
                                    {"text": {"query": query, "path": "category",
                                              "score": {"boost": {"value": 1.1}}}},
                                    {"text": {"query": query, "path": "subCategory",
                                              "score": {"boost": {"value": 1.0}}}},
                                ],
                                "minimumShouldMatch": 1
                            }
                        }
                    ],
                },
            }
        }
    ]

    # Vector: semantic retrieval; scoped to store.
    vector_pipeline: List[Dict[str, Any]] = [
        {
            "$vectorSearch": {
                "index": vector_index,
                "path": vector_field,
                "queryVector": embedding,
                "numCandidates": 500,
                "limit": 200,
                "filter": {"inventorySummary.storeObjectId": store_oid},
            }
        }
    ]

    # --- Rank Fusion (RRF) ---
    # Fuse both ranked lists; RRF exposes a meta `score` per document.
    pipeline: List[Dict[str, Any]] = [
        {
            "$rankFusion": {
                "input": {"pipelines": {"text": text_pipeline, "vector": vector_pipeline}},
                "combination": {"weights": {"text": w_txt, "vector": w_vec}},
                # No per-document scoreDetails here to keep the pipeline clean and fast.
            }
        },
        # Capture the fused score into a regular field for amplification and sorting.
        {"$set": {"rrfScore": {"$meta": "score"}}},
    ]

    # --- Post-fusion Brand Amplification (multiplicative) ---
    # Compute a per-document boost factor from brand/category rules.
    if branches:
        pipeline.append({"$set": {"boostFactor": {"$switch": {"branches": branches, "default": 0}}}})
    else:
        pipeline.append({"$set": {"boostFactor": 0}})

    pipeline += [
        {
            "$set": {
                # Multiply by (1 + boostFactor) so that non-boosted docs remain unchanged
                # (boostFactor=0 => multiplier=1); boosted docs get a proportional lift.
                "boostedScore": {"$multiply": ["$rrfScore", {"$add": [1, "$boostFactor"]}]},
                "isBoosted": {"$gt": ["$boostFactor", 0]},
            }
        },
        # Rank by the post-amplification score.
        {"$sort": {"boostedScore": -1, "_id": 1}},
    ]

    # --- Projection (stable API shape) ---
    docs_projection: Dict[str, Any] = {
        "id": {"$toString": "$_id"},
        **base_proj,
        "inventorySummary": {
            "$filter": {
                "input": "$inventorySummary",
                "as": "inv",
                "cond": {"$eq": ["$$inv.storeObjectId", store_oid]},
            }
        },
        "score": {"$round": ["$boostedScore", 6]},
        "isBoosted": 1,
    }

    pipeline += [
        # Do not expose helper fields in API responses.
        {"$unset": ["rrfScore", "boostFactor"]},
        # Pagination + total count
        {"$facet": {
            "docs": [
                {"$project": docs_projection},
                {"$skip": skip},
                {"$limit": limit},
            ],
            "count": [{"$count": "total"}],
        }},
        {"$unwind": {"path": "$count", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        {"$project": {"count": 0}},
    ]

    logger.info(
        "[HYBRID/RRF] built | stages=%d | boostedBrands=%d | brandCatPairs=%d | post-fusion multiply boosting enabled",
        len(pipeline), len(boosted_brands), len(brand_cat_pairs),
    )
    return pipeline
