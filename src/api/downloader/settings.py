"""Application settings read from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass

from .errors import ConfigurationError

DEFAULT_ALPACA_BASE_URL = "https://data.alpaca.markets"
DEFAULT_DB_PORT = 3306


@dataclass(frozen=True)
class AlpacaSettings:
    api_key: str
    secret_key: str
    base_url: str = DEFAULT_ALPACA_BASE_URL


@dataclass(frozen=True)
class DatabaseSettings:
    host: str
    port: int
    user: str
    password: str
    database: str


class SettingsFactory:
    """Builds validated settings from already-loaded environment variables."""

    def alpaca(self) -> AlpacaSettings:
        api_key = os.getenv("ALPACA_API_KEY") or os.getenv("ALPACA_API_KEY_ID")
        secret_key = os.getenv("ALPACA_SECRET_KEY") or os.getenv("ALPACA_API_SECRET_KEY")
        base_url = os.getenv("ALPACA_DATA_BASE_URL", DEFAULT_ALPACA_BASE_URL).rstrip("/")

        missing = [n for n, v in (("ALPACA_API_KEY", api_key), ("ALPACA_SECRET_KEY", secret_key)) if not v]
        if missing:
            raise ConfigurationError(f"Missing required env var(s): {', '.join(missing)}")

        return AlpacaSettings(api_key=api_key or "", secret_key=secret_key or "", base_url=base_url)

    def database(self, database_override: str | None = None) -> DatabaseSettings:
        user = os.getenv("DB_USER") or os.getenv("MYSQL_USER")
        password = os.getenv("DB_PASSWORD") or os.getenv("MYSQL_PASSWORD")
        database = database_override or os.getenv("DB_NAME") or os.getenv("MYSQL_DATABASE")

        missing = [n for n, v in (("DB_USER", user), ("DB_PASSWORD", password)) if not v]
        if missing:
            raise ConfigurationError(f"Missing required env var(s): {', '.join(missing)}")

        return DatabaseSettings(
            host=os.getenv("DB_HOST", "127.0.0.1"),
            port=int(os.getenv("DB_PORT") or os.getenv("MYSQL_PORT") or DEFAULT_DB_PORT),
            user=user or "",
            password=password or "",
            database=database or "",
        )
