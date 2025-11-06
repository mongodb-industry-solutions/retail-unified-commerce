#############################
# 1️⃣ Build Stage
#############################
FROM python:3.11-slim AS builder
WORKDIR /app

# ── Install Poetry + build prerequisites
RUN apt-get update && apt-get install -y curl build-essential && \
    curl -sSL https://install.python-poetry.org | python3 - && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
ENV PATH="/root/.local/bin:$PATH"

# ── Copy only manifest files to leverage Docker cache
COPY pyproject.toml poetry.lock* ./

# ── Install deps into the system (no venv)
RUN poetry config virtualenvs.create false && \
    poetry install --no-interaction --no-ansi

# ── Copy application source code
COPY . .

#############################
# 2️⃣ Runtime Stage
#############################
FROM python:3.11-slim
WORKDIR /app

# ── Copy the dependencies layer from builder
COPY --from=builder /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY --from=builder /usr/local/bin /usr/local/bin

# ── Copy the application code
COPY --from=builder /app .

# ── Note: Environment variables will be injected by Kanopy at runtime
#    via envSecrets configuration (no .env file needed)

# ── Expose API port (Kanopy standard)
EXPOSE 8080

# ── Start FastAPI with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
