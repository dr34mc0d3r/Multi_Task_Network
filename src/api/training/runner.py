from __future__ import annotations

import json
import pickle
from datetime import datetime, timezone
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim

from .model import MultiTaskLSTM
from .pipeline import build_dataloaders

_LOSS_FNS: dict[str, type] = {
    "mse": nn.MSELoss,
    "mae": nn.L1Loss,
    "huber": nn.HuberLoss,
    "bce": nn.BCEWithLogitsLoss,
    "crossentropy": nn.CrossEntropyLoss,
}

_OPTIMIZERS: dict[str, type] = {
    "adam": optim.Adam,
    "adamw": optim.AdamW,
    "sgd": optim.SGD,
    "rmsprop": optim.RMSprop,
}


def build_model(config: dict, feature_cols: list[str]) -> MultiTaskLSTM:
    hp = config["hyperparameters"]
    return MultiTaskLSTM(
        input_size=len(feature_cols),
        hidden_size=hp["hidden_size"],
        num_layers=hp["num_layers"],
        dropout=hp["dropout"],
        bidirectional=hp["bidirectional"],
        task_names=[t["label"] for t in config["targets"]],
    )


def _build_scheduler(optimizer, hp: dict):
    sched = hp.get("scheduler", "none")
    p = hp.get("scheduler_params", {})
    if sched == "ReduceLROnPlateau":
        return optim.lr_scheduler.ReduceLROnPlateau(
            optimizer,
            factor=p.get("factor", 0.1),
            patience=p.get("patience", 5),
            min_lr=p.get("min_lr", 1e-6),
        )
    if sched == "CosineAnnealingLR":
        return optim.lr_scheduler.CosineAnnealingLR(
            optimizer,
            T_max=p.get("T_max", hp.get("max_epochs", 100)),
            eta_min=p.get("eta_min", 1e-6),
        )
    if sched == "StepLR":
        return optim.lr_scheduler.StepLR(
            optimizer,
            step_size=p.get("step_size", 10),
            gamma=p.get("gamma", 0.1),
        )
    if sched == "ExponentialLR":
        return optim.lr_scheduler.ExponentialLR(optimizer, gamma=p.get("gamma", 0.95))
    return None


def _train_epoch(model, loader, optimizer, loss_fns, task_weights, grad_clip):
    model.train()
    total_loss = 0.0
    task_acc: dict[str, float] = {k: 0.0 for k in loss_fns}
    norm_acc = 0.0
    n_batches = 0

    for X, y in loader:
        optimizer.zero_grad()
        preds = model(X)

        weighted: list[torch.Tensor] = []
        for i, (label, loss_fn) in enumerate(loss_fns.items()):
            key = label.replace(" ", "_")
            pred = preds[key].squeeze(1)
            target = y[:, i]
            t_loss = loss_fn(pred, target)
            task_acc[label] += t_loss.item()
            weighted.append(task_weights[i] * t_loss)

        batch_loss = weighted[0]
        for w in weighted[1:]:
            batch_loss = batch_loss + w
        batch_loss.backward()

        if grad_clip and grad_clip > 0:
            raw_norm = torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip).item()
        else:
            raw_norm = sum(
                p.grad.data.norm(2).item() ** 2
                for p in model.parameters()
                if p.grad is not None
            ) ** 0.5

        optimizer.step()
        total_loss += batch_loss.item()
        norm_acc += raw_norm
        n_batches += 1

    if n_batches == 0:
        return 0.0, {k: 0.0 for k in loss_fns}, 0.0
    return (
        total_loss / n_batches,
        {k: v / n_batches for k, v in task_acc.items()},
        norm_acc / n_batches,
    )


def _eval_epoch(model, loader, loss_fns, task_weights):
    model.eval()
    total_loss = 0.0
    task_acc: dict[str, float] = {k: 0.0 for k in loss_fns}
    n_batches = 0

    with torch.no_grad():
        for X, y in loader:
            preds = model(X)
            weighted: list[torch.Tensor] = []
            for i, (label, loss_fn) in enumerate(loss_fns.items()):
                key = label.replace(" ", "_")
                pred = preds[key].squeeze(1)
                target = y[:, i]
                t_loss = loss_fn(pred, target)
                task_acc[label] += t_loss.item()
                weighted.append(task_weights[i] * t_loss)
            batch_loss = weighted[0]
            for w in weighted[1:]:
                batch_loss = batch_loss + w
            total_loss += batch_loss.item()
            n_batches += 1

    if n_batches == 0:
        return 0.0, {k: 0.0 for k in loss_fns}
    return total_loss / n_batches, {k: v / n_batches for k, v in task_acc.items()}


