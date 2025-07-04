"""
Domain model for a Product.

Purpose
-------
Defines immutable business entities (Pydantic models) that the
application operates on, independent of persistence details.

Why
---
Keeping the domain layer free of DB-specific fields makes the core
business logic portable and easy to test.

How
---
• Uses `pydantic.BaseModel` for validation / serialisation.
• Factory method `from_mongo` maps raw MongoDB docs—including the
  vector-search similarity score—into domain objects.
"""

from typing import List, Optional, Dict

from pydantic import BaseModel


class InventoryItem(BaseModel):
    storeId: str
    sectionId: str
    aisleId: str
    shelfId: str
    inStock: bool
    nearToReplenishmentInShelf: Optional[bool]


class Price(BaseModel):
    amount: float
    currency: str


class Product(BaseModel):
    id: str
    productName: str
    brand: str
    price: Price
    imageUrl: str
    quantity: str
    category: str
    subCategory: str
    absoluteUrl: str
    aboutTheProduct: Optional[str]
    inventorySummary: List[InventoryItem]

    # Score returned by MongoDB Atlas Vector Search
    score: Optional[float] = None

    @classmethod
    def from_mongo(cls, doc: Dict) -> "Product":
        """
        Map a raw MongoDB document into a domain Product object.
        The `score` field is included when the aggregate pipeline
        adds `{"$addFields": {"score": {"$meta": "vectorSearchScore"}}}`.
        """
        return cls(
            id=str(doc.get("_id")),
            productName=doc.get("productName"),
            brand=doc.get("brand"),
            price=Price(**doc.get("price", {})),
            imageUrl=doc.get("imageUrl"),
            quantity=doc.get("quantity"),
            category=doc.get("category"),
            subCategory=doc.get("subCategory"),
            absoluteUrl=doc.get("absoluteUrl"),
            aboutTheProduct=doc.get("aboutTheProduct"),
            inventorySummary=[
                InventoryItem(**item) for item in doc.get("inventorySummary", [])
            ],
            score=doc.get("score"),  # may be None for non-vector searches
        )
