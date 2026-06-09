from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class TaskEvalResult(BaseModel):
    label: str
    task_type: str
    metrics: dict
    predictions: list[float]
    actuals: list[float]
    timestamps: list[str]


class EvaluationResult(BaseModel):
    run_id: int
    test_loss: float
    tasks: list[TaskEvalResult]


class TrainingRunRead(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    config_id: int
    status: str
    current_epoch: int
    total_epochs: int
    best_epoch: int | None
    best_val_loss: float | None
    train_losses: str | None
    val_losses: str | None
    grad_norms: str | None
    learning_rates: str | None
    task_train_losses: str | None
    task_val_losses: str | None
    metrics_json: str | None
    model_path: str | None
    scaler_path: str | None
    started_at: datetime
    finished_at: datetime | None
    error_message: str | None