def run_training(
    run_id: int,
    config_id: int,
    config: dict,
    db_factory,
    progress_store: dict,
    models_dir: Path,
):
    hp = config["hyperparameters"]
    task_labels = [t["label"] for t in config["targets"]]
    epoch = -1

    try:
        progress_store[run_id]["status"] = "running"

        train_loader, val_loader, _, scaler, feature_cols = build_dataloaders(config)

        model = MultiTaskLSTM(
            input_size=len(feature_cols),
            hidden_size=hp["hidden_size"],
            num_layers=hp["num_layers"],
            dropout=hp["dropout"],
            bidirectional=hp["bidirectional"],
            task_names=task_labels,
        )

        opt_cls = _OPTIMIZERS.get(hp["optimizer"], optim.Adam)
        optimizer = opt_cls(
            model.parameters(),
            lr=hp["learning_rate"],
            weight_decay=hp["weight_decay"],
        )

        loss_fns: dict[str, nn.Module] = {}
        for t, loss_key in zip(config["targets"], hp["task_losses"]):
            loss_fns[t["label"]] = _LOSS_FNS.get(loss_key, nn.MSELoss)()

        task_weights: list[float] = hp["task_weights"]
        grad_clip: float = hp.get("grad_clip", 1.0)
        patience: int = hp.get("early_stopping_patience", 10)
        max_epochs: int = hp["max_epochs"]
        sched_type: str = hp.get("scheduler", "none")

        scheduler = _build_scheduler(optimizer, hp)

        best_val_loss = float("inf")
        best_epoch = 0
        no_improve = 0
        train_losses: list[float] = []
        val_losses: list[float] = []
        grad_norms: list[float] = []
        learning_rates: list[float] = []
        task_train_losses: dict[str, list[float]] = {k: [] for k in task_labels}
        task_val_losses: dict[str, list[float]] = {k: [] for k in task_labels}
        best_state = None

        for epoch in range(max_epochs):
            if progress_store[run_id].get("cancel"):
                progress_store[run_id]["status"] = "cancelled"
                break

            current_lr = optimizer.param_groups[0]["lr"]
            t_loss, t_tasks, grad_norm = _train_epoch(
                model, train_loader, optimizer, loss_fns, task_weights, grad_clip
            )
            v_loss, v_tasks = _eval_epoch(model, val_loader, loss_fns, task_weights)

            train_losses.append(t_loss)
            val_losses.append(v_loss)
            grad_norms.append(grad_norm)
            learning_rates.append(current_lr)
            for k in task_labels:
                task_train_losses[k].append(t_tasks.get(k, 0.0))
                task_val_losses[k].append(v_tasks.get(k, 0.0))

            if v_loss < best_val_loss:
                best_val_loss = v_loss
                best_epoch = epoch + 1
                best_state = {k: v.clone() for k, v in model.state_dict().items()}
                no_improve = 0
            else:
                no_improve += 1

            if scheduler is not None:
                if sched_type == "ReduceLROnPlateau":
                    scheduler.step(v_loss)
                else:
                    scheduler.step()

            progress_store[run_id].update(
                {
                    "current_epoch": epoch + 1,
                    "train_losses": train_losses[:],
                    "val_losses": val_losses[:],
                    "grad_norms": grad_norms[:],
                    "learning_rates": learning_rates[:],
                    "current_lr": optimizer.param_groups[0]["lr"],
                    "task_train_losses": {k: v[:] for k, v in task_train_losses.items()},
                    "task_val_losses": {k: v[:] for k, v in task_val_losses.items()},
                    "best_epoch": best_epoch,
                    "best_val_loss": best_val_loss,
                    "no_improve_count": no_improve,
                }
            )

            if no_improve >= patience:
                if progress_store[run_id].get("status") == "running":
                    progress_store[run_id]["status"] = "completed"
                break
        else:
            if progress_store[run_id].get("status") == "running":
                progress_store[run_id]["status"] = "completed"

        # Save best model + scaler
        save_dir = models_dir / f"config_{config_id}"
        save_dir.mkdir(parents=True, exist_ok=True)
        model_path = save_dir / f"run_{run_id}_epoch_{best_epoch}.pt"
        scaler_path = save_dir / f"run_{run_id}_scaler.pkl"

        if best_state:
            torch.save(best_state, model_path)
        with open(scaler_path, "wb") as f:
            pickle.dump(scaler, f)

        progress_store[run_id]["model_path"] = str(model_path)
        progress_store[run_id]["scaler_path"] = str(scaler_path)

        final_epoch = epoch + 1 if epoch >= 0 else 0
        db = db_factory()
        try:
            from ..models.training_run import TrainingRun

            run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
            if run:
                run.status = progress_store[run_id]["status"]
                run.current_epoch = final_epoch
                run.best_epoch = best_epoch
                run.best_val_loss = best_val_loss
                run.train_losses = json.dumps(train_losses)
                run.val_losses = json.dumps(val_losses)
                run.grad_norms = json.dumps(grad_norms)
                run.learning_rates = json.dumps(learning_rates)
                run.task_train_losses = json.dumps(task_train_losses)
                run.task_val_losses = json.dumps(task_val_losses)
                run.model_path = str(model_path)
                run.scaler_path = str(scaler_path)
                run.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
                db.commit()
        finally:
            db.close()

    except Exception as e:
        progress_store[run_id]["status"] = "failed"
        progress_store[run_id]["error"] = str(e)
        db = db_factory()
        try:
            from ..models.training_run import TrainingRun

            run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
            if run:
                run.status = "failed"
                run.error_message = str(e)
                run.current_epoch = epoch + 1 if epoch >= 0 else 0
                run.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
                db.commit()
        finally:
            db.close()
