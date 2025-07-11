# ADR: Repository Pattern Implementation in Advanced Search Microservice


## Context

In our **Advanced Search Microservice**, we implemented the **Repository Pattern** as a core architectural decision.

### What is the Repository Pattern?

The Repository Pattern is a **design pattern** that:

- **Abstracts the data access logic** from the business logic.  
- Acts as a **mediator** between the domain and data mapping layers, providing a collection-like interface for accessing data.

In simple terms:

> **Controllers / use-cases do not care how data is persisted or queried; they only depend on the repository interface.**

---

## Decision

We created a **`SearchRepository` port** (interface) under `app.application.ports`, defining the contract for search operations.  
Then, we implemented **`MongoSearchRepository`** under `app.infrastructure.mongodb`, which:

- Provides multiple search strategies (keyword, Atlas text search, vector, hybrid RRF).  
- Connects to MongoDB using **Motor** (async driver).  
- Uses **aggregation pipelines** to efficiently query and filter data.

### Why we chose this pattern:

✅ **Separation of Concerns**  
The application logic (use-cases) focuses purely on orchestrating business operations, delegating data access to repositories.

✅ **Testability**  
We can mock the repository during unit tests, ensuring isolation of business logic without requiring a real database.

✅ **Flexibility & Maintainability**  
If we migrate from MongoDB to another data store or change query implementations (e.g. integrate a Search API), only the repository implementation needs updating, **not the use-cases or higher layers**.

✅ **Clean Architecture compliance**  
Repositories are a fundamental element of Clean Architecture, enforcing clear **boundaries** between application and infrastructure layers.

---

## Implementation Summary

🔧 **Interface:** `SearchRepository`  
Defined methods:

- `search_keyword()`
- `search_atlas_text()`
- `search_by_vector()`
- `search_hybrid_rrf()`

🔧 **Implementation:** `MongoSearchRepository`

- Uses aggregation pipelines with `$match`, `$facet`, and `$project` stages.  
- Filters results by store context (`storeObjectId`).  
- Returns **raw MongoDB documents**, keeping mapping responsibility in the use-cases.

---

## Consequences

✅ **Pros**

- Easier unit testing.  
- Increased modularity and adaptability.  
- Cleaner, business-focused use-cases.

⚠️ **Cons**

- Slightly higher initial implementation complexity.  
- Requires discipline to maintain separation and avoid coupling use-cases with MongoDB directly.

---

## References

- [Repository Pattern – Martin Fowler](https://martinfowler.com/eaaCatalog/repository.html)
- [Clean Architecture – Uncle Bob](https://8thlight.com/blog/uncle-bob/2012/08/13/the-clean-architecture.html)

---
