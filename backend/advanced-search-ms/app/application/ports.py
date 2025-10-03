# app/application/ports.py
"""
Application-level abstraction interfaces (“ports”).

Why?
-----
Ports define the contracts the *application* layer relies on.
Concrete adapters in the *infrastructure* layer (MongoDB, Voyage AI, mocks …)
implement these contracts, so business logic remains I/O-agnostic.

Conventions
-----------
Every search method returns:
    SearchResult = Tuple[List[Dict], int]  →  (documents, total_count)

Shared parameters:
    store_object_id • page • page_size

Brand Amplification (App-local spec)
------------------------------------
Use `BrandAmpSpec` (TypedDict) to keep Application ↔ Domain decoupled.
Infra is responsible for translating:
  - `boostLevel` (1|2|3) → numeric weights/factors/boosts
  - optional `categories` → brand+category-specific rules
"""

from __future__ import annotations

from typing import Dict, List, Optional, Protocol, Sequence, Tuple, TypedDict, Literal

# Readability alias for return types
SearchResult = Tuple[List[Dict], int]


# ───────────────────── Brand amplification typing (app-local) ─────────────────────
class BrandAmpSpec(TypedDict, total=False):
    """
    Minimal, app-local spec to avoid coupling Application ↔ Domain.

    name         → brand name to match against product.brand
    boostLevel   → 1 (low), 2 (medium), 3 (high)
    categories   → optional list of categories for brand+category rules
    """
    name: str
    boostLevel: int
    categories: List[str]


# ───────────────────────────── Embeddings ──────────────────────────────
class EmbeddingProvider(Protocol):
    """Interface for embedding generation providers."""
    async def create_embedding(self, text: str) -> List[float]: ...


# ─────────────────────── Product-search repository ─────────────────────
class SearchRepository(Protocol):
    """Repository interface for product search strategies."""

    # Option 1 – keyword / regex (no brand amplification)
    async def search_keyword(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> SearchResult: ...

    # Option 2 – Atlas text index (supports brand amplification)
    async def search_atlas_text(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
        *,
        brand_amplification: Optional[Sequence[BrandAmpSpec]] = None,
    ) -> SearchResult: ...

    # Option 3 – Lucene k-NN vector search (supports brand amplification)
    async def search_by_vector(
        self,
        embedding: List[float],
        store_object_id: str,
        page: int,
        page_size: int,
        *,
        brand_amplification: Optional[Sequence[BrandAmpSpec]] = None,
    ) -> SearchResult: ...

    # Option 4 – Hybrid (text + vector) with RRF / score fusion
    async def search_hybrid_rrf(
        self,
        query: str,
        embedding: List[float],
        store_object_id: str,
        page: int,
        page_size: int,
        *,
        weight_vector: Optional[float] = None,
        weight_text:   Optional[float] = None,
        fusion_mode:   Optional[Literal["rrf", "scoreFusion"]] = None,
        brand_amplification: Optional[Sequence[BrandAmpSpec]] = None,
    ) -> SearchResult: ...
