# --------------------------------------------------
# 🛠️ Build & Run Services with Docker Compose
# --------------------------------------------------

# Build both frontend and backend containers
build:
	docker-compose up --build -d

# Start existing containers (without rebuilding)
start:
	docker-compose start

# Stop running containers
stop:
	docker-compose stop

# Remove containers, volumes, and images
clean:
	docker-compose down --rmi all -v

# View real-time logs from all containers
logs:
	docker-compose logs -f

# View logs only from the frontend service
logs_frontend:
	docker-compose logs -f frontend

# View logs only from the backend service
logs_backend:
	docker-compose logs -f advanced-search-ms

# --------------------------------------------------
# 🐍 Poetry Setup (for local backend development)
# --------------------------------------------------

# Install Poetry globally using pipx (for Mac users)
install_poetry:
	brew install pipx
	pipx ensurepath
	pipx install poetry==1.8.4

# Set Poetry to use local virtual environments (within backend folder)
poetry_start:
	cd backend && poetry config virtualenvs.in-project true

# Install all Python dependencies
poetry_install:
	cd backend && poetry install --no-interaction -v --no-cache --no-root

# Update Python dependencies
poetry_update:
	cd backend && poetry update
