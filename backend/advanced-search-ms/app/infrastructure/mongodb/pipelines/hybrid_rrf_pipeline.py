"""
Pipeline builder for *option 4* — Hybrid search using $rankFusion (RRF)
with Brand Amplification applied *after* fusion.

Design
------
- Sub-pipelines:
  * vectorPipeline: $vectorSearch filtered by store, limit K.
  * textPipeline:   $search with compound filter by store, limit K.
  No scoring/boosting inside sub-pipelines (RRF ranks by position).
- Fusion:
  $rankFusion with per-pipeline weights (vectorPipeline/textPipeline),
  scoreDetails enabled for observability.
- Post-fusion shaping:
  * Capture RRF score via {$meta: "searchScore"} as `originalScore`.
  * Also capture {$meta: "scoreDetails"} for diagnostics/fallback.
  * Compute Brand Amplification as multiplicative factor:
      score := originalScore * (1 + boostFactor)
    where boostFactor is derived from rules {brand, categories?, boostLevel}.
  * Do NOT normalize RRF. We keep rank-based score semantics.
- Facet:
  Build {docs, total} envelope with pagination.

Notes
-----
- $rankFusion sub-pipelines may only contain: $search, $vectorSearch, $match, $sort, $geoNear, $limit.
  No $project/$set inside them.
- Brand Amplification runs only after fusion to avoid polluting relative ranks.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence, Union

from bson import ObjectId
from app.infrastructure.mongodb.utils import PRODUCT_FIELDS

logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())

# Fixed post-fusion boost mapping (multiplicative on the fused score):
# final_score = rrf_score * (1 + factor)
BOOST_MAP: Dict[int, float] = {
    1: 0.05,  # Low
    2: 0.10,  # Medium
    3: 0.15,  # High
}


def _brand_amp_switch_branches(
    specs: Optional[Sequence[Dict[str, Any]]],
) -> Dict[str, Any]:
    """
    Build $switch branches to compute `boostFactor` AFTER fusion.
    If categories are provided, we require an exact (brand, category) match.
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
            branches.append({"case": {"$eq": ["$brand", brand]}, "then": factor})
        else:
            for cat in categories:
                brand_cat_pairs.append(f"{brand}::{cat}")
                branches.append({
                    "case": {
                        "$and": [
                            {"$eq": ["$brand", brand]},
                            {"$eq": ["$category", cat]},
                        ]
                    },
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
    store_object_id: Union[str, ObjectId],
    text_index: str,
    vector_index: str,
    vector_field: str,
    weights: Optional[Dict[str, Optional[float]]] = None,  # {"vectorPipeline": float, "textPipeline": float}
    brand_amplification: Optional[Sequence[Dict[str, Any]]] = None,
    skip: int,
    limit: int,
    projection_fields: Optional[Dict[str, int]] = None,
    # knobs
    num_candidates: int = 200,
    per_pipeline_limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    Build Hybrid RRF pipeline with post-fusion Brand Amplification.

    The final response shape is an envelope:
      { docs: [...], total: <int> }
    where docs include the projected product fields + (score, isBoosted).
    """
    try:
        store_oid = store_object_id if isinstance(store_object_id, ObjectId) else ObjectId(store_object_id)
    except Exception as exc:
        raise ValueError("store_object_id must be a valid ObjectId") from exc
    if skip < 0 or limit <= 0:
        raise ValueError("'skip' must be ≥ 0 and 'limit' must be > 0")

    # Prepare weights (defaults if None)
    w_vec = float(weights.get("vectorPipeline") or 0.5) if weights else 0.5
    w_txt = float(weights.get("textPipeline") or 0.5) if weights else 0.5

    amp = _brand_amp_switch_branches(brand_amplification)
    branches = amp["branches"]
    boosted_brands = amp["boostedBrands"]
    brand_cat_pairs = amp["brandCategoryPairs"]

    logger.info(
        "[HYBRID/rrf] store=%s | skip=%d | limit=%d | w_vec=%.2f | w_txt=%.2f | brandAmp=%d",
        store_oid, skip, limit, w_vec, w_txt, len(brand_amplification or []),
    )

    # Sub-pipelines (no projection/sets inside; only allowed stages)
    vector_pipeline: List[Dict[str, Any]] = [
        {
            "$vectorSearch": {
                "index": vector_index,
                "path": vector_field,
                "queryVector": embedding,
                "numCandidates": num_candidates,
                "limit": per_pipeline_limit,
                "filter": {
                    "inventorySummary.storeObjectId": store_oid,
                },
            }
        }
    ]

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
                                    {"text": {"query": query, "path": "productName",   "fuzzy": {"maxEdits": 2}}},
                                    {"text": {"query": query, "path": "aboutTheProduct"}},
                                    {"text": {"query": query, "path": "brand"}},
                                    {"text": {"query": query, "path": "category"}},
                                    {"text": {"query": query, "path": "subCategory"}},
                                ],
                                "minimumShouldMatch": 1
                            }
                        }
                    ]
                }
            }
        },
        {"$limit": per_pipeline_limit},
    ]

    # Base projection (outer pipeline)
    projection = dict(projection_fields or PRODUCT_FIELDS)
    projection.update({"score": 1})  # we will set score after amplification

    # --------- Full aggregation (outside of sub-pipelines) ----------
    stages: List[Dict[str, Any]] = [
        {
            "$rankFusion": {
                "input": {
                    "pipelines": {
                        "vectorPipeline": vector_pipeline,
                        "textPipeline":   text_pipeline,
                    }
                },
                "combination": {
                    "weights": {
                        "vectorPipeline": w_vec,
                        "textPipeline":   w_txt,
                    }
                },
                "scoreDetails": True
            }
        },
        # Capture RRF fused score + details
        {"$set": {
            "originalScore": {"$meta": "searchScore"},
            "scoreDetails":  {"$meta": "scoreDetails"},
        }},
        # Compute brand amplification factor after fusion
        {"$set": {"boostFactor": {"$switch": {"branches": branches or [], "default": 0}}}},
        {"$set": {
            "isBoosted": {"$gt": ["$boostFactor", 0]},
            "score": {"$multiply": ["$originalScore", {"$add": [1, "$boostFactor"]}]}
        }},
        # Sort by final score (descending), then stable _id
        {"$sort": {"score": -1, "_id": 1}},
        # Envelope with pagination + total
        {"$facet": {
            "docs": [
                {"$project": {
                    "id": {"$toString": "$_id"},
                    **projection,
                    # Keep only this store’s inventory rows
                    "inventorySummary": {
                        "$filter": {
                            "input": "$inventorySummary",
                            "as": "inv",
                            "cond": {"$eq": ["$$inv.storeObjectId", store_oid]},
                        }
                    },
                    # Round the final score for readability
                    "score": {"$round": ["$score", 6]},
                    "isBoosted": 1,
                    # Useful for debugging / fallback in repo
                    "originalScore": {"$round": ["$originalScore", 6]},
                    "scoreDetails": 1,
                }},
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
        "[HYBRID/rrf] built | stages=%d | boostedBrands=%d | brandCatPairs=%d",
        len(stages), len(boosted_brands), len(brand_cat_pairs),
    )
    return stages
