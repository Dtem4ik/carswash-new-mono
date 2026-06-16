"""Application configuration sourced from the environment (pydantic-settings).

No secrets live in code. Real values come from the environment or a local
``.env`` file (git-ignored); see ``.env.example`` for the expected keys.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables / ``.env``."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "CarsWash API"
    env: str = "development"


settings = Settings()
