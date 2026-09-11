import pandas as pd
import numpy as np
from strategies.base import BaseStrategy

class TBM7EMAStrategy(BaseStrategy):
    """
    Trade Like Berlin (TBM) - 7 EMA + 30 EMA Strategy
    
    Rules:
    1. 1-Hour (1H) HTF Trend Filter:
       - 1H 7 EMA > 1H 30 EMA and 1H Close > 1H 7 EMA -> Strong Bullish Regime (Only LONG)
       - 1H 7 EMA < 1H 30 EMA and 1H Close < 1H 7 EMA -> Strong Bearish Regime (Only SHORT)
    2. 15-Minute (15M) Execution Trigger:
       - LONG: Bullish Regime + 15M candle low touches 7 EMA + 15M candle closes > 7 EMA
       - SHORT: Bearish Regime + 15M candle high touches 7 EMA + 15M candle closes < 7 EMA
    3. Target Risk-Reward: 1:3 or 1:4.
    """
    def __init__(self, ema_fast=7, ema_slow=30, rr_ratio=3.0, lots=0.1, max_sl_pips=40, min_sl_pips=15):
        super().__init__()
        self.ema_fast = ema_fast
        self.ema_slow = ema_slow
        self.rr_ratio = rr_ratio
        self.lots = lots
        self.max_sl_pips = max_sl_pips
        self.min_sl_pips = min_sl_pips
        
        self.candles_15m = []

    def _calc_ema(self, series: pd.Series, period: int) -> pd.Series:
        return series.ewm(span=period, adjust=False).mean()

    def on_candle(self, candle):
        self.candles_15m.append(candle)
        if len(self.candles_15m) < 60:
            return

        df_15m = pd.DataFrame(self.candles_15m)
        df_15m['ema7'] = self._calc_ema(df_15m['close'], self.ema_fast)
        df_15m['ema30'] = self._calc_ema(df_15m['close'], self.ema_slow)

        # Build 1H aggregated candles for HTF Trend Filter
        df_15m['dt'] = pd.to_datetime(df_15m['time'], unit='s', utc=True)
        df_1h = df_15m.resample('1h', on='dt').agg({
            'open': 'first',
            'high': 'max',
            'low': 'min',
            'close': 'last',
            'time': 'last'
        }).dropna().reset_index()

        if len(df_1h) < 15:
            return

        df_1h['ema7'] = self._calc_ema(df_1h['close'], self.ema_fast)
        df_1h['ema30'] = self._calc_ema(df_1h['close'], self.ema_slow)

        latest_15m = df_15m.iloc[-1]
        prev_15m = df_15m.iloc[-2]
        latest_1h = df_1h.iloc[-1]

        # Dual EMA Trend Regime (7 EMA & 30 EMA)
        htf_bullish = (latest_1h['close'] > latest_1h['ema7']) and (latest_1h['ema7'] > latest_1h['ema30'])
        htf_bearish = (latest_1h['close'] < latest_1h['ema7']) and (latest_1h['ema7'] < latest_1h['ema30'])

        pip_size = self.engine.pip_size

        if len(self.engine.positions) > 0:
            return

        # 1. BULLISH SETUP
        if htf_bullish:
            touched_ema = prev_15m['low'] <= prev_15m['ema7'] or latest_15m['low'] <= latest_15m['ema7']
            closed_above = latest_15m['close'] > latest_15m['ema7']

            if touched_ema and closed_above:
                recent_low = min(df_15m['low'].iloc[-4:])
                sl_distance = max(latest_15m['close'] - recent_low, self.min_sl_pips * pip_size)
                sl_distance = min(sl_distance, self.max_sl_pips * pip_size)

                sl_price = latest_15m['close'] - sl_distance
                tp_price = latest_15m['close'] + (sl_distance * self.rr_ratio)

                self.buy(self.lots, sl=sl_price, tp=tp_price)

        # 2. BEARISH SETUP
        elif htf_bearish:
            touched_ema = prev_15m['high'] >= prev_15m['ema7'] or latest_15m['high'] >= latest_15m['ema7']
            closed_below = latest_15m['close'] < latest_15m['ema7']

            if touched_ema and closed_below:
                recent_high = max(df_15m['high'].iloc[-4:])
                sl_distance = max(recent_high - latest_15m['close'], self.min_sl_pips * pip_size)
                sl_distance = min(sl_distance, self.max_sl_pips * pip_size)

                sl_price = latest_15m['close'] + sl_distance
                tp_price = latest_15m['close'] - (sl_distance * self.rr_ratio)

                self.sell(self.lots, sl=sl_price, tp=tp_price)
