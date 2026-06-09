# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`lstm-2` is an early-stage Python 3.13 project. The application entry point is `main.py`. The `mysql/` directory contains a standalone MariaDB service managed via Docker Compose, intended as the project's database backend.

## Environment Setup

Python version is pinned to 3.13 via `.python-version` (used by `pyenv`). A virtual environment is expected at `.venv/`.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Running the App

**Backend (FastAPI):**
```bash
.venv/bin/python -m uvicorn src.api.main:app --reload --port 8000
```
Swagger UI: `http://localhost:8000/docs`

**Frontend (React + Vite):**
```bash
cd src/frontend && npm run dev
```
Dev server: `http://localhost:5173`

## Architecture

This is a full-stack app: Python FastAPI backend + React frontend, sharing a remote MariaDB database.

**Backend (`src/api/`)** — SQLAlchemy 2.x ORM (sync), PyMySQL driver. All table models live in `src/api/models/` and inherit from `src/api/models/base.py`'s `Base`. All `__tablename__` values must be prefixed `lstm_2_`. On startup, `main.py` calls `Base.metadata.create_all()` so tables are created automatically. Routes are organised into routers in `src/api/routers/` and registered in `main.py`. Pydantic schemas for request/response validation live in `src/api/schemas/`. Database connection is wired in `src/api/database.py` via `get_db()` dependency injection. CORS is open to `http://localhost:5173` (Vite dev server).

**Frontend (`src/frontend/`)** — Vite + React 18 (JavaScript). TailwindCSS v4 loaded via `@tailwindcss/vite` plugin; no config file needed. Routing: `BrowserRouter` in `main.jsx`, `Routes`/`Route` in `App.jsx`, shared nav in `components/Layout.jsx` using React Router's `<Outlet>`. Pages live in `src/frontend/src/pages/`. API calls use the native `fetch` API pointed at `http://localhost:8000`.

**Adding a new resource:**
1. Model in `src/api/models/<name>.py` (prefix table `lstm_2_`)
2. Import it in `src/api/main.py` so `Base` registers it
3. Schema in `src/api/schemas/<name>.py`
4. Router in `src/api/routers/<name>.py`, register in `main.py`
5. Page in `src/frontend/src/pages/<Name>.jsx`, add route in `App.jsx` and nav link in `Layout.jsx`

**Project direction log:** `docs/REQUESTS.md`

---

## Database (MariaDB via Docker)

The database is a separate service in `mysql/`. It requires its own `.env` file at `mysql/.env`.

```bash
# Start the database
cd mysql && docker compose up -d

# Connect interactively
docker exec -it mysql_db mysql -uroot -p

# Verify running version
docker exec mysql_db mysql -V

# Backup data volume
docker run --rm -v mariadb_data:/data -v $(pwd)/backup:/backup ubuntu tar cvf /backup/mariadb_backup_$(date +%F).tar /data
```

Database: `app_db`, default port `3306`. A GUI client (DBeaver) can connect to the host running Docker at port 3306.

MariaDB is tuned for a low-resource host in `mysql/mysql-conf/my.cnf` — `innodb_buffer_pool_size` is set to 256M and can be reduced to 128M if the host is memory-constrained.

## Database Users

Two DB users are documented in `mysql/NOTES.md`:
- `app_user` — full access from the local subnet (`192.168.142.0/24`), used for development/DBeaver access
- `api_user` — restricted to `SELECT/INSERT/UPDATE/DELETE` from `localhost`, intended for application use
