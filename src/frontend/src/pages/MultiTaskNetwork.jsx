import { useState } from 'react'

function Section({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <span className="font-bold text-gray-800">{title}</span>
        <span
          className="text-gray-400 text-xs shrink-0 ml-4"
          style={{ display: 'inline-block', transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          ▶
        </span>
      </button>
      {open && (
        <div className="px-6 pb-6 pt-3 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 1 — Architecture overview
// ---------------------------------------------------------------------------

const CONCEPT_CARDS = [
  {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    top: 'border-t-blue-400',
    title: 'The Input',
    body: 'One stock ticker + one timeframe. A sliding window of lookback consecutive OHLCV bars (+ optional computed features) forms one input sequence. One window = one training example.',
  },
  {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    top: 'border-t-emerald-400',
    title: 'The Architecture',
    body: 'Stacked nn.LSTM (optionally bidirectional) reads the sequence. The last timestep\'s hidden state feeds N independent nn.Linear(effective_size, 1) heads — one per prediction target.',
  },
  {
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    top: 'border-t-violet-400',
    title: 'The Advantage',
    body: 'All heads share the LSTM weights. Every task sends gradient signal back through the shared layers simultaneously — regression and classification tasks regularise each other in one backward pass.',
  },
]

const HOW_STEPS = [
  {
    label: 'Sliding window',
    body: 'The raw DataFrame is cut into overlapping windows of length lookback. Window i = bars i … i+lookback−1, target = values at bar i+lookback. This produces (n − lookback) examples.',
  },
  {
    label: 'Chronological split + scaling',
    body: 'Rows are divided in time order: train / val / test (default 70/15/15). The scaler (Standard, MinMax, or Robust) is fit only on the training partition and then applied to all three — no data leakage.',
  },
  {
    label: 'Shared LSTM layers',
    body: 'Each window flows through nn.LSTM(input_size, hidden_size, num_layers, bidirectional=…). The last timestep output — out[:, -1, :] — captures the sequence\'s final state. Shape: (batch, hidden_size × (2 if bidirectional else 1)).',
  },
  {
    label: 'Per-task output heads',
    body: 'Each head is nn.Linear(effective_size, 1). Regression heads output a float directly. Classification heads output a raw logit — BCEWithLogitsLoss is used during training; sigmoid is applied at inference time.',
  },
  {
    label: 'Combined loss',
    body: 'Each task\'s loss (MSE / Huber / MAE / BCEWithLogitsLoss) is multiplied by its configured weight and summed. All gradients flow back through the shared LSTM in a single backward pass.',
  },
]

function ArchitectureSection() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-700 leading-relaxed">
        <strong>MultiTaskLSTM</strong> is one PyTorch model that reads a window of stock bars and
        simultaneously predicts multiple targets — price returns, volatility, direction signals, and
        more. All output heads share a single set of LSTM layers, so every task contributes to
        training the shared representation at once.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CONCEPT_CARDS.map(card => (
          <div
            key={card.title}
            className={`rounded-lg border-t-4 border ${card.border} ${card.top} ${card.bg} p-4 space-y-1.5`}
          >
            <p className="text-sm font-bold text-gray-800">{card.title}</p>
            <p className="text-xs text-gray-600 leading-relaxed">{card.body}</p>
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Data flow</p>
        <div className="space-y-3">
          {HOW_STEPS.map((step, i) => (
            <div key={step.label} className="flex gap-4">
              <div className="flex flex-col items-center shrink-0">
                <span className="w-6 h-6 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">{i + 1}</span>
                {i < HOW_STEPS.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
              </div>
              <div className="pb-3">
                <p className="text-sm font-semibold text-gray-800 mb-0.5">{step.label}</p>
                <p className="text-xs text-gray-600 leading-relaxed font-mono-note">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
        <p className="text-xs font-bold text-blue-700 mb-2">Input features: OHLCV vs OHLCV + Indicators</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-white rounded-md border border-blue-100 p-3 space-y-1">
            <p className="text-xs font-semibold text-gray-700">OHLCV only (baseline)</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              open, high, low, close, volume — 5 features per timestep. Available for every ticker/interval you have downloaded.
            </p>
          </div>
          <div className="bg-white rounded-md border border-blue-100 p-3 space-y-1">
            <p className="text-xs font-semibold text-gray-700">OHLCV + Computed indicators</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              If you have run the Features panel, those indicator columns (RSI, MACD, ATR, Bollinger Bands…) are appended — up to 105 features per timestep.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 2 — Prediction targets
// ---------------------------------------------------------------------------

const REGRESSION_TARGETS = [
  {
    key: 'return_frac',
    label: 'Return (frac)',
    formula: '(future_close − close) / close',
    desc: 'Fractional price change over the shift horizon.',
  },
  {
    key: 'return_pct',
    label: 'Return (%)',
    formula: '(future_close − close) / close × 100',
    desc: 'Same as return_frac scaled to percentage points.',
  },
  {
    key: 'log_return',
    label: 'Log return',
    formula: 'log(future_close / close)',
    desc: 'Log-scale return. Additive over multiple periods.',
  },
  {
    key: 'realized_vol',
    label: 'Realized volatility',
    formula: 'rolling std of returns over the horizon',
    desc: 'Annualised realised volatility proxy over the next N bars.',
  },
  {
    key: 'mfe',
    label: 'Max Favorable Excursion',
    formula: '(rolling_high_max − close) / close',
    desc: 'Best unrealised gain available over the horizon — how high it could go.',
  },
  {
    key: 'mae',
    label: 'Max Adverse Excursion',
    formula: '(rolling_low_min − close) / close',
    desc: 'Worst drawdown over the horizon — how low it could go.',
  },
  {
    key: 'future_range',
    label: 'Future range',
    formula: '(future_max − future_min) / close',
    desc: 'Normalised high−low range over the next N bars — a volatility proxy.',
  },
  {
    key: 'raw',
    label: 'Raw shift',
    formula: 'column.shift(−N)',
    desc: 'Any column shifted N bars forward. E.g. the close price N bars ahead.',
  },
]

const CLASSIFICATION_TARGETS = [
  {
    key: 'direction',
    label: 'Direction',
    output: '1 if next close > close, else 0',
    desc: 'Binary up/down signal. Trained with BCEWithLogitsLoss.',
  },
  {
    key: 'direction_threshold',
    label: 'Direction (threshold)',
    output: '1 / 0 / −1 for up / flat / down',
    desc: 'Ternary signal: only classifies as up or down when the move exceeds a threshold; otherwise flat.',
  },
  {
    key: 'large_move',
    label: 'Large move',
    output: '1 if |return| ≥ threshold, else 0',
    desc: 'Binary: did the price move more than the configured threshold in either direction?',
  },
  {
    key: 'breakout',
    label: 'Breakout',
    output: '1 if future rolling high > current high, else 0',
    desc: 'Binary: does price break above the current bar\'s high within the horizon?',
  },
]

function TargetsSection() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 leading-relaxed">
        Targets are computed from raw OHLCV data at config time and appended as columns before
        training. The <code className="text-xs bg-gray-100 px-1 rounded">shift</code> parameter controls the prediction horizon
        (e.g. <code className="text-xs bg-gray-100 px-1 rounded">shift=−1</code> = next bar, <code className="text-xs bg-gray-100 px-1 rounded">shift=−5</code> = 5 bars ahead).
        Any combination of targets can be trained simultaneously.
      </p>

      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
          Regression targets — trained with MSE / Huber / MAE loss
        </p>
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
          {REGRESSION_TARGETS.map(t => (
            <div key={t.key} className="flex gap-4 px-4 py-3 bg-white hover:bg-gray-50">
              <div className="w-40 shrink-0">
                <p className="text-xs font-semibold text-gray-800">{t.label}</p>
                <p className="text-xs text-blue-600 font-mono mt-0.5 break-all">{t.formula}</p>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
          Classification targets — trained with BCEWithLogitsLoss
        </p>
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
          {CLASSIFICATION_TARGETS.map(t => (
            <div key={t.key} className="flex gap-4 px-4 py-3 bg-white hover:bg-gray-50">
              <div className="w-40 shrink-0">
                <p className="text-xs font-semibold text-gray-800">{t.label}</p>
                <p className="text-xs text-violet-600 font-mono mt-0.5">{t.output}</p>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 3 — Hyperparameters
// ---------------------------------------------------------------------------

const HP_GROUPS = [
  {
    title: 'LSTM architecture',
    items: [
      { name: 'hidden_size', desc: 'Number of units per LSTM layer. Larger = more capacity; also increases head input size.' },
      { name: 'num_layers', desc: 'Stacked LSTM depth. Dropout is applied between layers (ignored when num_layers = 1).' },
      { name: 'dropout', desc: 'Dropout probability applied to LSTM inter-layer outputs. 0 to disable.' },
      { name: 'bidirectional', desc: 'Adds a reverse-direction pass through the sequence. Doubles effective hidden size fed to output heads.' },
    ],
  },
  {
    title: 'Training',
    items: [
      { name: 'optimizer', desc: 'adam / adamw / sgd / rmsprop.' },
      { name: 'learning_rate', desc: 'Initial learning rate. Reduced automatically if a scheduler is active.' },
      { name: 'weight_decay', desc: 'L2 regularisation applied to all parameters.' },
      { name: 'grad_clip', desc: 'Global gradient norm is clipped to this value before each optimiser step. Prevents exploding gradients.' },
      { name: 'max_epochs', desc: 'Hard ceiling. Training stops here even if val loss is still improving.' },
      { name: 'early_stopping_patience', desc: 'Stops training if val loss does not improve for this many consecutive epochs. Best model state is saved.' },
    ],
  },
  {
    title: 'LR scheduler',
    items: [
      { name: 'none', desc: 'Constant learning rate throughout training.' },
      { name: 'ReduceLROnPlateau', desc: 'Reduces LR by factor after patience non-improving val epochs.' },
      { name: 'CosineAnnealingLR', desc: 'Cosine decay from initial LR to eta_min over T_max epochs.' },
      { name: 'StepLR', desc: 'Multiplies LR by gamma every step_size epochs.' },
      { name: 'ExponentialLR', desc: 'Multiplies LR by gamma each epoch.' },
    ],
  },
  {
    title: 'Per-task settings',
    items: [
      { name: 'task_losses', desc: 'Loss function for each task: mse / mae / huber for regression; bce for classification. One entry per task, in order.' },
      { name: 'task_weights', desc: 'Scalar multiplier for each task\'s loss before summing to the combined loss. Higher weight = task pulls harder on the shared LSTM.' },
    ],
  },
]

function HyperparametersSection() {
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600 leading-relaxed">
        All hyperparameters are stored in the training config JSON and loaded at run time. Changes
        take effect on the next training run — no restart required.
      </p>
      {HP_GROUPS.map(group => (
        <div key={group.title}>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{group.title}</p>
          <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
            {group.items.map(item => (
              <div key={item.name} className="flex gap-4 px-4 py-3 bg-white hover:bg-gray-50">
                <code className="text-xs font-mono text-indigo-700 w-44 shrink-0 pt-0.5">{item.name}</code>
                <p className="text-xs text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MultiTaskNetwork() {
  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Multi-Task Network</h1>
        <p className="text-sm text-gray-500 mt-1">
          PyTorch LSTM that reads one ticker's bar history and predicts multiple targets simultaneously — built with PyTorch 2.2, pandas, scikit-learn, and NumPy.
        </p>
      </div>

      <Section title="Architecture" defaultOpen={true}>
        <ArchitectureSection />
      </Section>

      <Section title="Prediction targets">
        <TargetsSection />
      </Section>

      <Section title="Hyperparameters">
        <HyperparametersSection />
      </Section>
    </div>
  )
}
