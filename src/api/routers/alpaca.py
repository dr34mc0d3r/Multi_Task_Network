from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator

from ..downloader.alpaca_client import AlpacaClient
from ..downloader.database import DEFAULT_TABLE_NAME, DEFAULT_UPSERT_BATCH_SIZE, MariaDBStockBarRepository
from ..downloader.errors import DownloaderError
from ..downloader.models import BarRequest
from ..downloader.services import AlpacaHistoryLoader
from ..downloader.settings import SettingsFactory

router = APIRouter(prefix="/api", tags=["alpaca"])

_settings = SettingsFactory()


def _make_repository(
    database: str | None = Query(None, description="Override DB_NAME from .env"),
    table: str = Query(DEFAULT_TABLE_NAME, description="Target table name"),
) -> MariaDBStockBarRepository:
    try:
        return MariaDBStockBarRepository(_settings.database(database), table_name=table)
    except DownloaderError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


RepositoryDep = Annotated[MariaDBStockBarRepository, Depends(_make_repository)]


class AlpacaHistoryRequest(BaseModel):
    symbols: list[str] = Field(..., min_length=1)
    start: str
    end: str | None = None
    timeframe: str = "1Day"
    feed: Literal["iex", "sip", "delayed_sip", "otc"] = "iex"
    adjustment: Literal["raw", "split", "dividend", "all"] = "raw"
    currency: str | None = None
    limit: int = Field(10_000, ge=1, le=10_000)
    database: str | None = None
    table: str = DEFAULT_TABLE_NAME
    db_batch_size: int = Field(DEFAULT_UPSERT_BATCH_SIZE, ge=1)

    @field_validator("symbols")
    @classmethod
    def normalize_symbols(cls, symbols: list[str]) -> list[str]:
        normalized = [s.strip().upper() for s in symbols if s.strip()]
        if not normalized:
            raise ValueError("symbols must contain at least one ticker")
        return normalized


class AlpacaHistoryResponse(BaseModel):
    fetched_bars: int
    upserted_bars: int
    database: str
    table: str


@router.post("/alpaca-history", response_model=AlpacaHistoryResponse, status_code=status.HTTP_200_OK)
def run_alpaca_history(request_body: AlpacaHistoryRequest) -> AlpacaHistoryResponse:
    """Fetch historical bars from Alpaca and upsert them into MariaDB."""
    try:
        settings = SettingsFactory()
        repository = MariaDBStockBarRepository(
            settings.database(request_body.database),
            table_name=request_body.table,
        )
        loader = AlpacaHistoryLoader(AlpacaClient(settings.alpaca()), repository)
        result = loader.load(
            BarRequest(
                symbols=request_body.symbols,
                start=request_body.start,
                end=request_body.end,
                timeframe=request_body.timeframe,
                feed=request_body.feed,
                adjustment=request_body.adjustment,
                currency=request_body.currency,
                limit=request_body.limit,
            ),
            db_batch_size=request_body.db_batch_size,
        )
    except DownloaderError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return AlpacaHistoryResponse(
        fetched_bars=result.fetched_bars,
        upserted_bars=result.upserted_bars,
        database=result.database,
        table=result.table,
    )
