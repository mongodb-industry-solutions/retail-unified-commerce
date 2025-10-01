# domain/brand_amplification.py

from __future__ import annotations

import logging
from typing import List, Optional

from pydantic import BaseModel, Field, validator

logger = logging.getLogger("advanced-search-ms.domain")


class BrandAmplification(BaseModel):
    """
    Domain model for brand amplification input (legacy-compatible).

    Represents a request to boost certain brands in search ranking.

    Invariants:
      • boostLevel must be 1, 2, or 3
      • if categories are provided, they must be non-empty strings

    Notes:
      • `categories` is optional. If provided, the boost is intended for brand+category matches.
      • Domain layer only validates intent; mapping boostLevel → numeric factors is handled in infra.
    """

    name: str = Field(
        ...,
        min_length=1,
        description="Brand name to boost (exact match with product.brand)",
    )
    boostLevel: int = Field(
        ...,
        description="Boost intensity level: 1 = low, 2 = medium, 3 = high",
    )
    categories: Optional[List[str]] = Field(
        None,
        description=(
            "Optional list of categories where the boost applies (brand+category). "
            "If omitted/empty → brand-only."
        ),
    )

    @validator("boostLevel")
    def check_boost_level(cls, v: int) -> int:
        if v not in {1, 2, 3}:
            logger.error(
                "❌ [DOMAIN] Invalid boostLevel=%s in BrandAmplification; must be 1, 2, or 3",
                v,
            )
            raise ValueError("boostLevel must be one of [1, 2, 3]")
        return v

    @validator("categories")
    def check_categories(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        if not isinstance(v, list):
            raise ValueError("categories must be a list of strings")
        cleaned = [c.strip() for c in v if isinstance(c, str) and c.strip()]
        if len(cleaned) != len(v):
            raise ValueError("each category must be a non-empty string")
        return cleaned
