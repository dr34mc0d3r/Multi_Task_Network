"""100 technical indicators computed from OHLCV DataFrames using pure pandas/numpy."""

from __future__ import annotations

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Registry — single source of truth for all 100 indicators
# ---------------------------------------------------------------------------

INDICATOR_META: dict[str, dict] = {
    # ── Trend (20) ──────────────────────────────────────────────────────────
    "sma_5":          {"label": "SMA 5",            "category": "Trend",        "desc": "Simple moving average, 5 periods"},
    "sma_10":         {"label": "SMA 10",           "category": "Trend",        "desc": "Simple moving average, 10 periods"},
    "sma_20":         {"label": "SMA 20",           "category": "Trend",        "desc": "Simple moving average, 20 periods"},
    "sma_50":         {"label": "SMA 50",           "category": "Trend",        "desc": "Simple moving average, 50 periods"},
    "sma_200":        {"label": "SMA 200",          "category": "Trend",        "desc": "Simple moving average, 200 periods"},
    "ema_5":          {"label": "EMA 5",            "category": "Trend",        "desc": "Exponential moving average, 5 periods"},
    "ema_10":         {"label": "EMA 10",           "category": "Trend",        "desc": "Exponential moving average, 10 periods"},
    "ema_20":         {"label": "EMA 20",           "category": "Trend",        "desc": "Exponential moving average, 20 periods"},
    "ema_50":         {"label": "EMA 50",           "category": "Trend",        "desc": "Exponential moving average, 50 periods"},
    "ema_200":        {"label": "EMA 200",          "category": "Trend",        "desc": "Exponential moving average, 200 periods"},
    "dema_20":        {"label": "DEMA 20",          "category": "Trend",        "desc": "Double EMA: 2×EMA20 − EMA(EMA20)"},
    "tema_20":        {"label": "TEMA 20",          "category": "Trend",        "desc": "Triple EMA: 3×EMA − 3×EMA(EMA) + EMA(EMA(EMA))"},
    "wma_20":         {"label": "WMA 20",           "category": "Trend",        "desc": "Linearly weighted moving average, 20 periods"},
    "hma_20":         {"label": "HMA 20",           "category": "Trend",        "desc": "Hull MA: WMA(2×WMA(n/2) − WMA(n), √n)"},
    "vwma_20":        {"label": "VWMA 20",          "category": "Trend",        "desc": "Volume-weighted moving average, 20 periods"},
    "kama_10":        {"label": "KAMA 10",          "category": "Trend",        "desc": "Kaufman adaptive moving average, 10 periods"},
    "ichimoku_conv":  {"label": "Ichimoku Conv",    "category": "Trend",        "desc": "Ichimoku conversion line (9-period midpoint)"},
    "ichimoku_base":  {"label": "Ichimoku Base",    "category": "Trend",        "desc": "Ichimoku base line (26-period midpoint)"},
    "linreg_slope_20":{"label": "LinReg Slope 20",  "category": "Trend",        "desc": "Linear regression slope over 20 periods"},
    "supertrend_dir": {"label": "Supertrend Dir",   "category": "Trend",        "desc": "Supertrend direction: +1 = bullish, −1 = bearish"},

    # ── Momentum (20) ───────────────────────────────────────────────────────
    "rsi_14":         {"label": "RSI 14",           "category": "Momentum",     "desc": "Relative Strength Index, 14 periods"},
    "rsi_7":          {"label": "RSI 7",            "category": "Momentum",     "desc": "Relative Strength Index, 7 periods"},
    "macd":           {"label": "MACD",             "category": "Momentum",     "desc": "MACD line (EMA12 − EMA26)"},
    "macd_signal":    {"label": "MACD Signal",      "category": "Momentum",     "desc": "MACD signal line (EMA9 of MACD)"},
    "macd_hist":      {"label": "MACD Histogram",   "category": "Momentum",     "desc": "MACD − Signal line"},
    "stoch_k":        {"label": "Stoch %K",         "category": "Momentum",     "desc": "Stochastic oscillator %K (14,3)"},
    "stoch_d":        {"label": "Stoch %D",         "category": "Momentum",     "desc": "Stochastic %D — SMA3 of %K"},
    "stochrsi_k":     {"label": "StochRSI %K",      "category": "Momentum",     "desc": "Stochastic RSI %K"},
    "stochrsi_d":     {"label": "StochRSI %D",      "category": "Momentum",     "desc": "Stochastic RSI %D — SMA3 of StochRSI %K"},
    "mom_10":         {"label": "Momentum 10",      "category": "Momentum",     "desc": "Price momentum: Close − Close[10]"},
    "roc_10":         {"label": "ROC 10",           "category": "Momentum",     "desc": "Rate of Change 10 periods (%)"},
    "cci_20":         {"label": "CCI 20",           "category": "Momentum",     "desc": "Commodity Channel Index, 20 periods"},
    "willr_14":       {"label": "Williams %R",      "category": "Momentum",     "desc": "Williams %R, 14 periods (0 to −100)"},
    "mfi_14":         {"label": "MFI 14",           "category": "Momentum",     "desc": "Money Flow Index, 14 periods"},
    "cmf_20":         {"label": "CMF 20",           "category": "Momentum",     "desc": "Chaikin Money Flow, 20 periods"},
    "aroon_up":       {"label": "Aroon Up",         "category": "Momentum",     "desc": "Aroon Up, 25 periods"},
    "aroon_down":     {"label": "Aroon Down",       "category": "Momentum",     "desc": "Aroon Down, 25 periods"},
    "aroon_osc":      {"label": "Aroon Oscillator", "category": "Momentum",     "desc": "Aroon Up − Aroon Down"},
    "dpo_20":         {"label": "DPO 20",           "category": "Momentum",     "desc": "Detrended Price Oscillator, 20 periods"},
    "tsi":            {"label": "TSI",              "category": "Momentum",     "desc": "True Strength Index (25, 13)"},

    # ── Volatility (18) ─────────────────────────────────────────────────────
    "atr_14":         {"label": "ATR 14",           "category": "Volatility",   "desc": "Average True Range, 14 periods"},
    "atr_7":          {"label": "ATR 7",            "category": "Volatility",   "desc": "Average True Range, 7 periods"},
    "natr_14":        {"label": "NATR 14",          "category": "Volatility",   "desc": "Normalized ATR: ATR14 / Close × 100"},
    "bb_upper":       {"label": "BB Upper",         "category": "Volatility",   "desc": "Bollinger Band upper (SMA20 + 2σ)"},
    "bb_lower":       {"label": "BB Lower",         "category": "Volatility",   "desc": "Bollinger Band lower (SMA20 − 2σ)"},
    "bb_mid":         {"label": "BB Mid",           "category": "Volatility",   "desc": "Bollinger Band middle (SMA 20)"},
    "bb_width":       {"label": "BB Width",         "category": "Volatility",   "desc": "Bollinger Band width: (upper − lower) / mid"},
    "bb_pctb":        {"label": "BB %B",            "category": "Volatility",   "desc": "Bollinger %B: (Close − lower) / (upper − lower)"},
    "kc_upper":       {"label": "KC Upper",         "category": "Volatility",   "desc": "Keltner Channel upper (EMA20 + 2×ATR10)"},
    "kc_lower":       {"label": "KC Lower",         "category": "Volatility",   "desc": "Keltner Channel lower (EMA20 − 2×ATR10)"},
    "kc_mid":         {"label": "KC Mid",           "category": "Volatility",   "desc": "Keltner Channel midline (EMA 20)"},
    "dc_upper":       {"label": "DC Upper",         "category": "Volatility",   "desc": "Donchian Channel upper: 20-period high"},
    "dc_lower":       {"label": "DC Lower",         "category": "Volatility",   "desc": "Donchian Channel lower: 20-period low"},
    "dc_mid":         {"label": "DC Mid",           "category": "Volatility",   "desc": "Donchian Channel midline"},
    "stddev_20":      {"label": "StdDev 20",        "category": "Volatility",   "desc": "Rolling standard deviation of close, 20 periods"},
    "hist_vol_20":    {"label": "Hist Vol 20",      "category": "Volatility",   "desc": "Historical volatility: annualised std of log returns, 20 periods"},
    "ulcer_14":       {"label": "Ulcer Index 14",   "category": "Volatility",   "desc": "Ulcer Index (drawdown severity), 14 periods"},
    "choppiness_14":  {"label": "Choppiness 14",    "category": "Volatility",   "desc": "Choppiness Index — 100 = ranging, 0 = trending"},

    # ── Volume (14) ─────────────────────────────────────────────────────────
    "obv":            {"label": "OBV",              "category": "Volume",       "desc": "On-Balance Volume (cumulative)"},
    "obv_ema_20":     {"label": "OBV EMA 20",       "category": "Volume",       "desc": "20-period EMA of OBV"},
    "vwap":           {"label": "VWAP",             "category": "Volume",       "desc": "Cumulative volume-weighted average price"},
    "ad":             {"label": "A/D Line",         "category": "Volume",       "desc": "Chaikin Accumulation/Distribution Line"},
    "adosc":          {"label": "A/D Oscillator",   "category": "Volume",       "desc": "Chaikin A/D Oscillator (EMA3 − EMA10 of AD)"},
    "emv_14":         {"label": "EMV 14",           "category": "Volume",       "desc": "Ease of Movement, 14-period smoothing"},
    "vpt":            {"label": "VPT",              "category": "Volume",       "desc": "Volume Price Trend (cumulative)"},
    "nvi":            {"label": "NVI",              "category": "Volume",       "desc": "Negative Volume Index"},
    "pvi":            {"label": "PVI",              "category": "Volume",       "desc": "Positive Volume Index"},
    "vol_sma_20":     {"label": "Vol SMA 20",       "category": "Volume",       "desc": "20-period simple moving average of volume"},
    "vol_ema_20":     {"label": "Vol EMA 20",       "category": "Volume",       "desc": "20-period exponential moving average of volume"},
    "vol_ratio_20":   {"label": "Vol Ratio 20",     "category": "Volume",       "desc": "Volume / 20-period average volume"},
    "force_idx_13":   {"label": "Force Index 13",   "category": "Volume",       "desc": "Elder Force Index: EMA13 of (Close−PrevClose)×Volume"},
    "klinger_osc":    {"label": "Klinger Osc",      "category": "Volume",       "desc": "Klinger Volume Oscillator (EMA34 − EMA55 of KVF)"},

    # ── Trend Strength (10) ─────────────────────────────────────────────────
    "adx_14":         {"label": "ADX 14",           "category": "Trend Strength", "desc": "Average Directional Index, 14 periods"},
    "di_plus_14":     {"label": "+DI 14",           "category": "Trend Strength", "desc": "Positive Directional Indicator, 14 periods"},
    "di_minus_14":    {"label": "−DI 14",           "category": "Trend Strength", "desc": "Negative Directional Indicator, 14 periods"},
    "dx_14":          {"label": "DX 14",            "category": "Trend Strength", "desc": "Directional Index: 100×|+DI−−DI|/(+DI+−DI)"},
    "vortex_pos":     {"label": "Vortex +VI",       "category": "Trend Strength", "desc": "Vortex positive indicator, 14 periods"},
    "vortex_neg":     {"label": "Vortex −VI",       "category": "Trend Strength", "desc": "Vortex negative indicator, 14 periods"},
    "trix_14":        {"label": "TRIX 14",          "category": "Trend Strength", "desc": "Triple-smoothed EMA ROC (%), 14 periods"},
    "mass_index":     {"label": "Mass Index",       "category": "Trend Strength", "desc": "Mass Index — range expansion detector (25 periods)"},
    "psar":           {"label": "PSAR",             "category": "Trend Strength", "desc": "Parabolic SAR value"},
    "psar_bull":      {"label": "PSAR Bull",        "category": "Trend Strength", "desc": "Parabolic SAR direction: 1 = price above SAR, 0 = below"},

    # ── Price Action (18) ───────────────────────────────────────────────────
    "typical_price":  {"label": "Typical Price",   "category": "Price Action", "desc": "(High + Low + Close) / 3"},
    "median_price":   {"label": "Median Price",    "category": "Price Action", "desc": "(High + Low) / 2"},
    "weighted_close": {"label": "Weighted Close",  "category": "Price Action", "desc": "(High + Low + 2×Close) / 4"},
    "ret_1":          {"label": "Return 1",        "category": "Price Action", "desc": "1-period percentage return"},
    "ret_5":          {"label": "Return 5",        "category": "Price Action", "desc": "5-period percentage return"},
    "ret_10":         {"label": "Return 10",       "category": "Price Action", "desc": "10-period percentage return"},
    "ret_20":         {"label": "Return 20",       "category": "Price Action", "desc": "20-period percentage return"},
    "log_ret_1":      {"label": "Log Return 1",    "category": "Price Action", "desc": "1-period natural log return"},
    "hl_range":       {"label": "HL Range",        "category": "Price Action", "desc": "High − Low (absolute bar range)"},
    "hl_pct":         {"label": "HL %",            "category": "Price Action", "desc": "(High − Low) / Close × 100"},
    "close_loc":      {"label": "Close Location",  "category": "Price Action", "desc": "Where close sits in HL range: (C−L)/(H−L)"},
    "gap":            {"label": "Gap",             "category": "Price Action", "desc": "Open vs previous close: (Open−PrevClose)/PrevClose × 100"},
    "zscore_20":      {"label": "Z-Score 20",      "category": "Price Action", "desc": "Close Z-score over 20-period rolling window"},
    "pct_rank_50":    {"label": "Pct Rank 50",     "category": "Price Action", "desc": "Percentile rank of close over last 50 bars"},
    "eff_ratio_10":   {"label": "Efficiency Ratio","category": "Price Action", "desc": "Kaufman Efficiency Ratio over 10 periods (0–1)"},
    "candle_body":    {"label": "Candle Body",     "category": "Price Action", "desc": "Absolute body size: |Close − Open|"},
    "upper_wick":     {"label": "Upper Wick",      "category": "Price Action", "desc": "Upper wick: High − max(Open, Close)"},
    "lower_wick":     {"label": "Lower Wick",      "category": "Price Action", "desc": "Lower wick: min(Open, Close) − Low"},
}

