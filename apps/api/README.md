# CarsWash API

FastAPI backend for CarsWash. Managed with [uv](https://docs.astral.sh/uv/).

## Develop

```bash
uv sync                                   # install deps into .venv
uv run uvicorn app.main:app --reload      # http://127.0.0.1:8000
uv run pytest                             # tests
```

- Health check: `GET /health` → `{"status": "ok"}`
- OpenAPI docs: `/docs` · schema: `/openapi.json`

Configuration comes from the environment / `.env` (see `.env.example`).
