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
3) Applies Brand Amplification *after fusion* as a **rank-space reorder** (see
   `utils.amplification_stages`): a boosted document at pre-boost rank r moves to
   `ceil(r / F)`, F = 4 / 10 / 25 for low / medium / high. The score is never
   multiplied by the boost — amplification changes order, not numbers.
4) Sorts by the post-boost score and returns a clean projection:
   product fields, store-filtered inventory, final `score`, and `isBoosted`,
   plus a total count via `$facet`.

`total_results` semantics
-------------------------
The `$facet` count branch counts the fused candidate window (both arms are capped at
`FUSION_ARM_LIMIT`), not a match count: the vector arm has no discrete match count,
so the union cannot have one either. `total_results` therefore reports the number of
results a client can actually page through. Modes 1 and 2 report a true match count;
modes 3, 4 and 5 report retrieval depth. See rec L2.4.

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
from app.infrastructure.mongodb.utils import (
    PRODUCT_FIELDS,
    amplification_stages,
    max_normalize_stages,
)

logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())


# Candidate depth fed into `$rankFusion`, applied identically to BOTH arms.
# RRF is rank-based: if one arm is uncapped its ranks run far deeper than the
# other's, so the reciprocal-rank contributions of the two arms are no longer
# comparable — and a broad query drags the whole fusion stage down with it.
FUSION_ARM_LIMIT = 200
# ANN over-fetch for the vector arm; must exceed FUSION_ARM_LIMIT for useful recall.
VECTOR_NUM_CANDIDATES = 500


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
    # An explicit 0.0 means "zero weight" and must survive; only a missing/None
    # weight falls back to 1.0 (`or` would coerce 0.0 to the default).
    def _weight(key: str) -> float:
        raw = weights.get(key)
        return 1.0 if raw is None else max(0.0, float(raw))

    w_vec = _weight("vectorPipeline")
    w_txt = _weight("textPipeline")

    base_proj = dict(projection_fields or PRODUCT_FIELDS)

    logger.info(
        "[HYBRID/RRF] store=%s | skip=%d | limit=%d | w_text=%.3f | w_vec=%.3f | brandAmpRules=%d (rank-space reorder)",
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
                                              "score": {"boost": {"value": 0.6}}}},
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
        # Match the vector arm's depth so both ranked lists are the same length.
        {"$limit": FUSION_ARM_LIMIT},
    ]

    # Vector: semantic retrieval; scoped to store.
    vector_pipeline: List[Dict[str, Any]] = [
        {
            "$vectorSearch": {
                "index": vector_index,
                "path": vector_field,
                "queryVector": embedding,
                "numCandidates": VECTOR_NUM_CANDIDATES,
                "limit": FUSION_ARM_LIMIT,
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

    pipeline += [
        # Score contract: the fused engine score, max-normalized. Never multiplied by
        # amplification — see utils.amplification_stages.
        *max_normalize_stages("rrfScore"),
        # Brand Amplification as a rank-space reorder.
        *amplification_stages(brand_amplification),
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
        "score": {"$round": ["$score", 6]},
        "isBoosted": 1,
    }

    pipeline += [
        # Do not expose helper fields in API responses.
        {"$unset": ["rrfScore"]},
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
        "[HYBRID/RRF] built | stages=%d | brandAmpRules=%d (rank-space reorder)",
        len(pipeline), len(brand_amplification or []),
    )
    return pipeline
