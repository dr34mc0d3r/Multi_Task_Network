import { useState, useEffect, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ScatterChart, Scatter, BarChart, Bar, ResponsiveContainer,
} from 'recharts'
import CandleChart from '../components/CandleChart'
import SubPane from '../components/SubPane'

const SAMPLE_MAX = 400

const PRICE_OVERLAY_KEYS = new Set([
  'sma_5','sma_10','sma_20','sma_50','sma_200',
  'ema_5','ema_10','ema_20','ema_50','ema_200',
  'dema_20','tema_20','wma_20','hma_20','vwma_20','kama_10',
  'ichimoku_conv','ichimoku_base',
  'bb_upper','bb_lower','bb_mid',
  'kc_upper','kc_lower','kc_mid',
  'dc_upper','dc_lower','dc_mid',
  'vwap',
])
const OHLCV_KEYS = new Set(['open', 'high', 'low', 'close', 'volume'])
const LINE_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#f97316', '#06b6d4', '#84cc16', '#ec4899', '#14b8a6',
]

function sample(arr, max) {
  if (arr.length <= max) return arr
  const step = arr.length / max
  return Array.from({ length: max }, (_, i) => arr[Math.floor(i * step)])
}

function MetricCard({ label, value, fmt, highlight }) {
  return (
    <div className={`border rounded p-3 min-w-[100px] ${highlight ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-200'}`}>
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-lg font-bold text-gray-900 mt-0.5">
        {fmt ? fmt(value) : value ?? '—'}
      </div>
    </div>
  )
}

function RegressionMetrics({ metrics }) {
  return (
    <div className="flex flex-wrap gap-2">
      <MetricCard label="MSE" value={metrics.mse} fmt={v => v.toFixed(6)} />
      <MetricCard label="MAE" value={metrics.mae} fmt={v => v.toFixed(6)} />
      <MetricCard label="RMSE" value={metrics.rmse} fmt={v => v.toFixed(6)} />
      <MetricCard label="R²" value={metrics.r2} fmt={v => v.toFixed(4)} />
      <MetricCard
        label="Dir Acc"
        value={metrics.dir_acc}
        fmt={v => (v * 100).toFixed(1) + '%'}
        highlight={metrics.dir_acc < 0.5}
      />
    </div>
  )
}

function ClassificationMetrics({ metrics }) {
  return (
    <div className="flex flex-wrap gap-2">
      <MetricCard label="Accuracy" value={metrics.accuracy} fmt={v => (v * 100).toFixed(1) + '%'} />
      <MetricCard label="Precision" value={metrics.precision} fmt={v => v.toFixed(4)} />
      <MetricCard label="Recall" value={metrics.recall} fmt={v => v.toFixed(4)} />
      <MetricCard label="F1" value={metrics.f1} fmt={v => v.toFixed(4)} />
    </div>
  )
}

function TimelineChart({ predictions, actuals, timestamps }) {
  const raw = predictions.map((p, i) => ({ i, pred: p, actual: actuals[i], ts: timestamps[i] }))
  const data = sample(raw, SAMPLE_MAX)
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="i" tick={false} />
        <YAxis width={60} tick={{ fontSize: 10 }} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const p = payload[0]?.payload
            return (
              <div className="bg-white border border-gray-200 rounded p-2 text-xs shadow">
                <div className="text-gray-400 mb-1 truncate max-w-[180px]">{p?.ts}</div>
                <div className="text-blue-600">Actual: {p?.actual?.toFixed(6)}</div>
                <div className="text-orange-500">Predicted: {p?.pred?.toFixed(6)}</div>
              </div>
            )
          }}
        />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="actual" stroke="#3b82f6" dot={false} strokeWidth={1.5} name="Actual" />
        <Line type="monotone" dataKey="pred" stroke="#f97316" dot={false} strokeWidth={1.5} name="Predicted" />
      </LineChart>
    </ResponsiveContainer>
  )
}

