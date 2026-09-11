import pandas as pd


class MSBOBMTFEngine:
    """Non-lookahead port of the MSB/OB + MTF EMA indicator."""

    def __init__(self, candles, zigzag_len=9, fib_factor=0.33, fast_len=50, slow_len=200):
        self.df = pd.DataFrame(candles).sort_values("time").reset_index(drop=True)
        self.zigzag_len = zigzag_len
        self.fib_factor = fib_factor
        self.fast_len = fast_len
        self.slow_len = slow_len

    @staticmethod
    def trend_for(candles, fast_len=50, slow_len=200):
        if len(candles) < slow_len:
            return 0
        close = pd.Series([c["close"] for c in candles], dtype=float)
        fast = close.ewm(span=fast_len, adjust=False).mean().iloc[-1]
        slow = close.ewm(span=slow_len, adjust=False).mean().iloc[-1]
        return 1 if fast > slow else -1 if fast < slow else 0

    def _last_opposing_candle(self, start, end, bullish):
        start, end = max(0, start), min(len(self.df) - 1, end)
        result = None
        for i in range(start, end + 1):
            row = self.df.iloc[i]
            if (bullish and row.close < row.open) or (not bullish and row.close > row.open):
                result = i
        return result

    def run(self, timeframe_trends, min_aligned=4, filter_by_mtf=False):
        if self.df.empty:
            return {"emas": {"fast": [], "slow": []}, "swings": [], "events": [], "zones": [], "dashboard": {}}

        close = self.df["close"].astype(float)
        fast = close.ewm(span=self.fast_len, adjust=False).mean()
        slow = close.ewm(span=self.slow_len, adjust=False).mean()
        emas = {
            "fast": [{"time": int(self.df.at[i, "time"]), "value": float(fast.iat[i])} for i in range(len(self.df))],
            "slow": [{"time": int(self.df.at[i, "time"]), "value": float(slow.iat[i])} for i in range(len(self.df))],
        }

        bull_count = sum(value == 1 for value in timeframe_trends.values())
        bear_count = sum(value == -1 for value in timeframe_trends.values())
        bias = "bullish" if bull_count >= min_aligned else "bearish" if bear_count >= min_aligned else "neutral"

        highs, lows, swings = [], [], []
        length = self.zigzag_len
        for i in range(length, len(self.df) - length):
            window = self.df.iloc[i - length:i + length + 1]
            high = float(self.df.at[i, "high"])
            low = float(self.df.at[i, "low"])
            if high >= float(window["high"].max()):
                highs.append((i, high))
                swings.append({"time": int(self.df.at[i, "time"]), "price": high, "type": "high"})
            if low <= float(window["low"].min()):
                lows.append((i, low))
                swings.append({"time": int(self.df.at[i, "time"]), "price": low, "type": "low"})

        pivots = sorted([(i, p, "high") for i, p in highs] + [(i, p, "low") for i, p in lows])
        alternating = []
        for pivot in pivots:
            if not alternating or alternating[-1][2] != pivot[2]:
                alternating.append(pivot)
            elif (pivot[2] == "high" and pivot[1] >= alternating[-1][1]) or (pivot[2] == "low" and pivot[1] <= alternating[-1][1]):
                alternating[-1] = pivot

        events, zones, market = [], [], 0
        last_highs, last_lows = [], []
        for index, price, kind in alternating:
            (last_highs if kind == "high" else last_lows).append((index, price))
            if len(last_highs) < 2 or len(last_lows) < 2:
                continue
            h0, h1 = last_highs[-1], last_highs[-2]
            l0, l1 = last_lows[-1], last_lows[-2]
            direction = None
            if kind == "high" and h0[1] > h1[1] + abs(h1[1] - l0[1]) * self.fib_factor and market != 1:
                direction, market = "bullish", 1
            elif kind == "low" and l0[1] < l1[1] - abs(h0[1] - l1[1]) * self.fib_factor and market != -1:
                direction, market = "bearish", -1
            if not direction or (filter_by_mtf and direction != bias):
                continue

            bullish = direction == "bullish"
            origin_start = h1[0] if bullish else l1[0]
            origin_end = l0[0] if bullish else h0[0]
            origin = self._last_opposing_candle(origin_start, origin_end, bullish)
            if origin is None:
                continue
            row = self.df.iloc[origin]
            event_time = int(self.df.at[index, "time"])
            events.append({"time": event_time, "price": float(h1[1] if bullish else l1[1]), "direction": direction, "label": "MSB"})
            zones.append({
                "id": f"{direction}_ob_{event_time}", "type": "OB", "direction": direction,
                "time": int(row.time), "created_at": event_time,
                "top": float(row.high), "bottom": float(row.low), "active": True,
            })
            breaker_start = (l1[0] - length) if bullish else (h1[0] - length)
            breaker_end = h1[0] if bullish else l1[0]
            breaker = self._last_opposing_candle(breaker_start, breaker_end, not bullish)
            if breaker is not None:
                breaker_row = self.df.iloc[breaker]
                breaker_type = "BB" if (l0[1] < l1[1] if bullish else h0[1] > h1[1]) else "MB"
                zones.append({
                    "id": f"{direction}_{breaker_type.lower()}_{event_time}", "type": breaker_type,
                    "direction": direction, "time": int(breaker_row.time), "created_at": event_time,
                    "top": float(breaker_row.high), "bottom": float(breaker_row.low), "active": True,
                })

        last_close = float(self.df.iloc[-1].close)
        for zone in zones:
            zone["active"] = last_close >= zone["bottom"] if zone["direction"] == "bullish" else last_close <= zone["top"]

        labels = {1: "Bullish", -1: "Bearish", 0: "Neutral"}
        dashboard = {
            "timeframes": [{"timeframe": tf, "trend": trend, "label": labels[trend]} for tf, trend in timeframe_trends.items()],
            "bull_count": bull_count, "bear_count": bear_count, "bias": bias,
        }
        return {"emas": emas, "swings": swings[-100:], "events": events[-50:], "zones": zones[-50:], "dashboard": dashboard}
