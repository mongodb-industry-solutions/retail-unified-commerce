WIP

# Unified Commerce – Workforce App Demo

This demo showcases a **Next.js frontend** and a **Python backend** working together to solve a real-world use case in retail. It is designed to help developers and solution architects understand how to combine powerful MongoDB features like **Atlas Vector Search**, **Triggers**, and **Document Modeling** to create intelligent, real-time search and data experiences.

---

## 🌐 Why Unified Commerce?

**Unified Commerce** aims to connect all customer touchpoints and backend systems (inventory, search, personalization, etc.) into a single, seamless platform.

Unlike multichannel or omnichannel approaches, unified commerce ensures:
- **Real-time data availability across channels** (in-store, online, etc.)
- **Consistent experiences** for customers and store associates
- **Faster innovation cycles** with centralized control

In this demo, we simulate a unified system where product search, inventory, and personalized data live in the same source of truth: **MongoDB Atlas**. Thanks to real-time updates, semantic search, and flexible modeling, we’re able to demonstrate how even a small team can deliver modern retail experiences at scale.

---

## 🎯 Demo Goals
- Empower store associates to **quickly locate and understand product availability**.
- Support intelligent **product discovery via advanced search**, especially helpful in multilingual or unfamiliar grocery contexts.
- Enable **predictive stock insights**, showcasing how MongoDB can serve as a unified data layer.
- Demonstrate how a **hybrid monolith with microservices** can still scale for real scenarios.

---

## 🛠️ What This Demo Does
- Provides a **Next.js-based frontend** for searching grocery items.
- Exposes an `advanced-search-ms` backend microservice that handles semantic vector search.
- Shows how to use **MongoDB Atlas Search** and **Voyage AI embeddings**.
- Integrates **real-time inventory metadata** through **Atlas Triggers**.
- Leverages **document modeling best practices** for scalability and readability.

---

## 🧩 Architecture Overview
- The frontend is a **mini-monolith** app built in Next.js that handles rendering and local API routes.
- A separate microservice (`advanced-search-ms`) exposes MongoDB’s vector search capabilities.
- MongoDB Atlas is used to store products, inventory, and pre-computed embeddings.
- Data is enriched offline, and updated in real-time using **Atlas Triggers**.

📁 We maintain a `docs/` folder with various **Architecture Decision Records (ADR)** where we explain our modeling and architectural decisions. These can be helpful for learning or adapting the architecture to your own needs depending on your level of experience.

We chose to separate the advanced search into its own microservice to highlight **MongoDB Atlas Vector Search** capabilities, while the rest of the data flow and logic lives in the frontend for simplicity—ideal for demo purposes.

---

## 🗂️ Folder Structure
```bash
retail-unified-commerce/
├── frontend/               # Next.js app
├── backend/
│   └── advanced-search-ms/  # Vector Search microservice (FastAPI)
├── docs/                  # ADRs, license tracking, helper scripts
├── docker-compose.yml     # Orchestrates both services
└── Makefile               # Useful commands for local development
```

---

## 🐳 Getting Started – Run All Together

### Prerequisites
- Docker & Docker Compose
- Python 3.11 & Poetry (if running microservices separately)
- Node.js v20 (if running frontend separately)

### Start Locally with Docker Compose
```bash
make build     # Builds images
make start     # Starts services
make logs      # Tails logs
```

---

## 🧪 Local Development Commands
```bash
make poetry_install     # Install backend dependencies
make poetry_update      # Update backend packages
make poetry_start       # Enable in-project virtualenv
make stop               # Stop all containers
make clean              # Tear down containers & images
```

---

## 🚀 Production Commands
To deploy this on AWS or another cloud provider:
- Build Docker images manually or via CI/CD.
- Ensure MongoDB Atlas credentials and `.env` files are securely injected.
- Configure services (frontend and microservices) with secure networking (e.g., via App Runner, ECS, etc.).

---

## ☁️ MongoDB Atlas Usage

By using MongoDB Atlas as our **unified operational data layer**, we gain:

- 📦 **Document flexibility** to model rich product and inventory data
- 🔍 **Atlas Search** with **Vector Search** for hybrid intent-based product discovery
- 🔁 **Atlas Triggers** to keep collections like `users`, `inventory`, and `recommendations` up to date
- ⚡ **Low-latency access** to both transactional and analytical queries from a single backend
- 🔐 **Integrated security, backup, and monitoring** out of the box

The embeddings used for product search are generated with **Voyage AI** and stored in a field `vai_text_embedding`. We use a **custom index** and the `$vectorSearch` operator to deliver fast, accurate, semantically rich search results.

---

## 📚 Related Demo Content Package
- This demo is part of the **MongoDB Retail Unified Commerce** initiative.
- Additional scripts, modeling decisions, and helper tools are available in the [`docs/`](./docs) folder.

---

## 👥 Authors
This project was made possible through a close collaboration between domain experts and technical implementers:

### Lead Authors (Use Case Ideation & Retail Implementation)
- Rodrigo Leal – Principal
- Prashant Juttukonda – Principal
- Genevieve Broadhead – Global Lead, Retail Solutions

### Developers & Maintainers (Technical Design & Implementation)
- Florencia Arin – Developer & Maintainer
- Angie Guemes – Developer & Maintainer

---

## ⭐ Give Back
If this repo added value to your learning or inspired your own projects, **giving it a star helps us share this work with more people and continue building impactful solutions.**

