# app/interfaces/schemas.py
"""
Pydantic schemas for API layer (request & response).

• Defines strict input/output validation and OpenAPI docs.
• Keeps FastAPI decoupled from domain logic.

Note:
All classes inherit from `pydantic.BaseModel`, which provides:
• Automatic type validation of inputs and outputs.
• JSON serialization and OpenAPI generation.
• A clean and declarative way to define data structures.
"""

import logging
from typing import List, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger("advanced-search-ms.schemas")

# ──────────────────────────────── Request Schema ────────────────────────────────
class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, example="organic onions")
    storeObjectId: str = Field(..., description="MongoDB ObjectId of the target store")
    option: int = Field(
        ...,
        ge=1,
        le=4,
        description="""
            1 = keyword / regex search
            2 = Atlas Search (text)
            3 = Lucene vector search
            4 = Hybrid search (RRF text + vector)
        """,
    )
    page: int = Field(1, ge=1)
    page_size: int = Field(10, ge=1, le=50)
    weightVector: Optional[float] = Field(
        None,
        title="Vector Weight",
        description="(Only used if option=4) Weight for vector ranking in hybrid RRF fusion",
        example=0.7,
    )
    weightText: Optional[float] = Field(
        None,
        title="Text Weight",
        description="(Only used if option=4) Weight for text ranking in hybrid RRF fusion",
        example=0.3,
    )

    def __init__(self, **data):
        logger.info("📥 [INTERFACES/schemas] Incoming SearchRequest: %s", data)
        super().__init__(**data)


# ──────────────────────────────── Response Schema ────────────────────────────────
class InventoryItemOut(BaseModel):
    storeObjectId: str
    storeId: str
    sectionId: str
    aisleId: str
    shelfId: str
    inStock: bool
    nearToReplenishmentInShelf: Optional[bool] = None


class PriceOut(BaseModel):
    amount: float
    currency: str


class ProductOut(BaseModel):
    id: str
    productName: str
    brand: Optional[str] = None
    price: Optional[PriceOut] = None
    quantity: Optional[str] = None
    category: Optional[str] = None
    subCategory: Optional[str] = None
    absoluteUrl: Optional[str] = None
    aboutTheProduct: Optional[str] = None
    imageUrlS3: str
    inventorySummary: List[InventoryItemOut]
    score: Optional[float] = None

    def __init__(self, **data):
        logger.info("📦 [INTERFACESs/schemas] Serializing ProductOut: %s", data.get("productName", "N/A"))
        super().__init__(**data)


class SearchResponse(BaseModel):
    total_results: int
    total_pages: int
    products: List[ProductOut]

    def __init__(self, **data):
        logger.info("📤 [INTERFACES/schemas] Outgoing SearchResponse: %d products | total_results=%d",
                    len(data.get("products", [])),
                    data.get("total_results", 0))
        super().__init__(**data)
