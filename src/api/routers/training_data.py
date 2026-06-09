from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sklearn.preprocessing import MinMaxScaler, RobustScaler, StandardScaler
from sqlalchemy.orm import Session

from ..database import get_db
from ..downloader.database import MariaDBStockBarRepository
from ..downloader.settings import SettingsFactory
from ..features.schema import FeaturesRepository
from ..models.training_config import TrainingConfig
from ..schemas.training_config import TrainingConfigCreate, TrainingConfigRead, TrainingConfigUpdate

router = APIRouter(prefix="/api/training-data", tags=["training-data"])
_settings = SettingsFactory()

_SCALERS: dict[str, type] = {
    "standard": StandardScaler,
    "minmax": MinMaxScaler,
    "robust": RobustScaler,
}


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class TargetSpec(BaseModel):
    label: str
    source_col: str
    shift: int = -1
    task_type: str = "regression"
    derived: str | None = None
    params: dict = {}


class NanInfoRequest(BaseModel):
    symbol: str
    timeframe: str
    feed: str = "iex"
    adjustment: str = "raw"
    targets: list[TargetSpec] = []


class SplitPreviewRequest(NanInfoRequest):
    nan_strategy: str = "drop"
    train_ratio: float = 0.70
    val_ratio: float = 0.15
    test_ratio: float = 0.15


class ScalePreviewRequest(SplitPreviewRequest):
    scaler_type: str = "standard"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_val(v: Any) -> Any:
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(v, "isoformat"):
        return v.isoformat()
    if hasattr(v, "item"):
        val = v.item()
        if isinstance(val, float) and math.isnan(val):
            return None
        return val
    return v


def _df_to_records(df: pd.DataFrame, n: int | None = None) -> list[dict]:
    part = df.head(n) if n is not None else df
    return [{col: _safe_val(val) for col, val in row.items()} for row in part.to_dict("records")]


def _load_df(symbol: str, timeframe: str, feed: str, adjustment: str) -> pd.DataFrame:
    bars_repo = MariaDBStockBarRepository(_settings.database())
    bars = bars_repo.get_interval_bars(symbol, timeframe, feed, adjustment, limit=None)
    if not bars:
        return pd.DataFrame()

    df = pd.DataFrame(bars)
    keep = ["timestamp_utc", "open", "high", "low", "close", "volume"]
    df = df[[c for c in keep if c in df.columns]].copy()
    df["timestamp_utc"] = pd.to_datetime(df["timestamp_utc"]).dt.tz_localize(None)

    feat_repo = FeaturesRepository(_settings.database())
    saved_keys = feat_repo.saved_indicators(symbol, timeframe, feed, adjustment)
    if saved_keys:
        feat_rows = feat_repo.get_bars(symbol, timeframe, feed, adjustment, saved_keys)
        if feat_rows:
            feat_df = pd.DataFrame(feat_rows)
            feat_df["timestamp_utc"] = pd.to_datetime(feat_df["timestamp_utc"]).dt.tz_localize(None)
            df = df.merge(feat_df, on="timestamp_utc", how="left")

    return df.sort_values("timestamp_utc").reset_index(drop=True)


