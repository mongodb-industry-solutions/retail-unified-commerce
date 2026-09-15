# app/infrastructure/mongodb/pipelines/text_pipeline.py
"""
Pipeline builder for *option 2* — Atlas Search text index with brand amplification.

Simplified strategy
-------------------
- Use `text` operator for categories (never `equals`) to avoid analyzer errors.
- Brand amplification rules injected as `should` clauses, same as hardcoded pipeline.
- Store filtering inside `$search.filter` (efficient and score-agnostic).
- Raw score logged (`originalScore`) and normalized to [0,1].
- Output: `{docs, total}` API-ready.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence

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

# Boost mapping: abstract levels → numeric multipliers
BOOST_MAP: Dict[int, float] = {
    1: 1.5,  # low
    2: 2.0,  # medium
    3: 2.5,  # high
}


def _brand_amp_should_clauses(
    specs: Optional[Sequence[Dict[str, Any]]],
) -> Dict[str, Any]:
    """
    Build `should` clauses for brand amplification.

    Always use `text` for categories to avoid analyzer issues.
    """
    clauses: List[Dict[str, Any]] = []
    boosted_brands: List[str] = []
    brand_cat_pairs: List[str] = []

    if not specs:
        return {"clauses": [], "boostedBrands": [], "brandCategoryPairs": []}

    for spec in specs:
        brand = (spec.get("name") or "").strip()
        level = int(spec.get("boostLevel", 0))
        boost = float(BOOST_MAP.get(level, 1.0))
        categories = [c.strip() for c in (spec.get("categories") or []) if isinstance(c, str) and c.strip()]

        if not brand:
            continue

        if brand not in boosted_brands:
            boosted_brands.append(brand)

        if not categories:
            # Brand-only boost
            clauses.append({
                "text": {
                    "path": "brand",
                    "query": brand,
                    "score": {"boost": {"value": boost}},
                }
            })
        else:
            # Brand + category combos
            for cat in categories:
                brand_cat_pairs.append(f"{brand}::{cat}")

                clauses.append({
                    "compound": {
                        "must": [
                            {
                                "text": {
                                    "path": "brand",
                                    "query": brand,
                                    "score": {"boost": {"value": boost}},
                                }
                            }
                        ],
                        "filter": [
                            {
                                "text": {
                                    "path": "category",
                                    "query": cat
                                }
                            }
                        ],
                    }
                })

    return {
        "clauses": clauses,
        "boostedBrands": boosted_brands,
        "brandCategoryPairs": brand_cat_pairs,
    }


def build_text_pipeline(
    *,
    query: str,
    store_object_id: str,
    text_index: str,
    skip: int,
    limit: int,
    projection_fields: Optional[Dict[str, int]] = None,
    brand_amplification: Optional[Sequence[Dict[str, Any]]] = None,
    normalization_mode: str = "window_max",
    log_score_details: bool = True,
) -> List[Dict[str, Any]]:
    """Build Atlas Search text pipeline with brand amplification (simple mode)."""
    try:
        store_oid = ObjectId(store_object_id)
    except Exception as exc:
        raise ValueError("store_object_id must be a valid ObjectId") from exc

    logger.info(
        "[TEXT] q=%r | store=%s | skip=%d | limit=%d | brandAmp=%d | norm=%s",
        query, store_oid, skip, limit, len(brand_amplification or []), normalization_mode,
    )

    amp = _brand_amp_should_clauses(brand_amplification)
    amp_should = amp["clauses"]
    boosted_brands = amp["boostedBrands"]
    brand_cat_pairs = amp["brandCategoryPairs"]

    projection = dict(projection_fields or PRODUCT_FIELDS)
    projection.update({"score": 1})

    search_stage = {
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
                                {"text": {"query": query, "path": "productName", "fuzzy": {"maxEdits": 2}, "score": {"boost": {"value": 3.0}}}},
                                {"text": {"query": query, "path": "aboutTheProduct", "score": {"boost": {"value": 0.6}}}},
                                {"text": {"query": query, "path": "brand", "score": {"boost": {"value": 1.2}}}},
                                {"text": {"query": query, "path": "category", "score": {"boost": {"value": 1.1}}}},
                                {"text": {"query": query, "path": "subCategory", "score": {"boost": {"value": 1.0}}}},
                            ],
                            "minimumShouldMatch": 1,
                        }
                    }
                ],
                "should": amp_should,
            },
        }
    }

    stages: List[Dict[str, Any]] = [
        search_stage,
        {"$set": {"originalScore": {"$meta": "searchScore"}}},
        # Shared score contract (see utils.max_normalize_stages).
        *max_normalize_stages("originalScore"),
        {"$sort": {"originalScore": -1, "_id": 1}},
    ]

    docs_projection: Dict[str, Any] = {
        "id": {"$toString": "$_id"},
        **(projection or {}),
        "inventorySummary": {
            "$filter": {
                "input": "$inventorySummary",
                "as": "inv",
                "cond": {"$eq": ["$$inv.storeObjectId", store_oid]},
            }
        },
        "score": {"$round": ["$score", 6]},
    }
    if log_score_details:
        docs_projection["originalScore"] = {"$round": ["$originalScore", 6]}

    # Compare in normalized form on both sides: the `should` clauses above match via the
    # analyzed `text` operator (which already tolerates the catalogue's stray whitespace),
    # so an exact `$in` here reported isBoosted=false for documents it had in fact boosted.
    docs_projection["isBoosted"] = {
        "$or": [
            {"$in": [_norm_field("$brand"), [b.strip().lower() for b in boosted_brands]]},
            {"$in": [
                {"$concat": [_norm_field("$brand"), "::", _norm_field("$category")]},
                [p.strip().lower() for p in brand_cat_pairs],
            ]},
        ]
    }

    finalize = [
        {"$facet": {"docs": [{"$project": docs_projection}, {"$skip": skip}, {"$limit": limit}], "count": [{"$count": "total"}]}},
        {"$unwind": {"path": "$count", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        {"$project": {"count": 0}},
    ]

    pipeline = stages + finalize

    logger.info("[TEXT] built | stages=%d | boostedBrands=%d | brandCatPairs=%d", len(pipeline), len(boosted_brands), len(brand_cat_pairs))
    return pipeline
