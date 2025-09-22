# app/interfaces/schemas.py

"""
Pydantic schemas for API layer (request & response).

• Defines strict input/output validation and OpenAPI docs.
• Keeps FastAPI decoupled from domain logic.

Contract highlights (v2):
- Supports 4 strategies (option=1..4).
- Brand Amplification (options 2–4): optional list [{ name, boostLevel(1..3) }].
- Hybrid fusion (option=4): optional fusionMode ('rrf' | 'scoreFusion') + weights.
- Pagination: page >=1, page_size 1..100 (default 20).
- Response includes relevance 'score' and 'isBoosted' (response-only).
"""

import logging
from typing import List, Optional

from pydantic import BaseModel, Field, validator

logger = logging.getLogger("advanced-search-ms.schemas")

# ─────────────────────────────── Brand Boost schema ───────────────────────────────
class BrandBoost(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        example="Oatly",
        description="Brand name to boost within the ranking (case-insensitive match)"
    )
    boostLevel: int = Field(
        ...,
        ge=1,
        le=3,
        example=2,
        description="Boost level: 1 (low), 2 (medium), 3 (high)"
    )


# ─────────────────────────────── Request Schema ────────────────────────────────
class SearchRequest(BaseModel):
    query: str = Field(
        ...,
        min_length=1,
        example="green tea cleanser",
        description="Free-text query to search products"
    )
    storeObjectId: str = Field(
        ...,
        example="684aa28064ff7c785a568aca",
        description="MongoDB ObjectId of the target store to scope results"
    )
    option: int = Field(
        ...,
        ge=1,
        le=4,
        example=2,
        description=(
            "Search strategy option:\n"
            "1 = keyword / regex search (no brand amplification)\n"
            "2 = Atlas Search (text) — supports brandAmplification\n"
            "3 = Lucene vector search — supports brandAmplification\n"
            "4 = Hybrid (text + vector) — supports brandAmplification, fusionMode & weights"
        ),
    )
    page: int = Field(
        1,
        ge=1,
        example=1,
        description="Page number (1-based)"
    )
    page_size: int = Field(
        20,
        ge=1,
        le=100,
        example=20,
        description="Page size (1..100), defaults to 20"
    )

    # Optional fields for hybrid search (option=4)
    weightVector: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        title="Vector Weight",
        description="(Only used if option=4) Weight for vector ranking in hybrid fusion / scoreFusion",
        example=0.5,
    )
    weightText: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        title="Text Weight",
        description="(Only used if option=4) Weight for text ranking in hybrid fusion / scoreFusion",
        example=0.5,
    )
    fusionMode: Optional[str] = Field(
        None,
        pattern=r"^(rrf|scoreFusion)$",
        title="Fusion Mode",
        example="rrf",
        description="(Only used if option=4) 'rrf' (default) or 'scoreFusion' to combine text + vector results"
    )

    brandAmplification: Optional[List[BrandBoost]] = Field(
        None,
        title="Brand Amplification",
        example=[{"name": "Oatly", "boostLevel": 3}, {"name": "Alpro", "boostLevel": 2}],
        description="Optional list of brands to boost in ranking; only supported for options 2, 3, 4"
    )

    @validator("brandAmplification", each_item=False)
    def _validate_brand_amp_not_empty(cls, value):
        if value is not None and len(value) == 0:
            raise ValueError("brandAmplification list, if provided, must contain at least one item")
        return value

    def __init__(self, **data):
        safe = {
            "query": (data.get("query") or "")[:64],
            "storeObjectId": data.get("storeObjectId"),
            "option": data.get("option"),
            "page": data.get("page"),
            "page_size": data.get("page_size"),
            "fusionMode": data.get("fusionMode"),
            "weights": {
                "text": data.get("weightText"),
                "vector": data.get("weightVector"),
            },
            "brandAmpCount": len(data.get("brandAmplification") or []),
        }
        logger.info("📥 [INTERFACES/schemas] Incoming SearchRequest v2 | %s", safe)
        super().__init__(**data)


# ─────────────────────────────── Response Schema ────────────────────────────────
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
    """
    DTO for product in the response.  
    Defines what fields are exposed to clients.  
    Fields like `isBoosted` help with explainability of brand amplification in results.
    """
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
    score: Optional[float] = Field(
        None,
        description="Relevance score from the selected strategy (text/vector/hybrid)",
    )
    isBoosted: bool = Field(
        False,
        description="True if this product's brand was boosted via brandAmplification"
    )

    def __init__(self, **data):
        logger.info("📦 [INTERFACES/schemas] Serializing ProductOut: %s", data.get("productName", "N/A"))
        super().__init__(**data)


class SearchResponse(BaseModel):
    total_results: int
    total_pages: int
    products: List[ProductOut]
    deployment: str = Field(
        ...,
        description="Deployment identifier (e.g., 'atlas' | 'enterprise')"
    )

    def __init__(self, **data):
        logger.info(
            "📤 [INTERFACES/schemas] Outgoing SearchResponse: %d products | total_results=%d",
            len(data.get("products", [])),
            data.get("total_results", 0)
        )
        super().__init__(**data)
