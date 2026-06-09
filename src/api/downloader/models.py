"""Typed request and domain models for historical stock bars."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any


@dataclass(frozen=True)
class BarRequest:
    """Parameters that define one Alpaca historical bars request."""

    symbols: list[str]
    start: str
    end: str | None
    timeframe: str
    feed: str
    adjustment: str
    currency: str | None
    limit: int


@dataclass(frozen=True)
class StockBar:
    """Normalized stock bar ready to be persisted."""

    symbol: str
    timestamp_utc: datetime
    open: float | None
    high: float | None
    low: float | None
    close: float | None
    volume: int | None
    trade_count: int | None
    vwap: float | None
    raw_timestamp: str

    @classmethod
    def from_alpaca_payload(cls, symbol: str, payload: dict[str, Any]) -> "StockBar":
        raw_timestamp = payload.get("t")
        if not raw_timestamp:
            raise ValueError("Alpaca bar payload is missing timestamp field 't'.")
        return cls(
            symbol=symbol.upper(),
            timestamp_utc=parse_alpaca_timestamp(raw_timestamp),
            open=to_float(payload.get("o")),
            high=to_float(payload.get("h")),
            low=to_float(payload.get("l")),
            close=to_float(payload.get("c")),
            volume=to_int(payload.get("v")),
            trade_count=to_int(payload.get("n")),
            vwap=to_float(payload.get("vw")),
            raw_timestamp=raw_timestamp,
        )


def parse_alpaca_timestamp(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(tzinfo=None)


def to_float(value: Any) -> float | None:
    if value is None:
        return None
    return float(Decimal(str(value)))


def to_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)
