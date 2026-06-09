import { useState, useEffect, useCallback } from 'react'
import CandleChart from '../components/CandleChart.jsx'

const TIMEFRAMES = ['1Min', '5Min', '15Min', '30Min', '1Hour', '4Hour', '1Day', '1Week', '1Month']
const FEEDS = ['iex', 'sip', 'delayed_sip', 'otc']
const ADJUSTMENTS = ['raw', 'split', 'dividend', 'all']

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtNum(n) {
  return typeof n === 'number' ? n.toLocaleString() : '—'
}

function groupBySymbol(rows) {
  const map = {}
  for (const row of rows) {
    if (!map[row.symbol]) map[row.symbol] = []
    map[row.symbol].push(row)
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
}

const inputCls =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
const labelCls = 'block text-xs font-semibold text-gray-500 mb-1'

const CATEGORY_COLORS = {
  'Trend':          { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   dot: 'bg-blue-400'   },
  'Momentum':       { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', dot: 'bg-violet-400' },
  'Volatility':     { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-400'  },
  'Volume':         { bg: 'bg-teal-50',   text: 'text-teal-700',   border: 'border-teal-200',   dot: 'bg-teal-400'   },
  'Trend Strength': { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-200',   dot: 'bg-rose-400'   },
  'Price Action':   { bg: 'bg-gray-50',   text: 'text-gray-700',   border: 'border-gray-200',   dot: 'bg-gray-400'   },
}

const OVERLAY_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#f97316', '#06b6d4', '#84cc16', '#ec4899', '#14b8a6',
]

// ---------------------------------------------------------------------------
// Acquire form
// ---------------------------------------------------------------------------

function AcquireForm({ onAcquired }) {
  const [form, setForm] = useState({
    symbols: '', start: '', end: '', timeframe: '1Day', feed: 'iex',
    adjustment: 'raw', limit: 10000, database: '',
    table: 'lstm_2_stock_bars', db_batch_size: 1000,
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const setField = (field) => (e) => {
    setResult(null); setError(null)
    setForm((f) => ({ ...f, [field]: e.target.value }))
  }
  const setNum = (field) => (e) => setForm((f) => ({ ...f, [field]: Number(e.target.value) }))

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError(null); setResult(null)
    const payload = {
      symbols: form.symbols.split(',').map((s) => s.trim()).filter(Boolean),
      start: form.start, end: form.end || null, timeframe: form.timeframe,
      feed: form.feed, adjustment: form.adjustment, limit: form.limit,
      database: form.database || null, table: form.table, db_batch_size: form.db_batch_size,
    }
    try {
      const res = await fetch('/api/alpaca-history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
      setResult(data); onAcquired?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
      <div>
        <h2 className="text-base font-bold text-gray-800">Fetch Historical Data</h2>
        <p className="text-xs text-gray-400 mt-0.5">Pull OHLCV bars from Alpaca and upsert into MariaDB</p>
      </div>

      <div>
        <label className={labelCls}>Symbols <span className="text-red-400">*</span></label>
        <input required type="text" placeholder="AAPL, MSFT, NVDA" value={form.symbols} onChange={setField('symbols')} className={inputCls} />
        <p className="text-xs text-gray-400 mt-1">Comma-separated tickers</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Start date <span className="text-red-400">*</span></label>
          <input required type="date" value={form.start} onChange={setField('start')} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>End date</label>
          <input type="date" value={form.end} onChange={setField('end')} className={inputCls} />
          <p className="text-xs text-gray-400 mt-1">Leave blank for latest available</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[['timeframe', TIMEFRAMES], ['feed', FEEDS], ['adjustment', ADJUSTMENTS]].map(([field, opts]) => (
          <div key={field}>
            <label className={labelCls}>{field.charAt(0).toUpperCase() + field.slice(1)}</label>
            <select value={form[field]} onChange={setField(field)} className={inputCls}>
              {opts.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
      </div>

      <details className="group">
        <summary className="cursor-pointer select-none text-xs font-semibold text-blue-600 hover:text-blue-800 list-none flex items-center gap-1">
          <span className="group-open:rotate-90 inline-block transition-transform">▶</span> Advanced options
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Limit (bars per page)</label>
            <input type="number" min="1" max="10000" value={form.limit} onChange={setNum('limit')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>DB batch size</label>
            <input type="number" min="1" value={form.db_batch_size} onChange={setNum('db_batch_size')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Database override</label>
            <input type="text" placeholder="stock_app" value={form.database} onChange={setField('database')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Table</label>
            <input type="text" value={form.table} onChange={setField('table')} className={inputCls} />
          </div>
        </div>
      </details>

      <button type="submit" disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-md text-sm transition-colors cursor-pointer disabled:cursor-not-allowed">
        {loading ? <span className="flex items-center justify-center gap-2"><Spinner /> Fetching from Alpaca…</span> : 'Acquire Data'}
      </button>

      {result && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800 space-y-0.5">
          <p className="font-semibold">Success</p>
          <p>Fetched <strong>{result.fetched_bars.toLocaleString()}</strong> bars · upserted <strong>{result.upserted_bars.toLocaleString()}</strong> into <code className="font-mono text-xs bg-green-100 px-1 rounded">{result.database}.{result.table}</code></p>
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          <p className="font-semibold">Error</p><p className="mt-0.5">{error}</p>
        </div>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Features panel
// ---------------------------------------------------------------------------

function FeaturesPanel({ interval, allIndicators, onClose }) {
  const { symbol, timeframe, feed, adjustment } = interval
  const [selected, setSelected] = useState(new Set())
  const [saved, setSaved] = useState([])
  const [loadingSaved, setLoadingSaved] = useState(true)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [saveErr, setSaveErr] = useState(null)

  const byCategory = {}
  for (const ind of allIndicators) {
    if (!byCategory[ind.category]) byCategory[ind.category] = []
    byCategory[ind.category].push(ind)
  }
  const categories = Object.keys(byCategory)

  useEffect(() => {
    setLoadingSaved(true)
    const qs = new URLSearchParams({ symbol, timeframe, feed, adjustment })
    fetch(`/api/features/saved?${qs}`)
      .then(r => r.json()).then(keys => { setSaved(keys); setSelected(new Set(keys)) })
      .catch(() => {}).finally(() => setLoadingSaved(false))
  }, [symbol, timeframe, feed, adjustment])

  const toggleKey = (key) => setSelected(prev => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next
  })

  const toggleCategory = (cat) => {
    const catKeys = byCategory[cat].map(i => i.key)
    const allOn = catKeys.every(k => selected.has(k))
    setSelected(prev => {
      const next = new Set(prev); catKeys.forEach(k => allOn ? next.delete(k) : next.add(k)); return next
    })
  }

  const selectAll = () => setSelected(new Set(allIndicators.map(i => i.key)))
  const clearAll  = () => setSelected(new Set())

  async function handleSave() {
    if (selected.size === 0) return
    setSaving(true); setSaveErr(null); setResult(null)
    try {
      const res = await fetch('/api/features/compute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, timeframe, feed, adjustment, indicators: [...selected] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
      setResult(data); setSaved([...selected])
    } catch (err) {
      setSaveErr(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-emerald-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 bg-emerald-50 border-b border-emerald-200">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-emerald-900">Add Features</span>
          <span className="font-mono text-xs bg-white border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded">
            {symbol} · {timeframe} · {feed} · {adjustment}
          </span>
          {loadingSaved && <span className="text-xs text-emerald-600 animate-pulse">Loading saved…</span>}
        </div>
        <button onClick={onClose} className="text-emerald-500 hover:text-emerald-800 text-xl leading-none cursor-pointer" aria-label="Close">×</button>
      </div>

      <div className="p-5 space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-gray-700">{selected.size} / {allIndicators.length} selected</span>
          <button onClick={selectAll} className="text-xs px-2.5 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 cursor-pointer transition-colors">
            Select all {allIndicators.length}
          </button>
          <button onClick={clearAll} className="text-xs px-2.5 py-1 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 cursor-pointer transition-colors">
            Clear all
          </button>
          {saved.length > 0 && <span className="text-xs text-teal-600 font-semibold">✓ {saved.length} already saved in DB</span>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {categories.map(cat => {
            const c = CATEGORY_COLORS[cat] || CATEGORY_COLORS['Price Action']
            const inds = byCategory[cat]
            const catKeys = inds.map(i => i.key)
            const nOn = catKeys.filter(k => selected.has(k)).length
            const allOn = nOn === catKeys.length
            return (
              <div key={cat} className={`rounded-lg border ${c.border} overflow-hidden`}>
                <div className={`flex items-center justify-between px-3 py-2 ${c.bg}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${c.dot} shrink-0`} />
                    <span className={`text-xs font-bold ${c.text}`}>{cat}</span>
                    <span className={`text-xs ${c.text} opacity-60`}>{nOn}/{catKeys.length}</span>
                  </div>
                  <button onClick={() => toggleCategory(cat)} className={`text-xs font-semibold cursor-pointer transition-colors ${c.text} hover:opacity-80`}>
                    {allOn ? 'None' : 'All'}
                  </button>
                </div>
                <div className="px-3 py-2 space-y-0.5 bg-white">
                  {inds.map(ind => {
                    const isSaved = saved.includes(ind.key)
                    const isChecked = selected.has(ind.key)
                    return (
                      <label key={ind.key} title={ind.desc} className="flex items-center gap-2 py-0.5 cursor-pointer group">
                        <input type="checkbox" checked={isChecked} onChange={() => toggleKey(ind.key)} className="w-3.5 h-3.5 rounded accent-emerald-600 shrink-0" />
                        <span className={`text-xs flex-1 group-hover:text-gray-900 ${isChecked ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>{ind.label}</span>
                        {isSaved && <span className="text-teal-500 text-xs shrink-0" title="Already saved in DB">✓</span>}
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-4 pt-2 border-t border-gray-100 flex-wrap">
          <button onClick={handleSave} disabled={saving || selected.size === 0}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-semibold px-5 py-2.5 rounded-md text-sm transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-2">
            {saving ? <><SpinnerDark />Computing &amp; saving…</> : `Save ${selected.size} indicator${selected.size !== 1 ? 's' : ''}`}
          </button>
          <span className="text-xs text-gray-400">All calculations are done server-side from your stored OHLCV data.</span>
        </div>

        {result && (
          <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
            <p className="font-semibold">Saved successfully</p>
            <p className="mt-0.5 text-xs">Computed and upserted <strong>{result.computed.toLocaleString()}</strong> bar rows with <strong>{result.indicators.length}</strong> indicator{result.indicators.length !== 1 ? 's' : ''} for <span className="font-mono">{result.symbol} {result.timeframe}</span>.</p>
          </div>
        )}
        {saveErr && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            <p className="font-semibold">Error</p><p className="mt-0.5 text-xs">{saveErr}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Available data panel
// ---------------------------------------------------------------------------

function AvailableData({ refreshKey, featuresInterval, onFeaturesClick, allIndicators }) {
  const [groups, setGroups] = useState([])
  const [totalBars, setTotalBars] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [viewingInterval, setViewingInterval] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/bars/summary')
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.detail || `HTTP ${res.status}`) }
      const rows = await res.json()
      setGroups(groupBySymbol(rows))
      setTotalBars(rows.reduce((s, r) => s + r.bar_count, 0))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  async function handleDelete(row) {
    const { symbol, timeframe, feed, adjustment } = row
    const params = new URLSearchParams({ symbol, timeframe, feed, adjustment })
    const res = await fetch(`/api/bars/interval?${params}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`)
    load()
  }

  function handleFeaturesClick(row) {
    const active = featuresInterval &&
      featuresInterval.symbol === row.symbol && featuresInterval.timeframe === row.timeframe &&
      featuresInterval.feed === row.feed && featuresInterval.adjustment === row.adjustment
    onFeaturesClick(active ? null : row)
  }

  const symbolCount = groups.length
  const intervalCount = groups.reduce((s, [, rows]) => s + rows.length, 0)

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-gray-800">Available Data</h2>
            {!loading && !error && symbolCount > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {symbolCount} {symbolCount === 1 ? 'ticker' : 'tickers'} &middot; {intervalCount} {intervalCount === 1 ? 'interval' : 'intervals'} &middot; {fmtNum(totalBars)} total bars
              </p>
            )}
          </div>
          <button onClick={load} disabled={loading}
            className="shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:text-gray-400 transition-colors cursor-pointer disabled:cursor-not-allowed mt-0.5">
            {loading ? 'Loading…' : '↺ Refresh'}
          </button>
        </div>

        {error && <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">{error}</div>}

        {loading && groups.length === 0 && (
          <div className="space-y-3 animate-pulse">
            {[80, 60, 70].map((w, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-4 bg-gray-200 rounded" style={{ width: `${w}px` }} />
                <div className="h-8 bg-gray-100 rounded-md" />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-3xl mb-3">📭</div>
            <p className="text-sm font-medium text-gray-500">No data in database yet.</p>
            <p className="text-xs text-gray-400 mt-1">Use the form to acquire your first dataset.</p>
          </div>
        )}

        {groups.length > 0 && (
          <div className="space-y-5">
            {groups.map(([symbol, rows]) => (
              <TickerGroup key={symbol} symbol={symbol} rows={rows}
                onView={setViewingInterval} onDelete={handleDelete}
                onFeatures={handleFeaturesClick} featuresInterval={featuresInterval} />
            ))}
          </div>
        )}
      </div>

      {viewingInterval && (
        <ChartModal interval={viewingInterval} allIndicators={allIndicators} onClose={() => setViewingInterval(null)} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Ticker group
// ---------------------------------------------------------------------------

function TickerGroup({ symbol, rows, onView, onDelete, onFeatures, featuresInterval }) {
  const symbolTotal = rows.reduce((s, r) => s + r.bar_count, 0)
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-mono font-bold text-sm text-gray-900">{symbol}</span>
        <span className="text-xs text-gray-400 tabular-nums">{fmtNum(symbolTotal)} bars</span>
        <div className="flex-1 border-t border-gray-100" />
      </div>
      <div className="space-y-0.5">
        {rows.map((row) => (
          <IntervalRow key={`${row.timeframe}-${row.feed}-${row.adjustment}`} row={row}
            onView={onView} onDelete={onDelete} onFeatures={onFeatures}
            featuresActive={featuresInterval &&
              featuresInterval.symbol === row.symbol && featuresInterval.timeframe === row.timeframe &&
              featuresInterval.feed === row.feed && featuresInterval.adjustment === row.adjustment} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Interval row
// ---------------------------------------------------------------------------

function IntervalRow({ row, onView, onDelete, onFeatures, featuresActive }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteErr, setDeleteErr] = useState(null)

  async function handleDelete() {
    setDeleting(true); setDeleteErr(null)
    try { await onDelete(row) }
    catch (err) { setDeleteErr(err.message); setDeleting(false); setConfirming(false) }
  }

  return (
    <div className={`flex flex-col px-2 py-2 rounded-lg transition-colors ${featuresActive ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
      <div className="flex items-center gap-2">
        <span className="font-mono font-semibold text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded w-16 text-center shrink-0">{row.timeframe}</span>
        <span className="text-sm font-bold text-gray-800 tabular-nums shrink-0">{fmtNum(row.bar_count)}<span className="text-xs font-normal text-gray-400 ml-0.5">bars</span></span>
        <span className="text-xs text-gray-400 shrink-0">{row.feed} · {row.adjustment}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onView(row)} className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded transition-colors cursor-pointer">
            View
          </button>
          <button onClick={() => onFeatures(row)}
            className={`text-xs font-semibold px-2 py-1 rounded transition-colors cursor-pointer ${
              featuresActive ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50'
            }`}>
            {featuresActive ? '⊕ Features' : 'Features'}
          </button>
          {confirming ? (
            <>
              <button onClick={handleDelete} disabled={deleting} className="text-xs font-semibold text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded transition-colors cursor-pointer disabled:opacity-50">
                {deleting ? '…' : 'Confirm'}
              </button>
              <button onClick={() => { setConfirming(false); setDeleteErr(null) }} className="text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 px-2 py-1 rounded transition-colors cursor-pointer">
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setConfirming(true)} className="text-xs font-semibold text-gray-300 hover:text-red-500 hover:bg-red-50 px-2 py-1 rounded transition-colors cursor-pointer">
              Delete
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 mt-0.5 pl-[72px]">
        <span className="text-xs font-mono text-gray-400">{fmtDate(row.earliest)}</span>
        <span className="text-xs text-gray-300">→</span>
        <span className="text-xs font-mono text-gray-400">{fmtDate(row.latest)}</span>
        {deleteErr && <span className="text-xs text-red-500 ml-2">{deleteErr}</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chart modal (with OHLCV + Features tabs)
// ---------------------------------------------------------------------------

function ChartModal({ interval, allIndicators, onClose }) {
  const [bars, setBars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [viewTab, setViewTab] = useState('ohlcv')
  const [savedKeys, setSavedKeys] = useState([])
  const [selectedKeys, setSelectedKeys] = useState([])
  const [featData, setFeatData] = useState({})
  const [featLoading, setFeatLoading] = useState(false)

  useEffect(() => {
    const { symbol, timeframe, feed, adjustment } = interval
    const params = new URLSearchParams({ symbol, timeframe, feed, adjustment, limit: 10000 })
    fetch(`/api/bars/chart-data?${params}`)
      .then((r) => r.ok ? r.json() : r.json().then((b) => Promise.reject(b.detail || `HTTP ${r.status}`)))
      .then(setBars).catch((err) => setError(String(err))).finally(() => setLoading(false))
  }, [interval])

  useEffect(() => {
    if (viewTab !== 'features') return
    const { symbol, timeframe, feed, adjustment } = interval
    const params = new URLSearchParams({ symbol, timeframe, feed, adjustment })
    fetch(`/api/features/saved?${params}`)
      .then((r) => r.ok ? r.json() : Promise.resolve([]))
      .then((keys) => { setSavedKeys(keys); setSelectedKeys((prev) => prev.length === 0 ? keys.slice(0, 5) : prev) })
      .catch(() => {})
  }, [viewTab, interval])

  useEffect(() => {
    if (selectedKeys.length === 0) { setFeatData({}); return }
    const { symbol, timeframe, feed, adjustment } = interval
    const params = new URLSearchParams({ symbol, timeframe, feed, adjustment, keys: selectedKeys.join(',') })
    setFeatLoading(true)
    fetch(`/api/features/bars?${params}`)
      .then((r) => r.ok ? r.json() : Promise.resolve([]))
      .then((rows) => {
        const map = {}
        selectedKeys.forEach((k) => { map[k] = [] })
        rows.forEach((row) => {
          selectedKeys.forEach((k) => { if (row[k] != null) map[k].push({ time: row.timestamp_utc, value: row[k] }) })
        })
        setFeatData(map)
      })
      .catch(() => {}).finally(() => setFeatLoading(false))
  }, [selectedKeys, interval])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggleKey = (key) => setSelectedKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])

  const overlayLines = selectedKeys
    .filter((k) => featData[k] && featData[k].length > 0)
    .map((k, i) => ({
      key: k,
      label: allIndicators.find((ind) => ind.key === k)?.label ?? k,
      color: OVERLAY_COLORS[i % OVERLAY_COLORS.length],
      data: featData[k],
    }))

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-6xl" style={{ height: '84vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono font-extrabold text-xl text-gray-900 shrink-0">{interval.symbol}</span>
            <span className="font-mono font-semibold text-sm bg-blue-50 text-blue-700 px-2.5 py-1 rounded shrink-0">{interval.timeframe}</span>
            <span className="text-sm text-gray-400 shrink-0">{interval.feed} · {interval.adjustment}</span>
            {!loading && bars.length > 0 && (
              <span className="text-xs text-gray-400 truncate">{bars.length.toLocaleString()} bars · {fmtDate(bars[0]?.timestamp_utc)} – {fmtDate(bars.at(-1)?.timestamp_utc)}</span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-4">
            <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
              <button onClick={() => setViewTab('ohlcv')}
                className={`px-3 py-1.5 transition-colors cursor-pointer ${viewTab === 'ohlcv' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                OHLCV
              </button>
              <button onClick={() => setViewTab('features')}
                className={`px-3 py-1.5 border-l border-gray-200 transition-colors cursor-pointer ${viewTab === 'features' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                Features
                {savedKeys.length > 0 && (
                  <span className={`ml-1.5 text-[10px] px-1 py-0.5 rounded ${viewTab === 'features' ? 'bg-indigo-500 text-indigo-100' : 'bg-gray-100 text-gray-500'}`}>
                    {savedKeys.length}
                  </span>
                )}
              </button>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors text-2xl leading-none cursor-pointer" aria-label="Close">×</button>
          </div>
        </div>

        {viewTab === 'features' && (
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 shrink-0">
            {savedKeys.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No features saved for this interval yet. Use "Features" on the row to compute them.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 shrink-0">Overlay indicators:</span>
                  <button onClick={() => setSelectedKeys(savedKeys)} className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer">All</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={() => setSelectedKeys([])} className="text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">None</button>
                  {featLoading && <SpinnerDark />}
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {savedKeys.map((key) => {
                    const active = selectedKeys.includes(key)
                    const color = OVERLAY_COLORS[selectedKeys.indexOf(key) % OVERLAY_COLORS.length]
                    const meta = allIndicators.find((ind) => ind.key === key)
                    return (
                      <button key={key} onClick={() => toggleKey(key)} title={meta?.desc ?? key}
                        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${active ? 'border-transparent text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                        style={active ? { backgroundColor: color, borderColor: color } : {}}>
                        {active && <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/60 shrink-0" />}
                        {meta?.label ?? key}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 p-3">
          {loading && <div className="flex items-center justify-center h-full gap-2 text-sm text-gray-500"><SpinnerDark /> Loading chart data…</div>}
          {error && <div className="flex items-center justify-center h-full text-red-500 text-sm">{error}</div>}
          {!loading && !error && bars.length === 0 && <div className="flex items-center justify-center h-full text-gray-400 text-sm">No bars found.</div>}
          {!loading && !error && bars.length > 0 && <CandleChart bars={bars} timeframe={interval.timeframe} overlayLines={overlayLines} />}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared tiny components
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function SpinnerDark() {
  return (
    <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Best Results Guidelines
// ---------------------------------------------------------------------------

const GUIDELINES = [
  {
    title: 'Bar count — more history, better models',
    color: 'blue',
    items: [
      {
        label: 'Daily timeframe: 8–10 years minimum',
        detail: 'With a 70/15/15 split and lookback=30, 2,000 bars gives only ~270 test windows — marginal for reliable metrics. 2,500+ bars (≈10 years) is the practical floor. Go longer if you can.',
      },
      {
        label: '1Hour: 3+ years (≈6,000 bars)',
        detail: 'Intraday data is noisier than daily, so you need more samples to average out that noise. Each trading day provides ≈6.5 bars at 1H — three years gives roughly the same usable window count as ten years of daily data.',
      },
      {
        label: 'Sub-hourly (15Min, 5Min): 1+ year minimum, more is better',
        detail: 'Fine-grained timeframes have the most noise and the fewest reliable patterns per bar. Short histories at these resolutions produce models that appear to train well but fail to generalise. Treat 5Min models as experimental until you have 2+ years.',
      },
      {
        label: 'Avoid 1Week / 1Month unless you have 20+ years',
        detail: 'Weekly and monthly bars look attractive but a 70/15/15 split on 10 years of weekly data gives fewer than 80 test samples — too few to trust any metric.',
      },
    ],
  },
  {
    title: 'Symbol quality — signal vs. noise',
    color: 'emerald',
    items: [
      {
        label: 'Start with liquid, large-cap symbols',
        detail: 'SPY, QQQ, AAPL, MSFT, NVDA have high daily volume, tight spreads, and continuous price action. Thin symbols introduce gaps, jumps, and bid-ask noise that the model will try to fit instead of learning real patterns.',
      },
      {
        label: 'ETFs are ideal for initial training',
        detail: 'Broad ETFs (SPY, QQQ, IWM) have smoother, mean-reverting behaviour relative to single stocks. They make it easier to validate that your pipeline is working before applying it to more volatile names.',
      },
      {
        label: 'Single stocks add idiosyncratic risk',
        detail: 'Earnings gaps, CEO changes, sector rotations — single-stock events can dominate a model\'s loss during training. Include them once your baseline model works, not before.',
      },
    ],
  },
  {
    title: 'Timeframe choice — match resolution to strategy',
    color: 'violet',
    items: [
      {
        label: 'Daily is the safest starting point',
        detail: 'Clean data, no intraday microstructure noise, well-studied patterns, and overnight/weekend gaps are handled correctly. Results are easiest to interpret and compare across runs.',
      },
      {
        label: '1Hour for intraday resolution',
        detail: 'Good compromise between resolution and noise. Avoids the microstructure noise of 5Min/15Min while still capturing intraday momentum and mean-reversion. Pre/post-market bars are excluded by default — this is usually what you want.',
      },
      {
        label: 'Train one model per timeframe',
        detail: 'Do not mix timeframes within a single training config. A model trained on daily bars cannot generalise to hourly bars. Treat each timeframe as a separate dataset and separate model.',
      },
    ],
  },
  {
    title: 'Adjustment type — use raw for most cases',
    color: 'amber',
    items: [
      {
        label: 'raw — recommended default',
        detail: 'Unadjusted prices are what you will observe in production. Training on raw prices means the model learns the true price scale, including split discontinuities. Use this unless you have a specific reason not to.',
      },
      {
        label: 'split — use if history spans stock splits',
        detail: 'Split-adjusted prices remove the discontinuous price drops that splits create, giving the model a smooth price series. Useful for stocks like NVDA or AAPL with multiple splits in the training window.',
      },
      {
        label: 'all (split + dividend) — use with care',
        detail: 'Dividend adjustments backfill the series so that ex-dividend drops appear as smooth price action. This is correct for total-return modelling but misleading for directional price prediction — dividend drops will look like recoveries in hindsight.',
      },
    ],
  },
  {
    title: 'History alignment with targets',
    color: 'rose',
    items: [
      {
        label: 'Large shift values consume more leading bars',
        detail: 'A target with shift=−10 (predict 10 bars ahead) loses 10 bars from the end of each split because there is no future close to compute the label. With 1,500 bars and shift=−10, you lose 10 samples from training, 10 from validation, and 10 from the test window.',
      },
      {
        label: 'Lookback window reduces effective sample count',
        detail: 'With lookback=60, the first 60 bars of your dataset cannot be used — they have no complete context window. A 2,000-bar dataset with lookback=60 yields 1,940 usable windows before the train/val/test split is applied.',
      },
      {
        label: 'Rule of thumb: total bars ≥ 10 × (lookback + |shift|)',
        detail: 'For lookback=30 and shift=−5, aim for at least 350 bars. In practice this is a floor — 5,000+ bars gives you statistical confidence in your test metrics.',
      },
    ],
  },
  {
    title: 'Feed selection',
    color: 'gray',
    items: [
      {
        label: 'iex — free, good for US equities',
        detail: 'IEX data is available on the free Alpaca plan and is suitable for most US equity symbols. Data quality is high for large-cap names. May have gaps for thinly traded or OTC securities.',
      },
      {
        label: 'sip — full consolidated tape',
        detail: 'SIP aggregates data from all US exchanges and is the most complete feed. Requires a paid Alpaca subscription. Use this if you are training on illiquid symbols or need highest accuracy for historical fills.',
      },
    ],
  },
]

const GUIDE_COLORS = {
  blue:   { header: 'bg-blue-50 border-blue-200',   title: 'text-blue-800',   dot: 'bg-blue-400',   badge: 'bg-blue-100 text-blue-700'   },
  emerald:{ header: 'bg-emerald-50 border-emerald-200', title: 'text-emerald-800', dot: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-700' },
  violet: { header: 'bg-violet-50 border-violet-200', title: 'text-violet-800', dot: 'bg-violet-400', badge: 'bg-violet-100 text-violet-700' },
  amber:  { header: 'bg-amber-50 border-amber-200',  title: 'text-amber-800',  dot: 'bg-amber-400',  badge: 'bg-amber-100 text-amber-700'  },
  rose:   { header: 'bg-rose-50 border-rose-200',    title: 'text-rose-800',   dot: 'bg-rose-400',   badge: 'bg-rose-100 text-rose-700'    },
  gray:   { header: 'bg-gray-50 border-gray-200',    title: 'text-gray-700',   dot: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-600'    },
}

function BestResultsGuidelines() {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div>
          <span className="text-base font-bold text-gray-800">Best Results Guidelines</span>
          <span className="ml-3 text-xs text-gray-400">What to acquire, and why it matters for training</span>
        </div>
        <span className={`text-gray-400 text-lg transition-transform ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {GUIDELINES.map(section => {
              const c = GUIDE_COLORS[section.color]
              return (
                <div key={section.title} className={`rounded-lg border ${c.header} overflow-hidden`}>
                  <div className={`flex items-center gap-2 px-4 py-2.5 border-b ${c.header}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                    <span className={`text-xs font-bold ${c.title}`}>{section.title}</span>
                  </div>
                  <div className="bg-white divide-y divide-gray-50">
                    {section.items.map(item => (
                      <div key={item.label} className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <span className={`mt-0.5 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${c.badge}`}>→</span>
                          <div>
                            <p className="text-xs font-semibold text-gray-800">{item.label}</p>
                            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.detail}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DataAcquire() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [featuresInterval, setFeaturesInterval] = useState(null)
  const [allIndicators, setAllIndicators] = useState([])

  useEffect(() => {
    fetch('/api/features/available').then(r => r.json()).then(setAllIndicators).catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Data Acquire</h1>
        <p className="text-sm text-gray-500 mt-1">Fetch historical OHLCV bars from Alpaca Market Data and load them into MariaDB.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <AcquireForm onAcquired={() => setRefreshKey((k) => k + 1)} />
        <AvailableData refreshKey={refreshKey} featuresInterval={featuresInterval}
          onFeaturesClick={setFeaturesInterval} allIndicators={allIndicators} />
      </div>

      {featuresInterval && allIndicators.length > 0 && (
        <FeaturesPanel interval={featuresInterval} allIndicators={allIndicators} onClose={() => setFeaturesInterval(null)} />
      )}

      <BestResultsGuidelines />
    </div>
  )
}
