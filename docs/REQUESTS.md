# Project Requests & Direction

A running log of feature requests and direction decisions for `lstm-2`.

---

## [2026-06-08] Initial full-stack scaffold

**Request:** Build a learning-focused full-stack scaffold with:
- FastAPI REST API backend (`src/api/`) connected to MariaDB via `.env`
- All DB tables prefixed with `lstm_2_`
- React (vanilla JS) + TailwindCSS v4 + React Router DOM frontend (`src/frontend/`)
- URL-routed pages with a shared layout/nav
- First example resource: `lstm_2_stocks` (CRUD)

**Outcome:** Established the project skeleton. Backend runs on `localhost:8000`, frontend dev server on `localhost:5173`. Swagger UI at `localhost:8000/docs`.
