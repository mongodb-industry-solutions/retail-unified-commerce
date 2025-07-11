# ADR: Using Template Method Pattern for Search Use Cases

**Date:** July 2025

---

## **Context**

In our **advanced-search-ms** microservice, we implement **four different search strategies**:

1. **Keyword / Regex Search**
2. **Atlas Text Search**
3. **Vector Search**
4. **Hybrid RRF Search**

All of them follow **the same high-level flow**:

1. Validate and process inputs.  
2. Call the appropriate **repository method** (and **embedding provider** if needed).  
3. Map raw MongoDB documents to **Product domain objects**.

Initially, each use case was implemented separately, resulting in duplicated logic and inconsistencies in error handling and observability.

---

## **Decision**

We adopted the **Template Method Pattern** by:

- Creating an **abstract base class**: `SearchUseCase` in `app/application/use_cases/base.py`, defining the general `execute()` logic.
- Declaring an **abstract method** `_run_repo_query()` to be implemented by each **concrete search use case subclass**.
- Implementing **concrete use cases** (e.g. `KeywordSearchUseCase`, `VectorSearchUseCase`) that inherit from this base class and implement `_run_repo_query()` with their specific strategy logic.

---

## **What is the Template Method Pattern?**

**Template Method** is a behavioral design pattern that:

✅ **Defines the skeleton of an algorithm in the base class** (here, `execute()`).  
✅ **Allows subclasses to override certain steps** (here, `_run_repo_query()`).

In our implementation:

- The **base class (`SearchUseCase`) defines the overall flow** of executing a search.
- **Subclasses implement only the variable part** (repository query strategy) by overriding `_run_repo_query()`.

---

## **How are inheritance and polymorphism used?**

🧠 **Inheritance**:

- All concrete use cases **extend `SearchUseCase`**, inheriting its `execute()` method logic (input logging, error handling, mapping).

🔄 **Polymorphism**:

- The controller (route) **calls `use_case.execute()` without knowing which concrete subclass is used**.  
- Each subclass executes its own `_run_repo_query()` implementation, thanks to polymorphism.

For example:

- `KeywordSearchUseCase` implements `_run_repo_query()` calling `repo.search_keyword(...)`.
- `VectorSearchUseCase` implements `_run_repo_query()` calling `repo.vector_search(...)` and uses the embedder.

---

## **Why did we choose Template Method?**

✅ **Standardizes the search use case flow** across strategies.  
✅ **Eliminates duplication** (shared logging, error handling, and mapping).  
✅ **Makes it easy to add new strategies** by creating a new subclass with minimal code.  
✅ **Improves maintainability** by localizing changes to strategy logic without modifying the base flow.  
✅ **Aligns with Clean Architecture** by keeping the use-case orchestration logic consistent.

---

## **Consequences**

- **Adding a new strategy** only requires creating a new subclass implementing `_run_repo_query()`.
- All new use cases **automatically inherit observability, error handling, and mapping logic**.
- There is **tight coupling via inheritance**, but this is acceptable here because all search strategies share the same conceptual domain flow.

---

> _“Define the invariant parts of an algorithm once and let subclasses define the behavior of each variant step.”_ – Template Method Pattern principle.

