# app/infrastructure/mongodb/pipelines/hybrid_rrf_pipeline.py
"""
Pipeline builder for option 4 – Hybrid Reciprocal-Rank Fusion (RRF).

• Mixes Atlas $search (text) and Lucene $vectorSearch with $rankFusion.
• Exposes full scoreDetails metadata and the final weighted score via searchScore.
"""

from __future__ import annotations
import logging
from typing import Any, Dict, List, Optional
from bson import ObjectId
from app.infrastructure.mongodb.utils import PRODUCT_FIELDS

logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())


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
    num_candidates: int = 200,
    knn_limit: int = 200,
) -> List[Dict[str, Any]]:
    """
    Build an RRF pipeline that mixes text & vector scores, logs details and
    returns a flat float `score` for Pydantic.
    """

    # ── Validation ────────────────────────────────────────────────────
    store_oid = ObjectId(store_object_id)
    if skip < 0 or limit <= 0:
        raise ValueError("'skip' must be >= 0 and 'limit' must be > 0")
    logger.info("[infra/mongodb/pipelines/RRF] 🔀 Hybrid search | q=%r | store=%s | skip=%d | limit=%d",
                query, store_oid, skip, limit)
    logger.info("[infra/mongodb/pipelines/RRF] ⚖️  Weights: %s", weights)
    logger.info("[infra/mongodb/pipelines/RRF] 🔍 VectorSearch: index=%s | path=%s | candidates=%d | limit=%d",
                vector_index, vector_field, num_candidates, knn_limit)
    logger.info("[infra/mongodb/pipelines/RRF] 🔍 AtlasSearch: index=%s | boosted fields productName/brand/category/subCategory",
                text_index)

    # ── Shared projection ─────────────────────────────────────────────
    projection = {
        **(projection_fields or PRODUCT_FIELDS),
        # metadata completo para inspección/debug
        "scoreDetails": {"$meta": "scoreDetails"},
        # el RRF fusionado que queremos mostrar en el front
        "score": {
            "$toDouble": {"$ifNull": ["$scoreDetails.details.value", 0]},
        },
    }

    # ── Aggregation pipeline ─────────────────────────────────────────
    pipeline: List[Dict[str, Any]] = [
        # 1) Hybrid rank fusion
        {
            "$rankFusion": {
                "input": {
                    "pipelines": {
                        "vectorPipeline": [
                            {"$vectorSearch": {
                                "index": vector_index,
                                "path": vector_field,
                                "queryVector": embedding,
                                "numCandidates": num_candidates,
                                "limit": knn_limit,
                            }}
                        ],
                        "textPipeline": [
                            {"$search": {
                                "index": text_index,
                                "compound": {
                                    "should": [
                                        {"text": {"query": query, "path": "productName", "score": {"boost": {"value": 0.8}}, "fuzzy": {"maxEdits": 2}}},
                                        {"text": {"query": query, "path": "brand",       "score": {"boost": {"value": 0.1}},}},
                                        {"text": {"query": query, "path": "category",    "score": {"boost": {"value": 0.06}},}},
                                        {"text": {"query": query, "path": "subCategory", "score": {"boost": {"value": 0.04}},}},
                                    ]
                                }
                            }},
                            {"$limit": knn_limit},
                        ],
                    }
                },
                "combination": {"weights": weights},
                "scoreDetails": True,
            }
        },

        # 2) Filter to our store
        {"$match": {"inventorySummary.storeObjectId": store_oid}},

        # 3) Facet for pagination + total count
        {"$facet": {
            "docs": [
                {"$project": projection},
                {"$skip":   skip},
                {"$limit":  limit},
            ],
            "count": [{"$count": "total"}],
        }},

        # 4) Unwind + default total to 0
        {"$unwind": {"path": "$count", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"total": {"$ifNull": ["$count.total", 0]}}},
        {"$project": {"count": 0}},
    ]

    logger.info("[infra/mongodb/pipelines/RRF] ✅ Hybrid pipeline built with %d stages", len(pipeline))
    return pipeline
