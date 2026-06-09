from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from ..downloader.database import DEFAULT_TABLE_NAME, MariaDBStockBarRepository
from ..downloader.errors import DownloaderError
from ..downloader.settings import SettingsFactory

router = APIRouter(prefix="/api/bars", tags=["bars"])

_settings = SettingsFactory()


def _make_repository(
    database: str | None = Query(None),
    table: str = Query(DEFAULT_TABLE_NAME),
) -> MariaDBStockBarRepository:
    try:
        return MariaDBStockBarRepository(_settings.database(database), table_name=table)
    except DownloaderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


RepositoryDep = Annotated[MariaDBStockBarRepository, Depends(_make_repository)]


class StockBarOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    symbol: str
    timeframe: str
    feed: str
    adjustment: str
    timestamp_utc: datetime
    open: float | None
    high: float | None
    low: float | None
    close: float | None
    volume: int | None
    trade_count: int | None
    vwap: float | None
    raw_timestamp: str
    created_at: datetime
    updated_at: datetime


class PagedBarsResponse(BaseModel):
    items: list[StockBarOut]
    total: int
    page: int
    page_size: int


class StockBarCreate(BaseModel):
    symbol: str
    timeframe: str = "1Day"
    feed: Literal["iex", "sip", "delayed_sip", "otc"] = "iex"
    adjustment: Literal["raw", "split", "dividend", "all"] = "raw"
    timestamp_utc: datetime
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    volume: int | None = None
    trade_count: int | None = None
    vwap: float | None = None
    raw_timestamp: str | None = None

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, v: str) -> str:
        return v.strip().upper()


class StockBarUpdate(BaseModel):
    symbol: str | None = None
    timeframe: str | None = None
    feed: Literal["iex", "sip", "delayed_sip", "otc"] | None = None
    adjustment: Literal["raw", "split", "dividend", "all"] | None = None
    timestamp_utc: datetime | None = None
    open: float | None = None
    high: float | None = None
    low: float | None = None
    close: float | None = None
    volume: int | None = None
    trade_count: int | None = None
    vwap: float | None = None
    raw_timestamp: str | None = None


class IntervalSummary(BaseModel):
    symbol: str
    timeframe: str
    feed: str
    adjustment: str
    bar_count: int
    earliest: datetime
    latest: datetime


def _strip_tz(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=None) if dt.tzinfo else dt


@router.get("/summary", response_model=list[IntervalSummary])
def get_bars_summary(repo: RepositoryDep) -> list[IntervalSummary]:
    try:
        rows = repo.summarize_intervals()
    except DownloaderError as exc:
        raise HTTPException(400, str(exc)) from exc
    return [IntervalSummary.model_validate(row) for row in rows]


@router.get("/chart-data", response_model=list[StockBarOut])
def get_chart_data(
    repo: RepositoryDep,
    symbol: str = Query(...),
    timeframe: str = Query(...),
    feed: str = Query(...),
    adjustment: str = Query(...),
    limit: int = Query(10_000, ge=1, le=10_000),
) -> list[StockBarOut]:
    try:
        bars = repo.get_interval_bars(
            symbol=symbol, timeframe=timeframe, feed=feed, adjustment=adjustment,
            limit=limit, newest_first=True,
        )
    except DownloaderError as exc:
        raise HTTPException(400, str(exc)) from exc
    return [StockBarOut.model_validate(bar) for bar in bars]


@router.delete("/interval", status_code=status.HTTP_200_OK)
def delete_interval(
    repo: RepositoryDep,
    symbol: str = Query(...),
    timeframe: str = Query(...),
    feed: str = Query(...),
    adjustment: str = Query(...),
) -> dict[str, int]:
    try:
        deleted = repo.delete_interval(symbol=symbol, timeframe=timeframe, feed=feed, adjustment=adjustment)
    except DownloaderError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"deleted": deleted}


@router.get("/", response_model=PagedBarsResponse)
def list_bars(
    repo: RepositoryDep,
    symbol: list[str] | None = Query(None),
    timeframe: str | None = Query(None),
    feed: str | None = Query(None),
    adjustment: str | None = Query(None),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
) -> PagedBarsResponse:
    try:
        items, total = repo.list_bars(
            symbols=symbol, timeframe=timeframe, feed=feed, adjustment=adjustment,
            start=_strip_tz(start), end=_strip_tz(end), page=page, page_size=page_size,
        )
    except DownloaderError as exc:
        raise HTTPException(400, str(exc)) from exc
    return PagedBarsResponse(
        items=[StockBarOut.model_validate(item) for item in items],
        total=total, page=page, page_size=page_size,
    )


@router.get("/{bar_id}", response_model=StockBarOut)
def get_bar(bar_id: int, repo: RepositoryDep) -> StockBarOut:
    try:
        bar = repo.get_bar(bar_id)
    except DownloaderError as exc:
        raise HTTPException(400, str(exc)) from exc
    if bar is None:
        raise HTTPException(404, f"Bar {bar_id} not found.")
    return StockBarOut.model_validate(bar)


@router.post("/", response_model=StockBarOut, status_code=201)
def create_bar(body: StockBarCreate, repo: RepositoryDep) -> StockBarOut:
    data = body.model_dump()
    ts: datetime = data["timestamp_utc"]
    if ts.tzinfo:
        ts = ts.replace(tzinfo=None)
    data["timestamp_utc"] = ts
    if data["raw_timestamp"] is None:
        data["raw_timestamp"] = ts.strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        bar = repo.create_bar(data)
    except DownloaderError as exc:
        raise HTTPException(400, str(exc)) from exc
    return StockBarOut.model_validate(bar)


@router.put("/{bar_id}", response_model=StockBarOut)
def update_bar(bar_id: int, body: StockBarUpdate, repo: RepositoryDep) -> StockBarOut:
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(422, "No fields provided for update.")
    if "timestamp_utc" in data:
        raw_ts: datetime = data["timestamp_utc"]
        data["timestamp_utc"] = raw_ts.replace(tzinfo=None) if raw_ts.tzinfo else raw_ts
    try:
        bar = repo.update_bar(bar_id, data)
    except DownloaderError as exc:
        raise HTTPException(400, str(exc)) from exc
    if bar is None:
        raise HTTPException(404, f"Bar {bar_id} not found.")
    return StockBarOut.model_validate(bar)


@router.delete("/{bar_id}", status_code=204)
def delete_bar(bar_id: int, repo: RepositoryDep) -> None:
    try:
        deleted = repo.delete_bar(bar_id)
    except DownloaderError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not deleted:
        raise HTTPException(404, f"Bar {bar_id} not found.")
