import { useCallback, useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtNum(n) { return typeof n === 'number' ? n.toLocaleString() : (n ?? '—') }
function rowKey(r) { return `${r.symbol}__${r.timeframe}__${r.feed}__${r.adjustment}` }

function fmtCell(col, val) {
  if (val == null) return <span className="text-gray-300">—</span>
  if (col === 'timestamp_utc') return fmtDate(val)
  if (typeof val === 'number') {
    if (Math.abs(val) > 100000) return val.toLocaleString(undefined, { maximumFractionDigits: 0 })
    if (Math.abs(val) > 1000)   return val.toLocaleString(undefined, { maximumFractionDigits: 2 })
    if (Math.abs(val) < 0.0001) return val.toExponential(3)
    return val.toFixed(4)
  }
  const s = String(val)
  return s.length > 24 ? s.slice(0, 24) + '…' : s
}

const inputCls = 'border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const wideInputCls = `${inputCls} w-24`
const narrowInputCls = `${inputCls} w-20`

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function Section({ title, children, defaultOpen = false, badge }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-bold text-gray-800">{title}</span>
          {badge && <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full shrink-0">{badge}</span>}
        </div>
        <span className="text-gray-400 text-xs shrink-0 ml-4"
          style={{ display: 'inline-block', transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          ▶
        </span>
      </button>
      {open && <div className="px-6 pb-6 pt-3 border-t border-gray-100">{children}</div>}
    </div>
  )
}

function Locked({ message = 'Complete the previous steps first.' }) {
  return (
    <div className="flex items-center gap-2 py-3">
      <span className="text-gray-300 text-sm">🔒</span>
      <p className="text-sm text-gray-400 italic">{message}</p>
    </div>
  )
}

function StatCard({ label, value, sub, color = 'gray' }) {
  const colors = {
    gray:    'bg-gray-50 border-gray-200 text-gray-800',
    blue:    'bg-blue-50 border-blue-200 text-blue-800',
    amber:   'bg-amber-50 border-amber-200 text-amber-800',
    red:     'bg-red-50 border-red-200 text-red-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  }
  return (
    <div className={`rounded-lg border p-3 ${colors[color]}`}>
      <p className="text-xs font-semibold opacity-70 mb-0.5">{label}</p>
      <p className="text-lg font-bold tabular-nums">{fmtNum(value)}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  )
}

function DataTable({ rows, maxCols = 8 }) {
  if (!rows || rows.length === 0) return <p className="text-xs text-gray-400">No rows.</p>
  const allCols = Object.keys(rows[0])
  // Always show timestamp first, then prioritise OHLCV, then truncate
  const priority = ['timestamp_utc', 'open', 'high', 'low', 'close', 'volume']
  const rest = allCols.filter(c => !priority.includes(c))
  const cols = [...priority.filter(c => allCols.includes(c)), ...rest].slice(0, maxCols)
  const truncated = allCols.length > maxCols
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="text-xs border-collapse min-w-full">
          <thead>
            <tr className="bg-gray-50">
              {cols.map(col => (
                <th key={col} className="px-3 py-1.5 border-b border-gray-200 text-left text-gray-500 font-semibold whitespace-nowrap">{col}</th>
              ))}
              {truncated && <th className="px-3 py-1.5 border-b border-gray-200 text-gray-300 font-normal">+{allCols.length - maxCols} more</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                {cols.map(col => (
                  <td key={col} className="px-3 py-1 border-b border-gray-100 text-gray-700 font-mono whitespace-nowrap">
                    {fmtCell(col, row[col])}
                  </td>
                ))}
                {truncated && <td className="px-3 py-1 border-b border-gray-100" />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated && <p className="text-xs text-gray-400 mt-1">Showing {cols.length} of {allCols.length} columns.</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// §0 — Saved configurations
// ---------------------------------------------------------------------------

function SavedConfigs({ onLoad, refreshTrigger }) {
  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewingId, setViewingId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/training-data/configs')
      setConfigs(res.ok ? await res.json() : [])
    } catch { setConfigs([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load, refreshTrigger])

  async function handleDelete(id) {
    await fetch(`/api/training-data/configs/${id}`, { method: 'DELETE' })
    setConfirmId(null); load()
  }

  if (loading) return <p className="text-sm text-gray-400 animate-pulse">Loading saved configurations…</p>
  if (configs.length === 0) return (
    <p className="text-sm text-gray-400 italic">No saved configurations yet. Configure the sections below and save.</p>
  )

  return (
    <div className="space-y-1">
      {configs.map(cfg => {
        const parsed = (() => { try { return JSON.parse(cfg.config_json) } catch { return {} } })()
        const splitLabel = `${Math.round((parsed.train_ratio ?? 0.7) * 100)}/${Math.round((parsed.val_ratio ?? 0.15) * 100)}/${Math.round((parsed.test_ratio ?? 0.15) * 100)}`
        const isViewing = viewingId === cfg.id
        return (
          <div key={cfg.id} className={`rounded-lg border transition-colors ${isViewing ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
              <span className="font-semibold text-sm text-gray-800 min-w-0 truncate flex-1">{cfg.name}</span>
              <span className="font-mono text-xs font-bold text-gray-600 shrink-0">{cfg.symbol}</span>
              <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded shrink-0">{cfg.timeframe}</span>
              <span className="text-xs text-gray-400 shrink-0">{parsed.scaler_type ?? '—'} · lb={parsed.lookback ?? '—'} · {splitLabel}</span>
              <span className="text-xs text-gray-300 shrink-0">{fmtDate(cfg.created_at)}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setViewingId(isViewing ? null : cfg.id)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded transition-colors cursor-pointer">
                  {isViewing ? 'Close' : 'View'}
                </button>
                <button onClick={() => { onLoad(cfg); setViewingId(null) }}
                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 px-2 py-1 rounded transition-colors cursor-pointer">
                  Load
                </button>
                {confirmId === cfg.id ? (
                  <>
                    <button onClick={() => handleDelete(cfg.id)}
                      className="text-xs font-semibold text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded transition-colors cursor-pointer">
                      Confirm
                    </button>
                    <button onClick={() => setConfirmId(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded cursor-pointer">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button onClick={() => setConfirmId(cfg.id)}
                    className="text-xs text-gray-300 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors cursor-pointer">
                    Delete
                  </button>
                )}
              </div>
            </div>
            {isViewing && (
              <div className="px-4 pb-4 pt-1 border-t border-blue-100 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
                  {[
                    ['Symbol', cfg.symbol], ['Timeframe', cfg.timeframe],
                    ['Feed', cfg.feed], ['Adjustment', cfg.adjustment],
                    ['Scaler', parsed.scaler_type], ['Lookback', parsed.lookback],
                    ['Batch size', parsed.batch_size], ['Shuffle', String(parsed.shuffle)],
                    ['Train/Val/Test', splitLabel], ['NaN strategy', parsed.nan_strategy],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-white rounded border border-blue-100 px-2.5 py-1.5">
                      <p className="text-gray-400 font-semibold">{k}</p>
                      <p className="text-gray-700 font-mono mt-0.5">{v ?? '—'}</p>
                    </div>
                  ))}
                </div>
                {parsed.targets?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-1">Targets ({parsed.targets.length})</p>
                    <div className="flex flex-wrap gap-1.5">
                      {parsed.targets.map((t, i) => (
                        <span key={i} className="text-xs bg-violet-50 border border-violet-200 text-violet-700 px-2 py-0.5 rounded-full font-mono">
                          {t.label} ({t.task_type})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// §1 — Select training data (lifted from previous implementation)
// ---------------------------------------------------------------------------

function SelectTrainingData({ selected, onSelect }) {
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(true)
  const [featureCounts, setFeatureCounts] = useState({})
  const [error, setError] = useState(null)

  const loadSummary = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/bars/summary')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const rows = await res.json()
      setSummary(rows)
      const entries = await Promise.all(rows.map(async row => {
        const qs = new URLSearchParams({ symbol: row.symbol, timeframe: row.timeframe, feed: row.feed, adjustment: row.adjustment })
        try {
          const r = await fetch(`/api/features/saved?${qs}`)
          const keys = r.ok ? await r.json() : []
          return [rowKey(row), keys.length]
        } catch { return [rowKey(row), 0] }
      }))
      setFeatureCounts(Object.fromEntries(entries))
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadSummary() }, [loadSummary])

  const grouped = {}
  for (const row of summary) {
    if (!grouped[row.symbol]) grouped[row.symbol] = []
    grouped[row.symbol].push(row)
  }
  const symbols = Object.keys(grouped).sort()
  const isSelected = r => selected && rowKey(selected) === rowKey(r)

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Choose one ticker + interval from your stored bar data. This becomes the input dataset for the training run.
      </p>
      {selected && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-3 flex-wrap">
          <span className="text-emerald-600 text-sm font-bold shrink-0">✓ Selected</span>
          <span className="font-mono text-sm font-bold text-emerald-900">{selected.symbol}</span>
          <span className="font-mono text-xs bg-white border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded">{selected.timeframe}</span>
          <span className="text-xs text-emerald-700">{selected.feed} · {selected.adjustment}</span>
          {featureCounts[rowKey(selected)] > 0
            ? <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">{featureCounts[rowKey(selected)]} features</span>
            : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">OHLCV only</span>}
          <button onClick={() => onSelect(null)} className="ml-auto text-xs text-emerald-500 hover:text-emerald-800 cursor-pointer">Clear</button>
        </div>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading ? (
        <div className="space-y-2 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-md" />)}</div>
      ) : summary.length === 0 ? (
        <p className="text-sm text-gray-400">No bar data found. Download data on the Data Acquire page first.</p>
      ) : (
        <div className="space-y-4">
          {symbols.map(symbol => (
            <div key={symbol}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5 px-1">{symbol}</p>
              <div className="space-y-1">
                {grouped[symbol].map(row => {
                  const key = rowKey(row); const nf = featureCounts[key] ?? null; const active = isSelected(row)
                  return (
                    <div key={key} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${active ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                      <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded shrink-0 ${active ? 'bg-emerald-200 text-emerald-800' : 'bg-blue-50 text-blue-700'}`}>{row.timeframe}</span>
                      <span className="text-sm font-semibold tabular-nums shrink-0">{fmtNum(row.bar_count)}<span className="text-xs font-normal text-gray-400 ml-0.5">bars</span></span>
                      <span className="text-xs text-gray-400 shrink-0">{row.feed} · {row.adjustment}</span>
                      <span className="text-xs text-gray-400 font-mono hidden sm:inline shrink-0">{fmtDate(row.earliest)} – {fmtDate(row.latest)}</span>
                      <div className="flex-1" />
                      {nf === null ? <span className="text-xs text-gray-300 animate-pulse shrink-0">…</span>
                        : nf > 0 ? <span className="text-xs font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full shrink-0">{nf} features</span>
                        : <span className="text-xs text-gray-300 border border-gray-200 px-2 py-0.5 rounded-full shrink-0">OHLCV only</span>}
                      <button onClick={() => onSelect(active ? null : row)}
                        className={`text-xs font-semibold px-3 py-1 rounded-md transition-colors cursor-pointer shrink-0 ${active ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {active ? 'Selected' : 'Select'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// §2 — Raw data preview
// ---------------------------------------------------------------------------

function RawDataPreview({ selectedData, onPreviewLoaded }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!selectedData) { setData(null); return }
    setLoading(true); setError(null)
    const qs = new URLSearchParams({ symbol: selectedData.symbol, timeframe: selectedData.timeframe, feed: selectedData.feed, adjustment: selectedData.adjustment, n_rows: 20 })
    fetch(`/api/training-data/preview?${qs}`)
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(b.detail)))
      .then(d => { setData(d); onPreviewLoaded?.(d) })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }, [selectedData])

  if (!selectedData) return <Locked />
  if (loading) return <p className="text-sm text-gray-400 animate-pulse">Loading data preview…</p>
  if (error) return <p className="text-sm text-red-500">{error}</p>
  if (!data) return null

  const nanCols = Object.entries(data.nan_per_column ?? {})

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total bars" value={data.total_bars} color="blue" />
        <StatCard label="Columns" value={data.columns?.length} />
        <StatCard label="Columns with NaN" value={nanCols.length} color={nanCols.length > 0 ? 'amber' : 'gray'} />
        <StatCard label="Date range" value={`${fmtDate(data.earliest)} – ${fmtDate(data.latest)}`} />
      </div>

      {nanCols.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">Columns with NaN values (indicator warmup)</p>
          <div className="flex flex-wrap gap-1.5">
            {nanCols.slice(0, 20).map(([col, n]) => (
              <span key={col} className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded font-mono">
                {col}: {n}
              </span>
            ))}
            {nanCols.length > 20 && <span className="text-xs text-gray-400">+{nanCols.length - 20} more</span>}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">First 20 rows</p>
        <DataTable rows={data.rows} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// §3 — Target builder
// ---------------------------------------------------------------------------

const PRESET_TARGETS = [
  { label: 'Next Close',    source_col: 'close', shift: -1, task_type: 'regression',     derived: null,               params: {} },
  { label: 'Direction',     source_col: 'close', shift: -1, task_type: 'classification', derived: 'direction',        params: {} },
  { label: 'Next High',     source_col: 'high',  shift: -1, task_type: 'regression',     derived: null,               params: {} },
  { label: 'Next Low',      source_col: 'low',   shift: -1, task_type: 'regression',     derived: null,               params: {} },
  { label: 'Return %',      source_col: 'close', shift: -1, task_type: 'regression',     derived: 'return_pct',       params: {} },
  { label: 'Return (frac)', source_col: 'close', shift: -1, task_type: 'regression',     derived: 'return_frac',      params: {} },
  { label: 'Log Return',    source_col: 'close', shift: -1, task_type: 'regression',     derived: 'log_return',       params: {} },
  { label: 'Realized Vol 5',source_col: 'close', shift: -5, task_type: 'regression',     derived: 'realized_vol',     params: {} },
  { label: 'MFE 5',         source_col: 'close', shift: -5, task_type: 'regression',     derived: 'mfe',              params: {} },
  { label: 'MAE 5',         source_col: 'close', shift: -5, task_type: 'regression',     derived: 'mae',              params: {} },
  { label: 'Large Move',    source_col: 'close', shift: -5, task_type: 'classification', derived: 'large_move',       params: { threshold: 0.02 } },
  { label: 'Breakout 5',    source_col: 'close', shift: -5, task_type: 'classification', derived: 'breakout',         params: {} },
]

const DERIVED_OPTIONS = [
  { value: null,                  label: 'Raw value',          desc: 'col.shift(N)',                     taskType: 'regression'     },
  { value: 'return_frac',         label: 'Return (frac)',      desc: '(shifted − cur) / cur',            taskType: 'regression'     },
  { value: 'return_pct',          label: 'Return (%)',         desc: '× 100',                            taskType: 'regression'     },
  { value: 'log_return',          label: 'Log return',         desc: 'log(shifted / cur)',               taskType: 'regression'     },
  { value: 'direction',           label: 'Direction',          desc: '1 if shifted > cur',               taskType: 'classification' },
  { value: 'direction_threshold', label: 'Direction (3-class)',desc: 'BUY / HOLD / SELL vs threshold',   taskType: 'classification' },
  { value: 'realized_vol',        label: 'Realized Volatility',desc: 'std(pct_change) over horizon',     taskType: 'regression'     },
  { value: 'mfe',                 label: 'MFE',                desc: '(max_high − close) / close',       taskType: 'regression'     },
  { value: 'mae',                 label: 'MAE',                desc: '(min_low − close) / close',        taskType: 'regression'     },
  { value: 'future_range',        label: 'Future Range',       desc: '(max_high − min_low) / close',     taskType: 'regression'     },
  { value: 'large_move',          label: 'Large Move',         desc: 'abs(return) ≥ threshold',          taskType: 'classification' },
  { value: 'breakout',            label: 'Breakout',           desc: 'max(high in horizon) > cur high',  taskType: 'classification' },
]

const FORMULA_PARAMS = {
  direction_threshold: [{ key: 'threshold', label: 'Threshold', default: 0.01, step: 0.001, min: 0 }],
  large_move:          [{ key: 'threshold', label: 'Threshold', default: 0.02, step: 0.001, min: 0 }],
}

const WINDOW_FORMULAS = new Set(['realized_vol', 'mfe', 'mae', 'future_range', 'breakout'])

function derivedTaskType(d) {
  return DERIVED_OPTIONS.find(o => o.value === d)?.taskType ?? 'regression'
}

const OHLCV_COLS = ['open', 'high', 'low', 'close', 'volume']

function TargetBuilder({ selectedData, targets, onTargetsChange, availableColumns }) {
  const [showCustom, setShowCustom] = useState(false)
  const [showHelp,   setShowHelp]   = useState(false)
  const [custom, setCustom] = useState({ label: '', source_col: 'close', shift: -1, task_type: 'regression', derived: null, params: {} })

  if (!selectedData) return <Locked />

  const cols = availableColumns?.filter(c => c !== 'timestamp_utc') ?? OHLCV_COLS
  const presentLabels = new Set(targets.map(t => t.label))

  function addPreset(p) {
    if (presentLabels.has(p.label)) return
    onTargetsChange([...targets, { ...p }])
  }

  function addCustom(e) {
    e.preventDefault()
    if (!custom.label.trim() || presentLabels.has(custom.label.trim())) return
    onTargetsChange([...targets, { ...custom, label: custom.label.trim() }])
    setCustom({ label: '', source_col: 'close', shift: -1, task_type: 'regression', derived: null, params: {} })
    setShowCustom(false)
  }

  function removeTarget(label) {
    onTargetsChange(targets.filter(t => t.label !== label))
  }

  const inputCls = 'border border-gray-300 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-gray-500">
          Define what the network will predict. Each target is derived from your input data and becomes one output head.
          Multiple targets enable multi-task learning — the network shares features but predicts each target simultaneously.
        </p>
        <button onClick={() => setShowHelp(v => !v)}
          className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-md border border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600 transition-colors cursor-pointer">
          {showHelp ? 'Hide guide' : '? Guide'}
        </button>
      </div>

      {showHelp && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-5 text-xs">

          {/* Form fields */}
          <div>
            <p className="font-bold text-blue-900 mb-2 text-sm">Custom form fields</p>
            <div className="space-y-2">
              {[
                { field: 'Label', desc: 'A name for this target — used in logging, the config file, and the output layer. Make it descriptive, e.g. "5d MFE" or "Direction 1h".' },
                { field: 'Source column', desc: 'The OHLCV column the formula is applied to. Usually close. For MFE, MAE, Future Range, and Breakout, the backend automatically uses the high and low columns regardless of this setting.' },
                { field: 'Shift / Horizon', desc: 'How many bars into the future to look. Use negative integers: -1 = next bar, -5 = five bars ahead. For single-bar formulas (Return, Direction) this is the exact future bar. For window formulas (MFE, MAE, Realized Vol, etc.) this is the window length — the formula aggregates over that many future bars.' },
                { field: 'Transform', desc: 'The formula applied to the source column. See the table below. Determines what value is actually computed for each training row.' },
                { field: 'Threshold', desc: 'Appears for Direction (3-class) and Large Move. Sets the boundary between classes. Example: 0.02 means a return must be ≥ 2% to be BUY, ≤ −2% to be SELL, anything in between is HOLD.' },
                { field: 'Type', desc: 'Regression = predict a continuous number (loss: MSE by default). Classification = predict a discrete class (loss: BCE or CE). Auto-set based on Transform, but can be overridden.' },
              ].map(({ field, desc }) => (
                <div key={field} className="flex gap-2">
                  <span className="font-semibold text-blue-800 w-28 shrink-0">{field}</span>
                  <span className="text-blue-700">{desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Formula reference table */}
          <div>
            <p className="font-bold text-blue-900 mb-2 text-sm">Formula reference</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-blue-200">
                    <th className="py-1 pr-3 font-semibold text-blue-800 w-36">Name</th>
                    <th className="py-1 pr-3 font-semibold text-blue-800 w-24">Type</th>
                    <th className="py-1 pr-3 font-semibold text-blue-800">Formula</th>
                    <th className="py-1 font-semibold text-blue-800">When to use</th>
                  </tr>
                </thead>
                <tbody className="text-blue-700">
                  {[
                    { name: 'Raw value',           type: 'reg', formula: 'col[t + shift]',                                  use: 'Predict the exact future price. Hard to learn — prefer a normalised return instead.' },
                    { name: 'Return (frac)',        type: 'reg', formula: '(col[t+N] − col[t]) / col[t]',                   use: 'Fractional return over N bars. Scale-invariant. The most common regression target.' },
                    { name: 'Return (%)',           type: 'reg', formula: '× 100',                                          use: 'Same as Return (frac) but expressed in percent. Values are 100× larger — adjust loss weights accordingly.' },
                    { name: 'Log return',           type: 'reg', formula: 'log(col[t+N] / col[t])',                         use: 'Symmetric and additive across time. Preferred when returns span a wide range or when you later combine multi-period returns.' },
                    { name: 'Direction',            type: 'clf', formula: '1 if col[t+N] > col[t] else 0',                  use: 'Simple up/down signal. Binary classification. Use when you only care about directionality, not magnitude.' },
                    { name: 'Direction (3-class)',  type: 'clf', formula: '1 (BUY) / 0 (HOLD) / −1 (SELL) vs threshold',   use: 'Filters out small noise moves into a HOLD class. More realistic than binary — the model learns to abstain when the signal is weak.' },
                    { name: 'Realized Volatility',  type: 'reg', formula: 'std(pct_change(col[t+1 : t+H]))',               use: 'Predicts how much the price will move over the next H bars. Use for position sizing, options pricing, or regime detection.' },
                    { name: 'MFE',                  type: 'reg', formula: '(max(high[t+1:t+H]) − col[t]) / col[t]',        use: 'Maximum Favorable Excursion — the best upside available in the next H bars. Useful for target selection and take-profit placement.' },
                    { name: 'MAE',                  type: 'reg', formula: '(min(low[t+1:t+H]) − col[t]) / col[t]',         use: 'Maximum Adverse Excursion — the worst drawdown in the next H bars. Useful for stop-loss placement and risk management.' },
                    { name: 'Future Range',         type: 'reg', formula: '(max(high) − min(low)) / col[t]  over H bars',   use: 'Total price range over the window. Combines MFE and MAE into a single volatility proxy. Useful for bar-range prediction.' },
                    { name: 'Large Move',           type: 'clf', formula: 'abs(return_frac) ≥ threshold  →  0/1',           use: 'Binary: will there be a big move at all, regardless of direction? Useful for event-detection or options strategies.' },
                    { name: 'Breakout',             type: 'clf', formula: 'max(high[t+1:t+H]) > high[t]  →  0/1',          use: 'Did price break above the current bar\'s high over the next H bars? Classic momentum / range-expansion signal.' },
                  ].map(({ name, type, formula, use }) => (
                    <tr key={name} className="border-b border-blue-100 last:border-0">
                      <td className="py-1.5 pr-3 font-semibold">{name}</td>
                      <td className="py-1.5 pr-3">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${type === 'clf' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-800'}`}>{type.toUpperCase()}</span>
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-[10px]">{formula}</td>
                      <td className="py-1.5">{use}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Multi-task note */}
          <div className="border-t border-blue-200 pt-3">
            <p className="font-bold text-blue-900 mb-1">Multi-task learning</p>
            <p className="text-blue-700">Adding multiple targets creates one output head per target. The network shares the LSTM layers but produces independent predictions. This often improves the shared representation — for example, jointly predicting Return + Volatility + Direction forces the model to learn richer features than any single target alone. Each head gets its own loss weight in the Task Heads section.</p>
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Presets</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_TARGETS.map(p => {
            const added = presentLabels.has(p.label)
            return (
              <button key={p.label} onClick={() => addPreset(p)} disabled={added}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${added ? 'bg-violet-50 border-violet-200 text-violet-600 opacity-50' : 'bg-white border-gray-200 text-gray-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700'}`}>
                {added ? '✓ ' : '+ '}{p.label}
                <span className="ml-1 text-[10px] opacity-60">{p.task_type === 'classification' ? 'clf' : 'reg'}</span>
              </button>
            )
          })}
          <button onClick={() => setShowCustom(v => !v)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
            {showCustom ? '✕ Cancel' : '+ Custom'}
          </button>
        </div>
      </div>

      {showCustom && (
        <form onSubmit={addCustom} className="flex flex-wrap gap-2 items-end bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-gray-400">Label</label>
            <input required value={custom.label} onChange={e => setCustom(c => ({ ...c, label: e.target.value }))}
              placeholder="My Target" className={`${inputCls} w-28`} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-gray-400">Source column</label>
            <select value={custom.source_col} onChange={e => setCustom(c => ({ ...c, source_col: e.target.value }))} className={inputCls}>
              {cols.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-gray-400">{WINDOW_FORMULAS.has(custom.derived) ? 'Horizon' : 'Shift'}</label>
            <input type="number" value={custom.shift} onChange={e => setCustom(c => ({ ...c, shift: Number(e.target.value) }))}
              className={`${inputCls} w-16`} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-gray-400">Transform</label>
            <select value={custom.derived ?? ''} onChange={e => {
              const d = e.target.value === '' ? null : e.target.value
              const defaults = Object.fromEntries((FORMULA_PARAMS[d] ?? []).map(p => [p.key, p.default]))
              setCustom(c => ({ ...c, derived: d, task_type: derivedTaskType(d), params: defaults }))
            }} className={inputCls}>
              {DERIVED_OPTIONS.map(o => (
                <option key={String(o.value)} value={o.value ?? ''}>{o.label} — {o.desc}</option>
              ))}
            </select>
          </div>
          {(FORMULA_PARAMS[custom.derived] ?? []).map(p => (
            <div key={p.key} className="flex flex-col gap-0.5">
              <label className="text-[10px] font-semibold text-gray-400">{p.label}</label>
              <input type="number" step={p.step} min={p.min}
                value={custom.params[p.key] ?? p.default}
                onChange={e => setCustom(c => ({ ...c, params: { ...c.params, [p.key]: parseFloat(e.target.value) } }))}
                className={`${inputCls} w-20`} />
            </div>
          ))}
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold text-gray-400">Type</label>
            <select value={custom.task_type} onChange={e => setCustom(c => ({ ...c, task_type: e.target.value }))} className={inputCls}>
              <option value="regression">Regression</option>
              <option value="classification">Classification</option>
            </select>
          </div>
          <button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors cursor-pointer">Add</button>
        </form>
      )}

      {targets.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">{targets.length} task{targets.length !== 1 ? 's' : ''} defined</p>
          <div className="space-y-1">
            {targets.map((t, i) => (
              <div key={i} className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                <span className="w-5 h-5 rounded-full bg-violet-200 text-violet-800 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="text-sm font-semibold text-violet-900 flex-1">{t.label}</span>
                <span className="text-xs font-mono text-violet-600">{t.source_col}.shift({t.shift})</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.task_type === 'classification' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                  {t.task_type === 'classification' ? 'CLF' : 'REG'}
                </span>
                <button onClick={() => removeTarget(t.label)} className="text-violet-300 hover:text-red-500 text-xs cursor-pointer transition-colors shrink-0">✕</button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">No targets yet. Add at least one to continue.</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// §4 — Handle missing values
// ---------------------------------------------------------------------------

function NaNHandler({ selectedData, targets, nanInfo, onNanInfoChange, nanStrategy, onNanStrategyChange }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  if (!selectedData || targets.length === 0) return <Locked message="Select training data and define at least one target first." />

  async function calculate() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/training-data/nan-info', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedData.symbol, timeframe: selectedData.timeframe,
          feed: selectedData.feed, adjustment: selectedData.adjustment,
          targets,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
      onNanInfoChange(data)
    } catch (err) { setError(String(err)) }
    finally { setLoading(false) }
  }

  const pctDropped = nanInfo ? ((nanInfo.total_nan_rows / nanInfo.total_rows) * 100).toFixed(1) : null

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        NaN rows arise from indicator warmup (start of series) and target shift alignment (end of series). You must handle them before splitting.
      </p>

      <button onClick={calculate} disabled={loading}
        className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold px-4 py-2 rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed">
        {loading ? 'Calculating…' : 'Calculate NaN Impact'}
      </button>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {nanInfo && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total rows" value={nanInfo.total_rows} />
            <StatCard label="Indicator warmup NaN" value={nanInfo.warmup_nan_rows} color="amber" />
            <StatCard label="Target alignment NaN" value={nanInfo.target_nan_rows} color="amber" />
            <StatCard label="Rows after drop" value={nanInfo.rows_after_drop} color="emerald"
              sub={`${(100 - parseFloat(pctDropped)).toFixed(1)}% of data retained`} />
          </div>
          {parseFloat(pctDropped) > 10 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2 text-sm text-amber-800">
              <span>⚠️</span>
              <p><strong>{pctDropped}% of data</strong> will be dropped. If this seems high, you may have very long-period indicators (e.g. 200-day SMA needs 200 bars of warmup). Consider a shorter indicator period or downloading more history.</p>
            </div>
          )}
        </>
      )}

      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Strategy</p>
        <div className="flex gap-3">
          {[['drop', 'Drop all NaN rows (recommended)', 'Safest — no imputed values enter the model.'],
            ['ffill', 'Forward-fill then drop remaining', 'Fills NaN with the last known value. Use with caution on indicators.']].map(([val, label, desc]) => (
            <label key={val} className="flex gap-3 cursor-pointer bg-gray-50 border border-gray-200 rounded-lg p-3 flex-1 hover:border-blue-300 transition-colors">
              <input type="radio" name="nanStrategy" value={val} checked={nanStrategy === val} onChange={() => onNanStrategyChange(val)} className="mt-0.5 shrink-0 accent-blue-600" />
              <div>
                <p className="text-sm font-semibold text-gray-800">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// §5 — Train / Validation / Test split
// ---------------------------------------------------------------------------

function TimelineBar({ train, val, test, data }) {
  if (!data) return null
  return (
    <div className="space-y-1.5">
      <div className="flex h-7 rounded-lg overflow-hidden text-xs font-semibold">
        <div className="bg-blue-500 flex items-center justify-center text-white shrink-0" style={{ width: `${train}%` }}>{train}%</div>
        <div className="bg-amber-400 flex items-center justify-center text-white shrink-0" style={{ width: `${val}%` }}>{val}%</div>
        <div className="bg-red-400 flex items-center justify-center text-white shrink-0" style={{ width: `${test}%` }}>{test}%</div>
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>{fmtDate(data.train?.start)}</span>
        <span className="text-center">{fmtDate(data.val?.start)} · {fmtDate(data.val?.end)}</span>
        <span>{fmtDate(data.test?.end)}</span>
      </div>
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500 inline-block" />Train {fmtNum(data.train?.count)} bars</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" />Val {fmtNum(data.val?.count)} bars</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400 inline-block" />Test {fmtNum(data.test?.count)} bars</span>
      </div>
    </div>
  )
}

function SplitSection({ selectedData, targets, nanStrategy, nanInfo, splitRatios, onSplitRatiosChange, splitData, onSplitDataChange }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showTrain, setShowTrain] = useState(false)
  const [showVal, setShowVal]   = useState(false)
  const [showTest, setShowTest] = useState(false)

  if (!nanInfo) return <Locked message="Calculate NaN impact (§4) first." />

  const sum = splitRatios.train + splitRatios.val + splitRatios.test
  const sumOk = sum === 100

  function setRatio(key, val) {
    const n = Math.max(1, Math.min(98, Number(val)))
    onSplitRatiosChange({ ...splitRatios, [key]: n })
  }

  async function fetchSplit() {
    if (!sumOk) return
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/training-data/split-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedData.symbol, timeframe: selectedData.timeframe,
          feed: selectedData.feed, adjustment: selectedData.adjustment,
          targets, nan_strategy: nanStrategy,
          train_ratio: splitRatios.train / 100,
          val_ratio: splitRatios.val / 100,
          test_ratio: splitRatios.test / 100,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
      onSplitDataChange(data)
    } catch (err) { setError(String(err)) }
    finally { setLoading(false) }
  }

  const inputCls = 'w-16 border border-gray-300 rounded-md px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500'

  function SamplePanel({ label, color, partition, show, onToggle }) {
    if (!partition) return null
    const hdr = { blue: 'bg-blue-500', amber: 'bg-amber-400', red: 'bg-red-400' }
    return (
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors">
          <span className={`w-3 h-3 rounded-sm ${hdr[color]} shrink-0`} />
          <span className="text-sm font-bold text-gray-800">{label}</span>
          <span className="text-xs text-gray-400">{fmtNum(partition.count)} bars · {fmtDate(partition.start)} – {fmtDate(partition.end)}</span>
          <span className="ml-auto text-gray-400 text-xs">{show ? '▲' : '▼'}</span>
        </button>
        {show && <div className="px-4 pb-4 border-t border-gray-100"><DataTable rows={partition.sample} /></div>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        All three splits are chronological — never shuffled. The model trains only on Training data; Validation monitors overfitting each epoch; Test is untouched until final evaluation.
      </p>

      <div className="flex items-center gap-4 flex-wrap">
        {[['train', 'Training', 'text-blue-700'], ['val', 'Validation', 'text-amber-700'], ['test', 'Test', 'text-red-600']].map(([key, label, cls]) => (
          <div key={key} className="flex items-center gap-2">
            <label className={`text-xs font-bold ${cls}`}>{label} %</label>
            <input type="number" min="1" max="98" value={splitRatios[key]} onChange={e => setRatio(key, e.target.value)} className={inputCls} />
          </div>
        ))}
        <span className={`text-xs font-semibold ${sumOk ? 'text-emerald-600' : 'text-red-500'}`}>
          = {sum}% {!sumOk && '(must equal 100)'}
        </span>
        <button onClick={fetchSplit} disabled={loading || !sumOk}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold px-4 py-1.5 rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed">
          {loading ? 'Loading…' : 'Preview Split'}
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {splitData && (
        <>
          <TimelineBar train={splitRatios.train} val={splitRatios.val} test={splitRatios.test} data={splitData} />
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
            ⚠️ Chronological split only — no shuffling. Train → Val → Test must be in time order.
          </div>
          <div className="space-y-2">
            <SamplePanel label={`Training — ${splitRatios.train}%`} color="blue" partition={splitData.train} show={showTrain} onToggle={() => setShowTrain(v => !v)} />
            <SamplePanel label={`Validation — ${splitRatios.val}%`} color="amber" partition={splitData.val} show={showVal} onToggle={() => setShowVal(v => !v)} />
            <SamplePanel label={`Test — ${splitRatios.test}%`} color="red" partition={splitData.test} show={showTest} onToggle={() => setShowTest(v => !v)} />
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// §6 — Feature scaling
// ---------------------------------------------------------------------------

const SCALER_INFO = {
  standard: { label: 'StandardScaler', desc: 'Mean=0, Std=1 (z-score). Recommended default for most indicators and OHLCV data.', color: 'blue' },
  minmax:   { label: 'MinMaxScaler',   desc: 'Scales to [0, 1]. Good when you want bounded outputs and no extreme outliers.', color: 'emerald' },
  robust:   { label: 'RobustScaler',   desc: 'Uses median / IQR. Best choice when data has sharp price spikes or outliers.', color: 'violet' },
}

function ScalingSection({ selectedData, targets, nanStrategy, splitData, splitRatios, scalerType, onScalerTypeChange, scaleData, onScaleDataChange }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  if (!splitData) return <Locked message="Preview the split (§5) first." />

  async function fetchScale(type) {
    onScalerTypeChange(type)
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/training-data/scale-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedData.symbol, timeframe: selectedData.timeframe,
          feed: selectedData.feed, adjustment: selectedData.adjustment,
          targets, nan_strategy: nanStrategy,
          train_ratio: splitRatios.train / 100, val_ratio: splitRatios.val / 100, test_ratio: splitRatios.test / 100,
          scaler_type: type,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
      onScaleDataChange(data)
    } catch (err) { setError(String(err)) }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        LSTMs are sensitive to input scale — normalise all features before training. The scaler is fitted on training data only, then applied to validation and test sets.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Object.entries(SCALER_INFO).map(([key, info]) => {
          const active = scalerType === key
          const colors = { blue: 'border-blue-400 bg-blue-50', emerald: 'border-emerald-400 bg-emerald-50', violet: 'border-violet-400 bg-violet-50' }
          return (
            <button key={key} onClick={() => fetchScale(key)} disabled={loading}
              className={`text-left rounded-lg border-2 p-3 transition-colors cursor-pointer disabled:opacity-50 ${active ? colors[info.color] : 'border-gray-200 bg-white hover:border-gray-300'}`}>
              <p className={`text-sm font-bold ${active ? `text-${info.color}-700` : 'text-gray-800'}`}>{info.label}</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{info.desc}</p>
            </button>
          )
        })}
      </div>

      {loading && <p className="text-sm text-gray-400 animate-pulse">Computing scale preview…</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {scaleData && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500">Fitted on training set only</span>
            <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">✓ no data leakage</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-1.5">Before scaling (5 rows, first 6 cols)</p>
              <DataTable rows={scaleData.sample_before} maxCols={7} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-1.5">After scaling</p>
              <DataTable rows={scaleData.sample_after} maxCols={7} />
            </div>
          </div>
          {Object.keys(scaleData.scaler_params_sample ?? {}).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-1.5">Scaler parameters (first 6 features)</p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="text-xs border-collapse min-w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-1.5 border-b border-gray-200 text-left text-gray-500 font-semibold">Column</th>
                      {Object.keys(Object.values(scaleData.scaler_params_sample)[0]).map(k => (
                        <th key={k} className="px-3 py-1.5 border-b border-gray-200 text-left text-gray-500 font-semibold">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(scaleData.scaler_params_sample).map(([col, vals]) => (
                      <tr key={col} className="hover:bg-gray-50">
                        <td className="px-3 py-1 border-b border-gray-100 font-mono text-gray-700">{col}</td>
                        {Object.values(vals).map((v, i) => (
                          <td key={i} className="px-3 py-1 border-b border-gray-100 font-mono text-gray-600">{typeof v === 'number' ? v.toFixed(6) : v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// §7 — Sequence windows
// ---------------------------------------------------------------------------

function WindowsSection({ splitData, targets, lookback, onLookbackChange, previewData }) {
  if (!splitData) return <Locked message="Preview the split (§5) first." />

  const nFeatures = previewData ? previewData.columns.filter(c => c !== 'timestamp_utc').length : '?'
  const nTasks = targets.length
  const calc = (n) => (typeof n === 'number' && n > lookback) ? fmtNum(n - lookback) : (n === '?' ? '?' : '0')

  const shapes = [
    { name: 'X_train', shape: `(${calc(splitData.train.count)},  ${lookback},  ${nFeatures})`, desc: 'sequences × timesteps × features' },
    { name: 'y_train', shape: `(${calc(splitData.train.count)},  ${nTasks})`, desc: 'sequences × tasks' },
    { name: 'X_val',   shape: `(${calc(splitData.val.count)},    ${lookback},  ${nFeatures})`, desc: '' },
    { name: 'y_val',   shape: `(${calc(splitData.val.count)},    ${nTasks})`, desc: '' },
    { name: 'X_test',  shape: `(${calc(splitData.test.count)},   ${lookback},  ${nFeatures})`, desc: '' },
    { name: 'y_test',  shape: `(${calc(splitData.test.count)},   ${nTasks})`, desc: '' },
  ]

  const tooLarge = splitData.train.count && lookback > splitData.train.count * 0.2

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        A sliding window rolls across the data to produce (X, y) pairs. X is a fixed-length sequence of input bars; y is the target values at the end of that window.
      </p>

      <div className="flex items-center gap-4 flex-wrap">
        <label className="text-sm font-semibold text-gray-700">Lookback window</label>
        <input type="number" min="1" value={lookback} onChange={e => onLookbackChange(Math.max(1, Number(e.target.value)))}
          className="w-20 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="text-xs text-gray-400">bars per sequence</span>
      </div>

      {tooLarge && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex gap-2">
          <span>⚠️</span>
          <p>Lookback ({lookback}) is larger than 20% of training set ({splitData.train.count} bars). Sequences will heavily overlap and the model may overfit. Consider reducing the lookback or downloading more data.</p>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="text-sm border-collapse min-w-full">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2 border-b border-gray-200 text-left text-gray-500 font-semibold">Tensor</th>
              <th className="px-4 py-2 border-b border-gray-200 text-left text-gray-500 font-semibold">Shape</th>
              <th className="px-4 py-2 border-b border-gray-200 text-left text-gray-500 font-semibold text-xs">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {shapes.map((s, i) => (
              <tr key={s.name} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                <td className="px-4 py-2 border-b border-gray-100 font-mono font-bold text-gray-800">{s.name}</td>
                <td className="px-4 py-2 border-b border-gray-100 font-mono text-blue-700">{s.shape}</td>
                <td className="px-4 py-2 border-b border-gray-100 text-xs text-gray-400">{s.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// §8 — DataLoader settings
// ---------------------------------------------------------------------------

function DataLoaderSection({ lookback, splitData, dlConfig, onDlConfigChange }) {
  if (!splitData) return <Locked message="Preview the split (§5) first." />

  const { batch_size, shuffle, drop_last, num_workers } = dlConfig

  function set(key, val) { onDlConfigChange({ ...dlConfig, [key]: val }) }

  const code = `import torch
from torch.utils.data import TensorDataset, DataLoader

train_dataset = TensorDataset(X_train, y_train)
val_dataset   = TensorDataset(X_val,   y_val)
test_dataset  = TensorDataset(X_test,  y_test)

train_loader = DataLoader(train_dataset, batch_size=${batch_size}, shuffle=${shuffle}, drop_last=${drop_last}, num_workers=${num_workers})
val_loader   = DataLoader(val_dataset,   batch_size=${batch_size}, shuffle=False,  drop_last=False, num_workers=${num_workers})
test_loader  = DataLoader(test_dataset,  batch_size=${batch_size}, shuffle=False,  drop_last=False, num_workers=${num_workers})`

  const inputCls = 'border border-gray-300 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-20'

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Configure the PyTorch DataLoader — the final step before data reaches the model.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-700">Batch size</p>
              <p className="text-xs text-gray-400">Sequences per gradient update step</p>
            </div>
            <input type="number" min="1" value={batch_size} onChange={e => set('batch_size', Math.max(1, Number(e.target.value)))} className={inputCls} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-700">num_workers</p>
              <p className="text-xs text-gray-400">Data loading workers (0 = main thread)</p>
            </div>
            <input type="number" min="0" max="8" value={num_workers} onChange={e => set('num_workers', Math.max(0, Number(e.target.value)))} className={inputCls} />
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={shuffle} onChange={e => set('shuffle', e.target.checked)} className="mt-0.5 accent-blue-600" />
            <div>
              <p className="text-sm font-semibold text-gray-700">Shuffle training batches</p>
              <p className="text-xs text-gray-400">Shuffles the ORDER of sequences (not the bars within each sequence). Recommended.</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={drop_last} onChange={e => set('drop_last', e.target.checked)} className="mt-0.5 accent-blue-600" />
            <div>
              <p className="text-sm font-semibold text-gray-700">Drop last incomplete batch</p>
              <p className="text-xs text-gray-400">Drops the final batch if it has fewer than batch_size sequences. Prevents inconsistent batch shapes.</p>
            </div>
          </label>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-400 mb-2">Generated PyTorch code</p>
          <pre className="bg-gray-900 text-gray-100 text-xs font-mono rounded-lg p-4 overflow-x-auto leading-relaxed whitespace-pre-wrap">{code}</pre>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// HP defaults & helpers
// ---------------------------------------------------------------------------

const DEFAULT_ARCH = { hidden_size: 128, num_layers: 2, dropout: 0.2, bidirectional: false }
const DEFAULT_OPTIMIZER = { type: 'adam', learning_rate: 0.001, weight_decay: 0.0 }
const DEFAULT_TRAINING_LOOP = { max_epochs: 100, early_stopping_patience: 10, grad_clip: 1.0 }
const DEFAULT_SCHEDULER = { type: 'none', params: {} }

const SCHEDULER_DEFAULTS = {
  none:              {},
  ReduceLROnPlateau: { factor: 0.1, patience: 5, min_lr: 1e-6 },
  CosineAnnealingLR: { T_max: 100, eta_min: 0 },
  StepLR:            { step_size: 10, gamma: 0.1 },
}

function defaultLoss(taskType) { return taskType === 'classification' ? 'bce' : 'mse' }

function defaultTaskHeads(targets) {
  return (targets ?? []).map(t => ({ label: t.label, task_type: t.task_type, loss: defaultLoss(t.task_type), weight: 1.0 }))
}

function syncTaskHeads(newTargets, currentHeads) {
  const existing = Object.fromEntries(currentHeads.map(h => [h.label, h]))
  return newTargets.map(t => existing[t.label] ?? { label: t.label, task_type: t.task_type, loss: defaultLoss(t.task_type), weight: 1.0 })
}

// ---------------------------------------------------------------------------
// §9 — LSTM Architecture
// ---------------------------------------------------------------------------

function ArchSection({ cfg, arch, onArchChange }) {
  const { hidden_size, num_layers, dropout, bidirectional } = arch
  const effectiveHidden = hidden_size * (bidirectional ? 2 : 1)
  const nFeatures = cfg?.n_features ?? '?'

  const code = `self.lstm = nn.LSTM(
    input_size=${nFeatures},
    hidden_size=${hidden_size},
    num_layers=${num_layers},
    dropout=${num_layers > 1 ? dropout : 0.0},
    batch_first=True,
    bidirectional=${bidirectional},
)`

  function set(key, val) { onArchChange({ ...arch, [key]: val }) }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-700">Hidden size</p>
              <p className="text-xs text-gray-400">LSTM units per layer</p>
            </div>
            <input type="number" min="1" value={hidden_size}
              onChange={e => set('hidden_size', Math.max(1, Number(e.target.value)))}
              className={wideInputCls} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-700">Num layers</p>
              <p className="text-xs text-gray-400">Stacked LSTM layers</p>
            </div>
            <input type="number" min="1" max="8" value={num_layers}
              onChange={e => set('num_layers', Math.max(1, Number(e.target.value)))}
              className={narrowInputCls} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-semibold ${num_layers < 2 ? 'text-gray-400' : 'text-gray-700'}`}>Dropout</p>
              <p className="text-xs text-gray-400">Between layers{num_layers < 2 ? ' (requires num_layers ≥ 2)' : ''}</p>
            </div>
            <input type="number" min="0" max="0.9" step="0.05" value={num_layers < 2 ? 0.0 : dropout}
              onChange={e => set('dropout', Math.min(0.9, Math.max(0, Number(e.target.value))))}
              disabled={num_layers < 2}
              className={`${narrowInputCls} disabled:opacity-40 disabled:cursor-not-allowed`} />
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={bidirectional} onChange={e => set('bidirectional', e.target.checked)} className="mt-0.5 accent-blue-600" />
            <div>
              <p className="text-sm font-semibold text-gray-700">Bidirectional</p>
              <p className="text-xs text-gray-400">Processes sequence forwards and backwards. Doubles effective hidden size.</p>
            </div>
          </label>
          <div className="flex items-center gap-2 pt-1">
            <p className="text-xs text-gray-500">Effective hidden size:</p>
            <span className="font-mono text-sm font-bold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded">{effectiveHidden}</span>
            {bidirectional && <span className="text-xs text-gray-400">({hidden_size} × 2)</span>}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-400 mb-2">PyTorch definition</p>
          <pre className="bg-gray-900 text-gray-100 text-xs font-mono rounded-lg p-4 leading-relaxed whitespace-pre-wrap overflow-x-auto">{code}</pre>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// §10 — Task Heads
// ---------------------------------------------------------------------------

const LOSS_OPTIONS = {
  regression:     [['mse', 'MSELoss (Mean Squared Error)'], ['mae', 'L1Loss (Mean Absolute Error)'], ['huber', 'HuberLoss (robust to outliers)']],
  classification: [['bce', 'BCEWithLogitsLoss (binary)'], ['crossentropy', 'CrossEntropyLoss (multi-class)']],
}

function TaskHeadsSection({ arch, taskHeads, onTaskHeadsChange }) {
  const effectiveHidden = arch.hidden_size * (arch.bidirectional ? 2 : 1)
  const totalWeight = taskHeads.reduce((s, h) => s + (h.weight || 0), 0)

  function setHead(i, key, val) {
    const next = [...taskHeads]
    next[i] = { ...next[i], [key]: val }
    onTaskHeadsChange(next)
  }

  if (taskHeads.length === 0) return <p className="text-sm text-gray-400 italic">No tasks defined. Add targets in §3 first.</p>

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Each task gets its own output head — a linear layer projecting from the shared LSTM hidden state to the task's prediction.
      </p>
      <div className="space-y-2">
        {taskHeads.map((h, i) => {
          const lossOpts = LOSS_OPTIONS[h.task_type] ?? LOSS_OPTIONS.regression
          const pct = totalWeight > 0 ? ((h.weight / totalWeight) * 100).toFixed(0) : 0
          return (
            <div key={h.label} className="rounded-lg border border-gray-200 bg-gray-50/40 p-4">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                <span className="text-sm font-bold text-gray-800 flex-1">{h.label}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${h.task_type === 'classification' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                  {h.task_type === 'classification' ? 'CLF' : 'REG'}
                </span>
                <span className="text-xs text-gray-400 font-mono shrink-0">nn.Linear({effectiveHidden}, 1)</span>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-gray-500">Loss</label>
                  <select value={h.loss} onChange={e => setHead(i, 'loss', e.target.value)} className={inputCls}>
                    {lossOpts.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-gray-500">Weight</label>
                  <input type="number" min="0" step="0.1" value={h.weight}
                    onChange={e => setHead(i, 'weight', Math.max(0, Number(e.target.value)))}
                    className={narrowInputCls} />
                  <span className="text-xs text-gray-400">{pct}% of loss</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {taskHeads.length > 1 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1.5">Combined loss weights</p>
          <div className="flex h-5 rounded-full overflow-hidden text-[10px] font-bold">
            {taskHeads.map((h, i) => {
              const pct = totalWeight > 0 ? (h.weight / totalWeight) * 100 : 100 / taskHeads.length
              const colors = ['bg-violet-500', 'bg-blue-500', 'bg-amber-400', 'bg-emerald-500', 'bg-red-400']
              return (
                <div key={h.label} className={`${colors[i % colors.length]} flex items-center justify-center text-white`}
                  style={{ width: `${pct}%` }} title={`${h.label}: ${pct.toFixed(0)}%`}>
                  {pct > 12 ? `${pct.toFixed(0)}%` : ''}
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-1">
            {taskHeads.map((h, i) => {
              const colors = ['text-violet-700', 'text-blue-700', 'text-amber-700', 'text-emerald-700', 'text-red-600']
              const pct = totalWeight > 0 ? ((h.weight / totalWeight) * 100).toFixed(0) : 0
              return <span key={h.label} className={`text-xs flex items-center gap-1 ${colors[i % colors.length]}`}><span className="font-bold">{h.label}</span> {pct}%</span>
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// §11 — Optimizer
// ---------------------------------------------------------------------------

const OPTIMIZER_MAP = { adam: 'Adam', adamw: 'AdamW', sgd: 'SGD', rmsprop: 'RMSprop' }

function OptimizerSection({ optimizer, onOptimizerChange }) {
  const { type, learning_rate, weight_decay } = optimizer
  function set(key, val) { onOptimizerChange({ ...optimizer, [key]: val }) }

  const code = `optimizer = torch.optim.${OPTIMIZER_MAP[type]}(
    model.parameters(),
    lr=${learning_rate},
    weight_decay=${weight_decay},
)`

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Optimizer</p>
          <select value={type} onChange={e => set('type', e.target.value)} className={inputCls}>
            {Object.entries(OPTIMIZER_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-700">Learning rate</p>
            <p className="text-xs text-gray-400">Step size for gradient updates</p>
          </div>
          <input type="number" min="1e-6" max="1" step="0.0001" value={learning_rate}
            onChange={e => set('learning_rate', Math.max(1e-7, Number(e.target.value)))}
            className={wideInputCls} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-700">Weight decay</p>
            <p className="text-xs text-gray-400">L2 regularisation — penalises large weights</p>
          </div>
          <input type="number" min="0" step="0.0001" value={weight_decay}
            onChange={e => set('weight_decay', Math.max(0, Number(e.target.value)))}
            className={wideInputCls} />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 mb-2">PyTorch code</p>
        <pre className="bg-gray-900 text-gray-100 text-xs font-mono rounded-lg p-4 leading-relaxed whitespace-pre-wrap overflow-x-auto">{code}</pre>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// §12 — Training Loop
// ---------------------------------------------------------------------------

function TrainingLoopSection({ cfg, trainingLoop, onTrainingLoopChange }) {
  const { max_epochs, early_stopping_patience, grad_clip } = trainingLoop
  function set(key, val) { onTrainingLoopChange({ ...trainingLoop, [key]: val }) }

  const nTrainSeq = cfg?.n_train_sequences ?? null
  const batchSize = cfg?.batch_size ?? 32
  const stepsPerEpoch = nTrainSeq != null ? Math.ceil(nTrainSeq / batchSize) : null
  const maxUpdates = stepsPerEpoch != null ? (max_epochs * stepsPerEpoch).toLocaleString() : '—'

  return (
    <div className="space-y-4">
      {nTrainSeq != null && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[['Train sequences', nTrainSeq.toLocaleString(), 'blue'], ['Batch size', batchSize, 'gray'],
            ['Steps / epoch', stepsPerEpoch?.toLocaleString(), 'blue'], ['Max gradient updates', maxUpdates, 'gray'],
          ].map(([label, val, color]) => (
            <div key={label} className={`rounded-lg border p-3 ${color === 'blue' ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
              <p className="text-xs font-semibold text-gray-500 mb-0.5">{label}</p>
              <p className="text-sm font-bold text-gray-800 tabular-nums">{val ?? '—'}</p>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[['max_epochs', 'Max epochs', 'Maximum training epochs', 1],
          ['early_stopping_patience', 'Early stopping patience', 'Stop after N epochs without val improvement', 1],
          ['grad_clip', 'Gradient clipping', 'Max gradient norm — prevents exploding gradients', 0],
        ].map(([key, label, desc, min]) => (
          <div key={key} className="flex items-center justify-between sm:flex-col sm:items-start sm:gap-1">
            <div>
              <p className="text-sm font-semibold text-gray-700">{label}</p>
              <p className="text-xs text-gray-400">{desc}</p>
            </div>
            <input type="number" min={min} step={key === 'grad_clip' ? 0.1 : 1} value={trainingLoop[key]}
              onChange={e => set(key, Math.max(min, Number(e.target.value)))}
              className={`${wideInputCls} sm:w-full`} />
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700 flex gap-2">
        <span>ℹ️</span>
        <p>Early stopping monitors validation loss. If it doesn't improve for <strong>{early_stopping_patience}</strong> consecutive epochs, training stops and the best checkpoint is restored.</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// §13 — LR Scheduler
// ---------------------------------------------------------------------------

function SchedulerSection({ trainingLoop, scheduler, onSchedulerChange }) {
  const { type, params } = scheduler
  function setType(t) { onSchedulerChange({ type: t, params: { ...SCHEDULER_DEFAULTS[t] } }) }
  function setParam(k, v) { onSchedulerChange({ ...scheduler, params: { ...params, [k]: v } }) }

  let code = 'scheduler = None  # no scheduler'
  if (type === 'ReduceLROnPlateau') {
    code = `scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(\n    optimizer, factor=${params.factor ?? 0.1},\n    patience=${params.patience ?? 5}, min_lr=${params.min_lr ?? 1e-6},\n)`
  } else if (type === 'CosineAnnealingLR') {
    code = `scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(\n    optimizer, T_max=${params.T_max ?? trainingLoop.max_epochs}, eta_min=${params.eta_min ?? 0},\n)`
  } else if (type === 'StepLR') {
    code = `scheduler = torch.optim.lr_scheduler.StepLR(\n    optimizer, step_size=${params.step_size ?? 10}, gamma=${params.gamma ?? 0.1},\n)`
  }

  const paramFields = {
    ReduceLROnPlateau: [['factor', 'Factor', '0.1'], ['patience', 'Patience', '5'], ['min_lr', 'Min LR', '1e-6']],
    CosineAnnealingLR: [['T_max', 'T_max (epochs)', String(trainingLoop.max_epochs)], ['eta_min', 'Min LR', '0']],
    StepLR: [['step_size', 'Step size', '10'], ['gamma', 'Gamma', '0.1']],
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-semibold text-gray-700">Scheduler type</label>
        <select value={type} onChange={e => setType(e.target.value)} className={inputCls}>
          <option value="none">None</option>
          <option value="ReduceLROnPlateau">ReduceLROnPlateau — reduce LR when loss plateaus</option>
          <option value="CosineAnnealingLR">CosineAnnealingLR — cosine decay to min LR</option>
          <option value="StepLR">StepLR — reduce LR every N epochs</option>
        </select>
      </div>
      {paramFields[type] && (
        <div className="flex flex-wrap gap-4">
          {paramFields[type].map(([k, label, placeholder]) => (
            <div key={k} className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500">{label}</label>
              <input type="number" value={params[k] ?? ''} placeholder={placeholder}
                onChange={e => setParam(k, Number(e.target.value))} className={narrowInputCls} />
            </div>
          ))}
        </div>
      )}
      <div>
        <p className="text-xs font-semibold text-gray-400 mb-2">PyTorch code</p>
        <pre className="bg-gray-900 text-gray-100 text-xs font-mono rounded-lg p-4 leading-relaxed whitespace-pre-wrap overflow-x-auto">{code}</pre>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// §14 — Model Summary
// ---------------------------------------------------------------------------

function hpParamCount(arch, nFeatures, nTasks) {
  const { hidden_size, num_layers, bidirectional } = arch
  const dir = bidirectional ? 2 : 1
  let lstm = dir * 4 * (nFeatures * hidden_size + hidden_size * hidden_size + hidden_size)
  for (let l = 1; l < num_layers; l++) {
    lstm += dir * 4 * (hidden_size * dir * hidden_size + hidden_size * hidden_size + hidden_size)
  }
  return lstm + nTasks * (hidden_size * dir + 1)
}

function ModelSummary({ nFeatures, lookback, arch, taskHeads }) {
  if (!nFeatures) return null
  const effectiveHidden = arch.hidden_size * (arch.bidirectional ? 2 : 1)
  const dropoutLine = arch.num_layers > 1 ? `\n            dropout=${arch.dropout},` : ''
  const headLines = taskHeads.length > 0
    ? taskHeads.map(h => `        self.head_${h.label.replace(/\s+/g, '_')} = nn.Linear(${effectiveHidden}, 1)  # ${h.task_type}`).join('\n')
    : '        # (add targets in §3 to see output heads)'
  const returnExpr = taskHeads.length > 0
    ? taskHeads.map(h => `"${h.label}": self.head_${h.label.replace(/\s+/g, '_')}(last)`).join(', ')
    : '...'
  const code = `import torch.nn as nn

class MultiTaskLSTM(nn.Module):
    def __init__(self):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=${nFeatures},
            hidden_size=${arch.hidden_size},
            num_layers=${arch.num_layers},${dropoutLine}
            batch_first=True,
            bidirectional=${arch.bidirectional},
        )
${headLines}

    def forward(self, x):
        # x: (batch, ${lookback ?? 'lookback'}, ${nFeatures})
        out, _ = self.lstm(x)
        last = out[:, -1, :]
        return {${returnExpr}}`

  const nParams = typeof nFeatures === 'number' && taskHeads.length > 0
    ? hpParamCount(arch, nFeatures, taskHeads.length)
    : null

  return (
    <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 bg-blue-50 border-b border-blue-100 flex items-center gap-3">
        <span className="font-bold text-blue-800">Model Summary</span>
        {nParams != null && (
          <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-mono">
            ~{nParams.toLocaleString()} parameters
          </span>
        )}
        <span className="text-xs text-blue-500 ml-auto">updates live</span>
      </div>
      <div className="p-5">
        <pre className="bg-gray-900 text-gray-100 text-xs font-mono rounded-lg p-4 leading-relaxed whitespace-pre-wrap overflow-x-auto">{code}</pre>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Save panel
// ---------------------------------------------------------------------------

function SavePanel({ config, loadedConfigId, loadedConfigName, loadedConfigParsed, onSaved, onUpdated, onDeleted }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState(null)
  const [savedName, setSavedName] = useState(null)
  const [updated, setUpdated] = useState(false)

  const { selectedData, targets, nanInfo, splitData, scaleData, scalerType, lookback, previewData,
          arch, taskHeads, optimizer, trainingLoop, scheduler } = config

  // Derived values — use live computed if available, fall back to loaded config's saved values
  const targetLabels = new Set((targets ?? []).map(t => t.label))
  const featureCols = previewData
    ? previewData.columns.filter(c => c !== 'timestamp_utc' && !targetLabels.has(c))
    : loadedConfigParsed?.feature_columns ?? []
  const nFeatures  = previewData  ? featureCols.length                              : loadedConfigParsed?.n_features
  const nTrainSeq  = splitData    ? Math.max(0, splitData.train.count - lookback)   : loadedConfigParsed?.n_train_sequences
  const nValSeq    = splitData    ? Math.max(0, splitData.val.count   - lookback)   : loadedConfigParsed?.n_val_sequences
  const nTestSeq   = splitData    ? Math.max(0, splitData.test.count  - lookback)   : loadedConfigParsed?.n_test_sequences

  const canUpdate = !!(loadedConfigId && selectedData)

  // Save as New needs all computed states
  const missing = []
  if (!selectedData)    missing.push('select training data (§1)')
  if (!targets?.length) missing.push('define at least one target (§3)')
  if (!nanInfo)         missing.push('calculate NaN impact (§4)')
  if (!splitData)       missing.push('preview the split (§5)')
  if (!scaleData)       missing.push('run a scaler preview (§6)')
  if (!previewData)     missing.push('load the raw data preview (§2)')
  const allSet = missing.length === 0

  function buildConfigJson() {
    const { selectedData: sd, targets: tgts, nanStrategy, splitRatios, dlConfig } = config
    const hyperparameters = {
      hidden_size: arch.hidden_size, num_layers: arch.num_layers,
      dropout: arch.num_layers > 1 ? arch.dropout : 0.0,
      bidirectional: arch.bidirectional,
      task_losses: taskHeads.map(h => h.loss),
      task_weights: taskHeads.map(h => h.weight),
      optimizer: optimizer.type, learning_rate: optimizer.learning_rate, weight_decay: optimizer.weight_decay,
      max_epochs: trainingLoop.max_epochs,
      early_stopping_patience: trainingLoop.early_stopping_patience,
      grad_clip: trainingLoop.grad_clip,
      scheduler: scheduler.type, scheduler_params: scheduler.params,
    }
    return JSON.stringify({
      ...(loadedConfigParsed ?? {}),
      symbol: sd.symbol, timeframe: sd.timeframe, feed: sd.feed, adjustment: sd.adjustment,
      n_features: nFeatures, feature_columns: featureCols,
      n_train_sequences: nTrainSeq, n_val_sequences: nValSeq, n_test_sequences: nTestSeq,
      targets: tgts, nan_strategy: nanStrategy,
      train_ratio: splitRatios.train / 100, val_ratio: splitRatios.val / 100, test_ratio: splitRatios.test / 100,
      scaler_type: scalerType, lookback,
      dl_config: { batch_size: dlConfig.batch_size, shuffle_train: dlConfig.shuffle, drop_last: dlConfig.drop_last, num_workers: dlConfig.num_workers },
      hyperparameters,
    })
  }

  async function handleUpdate() {
    setUpdating(true); setError(null); setUpdated(false)
    try {
      const res = await fetch(`/api/training-data/configs/${loadedConfigId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_json: buildConfigJson() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
      setUpdated(true); onUpdated()
    } catch (err) { setError(String(err)) }
    finally { setUpdating(false) }
  }

  async function handleDelete() {
    setDeleting(true); setError(null)
    try {
      const res = await fetch(`/api/training-data/configs/${loadedConfigId}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || `HTTP ${res.status}`) }
      setConfirmDelete(false); onDeleted()
    } catch (err) { setError(String(err)) }
    finally { setDeleting(false) }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setError(null); setSavedName(null); setUpdated(false)
    const { selectedData: sd } = config
    try {
      const res = await fetch('/api/training-data/configs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), symbol: sd.symbol, timeframe: sd.timeframe, feed: sd.feed, adjustment: sd.adjustment, config_json: buildConfigJson() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
      setSavedName(name.trim()); setName(''); onSaved()
    } catch (err) { setError(String(err)) }
    finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-5 space-y-4">
      <div>
        <p className="text-sm font-bold text-gray-800 mb-1">Save Configuration</p>
        <p className="text-xs text-gray-400">Save all current settings for use on downstream pages (Hyperparameters, Training, Evaluation).</p>
      </div>

      {(nFeatures != null || targets?.length > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {nFeatures != null && <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded font-mono">input_size = {nFeatures}</span>}
          <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded font-mono">lookback = {lookback}</span>
          {targets?.length > 0 && <span className="bg-violet-50 text-violet-700 border border-violet-100 px-2 py-0.5 rounded font-mono">{targets.length} task{targets.length !== 1 ? 's' : ''}</span>}
          {nTrainSeq != null && <span className="bg-gray-50 text-gray-600 border border-gray-200 px-2 py-0.5 rounded font-mono">train seq = {nTrainSeq.toLocaleString()}</span>}
        </div>
      )}

      {/* ── Loaded config: Update + Delete ── */}
      {loadedConfigId && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 space-y-3">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-blue-600 mb-0.5">Loaded configuration</p>
              <p className="text-sm font-bold text-blue-900 truncate">"{loadedConfigName}"</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button onClick={handleUpdate} disabled={updating || !canUpdate}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold px-4 py-2 rounded-md text-sm transition-colors cursor-pointer disabled:cursor-not-allowed">
                {updating ? 'Saving…' : '↑ Save Changes'}
              </button>
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)}
                  className="bg-white hover:bg-red-50 border border-red-200 text-red-500 hover:text-red-700 font-semibold px-3 py-2 rounded-md text-sm transition-colors cursor-pointer">
                  Delete
                </button>
              ) : (
                <>
                  <button onClick={handleDelete} disabled={deleting}
                    className="bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white font-semibold px-3 py-2 rounded-md text-sm transition-colors cursor-pointer disabled:cursor-not-allowed">
                    {deleting ? 'Deleting…' : 'Confirm Delete'}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="text-sm text-gray-400 hover:text-gray-600 px-2 cursor-pointer">Cancel</button>
                </>
              )}
            </div>
          </div>
          {updated && <p className="text-sm text-blue-700 font-semibold">✓ Changes saved to "{loadedConfigName}".</p>}
          {!canUpdate && !updated && <p className="text-xs text-blue-400 italic">Select training data (§1) to enable saving.</p>}
        </div>
      )}

      {/* ── Save as New ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-1.5">{loadedConfigId ? 'Or save as a new configuration' : 'Save as new configuration'}</p>
        {allSet ? (
          <form onSubmit={handleSave} className="flex gap-2 flex-wrap">
            <input required value={name} onChange={e => { setName(e.target.value); setSavedName(null) }}
              placeholder="e.g. AAPL 1Day Standard lb60"
              className="flex-1 min-w-48 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <button type="submit" disabled={saving || !name.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-semibold px-5 py-2 rounded-md text-sm transition-colors cursor-pointer disabled:cursor-not-allowed">
              {saving ? 'Saving…' : '💾 Save as New'}
            </button>
          </form>
        ) : (
          <div className="space-y-1">
            <p className="text-xs text-gray-400">Complete these steps to save as a new configuration:</p>
            {missing.map(m => (
              <p key={m} className="text-xs text-gray-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />{m}
              </p>
            ))}
          </div>
        )}
        {savedName && <p className="text-sm text-emerald-600 font-semibold mt-2">✓ "{savedName}" saved — visible in Saved Configurations above.</p>}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TrainingData() {
  const [selectedData,  setSelectedData]  = useState(null)
  const [previewData,   setPreviewData]   = useState(null)
  const [targets,       setTargets]       = useState([])
  const [nanInfo,       setNanInfo]       = useState(null)
  const [nanStrategy,   setNanStrategy]   = useState('drop')
  const [splitRatios,   setSplitRatios]   = useState({ train: 70, val: 15, test: 15 })
  const [splitData,     setSplitData]     = useState(null)
  const [scalerType,    setScalerType]    = useState('standard')
  const [scaleData,     setScaleData]     = useState(null)
  const [lookback,      setLookback]      = useState(60)
  const [dlConfig,      setDlConfig]      = useState({ batch_size: 32, shuffle: true, drop_last: false, num_workers: 0 })
  const [arch,          setArch]          = useState(DEFAULT_ARCH)
  const [taskHeads,     setTaskHeads]     = useState([])
  const [optimizer,     setOptimizer]     = useState(DEFAULT_OPTIMIZER)
  const [trainingLoop,  setTrainingLoop]  = useState(DEFAULT_TRAINING_LOOP)
  const [scheduler,     setScheduler]     = useState(DEFAULT_SCHEDULER)
  const [saveRefresh,      setSaveRefresh]      = useState(0)
  const [loadedBanner,     setLoadedBanner]     = useState(false)
  const [loadedConfigId,   setLoadedConfigId]   = useState(null)
  const [loadedConfigName, setLoadedConfigName] = useState(null)
  const [loadedConfigParsed, setLoadedConfigParsed] = useState(null)

  function handleLoadConfig(cfg) {
    const p = (() => { try { return JSON.parse(cfg.config_json) } catch { return {} } })()
    setSelectedData({ symbol: cfg.symbol, timeframe: cfg.timeframe, feed: cfg.feed, adjustment: cfg.adjustment, bar_count: null })
    const loadedTargets = p.targets ?? []
    setTargets(loadedTargets)
    setNanStrategy(p.nan_strategy ?? 'drop')
    setSplitRatios({
      train: Math.round((p.train_ratio ?? 0.70) * 100),
      val:   Math.round((p.val_ratio   ?? 0.15) * 100),
      test:  Math.round((p.test_ratio  ?? 0.15) * 100),
    })
    setScalerType(p.scaler_type ?? 'standard')
    setLookback(p.lookback ?? 60)
    // Handle both nested dl_config and legacy top-level keys
    const dl = p.dl_config ?? {}
    setDlConfig({
      batch_size:  dl.batch_size  ?? p.batch_size  ?? 32,
      shuffle:     dl.shuffle_train ?? dl.shuffle ?? p.shuffle ?? true,
      drop_last:   dl.drop_last   ?? p.drop_last   ?? false,
      num_workers: dl.num_workers ?? p.num_workers ?? 0,
    })
    // Restore hyperparameters
    const hp = p.hyperparameters
    if (hp) {
      setArch({ hidden_size: hp.hidden_size ?? 128, num_layers: hp.num_layers ?? 2, dropout: hp.dropout ?? 0.2, bidirectional: hp.bidirectional ?? false })
      setTaskHeads(loadedTargets.map((t, i) => ({
        label: t.label, task_type: t.task_type,
        loss: hp.task_losses?.[i] ?? defaultLoss(t.task_type),
        weight: hp.task_weights?.[i] ?? 1.0,
      })))
      setOptimizer({ type: hp.optimizer ?? 'adam', learning_rate: hp.learning_rate ?? 0.001, weight_decay: hp.weight_decay ?? 0.0 })
      setTrainingLoop({ max_epochs: hp.max_epochs ?? 100, early_stopping_patience: hp.early_stopping_patience ?? 10, grad_clip: hp.grad_clip ?? 1.0 })
      setScheduler({ type: hp.scheduler ?? 'none', params: hp.scheduler_params ?? {} })
    } else {
      setArch(DEFAULT_ARCH)
      setTaskHeads(defaultTaskHeads(loadedTargets))
      setOptimizer(DEFAULT_OPTIMIZER)
      setTrainingLoop(DEFAULT_TRAINING_LOOP)
      setScheduler(DEFAULT_SCHEDULER)
    }
    setNanInfo(null); setSplitData(null); setScaleData(null); setPreviewData(null)
    setLoadedConfigId(cfg.id)
    setLoadedConfigName(cfg.name)
    setLoadedConfigParsed(p)
    setLoadedBanner(true)
    setTimeout(() => setLoadedBanner(false), 4000)
  }

  function handleConfigDeleted() {
    setLoadedConfigId(null); setLoadedConfigName(null); setLoadedConfigParsed(null)
    setSaveRefresh(v => v + 1)
  }

  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Training Data</h1>
        <p className="text-sm text-gray-500 mt-1">Select and prepare the input dataset for the multi-task network training run.</p>
      </div>

      {loadedBanner && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-2 text-sm text-emerald-800 animate-pulse">
          <span>✓</span> Configuration loaded — all sections have been pre-filled. Re-run calculations as needed.
        </div>
      )}

      <Section title="Saved Configurations" defaultOpen={true}>
        <SavedConfigs onLoad={handleLoadConfig} refreshTrigger={saveRefresh} />
      </Section>

      <Section title="Select Training Data" defaultOpen={true}
        badge={selectedData ? `${selectedData.symbol} · ${selectedData.timeframe}` : null}>
        <SelectTrainingData selected={selectedData} onSelect={d => { setSelectedData(d); setPreviewData(null); setNanInfo(null); setSplitData(null); setScaleData(null) }} />
      </Section>

      <Section title="Raw Data Preview" defaultOpen={true}>
        <RawDataPreview selectedData={selectedData} onPreviewLoaded={setPreviewData} />
      </Section>

      <Section title="Define Targets" defaultOpen={true}
        badge={targets.length > 0 ? `${targets.length} task${targets.length !== 1 ? 's' : ''}` : null}>
        <TargetBuilder selectedData={selectedData} targets={targets}
          onTargetsChange={t => { setTargets(t); setTaskHeads(h => syncTaskHeads(t, h)); setNanInfo(null); setSplitData(null); setScaleData(null) }}
          availableColumns={previewData?.columns} />
      </Section>

      <Section title="Handle Missing Values" defaultOpen={true}
        badge={nanInfo ? `${nanInfo.rows_after_drop.toLocaleString()} rows after drop` : null}>
        <NaNHandler selectedData={selectedData} targets={targets}
          nanInfo={nanInfo} onNanInfoChange={i => { setNanInfo(i); setSplitData(null); setScaleData(null) }}
          nanStrategy={nanStrategy} onNanStrategyChange={s => { setNanStrategy(s); setSplitData(null); setScaleData(null) }} />
      </Section>

      <Section title="Train / Validation / Test Split" defaultOpen={true}
        badge={splitData ? `${splitData.train.count.toLocaleString()} / ${splitData.val.count.toLocaleString()} / ${splitData.test.count.toLocaleString()} bars` : null}>
        <SplitSection selectedData={selectedData} targets={targets} nanStrategy={nanStrategy} nanInfo={nanInfo}
          splitRatios={splitRatios} onSplitRatiosChange={setSplitRatios}
          splitData={splitData} onSplitDataChange={d => { setSplitData(d); setScaleData(null) }} />
      </Section>

      <Section title="Feature Scaling" defaultOpen={true}
        badge={scaleData ? scalerType : null}>
        <ScalingSection selectedData={selectedData} targets={targets} nanStrategy={nanStrategy}
          splitData={splitData} splitRatios={splitRatios}
          scalerType={scalerType} onScalerTypeChange={setScalerType}
          scaleData={scaleData} onScaleDataChange={setScaleData} />
      </Section>

      <Section title="Sequence Windows" defaultOpen={true}
        badge={splitData ? `lookback = ${lookback}` : null}>
        <WindowsSection splitData={splitData} targets={targets} lookback={lookback}
          onLookbackChange={setLookback} previewData={previewData} />
      </Section>

      <Section title="DataLoader Settings" defaultOpen={true}
        badge={`batch = ${dlConfig.batch_size}`}>
        <DataLoaderSection lookback={lookback} splitData={splitData} dlConfig={dlConfig} onDlConfigChange={setDlConfig} />
      </Section>

      {(() => {
        const tgtLabels = new Set(targets.map(t => t.label))
        const nFeat = previewData
          ? previewData.columns.filter(c => c !== 'timestamp_utc' && !tgtLabels.has(c)).length
          : loadedConfigParsed?.n_features ?? null
        const nTrainSeqForCfg = splitData
          ? Math.max(0, splitData.train.count - lookback)
          : loadedConfigParsed?.n_train_sequences ?? null
        const cfgForSections = { n_features: nFeat, n_train_sequences: nTrainSeqForCfg, batch_size: dlConfig.batch_size, lookback }
        const archBadge = `h=${arch.hidden_size} · L=${arch.num_layers}${arch.bidirectional ? ' · bidir' : ''}`
        return (
          <>
            <Section title="LSTM Architecture" defaultOpen={false}
              badge={`${archBadge}`}>
              <ArchSection cfg={cfgForSections} arch={arch} onArchChange={setArch} />
            </Section>

            <Section title="Task Heads" defaultOpen={false}
              badge={taskHeads.length > 0 ? `${taskHeads.length} head${taskHeads.length !== 1 ? 's' : ''}` : null}>
              <TaskHeadsSection arch={arch} taskHeads={taskHeads} onTaskHeadsChange={setTaskHeads} />
            </Section>

            <Section title="Optimizer" defaultOpen={false}
              badge={`${OPTIMIZER_MAP[optimizer.type]} · lr=${optimizer.learning_rate}`}>
              <OptimizerSection optimizer={optimizer} onOptimizerChange={setOptimizer} />
            </Section>

            <Section title="Training Loop" defaultOpen={false}
              badge={`${trainingLoop.max_epochs} epochs · patience ${trainingLoop.early_stopping_patience}`}>
              <TrainingLoopSection cfg={cfgForSections} trainingLoop={trainingLoop} onTrainingLoopChange={setTrainingLoop} />
            </Section>

            <Section title="LR Scheduler" defaultOpen={false}
              badge={scheduler.type !== 'none' ? scheduler.type : null}>
              <SchedulerSection trainingLoop={trainingLoop} scheduler={scheduler} onSchedulerChange={setScheduler} />
            </Section>

            <ModelSummary nFeatures={nFeat} lookback={lookback} arch={arch} taskHeads={taskHeads} />
          </>
        )
      })()}

      <SavePanel
        config={{ selectedData, targets, nanInfo, splitData, scaleData, scalerType, lookback, dlConfig, nanStrategy, splitRatios, previewData,
                  arch, taskHeads, optimizer, trainingLoop, scheduler }}
        loadedConfigId={loadedConfigId}
        loadedConfigName={loadedConfigName}
        loadedConfigParsed={loadedConfigParsed}
        onSaved={() => setSaveRefresh(v => v + 1)}
        onUpdated={() => setSaveRefresh(v => v + 1)}
        onDeleted={handleConfigDeleted}
      />
    </div>
  )
}
