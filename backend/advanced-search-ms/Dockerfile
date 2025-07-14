# Use lightweight Python image
FROM python:3.11-slim

# Install system dependencies for Poetry
RUN apt-get update && apt-get install -y curl build-essential && \
    curl -sSL https://install.python-poetry.org | python3 - && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Add Poetry to PATH
ENV PATH="/root/.local/bin:$PATH"

# Set working directory
WORKDIR /app

# Copy only Poetry files first (to cache dependencies)
COPY pyproject.toml poetry.lock* ./

# Install dependencies without virtualenvs
RUN poetry config virtualenvs.create false && \
    poetry install --no-interaction --no-ansi

# Copy the rest of the application code
COPY . .

# Expose backend port
EXPOSE 8000

# Run FastAPI with Uvicorn (adjust `main:app` if needed)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
