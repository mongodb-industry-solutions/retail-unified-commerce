# app/shared/config.py
"""
Configuration loader using Pydantic BaseSettings.

Purpose: Centralizes environment-based settings for all layers.
Why: Ensures secure, type-checked config and support for .env files.
How: Defines a Settings class and `get_settings` to instantiate it.
"""

from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # MongoDB
    MONGODB_URI: str
    MONGODB_DATABASE: str
    PRODUCTS_COLLECTION: str
    SEARCH_INDEX_NAME: str = "default"
    EMBEDDING_FIELD_NAME: str = "textEmbeddingVector"

    # Voyage AI
    VOYAGE_API_URL: str = "https://api.voyage.ai"
    VOYAGE_API_KEY: str
    VOYAGE_MODEL: str = "voyage-2"  # Embedding/rerank model ID: str
    VOYAGE_API_URL: str = "https://api.voyage.ai"

    class Config:
        env_file = ".env"


def get_settings() -> Settings:
    return Settings()