# app/infrastructure/mongodb/utils.py
"""
Shared MongoDB‑infrastructure helpers.

• PRODUCT_FIELDS – single source of truth for projection
• filter_inventory_summary() – keeps only the inventory row of the target store
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence

logger = logging.getLogger("advanced-search-ms.mongo.utils")

# Projection used by every pipeline
PRODUCT_FIELDS: Dict = {
    "_id": 1,
    "productName": 1,
    "brand": 1,
    "price": 1,
    "quantity": 1,
    "category": 1,
    "subCategory": 1,
    "absoluteUrl": 1,
    "aboutTheProduct": 1,
    "imageUrlS3": 1,
    "inventorySummary": 1,
}

# Internal fields used by the helpers below; none reach the response.
_MAX_FIELD = "__maxScore"
_PRE_RANK = "__preRank"
_TARGET_RANK = "__targetRank"
_AMP_FACTOR = "__ampFactor"


def max_normalize_stages(source_field: str, output_field: str = "score") -> List[Dict[str, Any]]:
    """
    Aggregation stages that rescale `source_field` into [0, 1] against the largest
    value present in the pipeline at this point, writing the result to `output_field`.

    Single definition of what the response `score` means, for every search mode:

        score = engineScore / max(engineScore in this result set)

    so the top-ranked document scores 1.0 and the rest are expressed relative to it.
    The transform is strictly monotonic, so it can never reorder results — it only
    puts every mode's score on one comparable scale. Previously modes 2 and 3 each
    carried their own copy of this logic, mode 4 returned raw `$rankFusion` values
    (~0.014-0.018) and mode 5 returned raw fused values, so the same field meant
    four different things.

    A non-positive maximum yields 0 for every document rather than dividing by zero.
    """
    return [
        {"$setWindowFields": {"partitionBy": None,
                              "output": {_MAX_FIELD: {"$max": f"${source_field}"}}}},
        {"$set": {output_field: {"$cond": [{"$gt": [f"${_MAX_FIELD}", 0]},
                                           {"$divide": [f"${source_field}", f"${_MAX_FIELD}"]},
                                           0]}}},
        {"$unset": _MAX_FIELD},
    ]


# Rank-space compression factors per Brand Amplification level (low / medium / high).
# A boosted document at pre-boost rank r moves to ceil(r / F): the higher the level,
# the larger the jump. Chosen so the three levels are visibly distinct on a 20-row page.
AMPLIFICATION_FACTORS: Dict[int, int] = {1: 4, 2: 10, 3: 25}


def _normalized(field: str) -> Dict[str, Any]:
    """
    Whitespace/case-insensitive form of a document field, for rule matching.
    Catalogue `brand` values are not normalized (38 brands carry stray whitespace),
    so an exact `$eq` against a trimmed rule name silently matches nothing.
    """
    return {"$toLower": {"$trim": {"input": {"$ifNull": [field, ""]}}}}


def amplification_stages(
    specs: Optional[Sequence[Dict[str, Any]]],
    level_factors: Optional[Dict[int, int]] = None,
) -> List[Dict[str, Any]]:
    """
    Brand Amplification as a **rank-space** transform, shared by modes 3, 4 and 5.

    Why rank space rather than score space
    --------------------------------------
    Amplification used to multiply the relevance score by `(1 + 0.05|0.10|0.15)`.
    That is unbounded in effect, because what a given multiplier does to a ranking
    depends entirely on how tightly that mode's scores are packed — and the packing
    differs wildly between modes (Lucene spans ~0.4-18.7 here, cosine ~0.75-0.84,
    RRF ~0.014-0.018). The same "high" setting was therefore a no-op on one query
    and, measurably, put an unrelated oolong tea at rank 1 for the query "tomatoe".

    Rank is comparable across modes without calibration, so the rule is expressed
    there instead:

        targetRank = max(1, ceil(preRank / F))    for a boosted document
                   = preRank                      otherwise

    with F from `level_factors`. Ordering is then `(targetRank, preRank)`, so the
    engine's own ranking still breaks ties among equally-promoted documents.

    The response `score` is deliberately **not** touched: it remains the engine's
    own max-normalized value (see `max_normalize_stages`). Amplification is visible
    through the reordering and the `isBoosted` flag, not through an inflated number.
    A boosted document may therefore legitimately show a lower score than the one
    below it — that contrast is the point.

    Known limitation (accepted for this iteration): there is no relevance gate, so a
    document sitting deep in a weak match can still climb a long way at "high". It is
    bounded — `ceil(r / 25)` cannot reach rank 1 from beyond rank 25 — but it is not
    zero. An eligibility gate keyed on lexical match was designed and deliberately
    deferred in favour of a single, explainable rule.
    """
    factors = level_factors or AMPLIFICATION_FACTORS
    branches: List[Dict[str, Any]] = []

    for spec in specs or []:
        brand = (spec.get("name") or "").strip()
        factor = factors.get(int(spec.get("boostLevel", 0)))
        categories = [
            c.strip() for c in (spec.get("categories") or [])
            if isinstance(c, str) and c.strip()
        ]
        if not brand or not factor:
            continue
        brand_matches = {"$eq": [_normalized("$brand"), brand.lower()]}
        if not categories:
            branches.append({"case": brand_matches, "then": factor})
        else:
            for cat in categories:
                branches.append({
                    "case": {"$and": [brand_matches,
                                      {"$eq": [_normalized("$category"), cat.lower()]}]},
                    "then": factor,
                })

    # No active rules: keep the engine ordering untouched and flag nothing.
    if not branches:
        return [{"$set": {"isBoosted": False}}, {"$sort": {"score": -1, "_id": 1}}]

    return [
        # Deterministic total order first, so documents with identical scores get a
        # stable pre-rank. `$documentNumber` only accepts a single-element `sortBy`,
        # so `_id` cannot be part of the window sort itself.
        {"$sort": {"score": -1, "_id": 1}},
        # Pre-boost position, taken from the score contract every mode already shares.
        {"$setWindowFields": {"sortBy": {"score": -1},
                              "output": {_PRE_RANK: {"$documentNumber": {}}}}},
        {"$set": {_AMP_FACTOR: {"$switch": {"branches": branches, "default": 0}}}},
        {"$set": {
            "isBoosted": {"$gt": [f"${_AMP_FACTOR}", 0]},
            _TARGET_RANK: {"$cond": [
                {"$gt": [f"${_AMP_FACTOR}", 0]},
                {"$max": [1, {"$ceil": {"$divide": [f"${_PRE_RANK}", f"${_AMP_FACTOR}"]}}]},
                f"${_PRE_RANK}",
            ]},
        }},
        {"$sort": {_TARGET_RANK: 1, _PRE_RANK: 1}},
        {"$unset": [_PRE_RANK, _TARGET_RANK, _AMP_FACTOR]},
    ]


def filter_inventory_summary(doc: Dict, store_object_id: str) -> Dict:
    """
    Replace the `inventorySummary` array with ONLY the item
    that matches the caller’s `store_object_id`.

    This keeps the JSON payload small and avoids leaking
    stock information of other stores.
    """
    if "inventorySummary" in doc:
        doc["inventorySummary"] = [
            inv for inv in doc["inventorySummary"]
            if str(inv.get("storeObjectId")) == str(store_object_id)
        ]
        logger.debug(
            f"[infra/mongodb/utils] Filtered inventorySummary for store '{store_object_id}': "
        )
    return doc
