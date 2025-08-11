# ADR 2025-07 — Using Clean Architecture in the Advanced Search Microservice for Educational Value

**Date:** July 2025

## Decision
We structured the Advanced Search microservice using Clean Architecture to teach a maintainable, extensible design pattern. While the demo’s scale doesn’t require this level of layering, it makes the code easier to navigate for someone learning both MongoDB search capabilities and backend architecture.

## Why in a Demo Context
- **Highlight separation of concerns:** Clearly illustrates where business rules live in the **application layer**, where the **domain layer** defines core entities, where the **interface layer** handles the application’s entry points (API endpoints), and where the **infrastructure layer** integrates with external services such as MongoDB (query building) and Voyage AI (query embedding generation).
- **Improve clarity for learners:** Allows anyone running the demo to understand exactly where to add or change logic, swap embedding providers, or adjust query pipelines without affecting unrelated parts of the code.
- **Show real-world readiness:** Even in a small demo, demonstrating a production-friendly structure gives users a pattern they can apply in their own projects.
- **Enable isolated experimentation:**  Demo users can swap embedding providers, adjust weights, or add new search modes without touching unrelated layers.


 ## Structure

This service follows Clean Architecture with explicit **ports/adapters** and two core patterns: **Template Method** (use cases) and **Repository** (data access). Each layer owns a narrow set of responsibilities.

### Interface Layer
HTTP entry points and I/O contracts.
- **FastAPI** router: `app/interfaces/routes.py` selects the use case (options 1–4), invokes `execute()`, and returns a typed response.
- **Schemas**: `app/interfaces/schemas.py` (Pydantic) validate input/output and generate OpenAPI docs.

### Application Layer
Orchestrates search flows and standardizes behavior (logging, input handling, and mapping of infrastructure errors to use‑case errors). RRF weighting and strategy selection happen here; query timeouts are enforced in infrastructure adapters.
- **Template Method**  
  We use a Template Method in `SearchUseCase.execute()` (see `app/application/use_cases/base.py`) to define the common search flow once (validate inputs, log, map infra errors to `UseCaseError`).  
  Concrete use cases only override `_run_repo_query()` with their specific strategy.  
  This keeps the execution flow consistent, eliminates duplicated logic, and ensures variable parts (embeddings, default weights, repository call) have a clear, maintainable place in the code.
- **Ports & Adapters (Dependency Inversion)**  
  We expose ports in `app/application/ports.py`:
  - `SearchRepository` — data access contract for keyword/text/vector/hybrid.
  - `EmbeddingProvider` — embedding contract so the app stays provider‑agnostic.
  Concrete adapters live in Infrastructure (Mongo repository, Voyage client).  
  It demonstrates clean boundaries: use cases depend on **abstractions**, not concrete drivers. Swapping Mongo query details or the embedding provider doesn’t touch the application layer, making tests and future changes easier.

### Infrastructure Layer

Contains the code that connects the application to external systems.
- **MongoDB**  
  - `app/infrastructure/mongodb/client.py`: wraps the Motor async client and configures connection pooling.
  - `.../search_repository.py`: implements the `SearchRepository` port, runs MongoDB aggregation pipelines.
- `.../pipelines/*`: contains the aggregation framework pipelines for each search type, stored in separate files to make them easier to read and analyze.
- **Embedding Provider**  
  - `app/infrastructure/voyage_ai/client.py`: calls Voyage AI with HTTP timeouts and retries/backoff using Tenacity.  
  - Follows the `EmbeddingProvider` port so the provider can be swapped without changing use cases.


### Domain Layer
Canonical models and lightweight invariants used across use‑cases:
- Typed entities (`Product`, `InventoryItem`, `Price`) and basic validations used to keep responses consistent.
- Pragmatic for the demo; deeper separation (e.g., pure mappers, stricter invariants) can be applied in production.

---

## Pros
- **Educational value:** Makes the demo’s architecture more educational for developers learning MongoDB search patterns.  
- **Best practices:** Encourages good practices for structuring search in MongoDB projects.  
- **Extensibility:** Facilitates adding future features like personalization, rerankers, or multimodal (image/text) search.  
- **Provider flexibility:** Embedding provider can be swapped (e.g., Voyage AI → Bedrock) with minimal code changes, thanks to the adapter pattern in the infrastructure layer.

## Cons

More boilerplate code than a minimal demo would need.

Slightly longer learning curve for first-time viewers.

