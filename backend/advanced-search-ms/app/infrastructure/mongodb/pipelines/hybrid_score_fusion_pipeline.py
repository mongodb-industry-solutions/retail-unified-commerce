# app/infrastructure/mongodb/pipelines/hybrid_score_fusion_pipeline.py
"""
Pipeline builder for *option 4* — Hybrid search (Score Fusion).

Approach
--------
• Run two branches and normalize independently:
   - Text branch: Atlas $search → textScore → textNorm ∈ [0..1]
   - Vector branch: $vectorSearch → vectorScore → vectorNorm ∈ [0..1]
• Merge by _id, compute weighted sum:
     preBoost = w_text * textNorm + w_vector * vectorNorm
• Brand Amplification:
     boostLevel → factor: {1: +0.05, 2: +0.10, 3: +0.15}
     adjusted = preBoost × (1 + boostFactor)
• Final normalization to a single `score` ∈ [0..1]
• Project only: PRODUCT_FIELDS + score + isBoosted (no internal fields leaked)
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence

from bson import ObjectId
from app.infrastructure.mongodb.utils import PRODUCT_FIELDS

logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())

BOOST_MAP: Dict[int, float] = {1: 0.05, 2: 0.10, 3: 0.15}


def _brand_amp_switch_branches(specs: Optional[Sequence[Dict[str, Any]]]) -> Dict[str, Any]:
    """Build `$switch.branches` for computing brand boostFactor."""
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
            branches.append({"case": {"$eq": ["$brand", brand]}, "then": factor})
        else:
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
    weights: Dict[str, Optional[float]],
    brand_amplification: Optional[Sequence[Dict[str, Any]]] = None,
    skip: int,
    limit: int,
    projection_fields: Optional[Dict[str, int]] = None,
) -> List[Dict[str, Any]]:
    """
    Build a hybrid pipeline that performs score fusion.

    weights: {"vectorPipeline": float | None, "textPipeline": float | None}
    """
    try:
        store_oid = ObjectId(store_object_id)
    except Exception as exc:
        raise ValueError("store_object_id must be a valid ObjectId") from exc

    w_vec = float(weights.get("vectorPipeline") or 0.5)
    w_txt = float(weights.get("textPipeline") or 0.5)
    w_vec = max(0.0, min(1.0, w_vec))
    w_txt = max(0.0, min(1.0, w_txt))

    amp = _brand_amp_switch_branches(brand_amplification)
    branches = amp["branches"]
    boosted_brands = amp["boostedBrands"]
    brand_cat_pairs = amp["brandCategoryPairs"]

    logger.info(
        "[HYBRID/scoreFusion] store=%s | skip=%d | limit=%d | w_text=%.2f | w_vec=%.2f | brandAmp=%d",
        store_oid, skip, limit, w_txt, w_vec, len(brand_amplification or []),
    )

    base_proj = dict(projection_fields or PRODUCT_FIELDS)

    # Text branch: normalized as textNorm
    text_branch: List[Dict[str, Any]] = [
        {"$search": {
            "index": text_index,
            "compound": {
                "filter": [
                    {"equals": {"path": "inventorySummary.storeObjectId", "value": store_oid}}
                ],
                "must": [
                    {"compound": {"should": [
                        {"text": {"query": query, "path": "productName", "fuzzy": {"maxEdits": 2}, "score": {"boost": {"value": 3.0}}}},
                        {"text": {"query": query, "path": "aboutTheProduct", "score": {"boost": {"value": 1.8}}}},
                        {"text": {"query": query, "path": "brand", "score": {"boost": {"value": 1.2}}}},
                        {"text": {"query": query, "path": "category", "score": {"boost": {"value": 1.1}}}},
                        {"text": {"query": query, "path": "subCategory", "score": {"boost": {"value": 1.0}}}},
                    ], "minimumShouldMatch": 1}}
                ],
            },
        }},
        {"$set": {"textScore": {"$meta": "searchScore"}}},
        {"$setWindowFields": {"partitionBy": None, "output": {"_maxText": {"$max": "$textScore"}}}},
        {"$set": {
            "textNorm": {
                "$cond": [{"$gt": ["$_maxText", 0]}, {"$divide": ["$textScore", "$_maxText"]}, 0]
            }
        }},
        {"$unset": ["_maxText", "textScore"]},
        {"$project": {
            **base_proj,
            "inventorySummary": 1,
            "brand": 1,
            "category": 1,
            "textNorm": {"$round": ["$textNorm", 6]},
            "vectorNorm": {"$literal": None},
        }},
    ]

    # Vector branch: normalized as vectorNorm
    vector_branch: List[Dict[str, Any]] = [
        {"$vectorSearch": {
            "index": vector_index,
            "path": vector_field,
            "queryVector": embedding,
            "numCandidates": 200,
            "limit": 200,
            "filter": {"inventorySummary.storeObjectId": store_oid},
        }},
        {"$set": {"vectorScore": {"$meta": "vectorSearchScore"}}},
        {"$setWindowFields": {"partitionBy": None, "output": {"_maxVec": {"$max": "$vectorScore"}}}},
        {"$set": {
            "vectorNorm": {
                "$cond": [{"$gt": ["$_maxVec", 0]}, {"$divide": ["$vectorScore", "$_maxVec"]}, 0]
            }
        }},
        {"$unset": ["_maxVec", "vectorScore"]},
        {"$project": {
            **base_proj,
            "inventorySummary": 1,
            "brand": 1,
            "category": 1,
            "textNorm": {"$literal": None},
            "vectorNorm": {"$round": ["$vectorNorm", 6]},
        }},
    ]

    # Union & merge by _id
    pipeline: List[Dict[str, Any]] = []
    pipeline += text_branch
    pipeline += [{"$unionWith": {
        "coll": "<self>",
        "pipeline": vector_branch,
    }}]

    # Merge both norms and compute final score
    pipeline += [
        {"$group": {
            "_id": "$_id",
            # keep one copy of all visible fields (the first encountered is fine)
            "doc": {"$first": "$$ROOT"},
            "textNorm": {"$max": "$textNorm"},
            "vectorNorm": {"$max": "$vectorNorm"},
            "inventorySummary": {"$first": "$inventorySummary"},
            "brand": {"$first": "$brand"},
            "category": {"$first": "$category"},
        }},
        {"$set": {
            "textNorm": {"$ifNull": ["$textNorm", 0]},
            "vectorNorm": {"$ifNull": ["$vectorNorm", 0]},
        }},
        {"$set": {"preBoostScore": {
            "$add": [
                {"$multiply": [w_txt, "$textNorm"]},
                {"$multiply": [w_vec, "$vectorNorm"]},
            ]
        }}},
    ]

    # Brand amplification (multiplicative)
    if branches:
        pipeline.append({"$set": {"boostFactor": {"$switch": {"branches": branches, "default": 0}}}})
    else:
        pipeline.append({"$set": {"boostFactor": 0}})

    pipeline += [
        {"$set": {
            "adjustedScore": {"$multiply": ["$preBoostScore", {"$add": [1, "$boostFactor"]}]},
            "isBoosted": {"$gt": ["$boostFactor", 0]},
        }},
        {"$setWindowFields": {"partitionBy": None, "output": {"_maxFinal": {"$max": "$adjustedScore"}}}},
        {"$set": {"score": {
            "$cond": [{"$gt": ["$_maxFinal", 0]}, {"$divide": ["$adjustedScore", "$_maxFinal"]}, 0]
        }}},
        {"$unset": ["_maxFinal", "preBoostScore", "boostFactor", "adjustedScore", "textNorm", "vectorNorm"]},
        {"$sort": {"score": -1, "_id": 1}},
    ]

    # Final projection (single score)
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
        "score": {"$round": ["$score", 6]},
        "isBoosted": 1,
    }

    pipeline += [
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
        "[HYBRID/scoreFusion] built | stages=%d | boostedBrands=%d | brandCatPairs=%d",
        len(pipeline), len(boosted_brands), len(brand_cat_pairs),
    )
    return pipeline
