"""MariaDB persistence for normalized stock bars."""

from __future__ import annotations

import urllib.parse
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    Float,
    Integer,
    MetaData,
    String,
    Table,
    UniqueConstraint,
    and_,
    create_engine,
    delete,
    func,
    select,
    text,
    update,
)
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from .errors import ConfigurationError, DatabaseError
from .models import StockBar
from .settings import DatabaseSettings

DEFAULT_TABLE_NAME = "lstm_2_stock_bars"
DEFAULT_UPSERT_BATCH_SIZE = 1_000


class MariaDBEngineFactory:
    def __init__(self, settings: DatabaseSettings) -> None:
        self.settings = settings

    def create(self, database: str | None = None) -> Engine:
        password = urllib.parse.quote_plus(self.settings.password)
        selected_database = f"/{database}" if database else ""
        url = (
            f"mysql+pymysql://{self.settings.user}:{password}"
            f"@{self.settings.host}:{self.settings.port}{selected_database}"
            "?charset=utf8mb4"
        )
        return create_engine(url, future=True, pool_pre_ping=True)


class StockBarsSchema:
    def __init__(self, table_name: str = DEFAULT_TABLE_NAME) -> None:
        self.table_name = table_name
        self.table = self._build_table(table_name)

    @staticmethod
    def validate_identifier(name: str) -> None:
        if not name.replace("_", "").isalnum():
            raise ConfigurationError(f"Invalid SQL identifier: {name}")

    @classmethod
    def quote_identifier(cls, name: str) -> str:
        cls.validate_identifier(name)
        return f"`{name}`"

    def _build_table(self, table_name: str) -> Table:
        self.validate_identifier(table_name)
        metadata = MetaData()
        return Table(
            table_name,
            metadata,
            Column("id", BigInteger, primary_key=True, autoincrement=True),
            Column("symbol", String(16), nullable=False),
            Column("timeframe", String(16), nullable=False),
            Column("feed", String(16), nullable=False),
            Column("adjustment", String(16), nullable=False),
            Column("timestamp_utc", DateTime, nullable=False),
            Column("open", Float, nullable=True),
            Column("high", Float, nullable=True),
            Column("low", Float, nullable=True),
            Column("close", Float, nullable=True),
            Column("volume", BigInteger, nullable=True),
            Column("trade_count", Integer, nullable=True),
            Column("vwap", Float, nullable=True),
            Column("raw_timestamp", String(40), nullable=False),
            Column("created_at", DateTime, nullable=False),
            Column("updated_at", DateTime, nullable=False),
            UniqueConstraint(
                "symbol", "timeframe", "feed", "adjustment", "timestamp_utc",
                name=f"uq_{table_name}_identity",
            ),
        )


