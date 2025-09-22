# domain/brand_amplification.py

from __future__ import annotations
import logging
from pydantic import BaseModel, Field, validator

logger = logging.getLogger("advanced-search-ms.domain")

class BrandAmplification(BaseModel):
    """
    Domain model for brand amplification input.

    Represents a request to boost certain brands in search ranking.
    Enforces business invariant: boostLevel must be 1, 2, or 3.
    Provides a boost_factor to apply on product score.
    """

    name: str = Field(..., min_length=1, description="Brand name to boost (exact match with product.brand)")
    boostLevel: int = Field(..., description="Boost intensity: 1 = low, 2 = medium, 3 = high")

    @validator("boostLevel")
    def check_boost_level(cls, v: int) -> int:
        if v not in {1, 2, 3}:
            logger.error("❌ [DOMAIN] Invalid boostLevel=%s in BrandAmplification; must be 1, 2, or 3", v)
            raise ValueError("boostLevel must be one of [1,2,3]")
        return v

    def boost_factor(self) -> float:
        """
        Returns a base multiplier to apply to product score based on boostLevel.
        Can be used by Use Cases to adjust ranking.
        """
        mapping = {
            1: 1.1,   # low boost
            2: 1.25,  # medium boost
            3: 1.5    # high boost
        }
        return mapping[self.boostLevel]
