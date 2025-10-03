# domain/product.py

"""
Domain models for Product & related nested types.

This file defines how product data from MongoDB is mapped into the internal domain model.
It ensures that aliases (e.g. `_id`) work correctly with Pydantic v2,
by using `model_config = ConfigDict(...)` instead of the deprecated Config.allow_population_by_field_name.

Contains:
- InventoryItem
- Price
- Product with factory method `from_mongo`
"""

from __future__ import annotations

import logging
from typing import List, Optional, Dict, Any

from pydantic import BaseModel, Field, ConfigDict

logger = logging.getLogger("advanced-search-ms.domain")

# ---------------------------------------------------------------------------#
# 📦  Nested models
# ---------------------------------------------------------------------------#
class InventoryItem(BaseModel):
    # Make most fields optional to tolerate different projections from pipelines
    storeObjectId: str
    storeId: Optional[str] = None
    sectionId: Optional[str] = None
    aisleId: Optional[str] = None
    shelfId: Optional[str] = None
    inStock: Optional[bool] = None
    nearToReplenishmentInShelf: Optional[bool] = None


class Price(BaseModel):
    amount: float
    currency: str


# ---------------------------------------------------------------------------#
# 🛒  Root model
# ---------------------------------------------------------------------------#
class Product(BaseModel):
    """
    Domain model for a Product.

    • `InventoryItem` includes `storeObjectId`.
    • Only `imageUrlS3` is used for the product image.
    • The `from_mongo` factory validates and assigns fields
      (it fails if `imageUrlS3` is missing, ensuring pipeline consistency).
    • Ranking fields:
        - `originalScore`: raw $meta.searchScore (if provided by the pipeline)
        - `score`: normalized [0..1] (if provided by the pipeline)
        - `isBoosted`: explanatory flag (true if any amplification rule matched)
    """

    # DB id is exposed as a plain string
    id: str = Field(..., alias="_id")

    productName: str
    brand: Optional[str] = None
    price: Optional[Price] = None
    quantity: Optional[str] = None
    category: Optional[str] = None
    subCategory: Optional[str] = None
    absoluteUrl: Optional[str] = None
    aboutTheProduct: Optional[str] = None

    # ✅ Only this image field is kept
    imageUrlS3: str

    # Inventory (already filtered by store in the pipeline)
    inventorySummary: List[InventoryItem] = Field(default_factory=list)

    # Ranking fields (present for text/vector/hybrid searches)
    originalScore: Optional[float] = None  # raw $meta.searchScore
    score: Optional[float] = None          # normalized [0..1]
    isBoosted: bool = False                # derived from amplification rules

    @classmethod
    def from_mongo(cls, doc: Dict[str, Any]) -> "Product":
        """
        Converts a MongoDB document (possibly enriched via aggregation)
        into a Product domain object.
        """
        logger.info("🔍 [DOMAIN] Mapping MongoDB document to Product domain model")

        # Validate mandatory S3 image URL
        if not doc.get("imageUrlS3"):
            logger.error("❌ [DOMAIN] Missing required field: imageUrlS3")
            raise ValueError("Field 'imageUrlS3' missing in product document")

        # Prepare inventory items (tolerant mapping)
        inv_items: List[InventoryItem] = []
        for item in (doc.get("inventorySummary") or []):
            # Convert storeObjectId to string if it's a Mongo ObjectId
            if "storeObjectId" in item and not isinstance(item["storeObjectId"], str):
                item["storeObjectId"] = str(item["storeObjectId"])
            inv_items.append(InventoryItem(**item))

        return cls(
            _id=str(doc.get("_id")),
            productName=doc.get("productName"),
            brand=doc.get("brand"),
            price=Price(**doc["price"]) if doc.get("price") else None,
            quantity=doc.get("quantity"),
            category=doc.get("category"),
            subCategory=doc.get("subCategory"),
            absoluteUrl=doc.get("absoluteUrl"),
            aboutTheProduct=doc.get("aboutTheProduct"),
            imageUrlS3=doc["imageUrlS3"],
            inventorySummary=inv_items,
            originalScore=doc.get("originalScore"),
            score=doc.get("score"),
            isBoosted=bool(doc.get("isBoosted", False)),
        )

    # ------------------ Pydantic v2 config ------------------ #
    model_config = ConfigDict(
        populate_by_name=True
        # If using Pydantic v2.11+ it's recommended to use validate_by_name=True in future.
    )