function ScatterPlot({ predictions, actuals }) {
  const raw = predictions.map((p, i) => ({ x: actuals[i], y: p }))
  const data = sample(raw, SAMPLE_MAX)
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ScatterChart margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="x" name="Actual" type="number" tick={{ fontSize: 10 }} label={{ value: 'Actual', position: 'insideBottom', offset: -5, fontSize: 10 }} />
        <YAxis dataKey="y" name="Predicted" type="number" tick={{ fontSize: 10 }} width={60} label={{ value: 'Predicted', angle: -90, position: 'insideLeft', fontSize: 10 }} />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            return (
              <div className="bg-white border border-gray-200 rounded p-2 text-xs shadow">
                <div>Actual: {payload[0]?.value?.toFixed(6)}</div>
                <div>Predicted: {payload[1]?.value?.toFixed(6)}</div>
              </div>
            )
          }}
        />
        <Scatter data={data} fill="#6366f1" opacity={0.4} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}

function ResidualHistogram({ predictions, actuals }) {
  const residuals = predictions.map((p, i) => p - actuals[i])
  const rMin = Math.min(...residuals)
  const rMax = Math.max(...residuals)
  const buckets = 20
  const step = (rMax - rMin) / buckets || 1
  const counts = Array(buckets).fill(0)
  residuals.forEach(r => {
    const idx = Math.min(Math.floor((r - rMin) / step), buckets - 1)
    counts[idx]++
  })
  const data = counts.map((count, i) => ({
    bin: (rMin + i * step + step / 2).toFixed(5),
    count,
  }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="bin" tick={{ fontSize: 8 }} angle={-45} textAnchor="end" interval={2} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip />
        <Bar dataKey="count" fill="#8b5cf6" name="Count" />
      </BarChart>
    </ResponsiveContainer>
  )
}

function ConfusionMatrix({ matrix }) {
  const n = matrix.length
  const labels = n === 2 ? ['Neg', 'Pos'] : matrix.map((_, i) => String(i))
  const maxVal = Math.max(...matrix.flat(), 1)
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="text-xs text-gray-500 font-semibold">Predicted →</div>
      <table className="border-collapse">
        <thead>
          <tr>
            <th className="text-xs text-gray-500 pr-3 pb-1">Actual ↓</th>
            {labels.map(l => (
              <th key={l} className="text-xs font-semibold text-gray-700 w-20 h-8 text-center pb-1">{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, ri) => (
            <tr key={ri}>
              <td className="text-xs font-semibold text-gray-700 pr-3 text-right">{labels[ri]}</td>
              {row.map((val, ci) => {
                const intensity = val / maxVal
                const bg = ri === ci
                  ? `rgba(34,197,94,${0.1 + intensity * 0.75})`
                  : `rgba(239,68,68,${0.05 + intensity * 0.55})`
                return (
                  <td
                    key={ci}
                    className="w-20 h-20 text-center font-bold text-base border border-gray-200"
                    style={{ backgroundColor: bg }}
                  >
                    {val}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10px] text-gray-400">Green diagonal = correct predictions</div>
    </div>
  )
}

function TaskPanel({ task }) {
  const isRegression = task.task_type === 'regression'
  const tabs = isRegression
    ? [['timeline', 'Timeline'], ['scatter', 'Scatter'], ['residuals', 'Residuals']]
    : [['confusion', 'Confusion Matrix']]
  const [tab, setTab] = useState(tabs[0][0])

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <span className="font-semibold text-gray-900">{task.label}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
          isRegression ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {task.task_type}
        </span>
        <span className="text-xs text-gray-400 ml-auto">{task.predictions.length} samples</span>
      </div>

      <div className="px-4 py-3 border-b border-gray-100">
        {isRegression
          ? <RegressionMetrics metrics={task.metrics} />
          : <ClassificationMetrics metrics={task.metrics} />
        }
      </div>

      <div className="flex gap-1 px-4 pt-3 border-b border-gray-100">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`text-xs px-3 py-1.5 rounded-t font-medium transition-colors border-b-2 ${
              tab === key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === 'timeline' && (
          <TimelineChart predictions={task.predictions} actuals={task.actuals} timestamps={task.timestamps} />
        )}
        {tab === 'scatter' && (
          <ScatterPlot predictions={task.predictions} actuals={task.actuals} />
        )}
        {tab === 'residuals' && (
          <ResidualHistogram predictions={task.predictions} actuals={task.actuals} />
        )}
        {tab === 'confusion' && task.metrics.confusion_matrix && (
          <ConfusionMatrix matrix={task.metrics.confusion_matrix} />
        )}
      </div>
    </div>
  )
}

const HELP_SECTIONS = [
  {
    title: 'What is Evaluation?',
    rows: [
      { term: 'Purpose', def: 'Evaluation runs the saved model checkpoint on the held-out test split — bars the model never saw during training or validation. This is the only unbiased estimate of real-world performance.' },
      { term: 'Caching', def: 'Results are cached in the database after the first run. Re-opening the page loads instantly. Click "Re-evaluate" to recompute (e.g. after retraining).' },
    ],
  },
  {
    title: 'Summary bar',
    rows: [
      { term: 'Best epoch', def: 'The epoch at which validation loss was lowest. The saved model checkpoint comes from this epoch, not the final epoch.' },
      { term: 'Epochs run', def: 'Total epochs completed before early stopping triggered. Early stopping fires when validation loss hasn\'t improved for the configured patience.' },
      { term: 'Test samples', def: 'Number of lookback windows in the test split. Each window is one prediction. Fewer samples = wider confidence intervals on all metrics.' },
      { term: 'Test window', def: 'Date range of the test split. Check that this covers the market conditions you care about — a bull-market model may score poorly on a bear-market test window.' },
    ],
  },
  {
    title: 'Loss comparison (Train / Val / Test)',
    rows: [
      { term: 'Best Train Loss', def: 'Lowest loss recorded on training data. The model optimised directly against this, so it will always look best here.' },
      { term: 'Best Val Loss', def: 'Lowest loss on the validation split — the early-stopping criterion. This is the benchmark to beat on the test set.' },
      { term: 'Test Loss', def: 'Loss on the held-out test set. Shown green when close to val loss (good generalisation) and red when >25% higher (possible overfitting or distribution shift between the val and test periods).' },
    ],
  },
  {
    title: 'Regression metrics',
    rows: [
      { term: 'MSE', def: 'Mean Squared Error — the optimisation objective. Penalises large errors heavily. Useful for comparing runs trained with the same loss function, but hard to interpret in isolation.' },
      { term: 'MAE', def: 'Mean Absolute Error — average error in the same units as the target. For Return (frac), MAE 0.006 means predictions are off by 0.6% on average. More intuitive than MSE.' },
      { term: 'RMSE', def: 'Root Mean Squared Error — same units as the target but more sensitive to large outlier errors than MAE. If RMSE >> MAE, the model occasionally makes very large errors.' },
      { term: 'R²', def: 'Proportion of variance explained. 1.0 = perfect. 0 = no better than predicting the mean every time. Negative = worse than predicting the mean. Most LSTM models on financial returns score near 0.' },
      { term: 'Dir Acc', def: 'Direction Accuracy — % of bars where sign(predicted) = sign(actual). The most trading-relevant single number. 50% = random. Highlighted amber if below 50% (model predicts the wrong direction more than half the time). Anything above ~53% consistently is meaningful.' },
    ],
  },
  {
    title: 'Classification metrics',
    rows: [
      { term: 'Accuracy', def: 'Overall % of correct class predictions. Can be misleading on imbalanced datasets — if 70% of bars move up, predicting "up" always gives 70% accuracy for free without learning anything.' },
      { term: 'Precision', def: 'Of all bars the model predicted as positive (up/signal), how many were actually positive. High precision = few false alarms. Important when acting on each signal is costly.' },
      { term: 'Recall', def: 'Of all bars that were actually positive, how many did the model catch. High recall = few missed signals. Important when missing opportunities is costly.' },
      { term: 'F1', def: 'Harmonic mean of precision and recall (range 0–1). Balances both concerns. Use F1 when you care equally about false alarms and missed signals. Higher is better.' },
    ],
  },
  {
    title: 'Charts',
    rows: [
      {
        term: 'Timeline',
        def: 'Actual (blue) vs Predicted (orange) over the test window in time order.',
        ideal: 'The orange line closely tracks the blue — matching direction and rough magnitude across the full window.',
        watchFor: [
          'Predictions flat near zero: the model hasn\'t learned and outputs the mean regardless of input.',
          'Orange lags blue by one bar: possible lookahead leak in your features.',
          'Predictions diverge at the end of the window: regime change — the test period behaved differently to training.',
          'Orange mirrors blue but with lower amplitude: model learned the direction but is under-confident.',
        ],
      },
      {
        term: 'Scatter',
        def: 'Each dot is one bar: X = actual value, Y = predicted value.',
        ideal: 'Dots tightly packed along a diagonal line from bottom-left to top-right. The slope should be ~1 with minimal scatter around it.',
        watchFor: [
          'Dots on a flat horizontal band near y=0: model predicts near-zero for everything regardless of actual.',
          'Dots spread in a fan (wide at large actuals): model is less reliable at extremes — misses large moves.',
          'Cluster shifted above the diagonal: model systematically over-predicts.',
          'Cluster shifted below the diagonal: model systematically under-predicts.',
        ],
      },
      {
        term: 'Residuals',
        def: 'Histogram of (Predicted − Actual) error for every bar in the test set.',
        ideal: 'A tall, narrow, symmetric bell-curve centred exactly at 0 — errors are small, unbiased, and normally distributed.',
        watchFor: [
          'Peak left of zero: model consistently under-predicts (overestimates actual moves).',
          'Peak right of zero: model consistently over-predicts.',
          'Heavy tails or multiple peaks: model struggles with certain regimes or outlier bars.',
          'Wide flat distribution: high variance — the model\'s errors are large and unpredictable.',
        ],
      },
      {
        term: 'Confusion Matrix',
        def: 'For classification targets. Rows = actual class, columns = predicted class. Green cells = correct, red cells = errors.',
        ideal: 'All counts concentrated on the green diagonal. Off-diagonal cells are zero or near-zero, meaning the model rarely confuses one class for another.',
        watchFor: [
          'Large off-diagonal numbers in a row: model consistently misclassifies one particular class.',
          'One row dominates: model predicts the same class for almost everything (class imbalance problem).',
          'Symmetric off-diagonal errors: model can\'t separate two classes at all — they look the same to it.',
          'Single large off-diagonal cell: one specific confusion is responsible for most errors — investigate those bars.',
        ],
      },
    ],
  },
]

export default function Evaluation() {
  const [runs, setRuns] = useState([])
  const [selectedRunId, setSelectedRunId] = useState('')
  const [runDetail, setRunDetail] = useState(null)
  const [result, setResult] = useState(null)
  const [evaluating, setEvaluating] = useState(false)
  const [error, setError] = useState(null)
  const [showHelp, setShowHelp] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [activeTab, setActiveTab] = useState('metrics')
  const [chartBars, setChartBars] = useState([])
  const [chartFeatures, setChartFeatures] = useState({})
  const [chartLoading, setChartLoading] = useState(false)
  const [mainChart, setMainChart] = useState(null)
  const [allConfigs, setAllConfigs] = useState([])

  useEffect(() => {
    fetch('/api/training-data/configs')
      .then(r => r.json())
      .then(data => setAllConfigs(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/training/runs')
      .then(r => r.json())
      .then(data => setRuns(data.filter(r => r.status === 'completed')))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedRunId) { setRunDetail(null); setResult(null); return }
    const run = runs.find(r => r.id === +selectedRunId)
    setRunDetail(run ?? null)
    setResult(null)
    setError(null)
    setDeleteConfirm(false)
    setActiveTab('metrics')
    setChartBars([])
    setChartFeatures({})
    setMainChart(null)
    fetch(`/api/training/runs/${selectedRunId}/evaluation`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setResult(data) })
      .catch(() => {})
  }, [selectedRunId]) // eslint-disable-line react-hooks/exhaustive-deps

  const deleteRun = () => {
    setDeleting(true)
    fetch(`/api/training/runs/${selectedRunId}`, { method: 'DELETE' })
      .then(r => {
        if (r.ok) {
          setRuns(prev => prev.filter(r => r.id !== +selectedRunId))
          setSelectedRunId('')
          setResult(null)
          setRunDetail(null)
        } else {
          r.json().then(e => setError(e.detail ?? 'Delete failed'))
        }
      })
      .catch(() => setError('Delete failed'))
      .finally(() => { setDeleting(false); setDeleteConfirm(false) })
  }

  const runEvaluation = () => {
    setEvaluating(true)
    setError(null)
    fetch(`/api/training/runs/${selectedRunId}/evaluate`, { method: 'POST' })
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.detail ?? 'Evaluation failed')))
      .then(data => setResult(data))
      .catch(e => setError(String(e)))
      .finally(() => setEvaluating(false))
  }

  const trainLosses = runDetail?.train_losses ? JSON.parse(runDetail.train_losses) : []
  const bestTrainLoss = trainLosses.length ? Math.min(...trainLosses) : null
  const bestValLoss = runDetail?.best_val_loss ?? null
  const testLoss = result?.test_loss ?? null
  const testHigher = testLoss != null && bestValLoss != null && testLoss > bestValLoss * 1.25

  const parsedConfig = useMemo(() => {
    if (!runDetail?.config_id) return null
    const cfg = allConfigs.find(c => c.id === runDetail.config_id)
    if (!cfg?.config_json) return null
    try { return JSON.parse(cfg.config_json) } catch { return null }
  }, [runDetail, allConfigs])

  const indicatorKeys = useMemo(() => {
    if (!parsedConfig?.feature_columns) return []
    return parsedConfig.feature_columns.filter(k => !OHLCV_KEYS.has(k))
  }, [parsedConfig])

  const priceOverlayKeys = useMemo(() => indicatorKeys.filter(k => PRICE_OVERLAY_KEYS.has(k)), [indicatorKeys])
  const oscillatorKeys   = useMemo(() => indicatorKeys.filter(k => !PRICE_OVERLAY_KEYS.has(k)), [indicatorKeys])

  const priceOverlayLines = useMemo(() => priceOverlayKeys.map((k, i) => ({
    key: k,
    label: k,
    color: LINE_COLORS[i % LINE_COLORS.length],
    data: chartFeatures[k] ?? [],
  })), [priceOverlayKeys, chartFeatures])

  const predMarkers = useMemo(() => {
    if (!result || !chartBars.length) return []
    return result.tasks.flatMap(task => {
      if (task.task_type !== 'classification') return []
      return task.timestamps.map((ts, i) => {
        const pred = task.predictions[i] > 0.5
        const actual = task.actuals[i] > 0.5
        const correct = pred === actual
        const ms = new Date(ts.endsWith('Z') ? ts : ts + 'Z').getTime()
        return {
          time: Math.floor(ms / 1000),
          position: pred ? 'belowBar' : 'aboveBar',
          shape: pred ? 'arrowUp' : 'arrowDown',
          color: correct ? '#10b981' : '#ef4444',
          size: 1,
        }
      })
    })
  }, [result, chartBars])

  const regressionTasks = useMemo(() => result?.tasks.filter(t => t.task_type === 'regression') ?? [], [result])

  const regressionSubPanesData = useMemo(() =>
    regressionTasks.map(task => ({
      label: task.label,
      actualData: task.actuals.map((v, i) => ({ time: task.timestamps[i], value: v })),
      predData: task.predictions.map((v, i) => ({ time: task.timestamps[i], value: v })),
    })),
  [regressionTasks])

  useEffect(() => {
    if (activeTab !== 'chart' || chartBars.length > 0 || !runDetail || !parsedConfig) return
    const { symbol, timeframe } = parsedConfig
    const keys = indicatorKeys
    setChartLoading(true)
    Promise.all([
      fetch(`/api/bars/chart-data?symbol=${symbol}&timeframe=${timeframe}&feed=iex&adjustment=raw&limit=10000`).then(r => r.json()),
      keys.length
        ? fetch(`/api/features/bars?symbol=${symbol}&timeframe=${timeframe}&feed=iex&adjustment=raw&keys=${keys.join(',')}`).then(r => r.json())
        : Promise.resolve([]),
    ]).then(([bars, rows]) => {
      setChartBars(bars)
      if (keys.length && rows.length) {
        const byKey = {}
        keys.forEach(k => { byKey[k] = [] })
        rows.forEach(row => {
          keys.forEach(k => { if (k in row) byKey[k].push({ time: row.timestamp_utc, value: row[k] }) })
        })
        setChartFeatures(byKey)
      }
    }).catch(() => {}).finally(() => setChartLoading(false))
  }, [activeTab, chartBars.length, runDetail, parsedConfig, indicatorKeys])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Evaluation</h1>
        <button
          onClick={() => setShowHelp(h => !h)}
          className="text-xs px-3 py-1.5 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 transition-colors font-medium"
        >
          {showHelp ? 'Hide guide' : '? Guide'}
        </button>
      </div>

      {showHelp && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 space-y-6 text-sm">
          {HELP_SECTIONS.map(section => (
            <div key={section.title}>
              <h3 className="font-semibold text-blue-900 mb-2 text-sm">{section.title}</h3>
              <div className="space-y-3">
                {section.rows.map(row => (
                  <div key={row.term}>
                    <div className="flex gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800 min-w-[110px]">{row.term}</span>
                      <span className="text-gray-700 flex-1">{row.def}</span>
                    </div>
                    {row.ideal && (
                      <div className="mt-1 ml-[118px] text-gray-700">
                        <span className="text-green-700 font-medium">Ideal: </span>{row.ideal}
                      </div>
                    )}
                    {row.watchFor && (
                      <ul className="mt-1 ml-[118px] space-y-0.5">
                        {row.watchFor.map((w, i) => (
                          <li key={i} className="text-gray-600 flex gap-1.5">
                            <span className="text-amber-500 mt-0.5 shrink-0">▸</span>
                            <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Run selector */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
          <label className="text-xs font-semibold text-gray-600">Completed Training Run</label>
          <select
            value={selectedRunId}
            onChange={e => setSelectedRunId(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900 bg-white"
          >
            <option value="">Select a run…</option>
            {runs.map(r => (
              <option key={r.id} value={r.id}>
                Run #{r.id} — {new Date(r.started_at).toLocaleDateString()} — best val loss {r.best_val_loss?.toFixed(6)}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={runEvaluation}
          disabled={!selectedRunId || evaluating}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {evaluating ? 'Running…' : result ? 'Re-evaluate' : 'Run Evaluation'}
        </button>

        {selectedRunId && !deleteConfirm && (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="px-3 py-1.5 text-sm font-semibold rounded border border-red-300 text-red-500 hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        )}

        {selectedRunId && deleteConfirm && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded px-3 py-1.5">
            <span className="text-xs text-red-700 font-medium">Delete this run permanently?</span>
            <button
              onClick={deleteRun}
              disabled={deleting}
              className="px-2.5 py-1 text-xs font-semibold rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button
              onClick={() => setDeleteConfirm(false)}
              className="px-2.5 py-1 text-xs font-semibold rounded border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">{error}</div>
      )}

      {/* Summary bar */}
      {runDetail && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span><span className="text-gray-500">Best epoch:</span> <span className="font-semibold">{runDetail.best_epoch ?? '—'}</span></span>
          <span><span className="text-gray-500">Epochs run:</span> <span className="font-semibold">{runDetail.current_epoch}</span></span>
          {result && (
            <span><span className="text-gray-500">Test samples:</span> <span className="font-semibold">{result.tasks[0]?.predictions?.length ?? 0}</span></span>
          )}
          {result && (
            <span>
              <span className="text-gray-500">Test window:</span>{' '}
              <span className="font-semibold text-xs">
                {result.tasks[0]?.timestamps?.[0]?.slice(0, 10)} → {result.tasks[0]?.timestamps?.at(-1)?.slice(0, 10)}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Loss comparison */}
      {runDetail && result && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Best Train Loss', value: bestTrainLoss, cls: 'text-gray-900' },
            { label: 'Best Val Loss', value: bestValLoss, cls: 'text-gray-900' },
            { label: 'Test Loss', value: testLoss, cls: testHigher ? 'text-red-600' : 'text-green-600' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-lg p-4 text-center">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className={`text-xl font-bold ${cls}`}>
                {value != null ? value.toFixed(6) : '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      {testHigher && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded p-3">
          Test loss is significantly higher than validation loss — the model may be overfitting or the test period has a different distribution.
        </div>
      )}

      {/* Tab switcher + task/chart panels */}
      {result && (
        <div>
          <div className="flex gap-0 border-b border-gray-200 mb-4">
            {['metrics', 'chart'].map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-5 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === t
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'metrics' ? 'Metrics' : 'Chart'}
              </button>
            ))}
          </div>

          {activeTab === 'metrics' && (
            <div className="space-y-4">
              {result.tasks.map(task => (
                <TaskPanel key={task.label} task={task} />
              ))}
            </div>
          )}

          {activeTab === 'chart' && (
            <div className="space-y-0 border border-gray-200 rounded-lg overflow-hidden">
              {chartLoading && (
                <div className="text-center text-gray-400 text-sm py-10 animate-pulse">Loading chart data…</div>
              )}
              {!chartLoading && chartBars.length === 0 && (
                <div className="text-center text-gray-400 text-sm py-10">No bar data loaded.</div>
              )}
              {!chartLoading && chartBars.length > 0 && (
                <>
                  <div style={{ height: 384 }}>
                    <CandleChart
                      bars={chartBars}
                      timeframe={parsedConfig?.timeframe ?? ''}
                      overlayLines={priceOverlayLines}
                      markers={predMarkers}
                      onChartReady={setMainChart}
                    />
                  </div>
                  {oscillatorKeys.map((k, i) => (
                    <SubPane
                      key={k}
                      label={k}
                      data={chartFeatures[k] ?? []}
                      timeframe={parsedConfig?.timeframe ?? ''}
                      color={LINE_COLORS[(priceOverlayKeys.length + i) % LINE_COLORS.length]}
                      mainChart={mainChart}
                    />
                  ))}
                  {regressionSubPanesData.map(pane => (
                    <SubPane
                      key={pane.label}
                      label={`${pane.label} — predicted (orange) vs actual (blue)`}
                      data={pane.actualData}
                      secondaryData={pane.predData}
                      timeframe={parsedConfig?.timeframe ?? ''}
                      color="#3b82f6"
                      secondaryColor="#f97316"
                      mainChart={mainChart}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {evaluating && (
        <div className="text-center text-gray-500 text-sm py-10 animate-pulse">
          Running inference on test set…
        </div>
      )}

      {!selectedRunId && runs.length === 0 && (
        <div className="text-center text-gray-400 text-sm py-10">
          No completed training runs found. Train a model first.
        </div>
      )}
    </div>
  )
}
