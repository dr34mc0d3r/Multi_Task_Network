from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..downloader.database import DEFAULT_TABLE_NAME, MariaDBStockBarRepository
from ..downloader.errors import DownloaderError
from ..downloader.settings import SettingsFactory
from ..features.indicators import INDICATOR_META, INDICATOR_KEYS, compute
from ..features.schema import FeaturesRepository

router = APIRouter(prefix="/api/features", tags=["features"])

_settings = SettingsFactory()


def _bars_repo(table: str = DEFAULT_TABLE_NAME) -> MariaDBStockBarRepository:
    return MariaDBStockBarRepository(_settings.database(), table_name=table)


def _features_repo() -> FeaturesRepository:
    return FeaturesRepository(_settings.database())


class ComputeRequest(BaseModel):
    symbol: str
    timeframe: str
    feed: str = "iex"
    adjustment: str = "raw"
    table: str = DEFAULT_TABLE_NAME
    indicators: list[str]


class ComputeResponse(BaseModel):
    symbol: str
    timeframe: str
    bars: int
    computed: int
    indicators: list[str]


class IndicatorInfo(BaseModel):
    key: str
    label: str
    category: str
    desc: str


@router.get("/available", response_model=list[IndicatorInfo])
def list_available() -> list[IndicatorInfo]:
    return [
        IndicatorInfo(key=k, label=v["label"], category=v["category"], desc=v["desc"])
        for k, v in INDICATOR_META.items()
    ]


@router.get("/saved")
def get_saved(
    symbol: str = Query(...),
    timeframe: str = Query(...),
    feed: str = Query("iex"),
    adjustment: str = Query("raw"),
) -> list[str]:
    try:
        return _features_repo().saved_indicators(symbol, timeframe, feed, adjustment)
    except DownloaderError as exc:
        raise HTTPException(400, str(exc))


@router.get("/saved-all")
def get_all_saved() -> dict[str, list[str]]:
    try:
        return _features_repo().all_saved_indicators()
    except DownloaderError as exc:
        raise HTTPException(400, str(exc))


@router.get("/bars")
def get_feature_bars(
    symbol: str = Query(...),
    timeframe: str = Query(...),
    feed: str = Query("iex"),
    adjustment: str = Query("raw"),
    keys: str = Query(...),
) -> list[dict]:
    key_list = [k.strip() for k in keys.split(",") if k.strip()]
    invalid = [k for k in key_list if k not in INDICATOR_META]
    if invalid:
        raise HTTPException(400, f"Unknown indicator key(s): {invalid}")
    if not key_list:
        raise HTTPException(400, "No indicator keys specified.")
    try:
        return _features_repo().get_bars(symbol, timeframe, feed, adjustment, key_list)
    except Exception as exc:
        raise HTTPException(500, str(exc))


@router.post("/compute", response_model=ComputeResponse)
def compute_and_save(body: ComputeRequest) -> ComputeResponse:
    invalid = [k for k in body.indicators if k not in INDICATOR_META]
    if invalid:
        raise HTTPException(400, f"Unknown indicator key(s): {invalid}")
    if not body.indicators:
        raise HTTPException(400, "No indicators selected.")

    try:
        raw_bars = _bars_repo(body.table).get_interval_bars(
            symbol=body.symbol, timeframe=body.timeframe,
            feed=body.feed, adjustment=body.adjustment, limit=None,
        )
    except DownloaderError as exc:
        raise HTTPException(400, str(exc))

    if not raw_bars:
        raise HTTPException(404, "No bars found for the given parameters.")

    rows_base = [
        {
            "timestamp": b["timestamp_utc"],
            "open":   float(b["open"]  or 0),
            "high":   float(b["high"]  or 0),
            "low":    float(b["low"]   or 0),
            "close":  float(b["close"] or 0),
            "volume": float(b["volume"] or 0),
        }
        for b in raw_bars
        if b.get("open") is not None and b.get("close") is not None
    ]

    df = pd.DataFrame(rows_base)
    df.reset_index(drop=True, inplace=True)

    indicator_series = compute(df, body.indicators)

    now = pd.Timestamp.utcnow().replace(tzinfo=None)
    sym = body.symbol.upper()
    upsert_rows = []
    for i, bar in enumerate(rows_base):
        ts = bar["timestamp"]
        if hasattr(ts, "to_pydatetime"):
            ts = ts.to_pydatetime()
        if hasattr(ts, "tzinfo") and ts.tzinfo:
            ts = ts.replace(tzinfo=None)

        row: dict = {
            "symbol": sym,
            "timeframe": body.timeframe,
            "feed": body.feed,
            "adjustment": body.adjustment,
            "timestamp_utc": ts,
            "updated_at": now,
        }
        for k in body.indicators:
            s = indicator_series.get(k)
            if s is None:
                row[k] = None
            else:
                val = s.iloc[i] if i < len(s) else None
                row[k] = None if (val is None or (isinstance(val, float) and np.isnan(val))) else float(val)

        upsert_rows.append(row)

    try:
        _features_repo().upsert_rows(upsert_rows, body.indicators)
    except DownloaderError as exc:
        raise HTTPException(500, str(exc))

    return ComputeResponse(
        symbol=sym,
        timeframe=body.timeframe,
        bars=len(upsert_rows),
        computed=len(upsert_rows),
        indicators=body.indicators,
    )