INDICATOR_KEYS: list[str] = list(INDICATOR_META.keys())

# ---------------------------------------------------------------------------
# Low-level helpers
# ---------------------------------------------------------------------------

def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()

def _wma(s: pd.Series, n: int) -> pd.Series:
    w = np.arange(1, n + 1, dtype=float)
    return s.rolling(n).apply(lambda x: (x * w).sum() / w.sum(), raw=True)

def _atr_series(high: pd.Series, low: pd.Series, close: pd.Series, n: int) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat([high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
    return tr.ewm(span=n, adjust=False).mean()

def _rsi(close: pd.Series, n: int) -> pd.Series:
    delta = close.diff()
    gain  = delta.clip(lower=0).ewm(span=n, adjust=False).mean()
    loss  = (-delta.clip(upper=0)).ewm(span=n, adjust=False).mean()
    rs    = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))

def _wilder_smooth(s: pd.Series, n: int) -> pd.Series:
    """Wilder smoothing (same as EMA with alpha=1/n)."""
    return s.ewm(alpha=1.0 / n, adjust=False).mean()

# ---------------------------------------------------------------------------
# Master compute function
# ---------------------------------------------------------------------------

def compute(df: pd.DataFrame, keys: list[str]) -> dict[str, pd.Series]:
    """
    Compute requested indicators from a OHLCV DataFrame.
    df must have columns: open, high, low, close, volume (all numeric, sorted oldest-first).
    Returns {key: pd.Series aligned to df.index} — NaN where insufficient data.
    """
    o, h, l, c, v = df["open"], df["high"], df["low"], df["close"], df["volume"]
    results: dict[str, pd.Series] = {}

    # ── Trend ──────────────────────────────────────────────────────────────

    if "sma_5"   in keys: results["sma_5"]   = c.rolling(5).mean()
    if "sma_10"  in keys: results["sma_10"]  = c.rolling(10).mean()
    if "sma_20"  in keys: results["sma_20"]  = c.rolling(20).mean()
    if "sma_50"  in keys: results["sma_50"]  = c.rolling(50).mean()
    if "sma_200" in keys: results["sma_200"] = c.rolling(200).mean()

    if "ema_5"   in keys: results["ema_5"]   = _ema(c, 5)
    if "ema_10"  in keys: results["ema_10"]  = _ema(c, 10)
    if "ema_20"  in keys: results["ema_20"]  = _ema(c, 20)
    if "ema_50"  in keys: results["ema_50"]  = _ema(c, 50)
    if "ema_200" in keys: results["ema_200"] = _ema(c, 200)

    if "dema_20" in keys:
        e1 = _ema(c, 20); results["dema_20"] = 2 * e1 - _ema(e1, 20)

    if "tema_20" in keys:
        e1 = _ema(c, 20); e2 = _ema(e1, 20); e3 = _ema(e2, 20)
        results["tema_20"] = 3 * e1 - 3 * e2 + e3

    if "wma_20"  in keys: results["wma_20"]  = _wma(c, 20)

    if "hma_20"  in keys:
        n = 20
        results["hma_20"] = _wma(2 * _wma(c, n // 2) - _wma(c, n), int(np.sqrt(n)))

    if "vwma_20" in keys:
        results["vwma_20"] = (c * v).rolling(20).sum() / v.rolling(20).sum()

    if "kama_10" in keys:
        n, fast, slow = 10, 2, 30
        fast_sc = 2.0 / (fast + 1)
        slow_sc = 2.0 / (slow + 1)
        kama = c.copy().astype(float)
        for i in range(n, len(c)):
            direction = abs(c.iloc[i] - c.iloc[i - n])
            volatility = sum(abs(c.iloc[j] - c.iloc[j - 1]) for j in range(i - n + 1, i + 1))
            er = direction / volatility if volatility != 0 else 0
            sc = (er * (fast_sc - slow_sc) + slow_sc) ** 2
            kama.iloc[i] = kama.iloc[i - 1] + sc * (c.iloc[i] - kama.iloc[i - 1])
        kama.iloc[:n] = np.nan
        results["kama_10"] = kama

    if "ichimoku_conv" in keys:
        results["ichimoku_conv"] = (h.rolling(9).max() + l.rolling(9).min()) / 2

    if "ichimoku_base" in keys:
        results["ichimoku_base"] = (h.rolling(26).max() + l.rolling(26).min()) / 2

    if "linreg_slope_20" in keys:
        def _slope(arr):
            x = np.arange(len(arr), dtype=float)
            if np.isnan(arr).any():
                return np.nan
            slope = np.polyfit(x, arr, 1)[0]
            return slope
        results["linreg_slope_20"] = c.rolling(20).apply(_slope, raw=True)

    if "supertrend_dir" in keys:
        atr = _atr_series(h, l, c, 7)
        hl2 = (h + l) / 2
        upper = hl2 + 3 * atr
        lower = hl2 - 3 * atr
        direction = pd.Series(1.0, index=c.index)
        final_upper = upper.copy()
        final_lower = lower.copy()
        for i in range(1, len(c)):
            fu_prev = final_upper.iloc[i - 1]
            fl_prev = final_lower.iloc[i - 1]
            final_upper.iloc[i] = min(upper.iloc[i], fu_prev) if c.iloc[i - 1] <= fu_prev else upper.iloc[i]
            final_lower.iloc[i] = max(lower.iloc[i], fl_prev) if c.iloc[i - 1] >= fl_prev else lower.iloc[i]
            if direction.iloc[i - 1] == 1:
                direction.iloc[i] = -1 if c.iloc[i] < final_lower.iloc[i] else 1
            else:
                direction.iloc[i] =  1 if c.iloc[i] > final_upper.iloc[i] else -1
        results["supertrend_dir"] = direction

    # ── Momentum ────────────────────────────────────────────────────────────

    if "rsi_14" in keys: results["rsi_14"] = _rsi(c, 14)
    if "rsi_7"  in keys: results["rsi_7"]  = _rsi(c, 7)

    if any(k in keys for k in ("macd", "macd_signal", "macd_hist")):
        macd_line = _ema(c, 12) - _ema(c, 26)
        signal    = _ema(macd_line, 9)
        if "macd"        in keys: results["macd"]        = macd_line
        if "macd_signal" in keys: results["macd_signal"] = signal
        if "macd_hist"   in keys: results["macd_hist"]   = macd_line - signal

    if any(k in keys for k in ("stoch_k", "stoch_d")):
        low14  = l.rolling(14).min()
        high14 = h.rolling(14).max()
        k14 = 100 * (c - low14) / (high14 - low14).replace(0, np.nan)
        if "stoch_k" in keys: results["stoch_k"] = k14.rolling(3).mean()
        if "stoch_d" in keys: results["stoch_d"] = k14.rolling(3).mean().rolling(3).mean()

    if any(k in keys for k in ("stochrsi_k", "stochrsi_d")):
        rsi14     = _rsi(c, 14)
        rsi_min   = rsi14.rolling(14).min()
        rsi_max   = rsi14.rolling(14).max()
        srsi      = (rsi14 - rsi_min) / (rsi_max - rsi_min).replace(0, np.nan)
        if "stochrsi_k" in keys: results["stochrsi_k"] = srsi.rolling(3).mean() * 100
        if "stochrsi_d" in keys: results["stochrsi_d"] = srsi.rolling(3).mean().rolling(3).mean() * 100

    if "mom_10"  in keys: results["mom_10"]  = c - c.shift(10)
    if "roc_10"  in keys: results["roc_10"]  = c.pct_change(10) * 100

    if "cci_20"  in keys:
        tp   = (h + l + c) / 3
        sma  = tp.rolling(20).mean()
        mad  = tp.rolling(20).apply(lambda x: np.mean(np.abs(x - x.mean())), raw=True)
        results["cci_20"] = (tp - sma) / (0.015 * mad.replace(0, np.nan))

    if "willr_14" in keys:
        h14 = h.rolling(14).max()
        l14 = l.rolling(14).min()
        results["willr_14"] = -100 * (h14 - c) / (h14 - l14).replace(0, np.nan)

    if "mfi_14" in keys:
        tp   = (h + l + c) / 3
        rmf  = tp * v
        pos  = rmf.where(tp > tp.shift(1), 0)
        neg  = rmf.where(tp < tp.shift(1), 0)
        mfr  = pos.rolling(14).sum() / neg.rolling(14).sum().replace(0, np.nan)
        results["mfi_14"] = 100 - (100 / (1 + mfr))

    if "cmf_20" in keys:
        mfm  = ((c - l) - (h - c)) / (h - l).replace(0, np.nan)
        mfv  = mfm * v
        results["cmf_20"] = mfv.rolling(20).sum() / v.rolling(20).sum().replace(0, np.nan)

    if any(k in keys for k in ("aroon_up", "aroon_down", "aroon_osc")):
        n = 25
        aroon_u = h.rolling(n + 1).apply(lambda x: ((n - (n - np.argmax(x))) / n) * 100, raw=True)
        aroon_d = l.rolling(n + 1).apply(lambda x: ((n - (n - np.argmin(x))) / n) * 100, raw=True)
        if "aroon_up"   in keys: results["aroon_up"]   = aroon_u
        if "aroon_down" in keys: results["aroon_down"] = aroon_d
        if "aroon_osc"  in keys: results["aroon_osc"]  = aroon_u - aroon_d

    if "dpo_20" in keys:
        shift = 20 // 2 + 1
        results["dpo_20"] = c - c.rolling(20).mean().shift(shift)

    if "tsi" in keys:
        m    = c.diff()
        dm1  = _ema(_ema(m, 25), 13)
        dm2  = _ema(_ema(m.abs(), 25), 13)
        results["tsi"] = 100 * dm1 / dm2.replace(0, np.nan)

    # ── Volatility ──────────────────────────────────────────────────────────

    if "atr_14" in keys: results["atr_14"] = _atr_series(h, l, c, 14)
    if "atr_7"  in keys: results["atr_7"]  = _atr_series(h, l, c, 7)
    if "natr_14" in keys:
        atr14 = _atr_series(h, l, c, 14)
        results["natr_14"] = atr14 / c.replace(0, np.nan) * 100

    if any(k in keys for k in ("bb_upper", "bb_lower", "bb_mid", "bb_width", "bb_pctb")):
        mid   = c.rolling(20).mean()
        std   = c.rolling(20).std()
        upper = mid + 2 * std
        lower = mid - 2 * std
        if "bb_upper" in keys: results["bb_upper"] = upper
        if "bb_lower" in keys: results["bb_lower"] = lower
        if "bb_mid"   in keys: results["bb_mid"]   = mid
        if "bb_width" in keys: results["bb_width"] = (upper - lower) / mid.replace(0, np.nan)
        if "bb_pctb"  in keys: results["bb_pctb"]  = (c - lower) / (upper - lower).replace(0, np.nan)

    if any(k in keys for k in ("kc_upper", "kc_lower", "kc_mid")):
        kc_mid = _ema(c, 20)
        atr10  = _atr_series(h, l, c, 10)
        if "kc_mid"   in keys: results["kc_mid"]   = kc_mid
        if "kc_upper" in keys: results["kc_upper"] = kc_mid + 2 * atr10
        if "kc_lower" in keys: results["kc_lower"] = kc_mid - 2 * atr10

    if any(k in keys for k in ("dc_upper", "dc_lower", "dc_mid")):
        dcu = h.rolling(20).max()
        dcl = l.rolling(20).min()
        if "dc_upper" in keys: results["dc_upper"] = dcu
        if "dc_lower" in keys: results["dc_lower"] = dcl
        if "dc_mid"   in keys: results["dc_mid"]   = (dcu + dcl) / 2

    if "stddev_20"   in keys: results["stddev_20"]   = c.rolling(20).std()
    if "hist_vol_20" in keys:
        lr = np.log(c / c.shift(1))
        results["hist_vol_20"] = lr.rolling(20).std() * np.sqrt(252) * 100

    if "ulcer_14" in keys:
        def _ulcer(arr):
            peak = np.maximum.accumulate(arr)
            dd   = (arr - peak) / peak * 100
            return np.sqrt(np.mean(dd ** 2))
        results["ulcer_14"] = c.rolling(14).apply(_ulcer, raw=True)

    if "choppiness_14" in keys:
        atr1 = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
        def _chop(n):
            atr_sum = atr1.rolling(n).sum()
            hh      = h.rolling(n).max()
            ll      = l.rolling(n).min()
            return 100 * np.log10(atr_sum / (hh - ll).replace(0, np.nan)) / np.log10(n)
        results["choppiness_14"] = _chop(14)

    # ── Volume ───────────────────────────────────────────────────────────────

    if "obv" in keys or "obv_ema_20" in keys:
        sign   = np.sign(c.diff()).fillna(0)
        obv_s  = (sign * v).cumsum()
        if "obv"       in keys: results["obv"]       = obv_s
        if "obv_ema_20" in keys: results["obv_ema_20"] = _ema(obv_s, 20)

    if "vwap" in keys:
        tp = (h + l + c) / 3
        results["vwap"] = (tp * v).cumsum() / v.cumsum().replace(0, np.nan)

    if "ad" in keys or "adosc" in keys:
        clv = ((c - l) - (h - c)) / (h - l).replace(0, np.nan)
        ad_s = (clv * v).cumsum()
        if "ad"    in keys: results["ad"]    = ad_s
        if "adosc" in keys: results["adosc"] = _ema(ad_s, 3) - _ema(ad_s, 10)

    if "emv_14" in keys:
        mid_move = (h + l) / 2 - (h.shift() + l.shift()) / 2
        box_ratio = v / 1e6 / (h - l).replace(0, np.nan)
        emv_raw = mid_move / box_ratio.replace(0, np.nan)
        results["emv_14"] = emv_raw.rolling(14).mean()

    if "vpt" in keys:
        ret = c.pct_change().fillna(0)
        results["vpt"] = (v * ret).cumsum()

    if "nvi" in keys or "pvi" in keys:
        ret = c.pct_change().fillna(0)
        nvi_s = pd.Series(1000.0, index=c.index)
        pvi_s = pd.Series(1000.0, index=c.index)
        for i in range(1, len(c)):
            if v.iloc[i] < v.iloc[i - 1]:
                nvi_s.iloc[i] = nvi_s.iloc[i - 1] * (1 + ret.iloc[i])
            else:
                nvi_s.iloc[i] = nvi_s.iloc[i - 1]
            if v.iloc[i] > v.iloc[i - 1]:
                pvi_s.iloc[i] = pvi_s.iloc[i - 1] * (1 + ret.iloc[i])
            else:
                pvi_s.iloc[i] = pvi_s.iloc[i - 1]
        if "nvi" in keys: results["nvi"] = nvi_s
        if "pvi" in keys: results["pvi"] = pvi_s

    if "vol_sma_20"   in keys: results["vol_sma_20"]   = v.rolling(20).mean()
    if "vol_ema_20"   in keys: results["vol_ema_20"]   = _ema(v.astype(float), 20)
    if "vol_ratio_20" in keys:
        vol_ma = v.rolling(20).mean().replace(0, np.nan)
        results["vol_ratio_20"] = v / vol_ma

    if "force_idx_13" in keys:
        fi = (c - c.shift(1)) * v
        results["force_idx_13"] = _ema(fi, 13)

    if "klinger_osc" in keys:
        tp    = (h + l + c) / 3
        trend = np.sign(tp - tp.shift(1))
        dm    = h - l
        cm    = dm.copy().astype(float)
        for i in range(1, len(dm)):
            cm.iloc[i] = cm.iloc[i - 1] + dm.iloc[i] if trend.iloc[i] == trend.iloc[i - 1] else dm.iloc[i]
        sv = trend * v * (2 * dm / cm.replace(0, np.nan) - 1).abs()
        results["klinger_osc"] = _ema(sv, 34) - _ema(sv, 55)

    # ── Trend Strength ───────────────────────────────────────────────────────

    if any(k in keys for k in ("adx_14", "di_plus_14", "di_minus_14", "dx_14")):
        n  = 14
        up = h - h.shift(1)
        dn = l.shift(1) - l
        pdm = up.where((up > dn) & (up > 0), 0.0)
        ndm = dn.where((dn > up) & (dn > 0), 0.0)
        atr = _atr_series(h, l, c, n)
        pdi = 100 * _wilder_smooth(pdm, n) / atr.replace(0, np.nan)
        ndi = 100 * _wilder_smooth(ndm, n) / atr.replace(0, np.nan)
        dx  = 100 * (pdi - ndi).abs() / (pdi + ndi).replace(0, np.nan)
        if "di_plus_14"  in keys: results["di_plus_14"]  = pdi
        if "di_minus_14" in keys: results["di_minus_14"] = ndi
        if "dx_14"       in keys: results["dx_14"]       = dx
        if "adx_14"      in keys: results["adx_14"]      = _wilder_smooth(dx, n)

    if any(k in keys for k in ("vortex_pos", "vortex_neg")):
        vm_plus  = (h - l.shift(1)).abs()
        vm_minus = (l - h.shift(1)).abs()
        tr       = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
        vp = vm_plus.rolling(14).sum()  / tr.rolling(14).sum().replace(0, np.nan)
        vn = vm_minus.rolling(14).sum() / tr.rolling(14).sum().replace(0, np.nan)
        if "vortex_pos" in keys: results["vortex_pos"] = vp
        if "vortex_neg" in keys: results["vortex_neg"] = vn

    if "trix_14" in keys:
        e1 = _ema(c, 14); e2 = _ema(e1, 14); e3 = _ema(e2, 14)
        results["trix_14"] = e3.pct_change() * 100

    if "mass_index" in keys:
        hl    = h - l
        ema9  = _ema(hl, 9)
        ratio = ema9 / _ema(ema9, 9).replace(0, np.nan)
        results["mass_index"] = ratio.rolling(25).sum()

    if "psar" in keys or "psar_bull" in keys:
        af_start, af_step, af_max = 0.02, 0.02, 0.20
        psar_val  = h.copy().astype(float)
        bull      = pd.Series(True, index=c.index)
        ep        = pd.Series(np.nan, index=c.index)
        af        = pd.Series(af_start, index=c.index)
        psar_val.iloc[0] = l.iloc[0]
        ep.iloc[0]       = h.iloc[0]
        for i in range(1, len(c)):
            is_bull = bull.iloc[i - 1]
            prev_ep = ep.iloc[i - 1]
            prev_af = af.iloc[i - 1]
            prev_sar = psar_val.iloc[i - 1]
            new_sar = prev_sar + prev_af * (prev_ep - prev_sar)
            if is_bull:
                new_sar = min(new_sar, l.iloc[i - 1], l.iloc[max(0, i - 2)])
                if l.iloc[i] < new_sar:
                    is_bull = False
                    new_sar = prev_ep
                    new_ep  = l.iloc[i]
                    new_af  = af_start
                else:
                    new_ep = max(prev_ep, h.iloc[i])
                    new_af = min(af_max, prev_af + af_step) if h.iloc[i] > prev_ep else prev_af
            else:
                new_sar = max(new_sar, h.iloc[i - 1], h.iloc[max(0, i - 2)])
                if h.iloc[i] > new_sar:
                    is_bull = True
                    new_sar = prev_ep
                    new_ep  = h.iloc[i]
                    new_af  = af_start
                else:
                    new_ep = min(prev_ep, l.iloc[i])
                    new_af = min(af_max, prev_af + af_step) if l.iloc[i] < prev_ep else prev_af
            psar_val.iloc[i] = new_sar
            bull.iloc[i]     = is_bull
            ep.iloc[i]       = new_ep
            af.iloc[i]       = new_af
        if "psar"      in keys: results["psar"]      = psar_val
        if "psar_bull" in keys: results["psar_bull"] = bull.astype(float)

    # ── Price Action ────────────────────────────────────────────────────────

    if "typical_price"  in keys: results["typical_price"]  = (h + l + c) / 3
    if "median_price"   in keys: results["median_price"]   = (h + l) / 2
    if "weighted_close" in keys: results["weighted_close"] = (h + l + 2 * c) / 4

    if "ret_1"     in keys: results["ret_1"]     = c.pct_change(1)  * 100
    if "ret_5"     in keys: results["ret_5"]     = c.pct_change(5)  * 100
    if "ret_10"    in keys: results["ret_10"]    = c.pct_change(10) * 100
    if "ret_20"    in keys: results["ret_20"]    = c.pct_change(20) * 100
    if "log_ret_1" in keys: results["log_ret_1"] = np.log(c / c.shift(1))

    if "hl_range"  in keys: results["hl_range"]  = h - l
    if "hl_pct"    in keys: results["hl_pct"]    = (h - l) / c.replace(0, np.nan) * 100
    if "close_loc" in keys:
        hl = (h - l).replace(0, np.nan)
        results["close_loc"] = (c - l) / hl

    if "gap" in keys:
        results["gap"] = (o - c.shift(1)) / c.shift(1).replace(0, np.nan) * 100

    if "zscore_20" in keys:
        roll_mean = c.rolling(20).mean()
        roll_std  = c.rolling(20).std().replace(0, np.nan)
        results["zscore_20"] = (c - roll_mean) / roll_std

    if "pct_rank_50" in keys:
        results["pct_rank_50"] = c.rolling(50).apply(
            lambda x: float(pd.Series(x).rank(pct=True).iloc[-1]) * 100, raw=False
        )

    if "eff_ratio_10" in keys:
        direction = (c - c.shift(10)).abs()
        noise     = c.diff().abs().rolling(10).sum().replace(0, np.nan)
        results["eff_ratio_10"] = direction / noise

    if "candle_body"  in keys: results["candle_body"]  = (c - o).abs()
    if "upper_wick"   in keys: results["upper_wick"]   = h - pd.concat([o, c], axis=1).max(axis=1)
    if "lower_wick"   in keys: results["lower_wick"]   = pd.concat([o, c], axis=1).min(axis=1) - l

    return results
