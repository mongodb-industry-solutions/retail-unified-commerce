# app/application/ports.py
"""
Application‑level abstraction interfaces (“ports”).

Why?
-----
Ports define the contracts the *application* layer relies on.
Concrete adapters in the *infrastructure* layer (MongoDB, Elastic, mocks …)
implement these contracts, so business logic remains I/O‑agnostic.

Conventions
-----------
Every search method returns:
    Tuple[List[Dict], int]  →  (documents, total_count)

Shared parameters:
    store_object_id • page • page_size
"""

from typing import Protocol, List, Dict, Tuple, Optional

# Readability alias for return types
SearchResult = Tuple[List[Dict], int]

# ───────────────────────────── Embeddings ──────────────────────────────
class EmbeddingProvider(Protocol):
    """Interface for embedding generation providers."""

    async def create_embedding(self, text: str) -> List[float]: ...

# ─────────────────────── Product‑search repository ─────────────────────
class SearchRepository(Protocol):
    """Repository interface for product search strategies."""

    # Option 1 – keyword / regex
    async def search_keyword(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> SearchResult: ...

    # Option 2 – Atlas text index
    async def search_atlas_text(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> SearchResult: ...

    # Option 3 – Lucene k‑NN vector search
    async def search_by_vector(
        self,
        embedding: List[float],
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> SearchResult: ...

    # Option 4 – Hybrid RRF (text + vector)
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
    ) -> SearchResult: ...
