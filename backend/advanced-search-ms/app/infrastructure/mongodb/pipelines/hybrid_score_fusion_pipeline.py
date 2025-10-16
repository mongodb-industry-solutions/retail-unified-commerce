# app/infrastructure/mongodb/pipelines/hybrid_score_fusion_pipeline.py
"""
Hybrid Search with $scoreFusion and Post-Fusion Brand Amplification
==================================================================

Purpose
-------
Build a hybrid search pipeline that:
1) Runs a full-text `$search` and a semantic `$vectorSearch`, both scoped to the
   active store and with business-relevant text boosts.
2) Combines results with `$scoreFusion` using a **weighted score expression**:
      fused = (w_text * text_score) + (w_vector * vector_score)
   where each input pipeline’s score is **normalized first** (see below).
3) Applies Brand Amplification *after fusion* by multiplying the fused score by
   (1 + boostFactor) based on brand (and optionally category) rules.
4) Sorts by the post-boost score and returns a clean projection:
   product fields, store-filtered inventory, final `score`, and `isBoosted`,
   plus a total count via `$facet`.

Normalization (what it means here)
----------------------------------
We default to `input.normalization: "sigmoid"` **inside** `$scoreFusion`.
This rescales each pipeline’s raw scores to the range [0, 1] *before* combining:
• Makes text and vector scores **comparable** (they do not share a native scale).
• Dampens outliers (common in vector similarity), improving stability.
• Keeps the fusion monotonic: higher raw score → higher normalized score.

Why this design
---------------
• `$scoreFusion` fuses by **score magnitude** (not only rank), giving fine control
  via per-pipeline weights.
• Post-fusion Brand Amplification is auditable and orthogonal to engine scoring.
• API surface stays simple and stable: `score`, `isBoosted`.
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


def build_hybrid_score_fusion_pipeline(
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
    normalization: str = "sigmoid",  # default: make text/vector scores comparable inside $scoreFusion
) -> List[Dict[str, Any]]:
    """
    Build a hybrid pipeline using `$scoreFusion` and *post-fusion* Brand Amplification.

    Fused score (after per-pipeline normalization) is computed as:
        fused = (w_text * $$text) + (w_vector * $$vector)

    Notes
    -----
    • We **don’t** apply any final normalization after Brand Amplification:
      the returned `score` is the post-boost fused score.
    • `$scoreFusion`’s `input.normalization` runs **per input pipeline** *before*
      the combination expression, so weights operate on comparable scales.
    """
    # --- Parameters & weights ---
    try:
        store_oid = ObjectId(store_object_id)
    except Exception as exc:
        raise ValueError("store_object_id must be a valid ObjectId") from exc

    # Non-negative weights for fusion.
    w_vec = max(0.0, float(weights.get("vectorPipeline") or 1.0))
    w_txt = max(0.0, float(weights.get("textPipeline") or 1.0))

    # Validate normalization choice (fallback to "sigmoid" if invalid/empty)
    norm = (normalization or "sigmoid").strip()
    if norm not in ("none", "sigmoid", "minMaxScaler"):
        norm = "sigmoid"

    amp = _brand_amp_switch_branches(brand_amplification)
    branches = amp["branches"]
    boosted_brands = amp["boostedBrands"]
    brand_cat_pairs = amp["brandCategoryPairs"]

    base_proj = dict(projection_fields or PRODUCT_FIELDS)

    logger.info(
        "[HYBRID/scoreFusion] store=%s | skip=%d | limit=%d | w_text=%.3f | w_vec=%.3f | normalization=%s | brandAmpRules=%d (post-fusion multiply)",
        store_oid, skip, limit, w_txt, w_vec, norm, len(brand_amplification or []),
    )

    # --- Input pipelines for fusion (selection + scoring only) ---
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
        },
        # Keep a per-pipeline limit to ensure responsive fusion.
        {"$limit": 200},
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

    # --- Score Fusion (weights over normalized pipeline scores) ---
    # `$scoreFusion` first normalizes each pipeline’s score stream using `norm`,
    # then evaluates our combination expression on those normalized values.
    pipeline: List[Dict[str, Any]] = [
        {
            "$scoreFusion": {
                "input": {
                    "pipelines": {
                        "text": text_pipeline,
                        "vector": vector_pipeline,
                    },
                    "normalization": norm,  # "sigmoid" (default) | "minMaxScaler" | "none"
                },
                "combination": {
                    "method": "expression",
                    "expression": {
                        "$add": [
                            {"$multiply": ["$$text", w_txt]},
                            {"$multiply": ["$$vector", w_vec]},
                        ]
                    },
                },
            }
        },
        # Capture the fused score for amplification and sorting.
        {"$set": {"fusionScore": {"$meta": "score"}}},
    ]

    # --- Post-fusion Brand Amplification (multiplicative) ---
    if branches:
        pipeline.append({"$set": {"boostFactor": {"$switch": {"branches": branches, "default": 0}}}})
    else:
        pipeline.append({"$set": {"boostFactor": 0}})

    pipeline += [
        {
            "$set": {
                # Multiply by (1 + boostFactor) so that non-boosted docs remain unchanged
                # (boostFactor=0 => multiplier=1); boosted docs get a proportional lift.
                "boostedScore": {"$multiply": ["$fusionScore", {"$add": [1, "$boostFactor"]}]},
                "isBoosted": {"$gt": ["$boostFactor", 0]},
            }
        },
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
        {"$unset": ["fusionScore", "boostFactor"]},
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
        "[HYBRID/scoreFusion] built | stages=%d | boostedBrands=%d | brandCatPairs=%d | normalization=%s | post-fusion multiply boosting enabled",
        len(pipeline), len(boosted_brands), len(brand_cat_pairs), norm,
    )
    return pipeline
