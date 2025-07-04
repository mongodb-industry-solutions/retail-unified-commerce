# app/infrastructure/voyage_ai/client.py
"""
Async HTTP client for Voyage AI (embeddings + re-rank).

* Retries (3× exponential back-off) around every outbound request.
* `/embeddings`  → returns a list[float] vector.
* `/rerank`      → takes a list[str] documents, returns
                   `[{"index": int, "score": float}, …]` in score-desc order.
"""

from __future__ import annotations

import logging
from typing import List, Dict

import httpx
from tenacity import before_log, retry, stop_after_attempt, wait_exponential

from app.shared.exceptions import InfrastructureError

logger = logging.getLogger("advanced-search-ms.infra")


class VoyageClient:
    """Thin async wrapper around the Voyage AI REST API."""

    def __init__(self, api_key: str, base_url: str, model: str) -> None:
        self.base_url = base_url.rstrip("/")  # protect against double “//”
        self.model = model
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    # --------------------------------------------------------------------- #
    #  Embeddings                                                            #
    # --------------------------------------------------------------------- #

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=0.1, max=1),
        before=before_log(logger, logging.WARNING),
    )
    async def create_embedding(self, text: str) -> List[float]:
        """
        POST /embeddings and return the vector.

        Raises
        ------
        InfrastructureError
            On network issues, 4xx/5xx, or malformed response.
        """
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.post(
                    f"{self.base_url}/embeddings",
                    json={"input": text, "model": self.model},
                    headers=self.headers,
                )
                resp.raise_for_status()

                data = resp.json()
                embedding: List[float] | None = (
                    data.get("data", [{}])[0].get("embedding")  # type: ignore[index]
                )

                if not embedding:
                    raise ValueError("Voyage returned empty embedding")

                return embedding

        except Exception as exc:  # noqa: BLE001
            logger.error(f"Embedding API error: {exc}")
            raise InfrastructureError(f"Embedding API failed: {exc}") from exc

    # --------------------------------------------------------------------- #
    #  Re-rank                                                               #
    # --------------------------------------------------------------------- #

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=0.1, max=1),
        before=before_log(logger, logging.WARNING),
    )
    async def rerank(
        self,
        query: str,
        documents: List[str],
        top_k: int,
    ) -> List[Dict[str, float]]:
        """
        POST /rerank and return list of {"index": int, "score": float}.

        Parameters
        ----------
        query : str
            The user query.
        documents : list[str]
            Plain-text representation of candidate docs (max 512 chars each).
        top_k : int
            How many best documents to return (≤ len(documents)).

        Raises
        ------
        InfrastructureError
            On network issues, 4xx/5xx, or malformed response.
        """
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.post(
                    f"{self.base_url}/rerank",
                    json={
                        "query": query,
                        "documents": documents,
                        "top_k": top_k,
                        "model": self.model,
                    },
                    headers=self.headers,
                )
                resp.raise_for_status()

                data = resp.json()
                if not isinstance(data.get("data"), list):
                    raise ValueError("Missing 'data' array in Voyage rerank response")

                # Already sorted by score desc
                return data["data"]  # type: ignore[return-value]

        except Exception as exc:  # noqa: BLE001
            logger.error(f"Re-rank API error: {exc}")
            raise InfrastructureError(f"Re-rank API failed: {exc}") from exc