def _apply_targets(df: pd.DataFrame, targets: list[dict]) -> pd.DataFrame:
    df = df.copy()
    for t in targets:
        src = t["source_col"]
        shift = t["shift"]
        label = t["label"]
        derived = t.get("derived")
        if src not in df.columns:
            continue
        if derived == "direction":
            shifted = df[src].shift(shift)
            df[label] = np.where(shifted.isna(), np.nan, (shifted > df[src]).astype("float64"))
        elif derived == "return_pct":
            df[label] = (df[src].shift(shift) - df[src]) / df[src] * 100.0
        elif derived == "return_frac":
            df[label] = (df[src].shift(shift) - df[src]) / df[src]
        elif derived == "log_return":
            df[label] = np.log(df[src].shift(shift) / df[src])
        elif derived == "direction_threshold":
            threshold = t.get("params", {}).get("threshold", 0.01)
            shifted = df[src].shift(shift)
            ret = (shifted - df[src]) / df[src]
            df[label] = np.where(shifted.isna(), np.nan,
                        np.where(ret > threshold, 1.0,
                        np.where(ret < -threshold, -1.0, 0.0)))
        elif derived == "realized_vol":
            horizon = abs(shift)
            df[label] = df[src].pct_change().rolling(horizon).std().shift(-horizon)
        elif derived == "mfe":
            horizon = abs(shift)
            df[label] = (df["high"].rolling(horizon).max().shift(-horizon) - df[src]) / df[src]
        elif derived == "mae":
            horizon = abs(shift)
            df[label] = (df["low"].rolling(horizon).min().shift(-horizon) - df[src]) / df[src]
        elif derived == "future_range":
            horizon = abs(shift)
            future_max = df["high"].rolling(horizon).max().shift(-horizon)
            future_min = df["low"].rolling(horizon).min().shift(-horizon)
            df[label] = (future_max - future_min) / df[src]
        elif derived == "large_move":
            threshold = t.get("params", {}).get("threshold", 0.02)
            shifted = df[src].shift(shift)
            ret = (shifted - df[src]) / df[src]
            df[label] = np.where(shifted.isna(), np.nan, (ret.abs() >= threshold).astype("float64"))
        elif derived == "breakout":
            horizon = abs(shift)
            future_max = df["high"].rolling(horizon).max().shift(-horizon)
            df[label] = np.where(future_max.isna(), np.nan, (future_max > df["high"]).astype("float64"))
        else:
            df[label] = df[src].shift(shift)
    return df


def _apply_nan_strategy(df: pd.DataFrame, strategy: str) -> pd.DataFrame:
    if strategy == "ffill":
        df = df.ffill()
    return df.dropna().reset_index(drop=True)


def _partition_info(part: pd.DataFrame, n_sample: int = 20) -> dict:
    if part.empty:
        return {"count": 0, "start": None, "end": None, "sample": []}
    return {
        "count": len(part),
        "start": _safe_val(part["timestamp_utc"].iloc[0]),
        "end": _safe_val(part["timestamp_utc"].iloc[-1]),
        "sample": _df_to_records(part, n_sample),
    }


# ---------------------------------------------------------------------------
# Config CRUD
# ---------------------------------------------------------------------------

@router.get("/configs", response_model=list[TrainingConfigRead])
def list_configs(db: Session = Depends(get_db)):
    return db.query(TrainingConfig).order_by(TrainingConfig.created_at.desc()).all()


@router.post("/configs", response_model=TrainingConfigRead, status_code=201)
def create_config(body: TrainingConfigCreate, db: Session = Depends(get_db)):
    cfg = TrainingConfig(**body.model_dump())
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return cfg


@router.put("/configs/{config_id}", response_model=TrainingConfigRead)
def update_config(config_id: int, body: TrainingConfigUpdate, db: Session = Depends(get_db)):
    cfg = db.query(TrainingConfig).filter(TrainingConfig.id == config_id).first()
    if not cfg:
        raise HTTPException(404, "Config not found")
    cfg.config_json = body.config_json
    if body.name is not None:
        cfg.name = body.name
    db.commit()
    db.refresh(cfg)
    return cfg


@router.delete("/configs/{config_id}", status_code=204)
def delete_config(config_id: int, db: Session = Depends(get_db)):
    cfg = db.query(TrainingConfig).filter(TrainingConfig.id == config_id).first()
    if not cfg:
        raise HTTPException(404, "Config not found")
    db.delete(cfg)
    db.commit()


# ---------------------------------------------------------------------------
# Data endpoints
# ---------------------------------------------------------------------------

@router.get("/preview")
def preview(
    symbol: str = Query(...),
    timeframe: str = Query(...),
    feed: str = Query("iex"),
    adjustment: str = Query("raw"),
    n_rows: int = Query(20),
) -> dict:
    df = _load_df(symbol, timeframe, feed, adjustment)
    if df.empty:
        raise HTTPException(404, "No bar data found for the given parameters.")
    nan_per_col = {col: int(df[col].isna().sum()) for col in df.columns if df[col].isna().any()}
    return {
        "total_bars": len(df),
        "columns": list(df.columns),
        "nan_per_column": nan_per_col,
        "earliest": _safe_val(df["timestamp_utc"].min()),
        "latest": _safe_val(df["timestamp_utc"].max()),
        "rows": _df_to_records(df, n_rows),
    }


