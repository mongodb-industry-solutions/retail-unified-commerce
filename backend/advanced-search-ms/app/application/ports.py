# app/application/ports.py
"""
Application-level interfaces (ports).

Purpose: Define abstraction contracts for external services.
Why: Decouples use cases from concrete implementations, enabling testing and flexibility.
How: Use Python `Protocol` for method signatures.
"""

from typing import List, Tuple, Protocol, Dict

class EmbeddingProvider(Protocol):
    async def create_embedding(self, text: str) -> List[float]: ...
    async def rerank(self, query: str, documents: List[Dict]) -> List[Dict]: ...

class SearchRepository(Protocol):
    async def search_by_vector(
        self, embedding: List[float], page: int, page_size: int
    ) -> Tuple[List[Dict], int]: ...