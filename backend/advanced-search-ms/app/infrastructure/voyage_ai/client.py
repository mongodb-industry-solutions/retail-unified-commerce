# app/infrastructure/voyage_ai/client.py
"""
Infrastructure layer – Voyage AI HTTP client

This adapter lives in the **Infrastructure** ring of our Clean Architecture.
Its single responsibility is to call the external **Voyage AI** REST API and
return a text **embedding** so the application layer can perform semantic
search with MongoDB Atlas `$vectorSearch`.

Key points
----------
* **Retries** – 3 attempts with exponential back‑off (Tenacity).
* **Timeout** – 5 s per request via `httpx.AsyncClient`.

"""

from __future__ import annotations

import logging
from typing import Dict, List

import httpx
from tenacity import before_log, retry, stop_after_attempt, wait_exponential

from app.shared.exceptions import InfrastructureError

logger = logging.getLogger("advanced-search-ms.infra.voyage")


class VoyageClient:
    """Thin async wrapper around the Voyage AI `/embeddings` endpoint."""

    def __init__(self, api_key: str, base_url: str, model: str) -> None:
        self.base_url = base_url.rstrip("/")  # avoid double "//"
        self.model = model
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    # ------------------------------------------------------------------ #
    # Embeddings                                                         #
    # ------------------------------------------------------------------ #

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(min=0.1, max=1),
        before=before_log(logger, logging.WARNING),
    )
    async def create_embedding(self, text: str) -> List[float]:
        """Return a dense vector for *text* using Voyage AI.

        This method is called by the **Application layer** (use‑case) and is the
        only outward HTTP hop in the semantic‑search flow.

        Raises
        ------
        InfrastructureError
            On network issues, HTTP 4xx/5xx, or malformed response bodies.
        """
        logger.info("[INFRA/voyage_ai] ↗️  Embedding request: %r", text[:80])

        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.post(
                    f"{self.base_url}/embeddings",
                    json={"input": text, "model": self.model},
                    headers=self.headers,
                )
                resp.raise_for_status()

                data: Dict = resp.json()
                embedding: List[float] | None = (
                    data.get("data", [{}])[0].get("embedding")  # type: ignore[index]
                )
                if not embedding:
                    raise ValueError("Voyage returned empty embedding")

                logger.info("[INFRA/voyage_ai] ✅ Embedding length=%d", len(embedding))
                return embedding

        except Exception as exc:  # noqa: BLE001
            logger.error("[INFRA/voyage_ai] ❌ Embedding API error: %s", exc)
            raise InfrastructureError(f"Embedding API failed: {exc}") from exc
