# app/infrastructure/mongodb/pipelines/hybrid_rrf_pipeline.py
"""
Pipeline builder for *option 4* – Hybrid **Reciprocal Rank Fusion** (RRF).

• Mixes Atlas $search (text) and Lucene $vectorSearch with $rankFusion.
• Exposes the fusion score via $meta:"searchScore" inside the facet‑projection.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from bson import ObjectId

from app.infrastructure.mongodb.utils import PRODUCT_FIELDS

logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())


# --------------------------------------------------------------------------- #
def build_hybrid_rrf_pipeline(
    query: str,
    embedding: List[float],
    store_object_id: str,
    *,
    text_index: str,
    vector_index: str,
    vector_field: str,
    weights: Dict[str, float],
    skip: int,
    limit: int,
    projection_fields: Optional[Dict[str, int]] = None,
) -> List[Dict[str, Any]]:
    """
    Build a Reciprocal‑Rank‑Fusion pipeline that mixes text & vector scores.
    """

    # ── Validation ─────────────────────────────────────────────────────────
    store_oid = ObjectId(store_object_id)
    if skip < 0 or limit <= 0:
        raise ValueError("'skip' must be ≥ 0 and 'limit' must be > 0")

    logger.info(
        "[RRF] 🔀 Hybrid search | q='%s' | store=%s | skip=%d | limit=%d",
        query, store_oid, skip, limit
    )
    logger.info("[RRF] ⚖️  Weights: %s", weights)

    # Shared projection (single source of truth) + score meta
    projection = {
        **(projection_fields or PRODUCT_FIELDS),
        "score": {"$meta": "searchScore"},   # <-- extract here
    }
    logger.info("[RRF] 🧾 Projection fields: %s", list(projection.keys()))

    # ── Aggregation pipeline ──────────────────────────────────────────────
    pipeline: List[Dict[str, Any]] = [
        # 1) Rank‑fusion of two inline pipelines
        {
            "$rankFusion": {
                "input": {
                    "pipelines": {
                        "vectorPipeline": [
                            {
                                "$vectorSearch": {
                                    "index": vector_index,
                                    "path":  vector_field,
                                    "queryVector": embedding,
                                    "numCandidates": 200,
                                    "limit": 200,
                                }
                            }
                        ],
                        "textPipeline": [
                            {
                                "$search": {
                                    "index": text_index,
                                    "compound": {
                                        "should": [
                                            {
                                                "text": {
                                                    "query": query,
                                                    "path": "productName",
                                                    "score": {"boost": {"value": 0.8}},
                                                    "fuzzy": {"maxEdits": 2},
                                                }
                                            },
                                            {
                                                "text": {
                                                    "query": query,
                                                    "path": ["brand", "category", "subCategory"],
                                                    "score": {"boost": {"value": 0.2}},
                                                    "fuzzy": {"maxEdits": 2},
                                                }
                                            },
                                        ]
                                    },
                                }
                            },
                            {"$limit": 200},
                        ],
                    }
                },
                "combination": {"weights": weights},
                "scoreDetails": False,
            }
        },

        # 2) Filter by store (after fusion)
        {
            "$match": {
                "inventorySummary.storeObjectId": store_oid
            }
        },

        # 3) Facet: paginate results + count total
        {
            "$facet": {
                "docs": [
                    {"$project": projection},  # score extracted here
                    {"$skip":   skip},
                    {"$limit":  limit},
                ],
                "count": [{"$count": "total"}],
            }
        },

        # 4) Flatten & default total=0
        {"$unwind":   {"path": "$count", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        {"$project":  {"count": 0}},
    ]

    logger.info("[RRF] ✅ Hybrid pipeline built with %d stages", len(pipeline))
    return pipeline
