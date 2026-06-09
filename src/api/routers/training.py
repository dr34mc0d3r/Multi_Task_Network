from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path

import numpy as np
import torch
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import SessionLocal, get_db
from ..models.training_config import TrainingConfig
from ..models.training_run import TrainingRun
from ..schemas.training_run import EvaluationResult, TrainingRunRead
from ..training.pipeline import build_dataloaders, get_test_timestamps
from ..training.runner import build_model, run_training

router = APIRouter(prefix="/api/training", tags=["training"])

_progress: dict[int, dict] = {}
_MODELS_DIR = Path(__file__).parent.parent.parent.parent / "models"


class StartRunRequest(BaseModel):
    config_id: int


@router.post("/runs", response_model=TrainingRunRead, status_code=201)
def start_run(body: StartRunRequest, db: Session = Depends(get_db)):
    cfg = db.query(TrainingConfig).filter(TrainingConfig.id == body.config_id).first()
    if not cfg:
        raise HTTPException(404, "Config not found")
    config = json.loads(cfg.config_json)
    if "hyperparameters" not in config:
        raise HTTPException(400, "Config has no hyperparameters — complete the Hyperparameters page first")

    hp = config["hyperparameters"]
    run = TrainingRun(
        config_id=body.config_id,
        status="pending",
        current_epoch=0,
        total_epochs=hp["max_epochs"],
        started_at=datetime.utcnow(),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    _progress[run.id] = {
        "status": "pending",
        "current_epoch": 0,
        "total_epochs": hp["max_epochs"],
        "train_losses": [],
        "val_losses": [],
        "grad_norms": [],
        "learning_rates": [],
        "task_train_losses": {},
        "task_val_losses": {},
        "best_epoch": None,
        "best_val_loss": None,
        "no_improve_count": 0,
        "model_path": None,
        "scaler_path": None,
        "error": None,
        "cancel": False,
    }

    threading.Thread(
        target=run_training,
        args=(run.id, body.config_id, config, SessionLocal, _progress, _MODELS_DIR),
        daemon=True,
    ).start()

    return run


@router.get("/runs", response_model=list[TrainingRunRead])
def list_runs(config_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(TrainingRun).order_by(TrainingRun.started_at.desc())
    if config_id is not None:
        q = q.filter(TrainingRun.config_id == config_id)
    return q.all()


@router.get("/runs/{run_id}/progress")
def get_progress(run_id: int, db: Session = Depends(get_db)) -> dict:
    if run_id in _progress:
        data = {k: v for k, v in _progress[run_id].items() if k != "cancel"}
        data["id"] = run_id
        return data

    run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found")
    return {
        "id": run.id,
        "status": run.status,
        "current_epoch": run.current_epoch,
        "total_epochs": run.total_epochs,
        "best_epoch": run.best_epoch,
        "best_val_loss": run.best_val_loss,
        "train_losses": json.loads(run.train_losses) if run.train_losses else [],
        "val_losses": json.loads(run.val_losses) if run.val_losses else [],
        "grad_norms": json.loads(run.grad_norms) if run.grad_norms else [],
        "learning_rates": json.loads(run.learning_rates) if run.learning_rates else [],
        "task_train_losses": json.loads(run.task_train_losses) if run.task_train_losses else {},
        "task_val_losses": json.loads(run.task_val_losses) if run.task_val_losses else {},
        "no_improve_count": 0,
        "model_path": run.model_path,
        "scaler_path": run.scaler_path,
        "error": run.error_message,
    }


@router.post("/runs/{run_id}/stop", status_code=200)
def stop_run(run_id: int):
    if run_id not in _progress:
        raise HTTPException(404, "Run not found in active progress store")
    if _progress[run_id].get("status") != "running":
        raise HTTPException(400, "Run is not currently running")
    _progress[run_id]["cancel"] = True
    return {"message": "Stop signal sent"}


@router.delete("/runs/{run_id}", status_code=204)
def delete_run(run_id: int, db: Session = Depends(get_db)):
    if run_id in _progress and _progress[run_id].get("status") == "running":
        raise HTTPException(400, "Cannot delete a running run — stop it first")
    run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found")
    db.delete(run)
    db.commit()
    _progress.pop(run_id, None)


@router.post("/runs/{run_id}/evaluate", response_model=EvaluationResult)
def evaluate_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found")
    if run.status != "completed":
        raise HTTPException(400, f"Run status is '{run.status}' — only completed runs can be evaluated")
    if not run.model_path or not Path(run.model_path).exists():
        raise HTTPException(400, f"Model file not found: {run.model_path}")

    cfg = db.query(TrainingConfig).filter(TrainingConfig.id == run.config_id).first()
    if not cfg:
        raise HTTPException(404, "Config not found")
    config = json.loads(cfg.config_json)

    _, _, test_loader, _, feature_cols = build_dataloaders(config)
    timestamps = get_test_timestamps(config)

    model = build_model(config, feature_cols)
    model.load_state_dict(torch.load(run.model_path, map_location="cpu"))
    model.eval()

    task_labels = [t["label"] for t in config["targets"]]
    task_types = {t["label"]: t["task_type"] for t in config["targets"]}
    all_preds: dict[str, list] = {label: [] for label in task_labels}
    all_actuals: dict[str, list] = {label: [] for label in task_labels}

    with torch.no_grad():
        for X, y in test_loader:
            preds = model(X)
            for i, label in enumerate(task_labels):
                key = label.replace(" ", "_")
                all_preds[label].extend(preds[key].squeeze(1).tolist())
                all_actuals[label].extend(y[:, i].tolist())

    tasks_out = []
    test_losses = []

    for label in task_labels:
        preds_arr = np.array(all_preds[label], dtype="float64")
        acts_arr = np.array(all_actuals[label], dtype="float64")
        task_type = task_types[label]
        n = len(preds_arr)

        if task_type == "regression":
            mse = float(np.mean((preds_arr - acts_arr) ** 2))
            mae = float(np.mean(np.abs(preds_arr - acts_arr)))
            rmse = float(np.sqrt(mse))
            ss_tot = float(np.sum((acts_arr - acts_arr.mean()) ** 2))
            r2 = float(1 - np.sum((acts_arr - preds_arr) ** 2) / ss_tot) if ss_tot > 0 else 0.0
            dir_acc = float(np.mean(np.sign(preds_arr) == np.sign(acts_arr)))
            metrics: dict = {"mse": mse, "mae": mae, "rmse": rmse, "r2": r2, "dir_acc": dir_acc}
            test_losses.append(mse)
        else:
            probs = 1.0 / (1.0 + np.exp(-preds_arr))
            pred_cls = (probs >= 0.5).astype(int)
            act_cls = (acts_arr >= 0.5).astype(int)
            accuracy = float(np.mean(pred_cls == act_cls))
            tp = int(np.sum((pred_cls == 1) & (act_cls == 1)))
            fp = int(np.sum((pred_cls == 1) & (act_cls == 0)))
            fn = int(np.sum((pred_cls == 0) & (act_cls == 1)))
            tn = int(np.sum((pred_cls == 0) & (act_cls == 0)))
            prec = tp / (tp + fp) if tp + fp > 0 else 0.0
            rec = tp / (tp + fn) if tp + fn > 0 else 0.0
            f1 = 2 * prec * rec / (prec + rec) if prec + rec > 0 else 0.0
            metrics = {
                "accuracy": accuracy,
                "precision": prec,
                "recall": rec,
                "f1": f1,
                "confusion_matrix": [[tn, fp], [fn, tp]],
            }
            test_losses.append(1.0 - accuracy)

        tasks_out.append({
            "label": label,
            "task_type": task_type,
            "metrics": metrics,
            "predictions": preds_arr.tolist(),
            "actuals": acts_arr.tolist(),
            "timestamps": timestamps[:n],
        })

    result = {
        "run_id": run_id,
        "test_loss": float(np.mean(test_losses)) if test_losses else 0.0,
        "tasks": tasks_out,
    }
    run.metrics_json = json.dumps(result)
    db.commit()
    return result


@router.get("/runs/{run_id}/evaluation", response_model=EvaluationResult)
def get_evaluation(run_id: int, db: Session = Depends(get_db)):
    run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
    if not run:
        raise HTTPException(404, "Run not found")
    if not run.metrics_json:
        raise HTTPException(404, "No evaluation results — run evaluation first")
    return json.loads(run.metrics_json)
