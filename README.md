# Empowering Store Associate - Unified Commerce with MongoDB Atlas



## Table of Contents

- [Demo Template: Python Backend with Next.js Frontend](#demo-template-python-backend-with-nextjs-frontend)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Prerequisites](#prerequisites)
  - [Getting Started](#getting-started)
    - [Create a New Repository](#create-a-new-repository)
    - [GitHub Desktop Setup](#github-desktop-setup)
    - [Backend Setup](#backend-setup)
  - [DEMO README](#demo-readme)

## Features

- Python backend with a RESTful API powered by [FastAPI](https://fastapi.tiangolo.com/)
- Next.js frontend for a responsive user interface
- Dependency management with Poetry ([More info](https://python-poetry.org/docs/basic-usage/))
- Easy setup and configuration

## Prerequisites

Before you begin, ensure you have met the following requirements:

- Python >=3.10,<3.11 - If you are Mac user, you can install Python 3.10.11 using this [link](https://www.python.org/ftp/python/3.10.11/python-3.10.11-macos11.pkg).
- Node.js 14 or higher
- Poetry (install via [Poetry's official documentation](https://python-poetry.org/docs/#installation))

## Getting Started

Follow these steps to set up the project locally.

### Backend Setup

1. (Optional) Set your project description and author information in the `pyproject.toml` file:
   ```toml
   description = "Your Description"
   authors = ["Your Name <you@example.com>"]
2. Open the project in your preferred IDE (the standard for the team is Visual Studio Code).
3. Open the Terminal within Visual Studio Code.
4. Ensure you are in the root project directory where the `makefile` is located.
5. Execute the following commands:
  - Poetry start
    ````bash
    make poetry_start
    ````
  - Poetry install
    ````bash
    make poetry_install
    ````
6. Verify that the `.venv` folder has been generated within the `/backend` directory.

### Frontend Setup

1. Navigate to the `frontend` folder.
2. Install dependencies by running:
```bash
npm install
```
3. Start the frontend development server with:
````bash
npm run dev
````
4. The frontend will now be accessible at http://localhost:3000 by default, providing a user interface.
