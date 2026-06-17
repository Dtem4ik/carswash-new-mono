"""Print the FastAPI OpenAPI schema as JSON to stdout.

Used to regenerate the web's typed client without running a live server:

    uv run --directory apps/api python -m app.export_openapi > \
        packages/shared/openapi/schema.json

See ``packages/shared`` for the codegen step that consumes this file.
"""

from __future__ import annotations

import json

from app.main import app


def main() -> None:
    print(json.dumps(app.openapi(), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
