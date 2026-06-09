"""Alpaca REST API client for historical stock bars."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from .errors import AlpacaAPIError
from .models import BarRequest, StockBar
from .settings import AlpacaSettings


class AlpacaClient:
    """Thin REST client around Alpaca's historical stock bars endpoint."""

    def __init__(self, settings: AlpacaSettings, timeout_seconds: int = 30) -> None:
        self.settings = settings
        self.timeout_seconds = timeout_seconds

    def fetch_stock_bars(self, request: BarRequest) -> list[StockBar]:
        """Fetch all pages of bars for the requested symbols and date range."""

        params = self._build_stock_bars_params(request)
        rows: list[StockBar] = []
        page_number = 1

        while True:
            payload = self._get_json("/v2/stocks/bars", params)
            rows.extend(self._parse_bars(payload))

            next_page_token = payload.get("next_page_token")
            print(f"Fetched page {page_number}: {len(rows)} total bars", file=sys.stderr)
            if not next_page_token:
                return rows

            params["page_token"] = next_page_token
            page_number += 1

    def _build_stock_bars_params(self, request: BarRequest) -> dict[str, Any]:
        params: dict[str, Any] = {
            "symbols": ",".join(request.symbols),
            "start": request.start,
            "timeframe": request.timeframe,
            "feed": request.feed,
            "adjustment": request.adjustment,
            "limit": request.limit,
            "sort": "asc",
        }
        if request.end:
            params["end"] = request.end
        if request.currency:
            params["currency"] = request.currency
        return params

    def _parse_bars(self, payload: dict[str, Any]) -> list[StockBar]:
        bars: list[StockBar] = []
        for symbol, symbol_bars in payload.get("bars", {}).items():
            for raw_bar in symbol_bars:
                bars.append(StockBar.from_alpaca_payload(symbol, raw_bar))
        return bars

    def _get_json(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        query = urllib.parse.urlencode(
            {key: value for key, value in params.items() if value is not None}
        )
        request = urllib.request.Request(
            f"{self.settings.base_url}{path}?{query}",
            headers={
                "APCA-API-KEY-ID": self.settings.api_key,
                "APCA-API-SECRET-KEY": self.settings.secret_key,
                "Accept": "application/json",
            },
            method="GET",
        )

        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise self._api_error_from_http_error(exc) from exc
        except urllib.error.URLError as exc:
            raise AlpacaAPIError(f"Alpaca request failed: {exc.reason}") from exc

    def _api_error_from_http_error(self, exc: urllib.error.HTTPError) -> AlpacaAPIError:
        body = exc.read().decode("utf-8", errors="replace")
        message = body
        try:
            message = json.loads(body).get("message", body)
        except ValueError:
            pass
        return AlpacaAPIError(f"Alpaca request failed with HTTP {exc.code}: {message}")
