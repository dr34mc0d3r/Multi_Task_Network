const DAILY_TF = new Set(['1Day', '1Week', '1Month'])

export function toChartTime(isoStr, timeframe) {
  const ms = new Date(isoStr.endsWith('Z') ? isoStr : isoStr + 'Z').getTime()
  if (DAILY_TF.has(timeframe)) {
    const d = new Date(ms)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }
  return Math.floor(ms / 1000)
}
