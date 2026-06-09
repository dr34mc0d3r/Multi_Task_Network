import { useEffect, useRef } from 'react'
import { createChart, LineSeries } from 'lightweight-charts'
import { toChartTime } from '../lib/chartTime'

// View-only sub-pane that syncs its time-scale one-way from mainChart.
// Optional secondaryData/secondaryColor renders a second line in the same pane.
export default function SubPane({ label, data, timeframe, color, mainChart, secondaryData, secondaryColor }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el || !data.length) return

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
      rightPriceScale: {
        borderColor: '#e5e7eb',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
    })

    const clean = (d) =>
      d.filter(p => p.value != null && !isNaN(p.value))
        .map(p => ({ time: toChartTime(p.time, timeframe), value: p.value }))

    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
    })
    series.setData(clean(data))

    let secondarySeries = null
    if (secondaryData?.length) {
      secondarySeries = chart.addSeries(LineSeries, {
        color: secondaryColor ?? '#f97316',
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 3,
      })
      secondarySeries.setData(clean(secondaryData))
    }

    let disposed = false
    let syncSub = null

    if (mainChart) {
      syncSub = (r) => {
        if (!disposed && r) {
          try { chart.timeScale().setVisibleLogicalRange(r) } catch {}
        }
      }
      try {
        mainChart.timeScale().subscribeVisibleLogicalRangeChange(syncSub)
        const initial = mainChart.timeScale().getVisibleLogicalRange()
        if (initial) chart.timeScale().setVisibleLogicalRange(initial)
      } catch {}
    }

    const ro = new ResizeObserver(() => {
      if (!disposed) {
        try { chart.resize(el.clientWidth, el.clientHeight) } catch {}
      }
    })
    ro.observe(el)

    return () => {
      disposed = true
      ro.disconnect()
      if (mainChart && syncSub) {
        try { mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(syncSub) } catch {}
      }
      try { chart.remove() } catch {}
    }
  }, [data, timeframe, color, mainChart, secondaryData, secondaryColor])

  return (
    <div className="w-full border-t border-gray-200">
      <div className="px-3 py-1 text-xs font-mono text-gray-400 bg-gray-50 select-none">{label}</div>
      <div ref={containerRef} style={{ height: 100 }} className="w-full" />
    </div>
  )
}
