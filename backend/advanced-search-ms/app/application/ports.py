# app/application/ports.py
"""
Application-level abstraction interfaces (“ports”).

Why?
-----
Ports define the contracts the *application* layer relies on.  
Concrete adapters in the *infrastructure* layer (Mongo, Elastic, etc.)
implement these contracts, so business logic remains I/O-agnostic.

Conventions
-----------
Every search method returns:
    Tuple[List[Dict], int]  →  (documents, total_count)

Shared parameters:
    store_object_id • page • page_size
"""

from typing import Protocol, List, Dict, Tuple

# Readability alias for return types
SearchResult = Tuple[List[Dict], int]


# ─────────────────────────── Embeddings ────────────────────────────────────
class EmbeddingProvider(Protocol):
    """
    Interface for embedding generation providers.

    Example usage:
    --------------
    embedder = SomeEmbeddingAdapter()
    vector = await embedder.create_embedding("text to embed")

    Logs (didactic):
    - [PORT] EmbeddingProvider called with text="..." returns embedding vector.
    """
    async def create_embedding(self, text: str) -> List[float]: ...


# ───────────────────── Product-search repository ───────────────────────────
class SearchRepository(Protocol):
    """
    Defines the repository interface for product search.

    Why we use it:
    --------------
    - Decouples the *what* from the *how* (clean architecture principle).
    - Allows swapping implementations (MongoDB, ElasticSearch, mocks) without changing use-cases.
    - Simplifies testing by mocking this protocol in unit tests.

    Strategies match the `option` parameter used by the HTTP API:
        1 → keyword / regex search
        2 → Atlas `$search` text index
        3 → Lucene `$vectorSearch`
        4 → hybrid Reciprocal-Rank-Fusion (text + vector)

    Logs (didactic):
    - Each method logs when it is called, input parameters, and total results fetched.
    """

    # option 1 – keyword / regex
    async def search_keyword(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> SearchResult:
        """
        Searches products using simple regex on `productName`.
        Logs:
        - [PORT] search_keyword called with query="..." store="..." page=.. page_size=..
        """
        ...

    # option 2 – Atlas text index
    async def search_atlas_text(
        self,
        query: str,
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> SearchResult:
        """
        Searches using MongoDB Atlas Search text index.
        Logs:
        - [PORT] search_atlas_text called with query="..." store="..." page=.. page_size=..
        """
        ...

    # option 3 – Lucene k-NN vector search
    async def search_by_vector(
        self,
        embedding: List[float],
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> SearchResult:
        """
        Searches products by vector similarity using Lucene.
        Logs:
        - [PORT] search_by_vector called with store="..." embedding length=... page=.. page_size=..
        """
        ...

    # option 4 – Hybrid RRF (text + vector)
    async def search_hybrid_rrf(
        self,
        query: str,
        embedding: List[float],
        store_object_id: str,
        page: int,
        page_size: int,
    ) -> SearchResult:
        """
        Combines text and vector search results using Reciprocal Rank Fusion.

        Logs:
        - [PORT] search_hybrid_rrf called with query="..." store="..." embedding length=... page=.. page_size=..
        """
        ...
