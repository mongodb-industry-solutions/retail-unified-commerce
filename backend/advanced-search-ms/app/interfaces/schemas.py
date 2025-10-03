# app/interfaces/schemas.py

"""
Pydantic schemas for API layer (request & response).

• Defines strict input/output validation and OpenAPI docs.
• Keeps FastAPI decoupled from domain logic.

Contract highlights (v2):
- Supports 4 strategies (option=1..4).
- Brand Amplification (options 2–4): optional list [{ name, boostLevel(1..3), categories?: string[] }].
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
    # NEW: optional categories for brand+category amplification (legacy format extension)
    categories: Optional[List[str]] = Field(
        None,
        example=["Face Care", "Beverages"],
        description="Optional list of categories. If provided, the boost applies only when both brand and category match."
    )

    @validator("categories")
    def _validate_categories(cls, v):
        if v is None:
            return v
        if not isinstance(v, list):
            raise ValueError("categories must be a list of strings")
        if any((not isinstance(c, str) or not c.strip()) for c in v):
            raise ValueError("each category must be a non-empty string")
        return [c.strip() for c in v]


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
        title="Brand Amplification (legacy format)",
        example=[
            {"name": "Oatly", "boostLevel": 3},
            {"name": "Alpro", "boostLevel": 2, "categories": ["Fresho"]}
        ],
        description=(
            "Optional list of brands to boost in ranking; only supported for options 2, 3, 4. "
            "If 'categories' is provided, the boost applies when both brand and category match."
        )
    )

    @validator("brandAmplification", each_item=False)
    def _validate_brand_amp_not_empty(cls, value):
        if value is not None and len(value) == 0:
            raise ValueError("brandAmplification list, if provided, must contain at least one item")
        return value

    def __init__(self, **data):
        brand_amp = data.get("brandAmplification") or []
        brand_amp_with_cats = sum(1 for b in brand_amp if isinstance(b, dict) and b.get("categories")) or \
                              sum(1 for b in brand_amp if hasattr(b, "categories") and getattr(b, "categories") is not None)
        brand_amp_cats_total = (
            sum(len(b.get("categories") or []) for b in brand_amp if isinstance(b, dict)) +
            sum(len(getattr(b, "categories") or []) for b in brand_amp if not isinstance(b, dict))
        )

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
            "brandAmpCount": len(brand_amp),
            "brandAmpWithCats": brand_amp_with_cats,
            "brandAmpCatsTotal": brand_amp_cats_total,
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
