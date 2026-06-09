"""Service layer coordinating the Alpaca client and the MariaDB repository."""

from __future__ import annotations

from dataclasses import dataclass

from .alpaca_client import AlpacaClient
from .database import MariaDBStockBarRepository
from .models import BarRequest


@dataclass(frozen=True)
class AlpacaHistoryLoadResult:
    fetched_bars: int
    upserted_bars: int
    database: str
    table: str


class AlpacaHistoryLoader:
    def __init__(self, alpaca_client: AlpacaClient, repository: MariaDBStockBarRepository) -> None:
        self.alpaca_client = alpaca_client
        self.repository = repository

    def load(self, request: BarRequest, *, db_batch_size: int) -> AlpacaHistoryLoadResult:
        bars = self.alpaca_client.fetch_stock_bars(request)
        upserted_bars = self.repository.upsert_bars(
            bars,
            timeframe=request.timeframe,
            feed=request.feed,
            adjustment=request.adjustment,
            batch_size=db_batch_size,
        )
        return AlpacaHistoryLoadResult(
            fetched_bars=len(bars),
            upserted_bars=upserted_bars,
            database=self.repository.settings.database,
            table=self.repository.schema.table_name,
        )
