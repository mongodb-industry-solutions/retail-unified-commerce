# app/infrastructure/mongodb/utils.py
"""
Shared MongoDB‑infrastructure helpers.

• PRODUCT_FIELDS – single source of truth for projection
• filter_inventory_summary() – keeps only the inventory row of the target store
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

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

# Internal field used by max_normalize_stages(); never reaches the response.
_MAX_FIELD = "__maxScore"


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