@router.post("/nan-info")
def nan_info(body: NanInfoRequest) -> dict:
    df = _load_df(body.symbol, body.timeframe, body.feed, body.adjustment)
    if df.empty:
        raise HTTPException(404, "No bar data found.")
    df = _apply_targets(df, [t.model_dump() for t in body.targets])
    total_rows = len(df)
    target_labels = [t.label for t in body.targets]
    feature_cols = [c for c in df.columns if c != "timestamp_utc" and c not in target_labels]
    warmup_nan = int(df[feature_cols].isna().any(axis=1).sum()) if feature_cols else 0
    target_nan = int(df[target_labels].isna().any(axis=1).sum()) if target_labels else 0
    total_nan = int(df.isna().any(axis=1).sum())
    return {
        "total_rows": total_rows,
        "warmup_nan_rows": warmup_nan,
        "target_nan_rows": target_nan,
        "total_nan_rows": total_nan,
        "rows_after_drop": total_rows - total_nan,
    }


@router.post("/split-preview")
def split_preview(body: SplitPreviewRequest) -> dict:
    df = _load_df(body.symbol, body.timeframe, body.feed, body.adjustment)
    if df.empty:
        raise HTTPException(404, "No bar data found.")
    df = _apply_targets(df, [t.model_dump() for t in body.targets])
    df = _apply_nan_strategy(df, body.nan_strategy)
    n = len(df)
    if n < 10:
        raise HTTPException(400, f"Only {n} rows after cleaning — not enough to split.")
    train_end = int(n * body.train_ratio)
    val_end = train_end + int(n * body.val_ratio)
    return {
        "total_clean_rows": n,
        "columns": list(df.columns),
        "train": _partition_info(df.iloc[:train_end]),
        "val": _partition_info(df.iloc[train_end:val_end]),
        "test": _partition_info(df.iloc[val_end:]),
    }


@router.post("/scale-preview")
def scale_preview(body: ScalePreviewRequest) -> dict:
    df = _load_df(body.symbol, body.timeframe, body.feed, body.adjustment)
    if df.empty:
        raise HTTPException(404, "No bar data found.")
    df = _apply_targets(df, [t.model_dump() for t in body.targets])
    df = _apply_nan_strategy(df, body.nan_strategy)
    n = len(df)
    if n < 10:
        raise HTTPException(400, "Not enough clean rows to scale.")

    train_end = int(n * body.train_ratio)
    train_df = df.iloc[:train_end].copy()
    target_labels = [t.label for t in body.targets]
    feature_cols = [c for c in df.columns if c != "timestamp_utc" and c not in target_labels]

    scaler = _SCALERS.get(body.scaler_type, StandardScaler)()
    train_arr = train_df[feature_cols].values.astype("float64")
    scaler.fit(train_arr)

    sample_cols = feature_cols[:6]
    sample_before = _df_to_records(train_df[["timestamp_utc"] + sample_cols].head(5))

    scaled_arr = scaler.transform(train_arr)
    scaled_df = train_df[["timestamp_utc"]].copy()
    for i, col in enumerate(feature_cols):
        scaled_df[col] = scaled_arr[:, i]
    sample_after = _df_to_records(scaled_df[["timestamp_utc"] + sample_cols].head(5))

    params: dict[str, dict] = {}
    for i, col in enumerate(feature_cols[:6]):
        if hasattr(scaler, "mean_"):
            params[col] = {"mean": float(scaler.mean_[i]), "std": float(scaler.scale_[i])}
        elif hasattr(scaler, "data_min_"):
            params[col] = {"min": float(scaler.data_min_[i]), "max": float(scaler.data_max_[i])}
        elif hasattr(scaler, "center_"):
            params[col] = {"center": float(scaler.center_[i]), "scale": float(scaler.scale_[i])}

    return {
        "feature_columns": feature_cols,
        "sample_before": sample_before,
        "sample_after": sample_after,
        "scaler_params_sample": params,
    }
