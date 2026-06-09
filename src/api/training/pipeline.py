from __future__ import annotations

import numpy as np
import torch
from torch.utils.data import DataLoader, TensorDataset

from ..routers.training_data import _SCALERS, _apply_nan_strategy, _apply_targets, _load_df


def _make_windows(
    features: np.ndarray,
    targets: np.ndarray,
    lookback: int,
) -> tuple[torch.Tensor, torch.Tensor]:
    n = len(features)
    if n <= lookback:
        raise ValueError(f"Not enough rows ({n}) for lookback={lookback}")
    X = np.array([features[i : i + lookback] for i in range(n - lookback)], dtype="float32")
    y = targets[lookback:].astype("float32")
    return torch.tensor(X), torch.tensor(y)


def build_dataloaders(
    config: dict,
) -> tuple[DataLoader, DataLoader, DataLoader, object, list[str]]:
    df = _load_df(
        config["symbol"],
        config["timeframe"],
        config.get("feed", "iex"),
        config.get("adjustment", "raw"),
    )
    df = _apply_targets(df, config["targets"])
    df = _apply_nan_strategy(df, config["nan_strategy"])

    n = len(df)
    train_end = int(n * config["train_ratio"])
    val_end = train_end + int(n * config["val_ratio"])

    train_df = df.iloc[:train_end].reset_index(drop=True)
    val_df = df.iloc[train_end:val_end].reset_index(drop=True)
    test_df = df.iloc[val_end:].reset_index(drop=True)

    feature_cols: list[str] = config["feature_columns"]
    target_labels: list[str] = [t["label"] for t in config["targets"]]
    lookback: int = config["lookback"]

    scaler = _SCALERS[config["scaler_type"]]()
    train_feat = scaler.fit_transform(train_df[feature_cols].values.astype("float64"))
    val_feat = scaler.transform(val_df[feature_cols].values.astype("float64"))
    test_feat = scaler.transform(test_df[feature_cols].values.astype("float64"))

    X_train, y_train = _make_windows(train_feat, train_df[target_labels].values, lookback)
    X_val, y_val = _make_windows(val_feat, val_df[target_labels].values, lookback)
    X_test, y_test = _make_windows(test_feat, test_df[target_labels].values, lookback)

    dl = config.get("dl_config", {})
    batch_size: int  = dl.get("batch_size",   config.get("batch_size",   32))
    num_workers: int = dl.get("num_workers",  config.get("num_workers",  0))
    pin_memory: bool = dl.get("pin_memory",   config.get("pin_memory",   False))
    drop_last: bool  = dl.get("drop_last",    config.get("drop_last",    False))
    shuffle_train: bool = dl.get("shuffle_train", dl.get("shuffle", config.get("shuffle", True)))

    train_loader = DataLoader(
        TensorDataset(X_train, y_train),
        batch_size=batch_size,
        shuffle=shuffle_train,
        num_workers=num_workers,
        pin_memory=pin_memory,
        drop_last=drop_last,
    )
    val_loader = DataLoader(
        TensorDataset(X_val, y_val),
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=pin_memory,
    )
    test_loader = DataLoader(
        TensorDataset(X_test, y_test),
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=pin_memory,
    )
    return train_loader, val_loader, test_loader, scaler, feature_cols


def get_test_timestamps(config: dict) -> list[str]:
    """Return one timestamp per test-window prediction (aligned with test_loader output)."""
    df = _load_df(
        config["symbol"],
        config["timeframe"],
        config.get("feed", "iex"),
        config.get("adjustment", "raw"),
    )
    df = _apply_targets(df, config["targets"])
    df = _apply_nan_strategy(df, config["nan_strategy"])
    n = len(df)
    train_end = int(n * config["train_ratio"])
    val_end = train_end + int(n * config["val_ratio"])
    test_df = df.iloc[val_end:].reset_index(drop=True)
    lookback: int = config["lookback"]
    return [str(t) for t in test_df["timestamp_utc"].iloc[lookback:].tolist()]
