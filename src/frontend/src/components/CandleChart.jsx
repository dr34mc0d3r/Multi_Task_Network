import { useEffect, useRef } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  createSeriesMarkers,
} from 'lightweight-charts'
import { toChartTime } from '../lib/chartTime'

const DAILY_TF = new Set(['1Day', '1Week', '1Month'])

const LINE_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#f97316', '#06b6d4', '#84cc16', '#ec4899', '#14b8a6',
  '#a78bfa', '#fb923c', '#34d399', '#f87171', '#c084fc',
]

function fmt(v, decimals = 4) {
  if (v == null) return '—'
  const n = Number(v)
  if (isNaN(n)) return '—'
  // Use fewer decimals for large numbers
  const d = Math.abs(n) >= 1000 ? 2 : Math.abs(n) >= 10 ? 3 : decimals
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })
}

// overlayLines: [{key, label, color?, data: [{time (isoStr), value}]}]
// markers:      [{time (unix seconds), position, color, shape, text}, ...]
export default function CandleChart({ bars, timeframe, markers = [], overlayLines = [], onChartReady }) {
  const containerRef = useRef(null)
  const legendRef    = useRef(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el || !bars.length) return

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#374151',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#f3f4f6' },
        horzLines: { color: '#f3f4f6' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#e5e7eb',
        scaleMargins: { top: 0.08, bottom: 0.28 },
      },
      timeScale: {
        borderColor: '#e5e7eb',
        timeVisible: !DAILY_TF.has(timeframe),
        secondsVisible: false,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    })

    if (onChartReady) onChartReady(chart)

    // --- Background shading for detected pattern candles ---
    const bgSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: 'detect_bg',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    chart.priceScale('detect_bg').applyOptions({
      scaleMargins: { top: 0.08, bottom: 0.28 },
    })

    // --- Candlestick series ---
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    })

    // --- Volume histogram ---
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    })
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    })

    // Feed and sort data
    const valid = bars.filter(
      (b) => b.open != null && b.high != null && b.low != null && b.close != null,
    )

    candleSeries.setData(
      valid.map((b) => ({
        time: toChartTime(b.timestamp_utc, timeframe),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    )

    bgSeries.setData(
      valid
        .filter((b) => b.detected)
        .map((b) => ({
          time: toChartTime(b.timestamp_utc, timeframe),
          value: 1,
          color: 'rgba(251, 191, 36, 0.22)',
        })),
    )

    volumeSeries.setData(
      valid.map((b) => ({
        time: toChartTime(b.timestamp_utc, timeframe),
        value: b.volume ?? 0,
        color: (b.close ?? 0) >= (b.open ?? 0) ? '#10b98130' : '#ef444430',
      })),
    )

    if (markers.length > 0) {
      createSeriesMarkers(
        candleSeries,
        markers.map((m) => ({
          ...m,
          time: DAILY_TF.has(timeframe)
            ? (() => {
                const d = new Date(m.time * 1000)
                const y = d.getUTCFullYear()
                const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
                const dy = String(d.getUTCDate()).padStart(2, '0')
                return `${y}-${mo}-${dy}`
              })()
            : m.time,
        }))
      )
    }

    // --- Overlay line series ---
    const lineSeriesMap = overlayLines.map((line, i) => {
      const color = line.color || LINE_COLORS[i % LINE_COLORS.length]
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 3,
      })
      const lineData = line.data
        .filter((d) => d.value != null && !isNaN(d.value))
        .map((d) => ({ time: toChartTime(d.time, timeframe), value: d.value }))
      series.setData(lineData)
      return { key: line.key, series, color }
    })

    // --- Crosshair legend updates (direct DOM, avoids React re-render on every tick) ---
    chart.subscribeCrosshairMove((param) => {
      const legend = legendRef.current
      if (!legend) return

      const candleEl = legend.querySelector('[data-leg="candle"]')
      if (candleEl) {
        if (param.seriesData) {
          const d = param.seriesData.get(candleSeries)
          if (d && d.open != null) {
            candleEl.textContent = `O ${fmt(d.open)}  H ${fmt(d.high)}  L ${fmt(d.low)}  C ${fmt(d.close)}`
          } else {
            candleEl.textContent = ''
          }
        }
      }

      lineSeriesMap.forEach(({ key, series }) => {
        const el = legend.querySelector(`[data-leg="${key}"]`)
        if (!el) return
        if (param.seriesData) {
          const d = param.seriesData.get(series)
          el.textContent = d != null ? fmt(d.value) : ''
        }
      })
    })

    chart.timeScale().fitContent()

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.resize(containerRef.current.clientWidth, containerRef.current.clientHeight)
      }
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.remove()
    }
  }, [bars, timeframe, markers, overlayLines])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Legend overlay */}
      <div
        ref={legendRef}
        className="absolute top-2 left-2 z-10 pointer-events-none flex flex-col gap-0.5"
      >
        {/* OHLC row — always shown */}
        <div className="flex items-center gap-1.5 bg-white/85 backdrop-blur-sm px-2 py-0.5 rounded text-xs font-mono shadow-sm">
          <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 shrink-0" />
          <span className="text-gray-400">OHLC</span>
          <span data-leg="candle" className="text-gray-700 ml-0.5" />
        </div>

        {/* One row per overlay line */}
        {overlayLines.map((line, i) => {
          const color = line.color || LINE_COLORS[i % LINE_COLORS.length]
          return (
            <div
              key={line.key}
              className="flex items-center gap-1.5 bg-white/85 backdrop-blur-sm px-2 py-0.5 rounded text-xs font-mono shadow-sm"
            >
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-gray-500 max-w-[160px] truncate">{line.label}</span>
              <span data-leg={line.key} className="text-gray-700 ml-0.5" />
            </div>
          )
        })}
      </div>
    </div>
  )
}