class MariaDBStockBarRepository:
    def __init__(
        self,
        settings: DatabaseSettings,
        table_name: str = DEFAULT_TABLE_NAME,
    ) -> None:
        self.settings = settings
        self.engine_factory = MariaDBEngineFactory(settings)
        self.schema = StockBarsSchema(table_name)

    def ensure_database(self) -> None:
        engine = self.engine_factory.create()
        try:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "CREATE DATABASE IF NOT EXISTS "
                        f"{StockBarsSchema.quote_identifier(self.settings.database)} "
                        "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                    )
                )
        except SQLAlchemyError as exc:
            raise DatabaseError(f"Could not create or access database '{self.settings.database}'.") from exc
        finally:
            engine.dispose()

    def ensure_table(self) -> None:
        engine = self.engine_factory.create(self.settings.database)
        try:
            self.schema.table.metadata.create_all(engine)
        except SQLAlchemyError as exc:
            raise DatabaseError(
                f"Could not create or access table '{self.settings.database}.{self.schema.table_name}'."
            ) from exc
        finally:
            engine.dispose()

    def upsert_bars(
        self,
        bars: list[StockBar],
        *,
        timeframe: str,
        feed: str,
        adjustment: str,
        batch_size: int = DEFAULT_UPSERT_BATCH_SIZE,
    ) -> int:
        if batch_size < 1:
            raise ConfigurationError("batch_size must be greater than 0.")

        self.ensure_database()
        self.ensure_table()

        rows = self._to_database_rows(bars, timeframe=timeframe, feed=feed, adjustment=adjustment)
        if not rows:
            return 0

        engine = self.engine_factory.create(self.settings.database)
        try:
            total_written = 0
            total_batches = (len(rows) + batch_size - 1) // batch_size
            for batch_number, batch_rows in enumerate(self._chunks(rows, batch_size), start=1):
                self._upsert_batch(engine, batch_rows)
                total_written += len(batch_rows)
                print(f"Persisted batch {batch_number}/{total_batches}: {total_written}/{len(rows)} bars")
            return total_written
        finally:
            engine.dispose()

    def _upsert_batch(self, engine: Engine, rows: list[dict[str, Any]]) -> None:
        insert_statement = mysql_insert(self.schema.table).values(rows)
        update_columns: dict[str, Any] = {
            column.name: insert_statement.inserted[column.name]
            for column in self.schema.table.columns
            if column.name not in {"id", "created_at"}
        }
        update_columns["updated_at"] = func.utc_timestamp()

        try:
            with engine.begin() as connection:
                connection.execute(insert_statement.on_duplicate_key_update(**update_columns))
        except SQLAlchemyError as exc:
            first_row = rows[0]
            last_row = rows[-1]
            raise DatabaseError(
                f"Failed to persist stock bars batch ({len(rows)} rows, "
                f"{first_row['symbol']} {first_row['timestamp_utc']} through "
                f"{last_row['symbol']} {last_row['timestamp_utc']})."
            ) from exc

    def _to_database_rows(
        self,
        bars: list[StockBar],
        *,
        timeframe: str,
        feed: str,
        adjustment: str,
    ) -> list[dict[str, Any]]:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        return [
            {
                "symbol": bar.symbol,
                "timeframe": timeframe,
                "feed": feed,
                "adjustment": adjustment,
                "timestamp_utc": bar.timestamp_utc,
                "open": bar.open,
                "high": bar.high,
                "low": bar.low,
                "close": bar.close,
                "volume": bar.volume,
                "trade_count": bar.trade_count,
                "vwap": bar.vwap,
                "raw_timestamp": bar.raw_timestamp,
                "created_at": now,
                "updated_at": now,
            }
            for bar in bars
        ]

    @staticmethod
    def _chunks(rows: list[dict[str, Any]], batch_size: int) -> list[list[dict[str, Any]]]:
        return [rows[i : i + batch_size] for i in range(0, len(rows), batch_size)]

    # ------------------------------------------------------------------
    # CRUD / query helpers
    # ------------------------------------------------------------------

    def list_bars(
        self,
        *,
        symbols: list[str] | None = None,
        timeframe: str | None = None,
        feed: str | None = None,
        adjustment: str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[dict[str, Any]], int]:
        t = self.schema.table
        filters = []
        if symbols:
            filters.append(t.c.symbol.in_(symbols))
        if timeframe:
            filters.append(t.c.timeframe == timeframe)
        if feed:
            filters.append(t.c.feed == feed)
        if adjustment:
            filters.append(t.c.adjustment == adjustment)
        if start is not None:
            filters.append(t.c.timestamp_utc >= start)
        if end is not None:
            filters.append(t.c.timestamp_utc <= end)

        where_clause = and_(*filters) if filters else None
        base_select = select(t)
        count_select = select(func.count()).select_from(t)
        if where_clause is not None:
            base_select = base_select.where(where_clause)
            count_select = count_select.where(where_clause)

        paged_select = (
            base_select.order_by(t.c.timestamp_utc.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )

        engine = self.engine_factory.create(self.settings.database)
        try:
            with engine.connect() as conn:
                total: int = conn.execute(count_select).scalar_one()
                rows = [dict(row._mapping) for row in conn.execute(paged_select)]
            return rows, total
        except SQLAlchemyError as exc:
            raise DatabaseError("Failed to list stock bars.") from exc
        finally:
            engine.dispose()

    def get_bar(self, bar_id: int) -> dict[str, Any] | None:
        t = self.schema.table
        engine = self.engine_factory.create(self.settings.database)
        try:
            with engine.connect() as conn:
                row = conn.execute(select(t).where(t.c.id == bar_id)).fetchone()
            return dict(row._mapping) if row else None
        except SQLAlchemyError as exc:
            raise DatabaseError(f"Failed to fetch bar {bar_id}.") from exc
        finally:
            engine.dispose()

    def create_bar(self, data: dict[str, Any]) -> dict[str, Any]:
        self.ensure_database()
        self.ensure_table()

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        row = {**data, "created_at": now, "updated_at": now}

        t = self.schema.table
        engine = self.engine_factory.create(self.settings.database)
        try:
            with engine.begin() as conn:
                result = conn.execute(mysql_insert(t).values([row]))
                new_id = result.lastrowid
                inserted = conn.execute(select(t).where(t.c.id == new_id)).fetchone()
                return dict(inserted._mapping) if inserted else {}
        except SQLAlchemyError as exc:
            raise DatabaseError("Failed to create stock bar.") from exc
        finally:
            engine.dispose()

    def update_bar(self, bar_id: int, data: dict[str, Any]) -> dict[str, Any] | None:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        update_data = {**data, "updated_at": now}

        t = self.schema.table
        engine = self.engine_factory.create(self.settings.database)
        try:
            with engine.begin() as conn:
                result = conn.execute(update(t).where(t.c.id == bar_id).values(**update_data))
                if result.rowcount == 0:
                    return None
                row = conn.execute(select(t).where(t.c.id == bar_id)).fetchone()
                return dict(row._mapping) if row else None
        except SQLAlchemyError as exc:
            raise DatabaseError(f"Failed to update bar {bar_id}.") from exc
        finally:
            engine.dispose()

    def delete_bar(self, bar_id: int) -> bool:
        t = self.schema.table
        engine = self.engine_factory.create(self.settings.database)
        try:
            with engine.begin() as conn:
                result = conn.execute(delete(t).where(t.c.id == bar_id))
            return result.rowcount > 0
        except SQLAlchemyError as exc:
            raise DatabaseError(f"Failed to delete bar {bar_id}.") from exc
        finally:
            engine.dispose()

    def get_interval_bars(
        self,
        symbol: str,
        timeframe: str,
        feed: str,
        adjustment: str,
        limit: int | None = 10_000,
        newest_first: bool = False,
    ) -> list[dict[str, Any]]:
        from sqlalchemy.exc import OperationalError, ProgrammingError

        t = self.schema.table
        order = t.c.timestamp_utc.desc() if newest_first else t.c.timestamp_utc.asc()
        stmt = (
            select(t)
            .where(
                and_(
                    t.c.symbol == symbol.upper(),
                    t.c.timeframe == timeframe,
                    t.c.feed == feed,
                    t.c.adjustment == adjustment,
                )
            )
            .order_by(order)
        )
        if limit is not None:
            stmt = stmt.limit(limit)

        engine = self.engine_factory.create(self.settings.database)
        try:
            with engine.connect() as conn:
                rows = [dict(row._mapping) for row in conn.execute(stmt)]
            if newest_first:
                rows.reverse()
            return rows
        except (OperationalError, ProgrammingError):
            return []
        except SQLAlchemyError as exc:
            raise DatabaseError("Failed to fetch interval bars.") from exc
        finally:
            engine.dispose()

    def delete_interval(
        self,
        symbol: str,
        timeframe: str,
        feed: str,
        adjustment: str,
    ) -> int:
        t = self.schema.table
        engine = self.engine_factory.create(self.settings.database)
        try:
            with engine.begin() as conn:
                result = conn.execute(
                    delete(t).where(
                        and_(
                            t.c.symbol == symbol.upper(),
                            t.c.timeframe == timeframe,
                            t.c.feed == feed,
                            t.c.adjustment == adjustment,
                        )
                    )
                )
            return result.rowcount
        except SQLAlchemyError as exc:
            raise DatabaseError("Failed to delete interval.") from exc
        finally:
            engine.dispose()

    def summarize_intervals(self) -> list[dict[str, Any]]:
        from sqlalchemy.exc import OperationalError, ProgrammingError

        t = self.schema.table
        stmt = (
            select(
                t.c.symbol,
                t.c.timeframe,
                t.c.feed,
                t.c.adjustment,
                func.count().label("bar_count"),
                func.min(t.c.timestamp_utc).label("earliest"),
                func.max(t.c.timestamp_utc).label("latest"),
            )
            .group_by(t.c.symbol, t.c.timeframe, t.c.feed, t.c.adjustment)
            .order_by(t.c.symbol, t.c.timeframe, t.c.feed, t.c.adjustment)
        )

        engine = self.engine_factory.create(self.settings.database)
        try:
            with engine.connect() as conn:
                return [dict(row._mapping) for row in conn.execute(stmt)]
        except (OperationalError, ProgrammingError):
            return []
        except SQLAlchemyError as exc:
            raise DatabaseError("Failed to summarize intervals.") from exc
        finally:
            engine.dispose()
