from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.dialects.mysql import MEDIUMTEXT
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TrainingRun(Base):
    __tablename__ = "lstm_2_training_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    config_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    current_epoch: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_epochs: Mapped[int] = mapped_column(Integer, nullable=False)
    best_epoch: Mapped[int | None] = mapped_column(Integer, nullable=True)
    best_val_loss: Mapped[float | None] = mapped_column(Float, nullable=True)
    train_losses: Mapped[str | None] = mapped_column(Text, nullable=True)
    val_losses: Mapped[str | None] = mapped_column(Text, nullable=True)
    grad_norms: Mapped[str | None] = mapped_column(Text, nullable=True)
    learning_rates: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_train_losses: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_val_losses: Mapped[str | None] = mapped_column(Text, nullable=True)
    metrics_json: Mapped[str | None] = mapped_column(MEDIUMTEXT, nullable=True)
    model_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    scaler_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
