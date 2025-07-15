# ------------------------------------------------------------------
# 🐳  Docker Compose shortcuts
# ------------------------------------------------------------------
DC := docker compose        # alias para abreviar

## 🔄  Build & (re)create everything
build:
	$(DC) up --build -d

## ▶️  Start (no rebuild)
start:
	$(DC) start

## ⏹️  Stop containers
stop:
	$(DC) stop

## 🧹  Tear down + clean images & volumes
clean:
	$(DC) down --rmi all -v

## 📜  Tail all logs
logs:
	$(DC) logs -f

# ---------- Frontend shortcuts ----------
front-build:
	$(DC) build nextjs-app

front-up:
	$(DC) up -d nextjs-app

front-stop:
	$(DC) stop nextjs-app

front-logs:
	$(DC) logs -f nextjs-app

# ---------- Backend shortcuts ----------
back-build:
	$(DC) build advanced-search-ms

back-up:
	$(DC) up -d advanced-search-ms

back-stop:
	$(DC) stop advanced-search-ms

back-logs:
	$(DC) logs -f advanced-search-ms