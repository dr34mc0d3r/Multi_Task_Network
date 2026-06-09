"""SQLAlchemy schema and CRUD for the lstm_2_stock_bar_features wide table."""

from __future__ import annotations

import urllib.parse
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    BigInteger, Column, DateTime, Double, MetaData, String, Table,
    UniqueConstraint, and_, create_engine, func, select,
)
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.exc import SQLAlchemyError, OperationalError, ProgrammingError

from ..downloader.errors import DatabaseError
from ..downloader.settings import DatabaseSettings
from .indicators import INDICATOR_KEYS

TABLE_NAME = "lstm_2_stock_bar_features"

_IDENTITY_COLS = ("symbol", "timeframe", "feed", "adjustment", "timestamp_utc")


def _build_table() -> Table:
    meta = MetaData()
    cols = [
        Column("id",            BigInteger, primary_key=True, autoincrement=True),
        Column("symbol",        String(16),  nullable=False),
        Column("timeframe",     String(16),  nullable=False),
        Column("feed",          String(16),  nullable=False),
        Column("adjustment",    String(16),  nullable=False),
        Column("timestamp_utc", DateTime,    nullable=False),
        *[Column(k, Double, nullable=True) for k in INDICATOR_KEYS],
        Column("updated_at",    DateTime,    nullable=False),
        UniqueConstraint(*_IDENTITY_COLS, name="uq_lstm2_sbf_identity"),
    ]
    return Table(TABLE_NAME, meta, *cols)


FEATURES_TABLE = _build_table()


class FeaturesRepository:
    def __init__(self, settings: DatabaseSettings) -> None:
        self.settings = settings

    def _engine(self):
        pw = urllib.parse.quote_plus(self.settings.password)
        url = (
            f"mysql+pymysql://{self.settings.user}:{pw}"
            f"@{self.settings.host}:{self.settings.port}/{self.settings.database}"
            "?charset=utf8mb4"
        )
        return create_engine(url, future=True, pool_pre_ping=True)

    def ensure_table(self) -> None:
        engine = self._engine()
        try:
            FEATURES_TABLE.metadata.create_all(engine)
        except SQLAlchemyError as exc:
            raise DatabaseError("Could not create lstm_2_stock_bar_features table.") from exc
        finally:
            engine.dispose()

    def upsert_rows(self, rows: list[dict[str, Any]], indicator_keys: list[str]) -> int:
        if not rows:
            return 0
        self.ensure_table()
        t = FEATURES_TABLE
        engine = self._engine()
        try:
            batch_size = 500
            total = 0
            for i in range(0, len(rows), batch_size):
                batch = rows[i : i + batch_size]
                stmt = mysql_insert(t).values(batch)
                update_cols: dict[str, Any] = {k: stmt.inserted[k] for k in indicator_keys}
                update_cols["updated_at"] = func.utc_timestamp()
                with engine.begin() as conn:
                    conn.execute(stmt.on_duplicate_key_update(**update_cols))
                total += len(batch)
            return total
        except SQLAlchemyError as exc:
            raise DatabaseError("Failed to upsert feature rows.") from exc
        finally:
            engine.dispose()

    def saved_indicators(self, symbol: str, timeframe: str, feed: str, adjustment: str) -> list[str]:
        engine = self._engine()
        t = FEATURES_TABLE
        try:
            with engine.connect() as conn:
                exprs = [func.count(t.c[k]).label(k) for k in INDICATOR_KEYS]
                row = conn.execute(
                    select(*exprs).where(
                        and_(
                            t.c.symbol == symbol.upper(),
                            t.c.timeframe == timeframe,
                            t.c.feed == feed,
                            t.c.adjustment == adjustment,
                        )
                    )
                ).mappings().one()
                return [k for k in INDICATOR_KEYS if row[k] > 0]
        except (OperationalError, ProgrammingError):
            return []
        except SQLAlchemyError as exc:
            raise DatabaseError("Failed to query saved indicators.") from exc
        finally:
            engine.dispose()

    def all_saved_indicators(self) -> dict[str, list[str]]:
        engine = self._engine()
        t = FEATURES_TABLE
        try:
            with engine.connect() as conn:
                group_cols = [t.c.symbol, t.c.timeframe, t.c.feed, t.c.adjustment]
                exprs = [func.count(t.c[k]).label(k) for k in INDICATOR_KEYS]
                rows = conn.execute(
                    select(*group_cols, *exprs).group_by(*group_cols)
                ).mappings().all()
                result = {}
                for row in rows:
                    key = f"{row['symbol']}|{row['timeframe']}|{row['feed']}|{row['adjustment']}"
                    result[key] = [k for k in INDICATOR_KEYS if row[k] > 0]
                return result
        except (OperationalError, ProgrammingError):
            return {}
        except SQLAlchemyError as exc:
            raise DatabaseError("Failed to query all saved indicators.") from exc
        finally:
            engine.dispose()

    def get_bars(self, symbol: str, timeframe: str, feed: str, adjustment: str, keys: list[str]) -> list[dict]:
        engine = self._engine()
        t = FEATURES_TABLE
        try:
            cols_to_select = [t.c.timestamp_utc] + [t.c[k] for k in keys]
            with engine.connect() as conn:
                rows = conn.execute(
                    select(*cols_to_select)
                    .where(and_(
                        t.c.symbol == symbol.upper(),
                        t.c.timeframe == timeframe,
                        t.c.feed == feed,
                        t.c.adjustment == adjustment,
                    ))
                    .order_by(t.c.timestamp_utc.asc())
                ).fetchall()
            return [
                {"timestamp_utc": str(row.timestamp_utc), **{k: row._mapping[k] for k in keys}}
                for row in rows
            ]
        except (OperationalError, ProgrammingError):
            return []
        except SQLAlchemyError as exc:
            raise DatabaseError("Failed to fetch feature bars.") from exc
        finally:
            engine.dispose()
