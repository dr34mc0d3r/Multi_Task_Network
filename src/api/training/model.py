from __future__ import annotations

import torch.nn as nn


class MultiTaskLSTM(nn.Module):
    def __init__(
        self,
        input_size: int,
        hidden_size: int,
        num_layers: int,
        dropout: float,
        bidirectional: bool,
        task_names: list[str],
    ):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size,
            hidden_size,
            num_layers,
            dropout=(dropout if num_layers > 1 else 0.0),
            batch_first=True,
            bidirectional=bidirectional,
        )
        effective = hidden_size * (2 if bidirectional else 1)
        self.heads = nn.ModuleDict({
            name.replace(" ", "_"): nn.Linear(effective, 1)
            for name in task_names
        })

    def forward(self, x):
        out, _ = self.lstm(x)
        last = out[:, -1, :]
        return {name: head(last) for name, head in self.heads.items()}
