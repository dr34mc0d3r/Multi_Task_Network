"""
Seed two reference training examples via the local API.

Prerequisites:
  - API running:  .venv/bin/python -m uvicorn src.api.main:app --port 8000
  - MariaDB up:   cd mysql && docker compose up -d
  - Alpaca keys in .env (ALPACA_API_KEY / ALPACA_SECRET_KEY)

Run:
  .venv/bin/python scripts/seed_examples.py
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from typing import Any

BASE = "http://localhost:8000"


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def _request(method: str, path: str, body: dict | None = None) -> Any:
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"Content-Type": "application/json"} if data else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode(errors="replace")
        print(f"  HTTP {e.code} {method} {path}: {body_text[:300]}", file=sys.stderr)
        raise


def get(path: str) -> Any:
    return _request("GET", path)


def post(path: str, body: dict) -> Any:
    return _request("POST", path, body)


# ---------------------------------------------------------------------------
# Step helpers
# ---------------------------------------------------------------------------

def check_backend() -> None:
    try:
        get("/api/bars/summary")
        print("✓ Backend reachable")
    except Exception:
        print("✗ Backend not reachable — start it first:", file=sys.stderr)
        print("  .venv/bin/python -m uvicorn src.api.main:app --port 8000", file=sys.stderr)
        sys.exit(1)


def download_bars(symbol: str, timeframe: str, start: str, end: str) -> None:
    print(f"  Downloading {symbol} {timeframe} {start}→{end} ...", end=" ", flush=True)
    result = post("/api/alpaca-history", {
        "symbols": [symbol],
        "start": start,
        "end": end,
        "timeframe": timeframe,
        "feed": "iex",
        "adjustment": "raw",
        "limit": 10000,
    })
    n = result.get("upserted_bars", result.get("fetched_bars", "?"))
    print(f"✓ {n} bars")


def compute_features(symbol: str, timeframe: str, indicators: list[str]) -> None:
    print(f"  Computing {len(indicators)} features for {symbol} {timeframe} ...", end=" ", flush=True)
    result = post("/api/features/compute", {
        "symbol": symbol,
        "timeframe": timeframe,
        "feed": "iex",
        "adjustment": "raw",
        "indicators": indicators,
    })
    print(f"✓ {result.get('computed', '?')} bars updated")


def get_or_create_config(name: str, symbol: str, timeframe: str, config_json: dict) -> int:
    configs = get("/api/training-data/configs")
    existing = next((c for c in configs if c["name"] == name), None)
    if existing:
        print(f"  Config '{name}' already exists → id={existing['id']}")
        return existing["id"]
    result = post("/api/training-data/configs", {
        "name": name,
        "symbol": symbol,
        "timeframe": timeframe,
        "feed": "iex",
        "adjustment": "raw",
        "config_json": json.dumps(config_json),
    })
    print(f"✓ Config #{result['id']}  {name}")
    return result["id"]


def start_run(config_id: int) -> int:
    result = post("/api/training/runs", {"config_id": config_id})
    return result["id"]


def poll_until_done(run_ids: list[int], names: dict[int, str], poll_interval: int = 5) -> dict[int, dict]:
    done: dict[int, dict] = {}
    active = set(run_ids)
    last_print: dict[int, str] = {}

    while active:
        for run_id in list(active):
            prog = get(f"/api/training/runs/{run_id}/progress")
            status = prog.get("status", "unknown")
            epoch = prog.get("current_epoch", 0)
            total = prog.get("total_epochs", "?")
            val = prog.get("best_val_loss")
            val_str = f"{val:.6f}" if val is not None else "—"
            name = names[run_id]

            line = f"  Run #{run_id}  {name:<35}  epoch {epoch}/{total}  val={val_str}  [{status}]"
            if line != last_print.get(run_id):
                print(line, flush=True)
                last_print[run_id] = line

            if status in ("completed", "failed", "cancelled"):
                active.discard(run_id)
                done[run_id] = prog
                mark = "✓" if status == "completed" else "✗"
                epochs_ran = prog.get("current_epoch", "?")
                print(f"{mark} Run #{run_id}  {name}  {status}  best_val={val_str}  epochs={epochs_ran}")

        if active:
            time.sleep(poll_interval)

    return done


def evaluate_run(run_id: int) -> None:
    print(f"  Evaluating run #{run_id} ...", end=" ", flush=True)
    try:
        result = post(f"/api/training/runs/{run_id}/evaluate", {})
        test_loss = result.get("test_loss", "?")
        print(f"✓ test_loss={test_loss:.6f}" if isinstance(test_loss, float) else f"✓ {test_loss}")
    except Exception as e:
        print(f"✗ {e}")


# ---------------------------------------------------------------------------
# Example configs
# ---------------------------------------------------------------------------

EXAMPLE_1_CONFIG = {
    "symbol": "AAPL",
    "timeframe": "1Day",
    "feed": "iex",
    "adjustment": "raw",
    "lookback": 30,
    "train_ratio": 0.70,
    "val_ratio": 0.15,
    "nan_strategy": "drop",
    "scaler_type": "standard",
    "batch_size": 32,
    "feature_columns": ["open", "high", "low", "close", "volume"],
    "targets": [
        {
            "label": "Return (frac)",
            "source_col": "close",
            "shift": -1,
            "task_type": "regression",
            "derived": "return_frac",
            "params": {},
        }
    ],
    "hyperparameters": {
        "hidden_size": 64,
        "num_layers": 2,
        "dropout": 0.2,
        "bidirectional": False,
        "optimizer": "adam",
        "learning_rate": 0.001,
        "weight_decay": 1e-5,
        "grad_clip": 1.0,
        "max_epochs": 100,
        "early_stopping_patience": 15,
        "scheduler": "none",
        "task_losses": ["mse"],
        "task_weights": [1.0],
    },
}

EXAMPLE_2_CONFIG = {
    "symbol": "SPY",
    "timeframe": "1Day",
    "feed": "iex",
    "adjustment": "raw",
    "lookback": 30,
    "train_ratio": 0.70,
    "val_ratio": 0.15,
    "nan_strategy": "drop",
    "scaler_type": "standard",
    "batch_size": 32,
    "feature_columns": [
        "open", "high", "low", "close", "volume",
        "rsi_14", "macd", "atr_14", "sma_20", "bb_width",
    ],
    "targets": [
        {
            "label": "Return (frac)",
            "source_col": "close",
            "shift": -1,
            "task_type": "regression",
            "derived": "return_frac",
            "params": {},
        },
        {
            "label": "Direction",
            "source_col": "close",
            "shift": -1,
            "task_type": "classification",
            "derived": "direction",
            "params": {},
        },
    ],
    "hyperparameters": {
        "hidden_size": 64,
        "num_layers": 2,
        "dropout": 0.2,
        "bidirectional": False,
        "optimizer": "adam",
        "learning_rate": 0.001,
        "weight_decay": 1e-5,
        "grad_clip": 1.0,
        "max_epochs": 100,
        "early_stopping_patience": 15,
        "scheduler": "none",
        "task_losses": ["mse", "bce"],
        "task_weights": [1.0, 1.0],
    },
}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("\n=== lstm-2 example seeder ===\n")

    # 1. Backend check
    check_backend()

    # 2. Download bars
    print("\n--- Download bars ---")
    download_bars("AAPL", "1Day", "2022-01-01", "2025-01-01")
    download_bars("SPY", "1Day", "2022-01-01", "2025-01-01")

    # 3. Compute features for SPY (Example 2)
    print("\n--- Compute features (SPY) ---")
    compute_features("SPY", "1Day", ["rsi_14", "macd", "atr_14", "sma_20", "bb_width"])

    # 4. Create configs
    print("\n--- Training configs ---")
    cfg1_id = get_or_create_config(
        "example_aapl_daily_return", "AAPL", "1Day", EXAMPLE_1_CONFIG
    )
    cfg2_id = get_or_create_config(
        "example_spy_multitask", "SPY", "1Day", EXAMPLE_2_CONFIG
    )

    # 5. Start training runs
    print("\n--- Start training ---")
    run1_id = start_run(cfg1_id)
    run2_id = start_run(cfg2_id)
    print(f"  Started run #{run1_id}  (example_aapl_daily_return)")
    print(f"  Started run #{run2_id}  (example_spy_multitask)")

    # 6. Poll until both finish
    print("\n--- Training progress ---")
    names = {
        run1_id: "example_aapl_daily_return",
        run2_id: "example_spy_multitask",
    }
    results = poll_until_done([run1_id, run2_id], names)

    # 7. Evaluate completed runs
    print("\n--- Evaluation ---")
    for run_id, prog in results.items():
        if prog.get("status") == "completed":
            evaluate_run(run_id)
        else:
            print(f"  Skipping run #{run_id} — status={prog.get('status')}")

    # 8. Summary
    print("\n=== Done ===")
    for run_id, prog in results.items():
        name = names[run_id]
        status = prog.get("status")
        val = prog.get("best_val_loss")
        val_str = f"{val:.6f}" if val is not None else "—"
        epochs = prog.get("current_epoch", "?")
        print(f"  #{run_id}  {name:<35}  {status}  val={val_str}  epochs={epochs}")
    print()
    print("Visit http://localhost:5174/evaluation to view results.")


if __name__ == "__main__":
    main()
