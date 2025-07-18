"""
Domain model for a Product.

• `InventoryItem` includes `storeObjectId`.
• Only `imageUrlS3` is used for the product image.
• The `from_mongo` factory validates and assigns fields
  (it fails if `imageUrlS3` is missing, ensuring pipeline consistency).
"""

from __future__ import annotations

import logging
from typing import List, Optional, Dict

from pydantic import BaseModel, Field

logger = logging.getLogger("advanced-search-ms.domain")

# ---------------------------------------------------------------------------#
# 📦  Nested models
# ---------------------------------------------------------------------------#
class InventoryItem(BaseModel):
    storeObjectId: str
    storeId: str
    sectionId: str
    aisleId: str
    shelfId: str
    inStock: bool
    nearToReplenishmentInShelf: Optional[bool] = None


class Price(BaseModel):
    amount: float
    currency: str


# ---------------------------------------------------------------------------#
# 🛒  Root model
# ---------------------------------------------------------------------------#
class Product(BaseModel):
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

    inventorySummary: List[InventoryItem]

    # Vector similarity (present for vector/hybrid searches)
    score: Optional[float] = None

    # --------------------------------------------------------------------- #
    # 🏭  Factory: raw Mongo → domain model
    # --------------------------------------------------------------------- #
    @classmethod
    def from_mongo(cls, doc: Dict) -> "Product":
        """
        Converts a MongoDB document (possibly enriched via aggregation)
        into a Product domain object.
        """

        logger.info("🔍 [DOMAIN] Mapping MongoDB document to Product domain model")

        # Validate mandatory S3 image URL
        if not doc.get("imageUrlS3"):
            logger.error("❌ [DOMAIN] Missing required field: imageUrlS3")
            raise ValueError("Field 'imageUrlS3' missing in product document")

        inv_items = []
        for item in doc.get("inventorySummary", []):
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
            score=doc.get("score"),
        )

    class Config:
        allow_population_by_field_name = True
