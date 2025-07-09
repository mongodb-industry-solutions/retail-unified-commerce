"""
Domain model for a Product.

• `InventoryItem` incluye `storeObjectId`.
• Únicamente usamos `imageUrlS3` para la imagen del producto.
• La fábrica `from_mongo` valida y asigna dicho campo
  (falla si está ausente, de modo que el pipeline debe incluirlo).
"""

from __future__ import annotations

from typing import List, Optional, Dict

from pydantic import BaseModel, Field


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
    # DB id is exposed as plain string
    id: str = Field(..., alias="_id")

    productName: str
    brand: Optional[str] = None
    price: Optional[Price] = None
    quantity: Optional[str] = None
    category: Optional[str] = None
    subCategory: Optional[str] = None
    absoluteUrl: Optional[str] = None
    aboutTheProduct: Optional[str] = None

    # ✅ only this image field is kept
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
        Convert a MongoDB document (possibly enriched by an aggregate
        pipeline) into a Product domain object.
        """
        # Mandatory S3 image URL
        if not doc.get("imageUrlS3"):
            raise ValueError("Field 'imageUrlS3' missing in product document")

        inv_items = [InventoryItem(**item) for item in doc.get("inventorySummary", [])]

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
