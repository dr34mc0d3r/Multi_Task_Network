import { useState, useEffect, useCallback, useMemo } from 'react'

// ---------------------------------------------------------------------------
// LineChart — reusable SVG line chart, no external deps
// ---------------------------------------------------------------------------
function LineChart({ lines, referenceY, title, height = 130 }) {
  const W = 480
  const PAD = { top: 18, right: 12, bottom: 22, left: 52 }
  const IW = W - PAD.left - PAD.right
  const IH = height - PAD.top - PAD.bottom

  const allVals = lines.flatMap(l => l.data).filter(v => v != null && Number.isFinite(v))
  if (allVals.length === 0) {
    return (
      <div className="text-xs text-gray-400 text-center py-6 bg-gray-50 rounded">
        {title} — waiting for data…
      </div>
    )
  }

  let minV = Math.min(...allVals)
  let maxV = Math.max(...allVals)
  if (referenceY != null) { minV = Math.min(minV, referenceY); maxV = Math.max(maxV, referenceY) }
  let range = maxV - minV
  if (range === 0) {
    const pad = Math.abs(minV) * 0.1 || 0.1
    minV -= pad
    maxV += pad
    range = maxV - minV
  }

  const toX = (i, n) => PAD.left + (n > 1 ? (i / (n - 1)) * IW : IW / 2)
  const toY = (v) => PAD.top + (1 - (v - minV) / range) * IH

  const gridVals = [0, 0.33, 0.67, 1].map(t => minV + t * range)

  return (
    <div>
      {title && <div className="text-xs font-semibold text-gray-600 mb-1">{title}</div>}
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ maxHeight: height }}>
        {/* Grid */}
        {gridVals.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={toY(v)} x2={PAD.left + IW} y2={toY(v)}
              stroke="#e5e7eb" strokeWidth="1"
            />
            <text x={PAD.left - 4} y={toY(v)} textAnchor="end" dominantBaseline="middle"
              fontSize="8" fill="#9ca3af">
              {Math.abs(v) >= 1000 ? v.toExponential(2) : Math.abs(v) < 0.001 ? v.toExponential(2) : v.toPrecision(4)}
            </text>
          </g>
        ))}

        {/* Reference line */}
        {referenceY != null && (
          <line
            x1={PAD.left} y1={toY(referenceY)} x2={PAD.left + IW} y2={toY(referenceY)}
            stroke="#6b7280" strokeWidth="1" strokeDasharray="5 3"
          />
        )}

        {/* Data lines */}
        {lines.map(({ data, color }, li) => {
          const pts = data
            .map((v, i) => Number.isFinite(v) ? `${toX(i, data.length).toFixed(1)},${toY(v).toFixed(1)}` : null)
            .filter(Boolean)
          if (pts.length < 2) return null
          return (
            <polyline
              key={li}
              points={pts.join(' ')}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          )
        })}

        {/* X axis */}
        <line
          x1={PAD.left} y1={PAD.top + IH} x2={PAD.left + IW} y2={PAD.top + IH}
          stroke="#d1d5db" strokeWidth="1"
        />
        <text x={PAD.left + IW / 2} y={height - 2} textAnchor="middle" fontSize="8" fill="#9ca3af">
          epoch
        </text>
      </svg>

      {/* Legend */}
      <div className="flex gap-3 flex-wrap mt-1">
        {lines.map(({ color, label }, i) => (
          <div key={i} className="flex items-center gap-1">
            <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke={color} strokeWidth="2" /></svg>
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
        {referenceY != null && (
          <div className="flex items-center gap-1">
            <svg width="16" height="4">
              <line x1="0" y1="2" x2="16" y2="2" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="4 2" />
            </svg>
            <span className="text-xs text-gray-500">clip={referenceY}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------
function StatusBadge({ status, large = false }) {
  const styles = {
    pending:   'bg-yellow-100 text-yellow-700',
    running:   'bg-blue-100 text-blue-700 animate-pulse',
    completed: 'bg-emerald-100 text-emerald-700',
    failed:    'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-600',
  }
  return (
    <span
      className={`${styles[status] ?? 'bg-gray-100 text-gray-600'} ${large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'} rounded-full font-medium capitalize`}
    >
      {status ?? 'idle'}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------
function Section({ title, defaultOpen = false, locked = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`border border-gray-200 rounded-lg bg-white ${locked ? 'opacity-60 pointer-events-none' : ''}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
      >
        <span className="font-semibold text-sm text-gray-700">{title}</span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 pb-5">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Training page
// ---------------------------------------------------------------------------
export default function Training() {
  const [configs, setConfigs] = useState([])
  const [selectedConfig, setSelectedConfig] = useState(null)
  const [runs, setRuns] = useState([])
  const [activeRunId, setActiveRunId] = useState(null)
  const [progress, setProgress] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const isRunning = progress?.status === 'running'
  const isActive  = progress?.status === 'running' || progress?.status === 'pending'

  // Parse each config's JSON once
  const parsedConfigs = useMemo(() =>
    configs.map(c => {
      try { return { ...c, parsed: JSON.parse(c.config_json) } }
      catch { return { ...c, parsed: {} } }
    }),
    [configs]
  )

  const selectedParsed = useMemo(() => {
    if (!selectedConfig) return null
    try { return JSON.parse(selectedConfig.config_json) } catch { return {} }
  }, [selectedConfig])

  // Fetch configs that have hyperparameters saved
  useEffect(() => {
    fetch('/api/training-data/configs')
      .then(r => r.json())
      .then(data => {
        const withHp = data.filter(c => {
          try { return !!JSON.parse(c.config_json).hyperparameters } catch { return false }
        })
        setConfigs(withHp)
      })
      .catch(console.error)
  }, [])

  const refreshRuns = useCallback(() => {
    if (!selectedConfig) return
    fetch(`/api/training/runs?config_id=${selectedConfig.id}`)
      .then(r => r.json())
      .then(setRuns)
      .catch(console.error)
  }, [selectedConfig])

  useEffect(() => { refreshRuns() }, [refreshRuns])

  // Polling while running
  useEffect(() => {
    if (!activeRunId || !isActive) return
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/training/runs/${activeRunId}/progress`)
        const data = await res.json()
        setProgress(data)
        if (data.status !== 'running' && data.status !== 'pending') {
          clearInterval(id)
          refreshRuns()
        }
      } catch (e) {
        console.error(e)
      }
    }, 2000)
    return () => clearInterval(id)
  }, [activeRunId, isActive, refreshRuns])

  async function handleStart() {
    const res = await fetch('/api/training/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config_id: selectedConfig.id }),
    })
    if (!res.ok) {
      const err = await res.json()
      alert(err.detail ?? 'Failed to start training')
      return
    }
    const run = await res.json()
    setActiveRunId(run.id)
    setProgress({
      status: 'pending',
      current_epoch: 0,
      total_epochs: run.total_epochs,
      train_losses: [],
      val_losses: [],
      grad_norms: [],
      learning_rates: [],
      task_train_losses: {},
      task_val_losses: {},
      no_improve_count: 0,
      best_epoch: null,
      best_val_loss: null,
    })
    refreshRuns()
  }

  async function handleStop() {
    await fetch(`/api/training/runs/${activeRunId}/stop`, { method: 'POST' })
  }

  async function handleDeleteRun(runId) {
    await fetch(`/api/training/runs/${runId}`, { method: 'DELETE' })
    if (runId === activeRunId) { setActiveRunId(null); setProgress(null) }
    setDeleteConfirm(null)
    refreshRuns()
  }

  async function handleViewRun(run) {
    const res = await fetch(`/api/training/runs/${run.id}/progress`)
    const data = await res.json()
    setActiveRunId(run.id)
    setProgress(data)
  }

  const patience  = selectedParsed?.hyperparameters?.early_stopping_patience ?? 10
  const gradClip  = selectedParsed?.hyperparameters?.grad_clip ?? 1.0
  const tasks     = selectedParsed?.targets ?? []
  const maxEpochs = selectedParsed?.hyperparameters?.max_epochs ?? 0

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800">Training</h1>

      {/* §0 Select Configuration */}
      <Section title="§0 Select Configuration" defaultOpen>
        {parsedConfigs.length === 0 ? (
          <p className="text-sm text-gray-500">
            No configs with hyperparameters found. Complete the Hyperparameters page first.
          </p>
        ) : (
          <div className="space-y-2">
            {parsedConfigs.map(cfg => {
              const hp = cfg.parsed.hyperparameters
              const isSelected = selectedConfig?.id === cfg.id
              return (
                <div
                  key={cfg.id}
                  className={`border rounded-lg p-3 transition-colors ${isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-sm text-gray-800">{cfg.name}</span>
                      <span className="ml-3 text-xs text-gray-500">
                        {cfg.symbol} · {cfg.timeframe} · input={cfg.parsed.n_features ?? '?'} · hidden={hp?.hidden_size} · L={hp?.num_layers} · {cfg.parsed.targets?.length ?? 0} tasks
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedConfig(cfg)
                        setActiveRunId(null)
                        setProgress(null)
                      }}
                      className={`text-xs px-3 py-1.5 rounded font-medium ${isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                    >
                      {isSelected ? 'Selected' : 'Select'}
                    </button>
                  </div>

                  {/* Past runs sub-list */}
                  {isSelected && runs.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Past runs</div>
                      {runs.map(r => (
                        <div
                          key={r.id}
                          className={`flex items-center gap-2 text-xs rounded px-2 py-1.5 ${activeRunId === r.id ? 'bg-blue-100 border border-blue-200' : 'bg-white border border-gray-100'}`}
                        >
                          <StatusBadge status={r.status} />
                          <span className="text-gray-500">{new Date(r.started_at).toLocaleString()}</span>
                          <span className="text-gray-600">ep {r.current_epoch}/{r.total_epochs}</span>
                          {r.best_val_loss != null && (
                            <span className="text-gray-600">best={r.best_val_loss.toFixed(5)}</span>
                          )}
                          <div className="ml-auto flex gap-2">
                            <button
                              onClick={() => handleViewRun(r)}
                              className="text-blue-500 hover:text-blue-700"
                            >
                              View
                            </button>
                            {r.status !== 'running' && r.status !== 'pending' && (
                              deleteConfirm === r.id ? (
                                <span className="flex items-center gap-1">
                                  <button onClick={() => handleDeleteRun(r.id)} className="text-red-500 hover:text-red-700">Confirm</button>
                                  <button onClick={() => setDeleteConfirm(null)} className="text-gray-400 hover:text-gray-600">Cancel</button>
                                </span>
                              ) : (
                                <button onClick={() => setDeleteConfirm(r.id)} className="text-red-400 hover:text-red-600">Delete</button>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* §1 Controls */}
      <Section title="§1 Controls" defaultOpen locked={!selectedConfig}>
        {!selectedConfig ? (
          <p className="text-sm text-gray-400">Select a configuration above to continue.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleStart}
                disabled={isActive}
                className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                Start Training
              </button>
              {isRunning && (
                <button
                  onClick={handleStop}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors"
                >
                  Stop
                </button>
              )}
              {progress && <StatusBadge status={progress.status} large />}
            </div>

            {/* Progress bar */}
            {progress && maxEpochs > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Epoch {progress.current_epoch} / {progress.total_epochs}</span>
                  <span>{Math.round((progress.current_epoch / progress.total_epochs) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(progress.current_epoch / progress.total_epochs) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* §2 Live Progress */}
      {progress && (
        <Section title="§2 Live Progress" defaultOpen>
          {/* Status summary bar */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-600 mb-4 p-2 bg-gray-50 rounded border border-gray-100">
            <span>Epoch <strong>{progress.current_epoch}</strong> / {progress.total_epochs}</span>
            <span>No improvement: <strong>{progress.no_improve_count ?? 0}</strong> / {patience}</span>
            {progress.current_lr != null && (
              <span>
                LR: <strong className="font-mono">
                  {progress.current_lr < 1e-4
                    ? progress.current_lr.toExponential(2)
                    : progress.current_lr.toPrecision(4)}
                </strong>
              </span>
            )}
            {progress.best_epoch != null && (
              <span>
                Best epoch: <strong>{progress.best_epoch}</strong> · val loss:{' '}
                <strong>{progress.best_val_loss?.toFixed(6)}</strong>
              </span>
            )}
          </div>

          <div className="space-y-6">
            {/* Train / Val Loss */}
            <LineChart
              title="Train / Val Loss"
              lines={[
                { data: progress.train_losses ?? [], color: '#3b82f6', label: 'train' },
                { data: progress.val_losses ?? [], color: '#f59e0b', label: 'val' },
              ]}
            />

            {/* Overfitting Gap */}
            {(progress.train_losses?.length ?? 0) > 0 && (
              <LineChart
                title="Overfitting Gap (val − train)"
                lines={[{
                  data: (progress.val_losses ?? []).map((v, i) => v - (progress.train_losses[i] ?? 0)),
                  color: '#ef4444',
                  label: 'gap',
                }]}
              />
            )}

            {/* Learning Rate */}
            {(progress.learning_rates?.length ?? 0) > 0 && (() => {
              const lrs = progress.learning_rates
              const fmtLR = (v) => v < 1e-4 ? v.toExponential(2) : v.toPrecision(4)
              const changes = []
              lrs.forEach((lr, i) => {
                if (i === 0 || lr !== lrs[i - 1]) {
                  changes.push({ epoch: i + 1, lr, decreased: i > 0 && lr < lrs[i - 1] })
                }
              })
              return (
                <div>
                  <LineChart
                    title="Learning Rate"
                    lines={[{ data: lrs, color: '#22c55e', label: 'lr' }]}
                  />
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-mono">
                    {changes.length === 1 ? (
                      <span className="text-gray-400">constant: {fmtLR(changes[0].lr)}</span>
                    ) : (
                      changes.map(({ epoch, lr, decreased }) => (
                        <span key={epoch} className={decreased ? 'text-amber-600' : 'text-gray-400'}>
                          ep{epoch}: {decreased && '↓'}{fmtLR(lr)}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Gradient Norm */}
            {(progress.grad_norms?.length ?? 0) > 0 && (
              <LineChart
                title="Gradient Norm"
                lines={[{ data: progress.grad_norms, color: '#a855f7', label: 'grad norm' }]}
                referenceY={gradClip > 0 ? gradClip : undefined}
              />
            )}
          </div>

          {/* Per-task losses table */}
          {tasks.length > 1 && Object.keys(progress.task_train_losses ?? {}).length > 0 && (
            <div className="mt-5">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Per-task losses (latest epoch)</div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-1.5 pr-4">Task</th>
                    <th className="py-1.5 pr-4">Train Loss</th>
                    <th className="py-1.5 pr-4">Val Loss</th>
                    <th className="py-1.5">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map(t => {
                    const tArr = progress.task_train_losses?.[t.label] ?? []
                    const vArr = progress.task_val_losses?.[t.label] ?? []
                    return (
                      <tr key={t.label} className="border-b border-gray-100">
                        <td className="py-1.5 pr-4 font-medium text-gray-700">{t.label}</td>
                        <td className="py-1.5 pr-4 text-gray-600">
                          {tArr.length > 0 ? tArr[tArr.length - 1].toFixed(6) : '—'}
                        </td>
                        <td className="py-1.5 pr-4 text-gray-600">
                          {vArr.length > 0 ? vArr[vArr.length - 1].toFixed(6) : '—'}
                        </td>
                        <td className="py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-white text-xs font-medium ${t.task_type === 'classification' ? 'bg-purple-500' : 'bg-blue-500'}`}>
                            {t.task_type === 'classification' ? 'CLF' : 'REG'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {/* §3 Results */}
      {progress?.status === 'completed' && (
        <Section title="§3 Results" defaultOpen>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                <div className="text-xs text-emerald-600 mb-1">Best Epoch</div>
                <div className="text-2xl font-bold text-emerald-700">{progress.best_epoch}</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <div className="text-xs text-blue-600 mb-1">Best Val Loss</div>
                <div className="text-2xl font-bold text-blue-700">{progress.best_val_loss?.toFixed(6)}</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-600 mb-1">Epochs Trained</div>
                <div className="text-2xl font-bold text-gray-700">{progress.current_epoch}</div>
              </div>
            </div>

            {progress.model_path && (
              <div>
                <div className="text-xs text-gray-500 mb-1 font-medium">Model checkpoint</div>
                <div className="font-mono text-xs bg-gray-100 p-2 rounded border break-all text-gray-700">
                  {progress.model_path}
                </div>
              </div>
            )}

            <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3 text-sm text-emerald-700 font-medium">
              This model is ready for Evaluation.
            </div>
          </div>
        </Section>
      )}

      {/* Error display */}
      {progress?.status === 'failed' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          <strong>Training failed:</strong>{' '}
          {progress.error ?? 'Unknown error'}
        </div>
      )}
    </div>
  )
}
