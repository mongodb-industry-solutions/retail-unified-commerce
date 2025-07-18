# app/infrastructure/mongodb/
"""
Shared MongoDB‑infrastructure helpers.

• PRODUCT_FIELDS – single source of truth for projection
• filter_inventory_summary() – keeps only the inventory row of the target store
"""

from __future__ import annotations

import logging
from typing import Dict

logger = logging.getLogger("advanced-search-ms.mongo.utils")

# 🔖 Projection used by every pipeline
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
    return doc
