# ADR 2025-07 — Separating Advanced Search into a Microservice for Demonstration Purposes

**Date:** July 2025  

## Decision
For a small-scale demo, it would be simpler to keep advanced search logic inside the main app. However, we chose to split it into a dedicated microservice so we could highlight a modular, production-inspired architecture. This separation makes the search layer easier to explore in isolation, test independently, and reuse in future projects. It also lets us demonstrate best practices in query orchestration, boosting, fuzzy matching, and hybrid RRF without mixing them into UI code — giving the audience a clear reference for how they might structure search in a more complex, higher-demand application.

## Pros
- **Clean separation of concerns** for learning purposes.  
- **Extensible**: new retrieval methods (e.g., image search) can be added and deployed independently, without any downtime for the UI.
- **Unified API**: side-by-side comparison of search modes through one endpoint.

## Cons
- Slightly more setup complexity for users running the demo locally.