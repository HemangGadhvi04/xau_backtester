import pandas as pd
import numpy as np
from datetime import datetime, timezone
from strategies.base import BaseStrategy

class TrendPullbackStrategy(BaseStrategy):
    """
    9/15 EMA Pullback Trend Strategy
    - Trend confirmed by structure (Fractal Swing HH/HL or LL/LH) + EMA slope
    - Pullback into 9/15 EMA zone
    - Rejection (bullish/bearish close)
    - Continuation entry via stop order at rejection candle extreme
    - SL beyond pullback extreme
    - TP at next liquidity (min 1:2 RR)
    """
    def __init__(self, leverage=100, lots=1.0, strict_mode=True, sl_pips=20, tp_pips=40):
        super().__init__(leverage)
        self.lots = lots
        self.strict_mode = strict_mode
        self.sl_pips = sl_pips
        self.tp_pips = tp_pips
        
        self.candles_buffer = []
        
        self.ema9 = None
        self.ema15 = None
        self.prev_ema9 = None
        self.prev_ema15 = None
        
        # Structure tracking
        self.swing_highs = []
        self.swing_lows = []
        self.last_hh = None
        self.last_hl = None
        self.last_lh = None
        self.last_ll = None
        
        self.trend = None # 'BULLISH' or 'BEARISH'
        
        self.state = 'IDLE' 
        self.pullback_extreme = None
        self.rejection_candle = None
        self.pending_order = None

    def calculate_ema(self, period, prev_ema, price):
        if prev_ema is None:
            if len(self.candles_buffer) >= period:
                return sum(c['close'] for c in self.candles_buffer[-period:]) / period
            return None
        k = 2 / (period + 1)
        return (price * k) + (prev_ema * (1 - k))

    def check_fractal(self):
        if len(self.candles_buffer) < 5:
            return
            
        # Center candle is at index -3
        c0, c1, c2, c3, c4 = self.candles_buffer[-5:]
        
        # Swing High
        if c2['high'] > c0['high'] and c2['high'] > c1['high'] and c2['high'] > c3['high'] and c2['high'] > c4['high']:
            if not self.swing_highs or self.swing_highs[-1]['time'] != c2['time']:
                sh = {'time': c2['time'], 'price': c2['high']}
                if self.swing_highs:
                    if sh['price'] > self.swing_highs[-1]['price']:
                        self.last_hh = sh
                    else:
                        self.last_lh = sh
                self.swing_highs.append(sh)
                
        # Swing Low
        if c2['low'] < c0['low'] and c2['low'] < c1['low'] and c2['low'] < c3['low'] and c2['low'] < c4['low']:
            if not self.swing_lows or self.swing_lows[-1]['time'] != c2['time']:
                sl = {'time': c2['time'], 'price': c2['low']}
                if self.swing_lows:
                    if sl['price'] < self.swing_lows[-1]['price']:
                        self.last_ll = sl
                    else:
                        self.last_hl = sl
                self.swing_lows.append(sl)

    def on_candle(self, candle):
        self.candles_buffer.append(candle)
        if len(self.candles_buffer) > 200:
            self.candles_buffer.pop(0)
            
        close = candle['close']
        high = candle['high']
        low = candle['low']
        
        # Update EMAs
        self.prev_ema9 = self.ema9
        self.prev_ema15 = self.ema15
        
        self.ema9 = self.calculate_ema(9, self.prev_ema9, close)
        self.ema15 = self.calculate_ema(15, self.prev_ema15, close)
        
        self.check_fractal()
        
        if self.ema9 is None or self.ema15 is None or self.prev_ema9 is None or self.prev_ema15 is None:
            return
            
        # 1. Determine Trend Health
        is_bullish = (self.ema9 > self.ema15) and (self.ema9 > self.prev_ema9) and (self.ema15 > self.prev_ema15)
        is_bearish = (self.ema9 < self.ema15) and (self.ema9 < self.prev_ema9) and (self.ema15 < self.prev_ema15)
        
        if not self.strict_mode:
            # Relaxed mode doesn't strictly require EMA slope matching
            is_bullish = self.ema9 > self.ema15
            is_bearish = self.ema9 < self.ema15

        if is_bullish and self.last_hh and self.last_hl:
            self.trend = 'BULLISH'
        elif is_bearish and self.last_ll and self.last_lh:
            self.trend = 'BEARISH'
        else:
            self.trend = None
            self.state = 'IDLE'
            self.pending_order = None
            self.cancel_all()
            return
            
        # Note: We now use true `engine.place_stop_order` instead of internal manual tracking, 
        # so we don't need the internal manual trigger check loop for `self.pending_order` here anymore!
        # The Engine handles triggering `STOP` orders at the exact price.
        
        # However, we still want to invalidate the order if it cuts too deep or breaks the wrong way
        if self.state == 'PENDING' and self.pending_order:
            if self.trend == 'BULLISH':
                if low < self.pullback_extreme or close < self.ema15:
                    self.cancel_all()
                    self.state = 'IDLE'
                    self.pending_order = None
            elif self.trend == 'BEARISH':
                if high > self.pullback_extreme or close > self.ema15:
                    self.cancel_all()
                    self.state = 'IDLE'
                    self.pending_order = None
        
        # State Machine Transitions
        if self.state == 'IDLE':
            # Check for pullback into EMA zone
            if self.trend == 'BULLISH':
                if low <= self.ema9 and low >= self.ema15 * 0.9995: 
                    self.state = 'PULLBACK'
                    self.pullback_extreme = low
            elif self.trend == 'BEARISH':
                if high >= self.ema9 and high <= self.ema15 * 1.0005:
                    self.state = 'PULLBACK'
                    self.pullback_extreme = high
                    
        elif self.state == 'PULLBACK':
            # Update pullback extreme
            if self.trend == 'BULLISH':
                if low < self.pullback_extreme:
                    self.pullback_extreme = low
                    
                # Look for bullish rejection candle inside zone
                if close > candle['open'] and close >= self.ema15 * 0.999:
                    self.state = 'REJECTED'
                    self.rejection_candle = candle
                    
                # Invalidate if cuts too deep
                if close < self.ema15 * 0.998:
                    self.state = 'IDLE'
                    
            elif self.trend == 'BEARISH':
                if high > self.pullback_extreme:
                    self.pullback_extreme = high
                    
                # Look for bearish rejection
                if close < candle['open'] and close <= self.ema15 * 1.001:
                    self.state = 'REJECTED'
                    self.rejection_candle = candle
                    
                if close > self.ema15 * 1.002:
                    self.state = 'IDLE'
                    
        elif self.state == 'REJECTED':
            pip = self.engine.pip_size
            
            # Set up pending stop order
            if self.trend == 'BULLISH':
                # Entry 1 pip above rejection candle high
                entry_price = self.rejection_candle['high'] + (1 * pip)
                # SL 2 pips below pullback extreme (or max sl_pips if it's too wide)
                sl_price = self.pullback_extreme - (2 * pip)
                
                risk = entry_price - sl_price
                if risk <= 0:
                    self.state = 'IDLE'
                    return
                    
                # Target previous high
                tp_price = self.last_hh['price']
                reward = tp_price - entry_price
                
                # If target RR < 2, force 1:2 RR
                if reward < risk * 2:
                    tp_price = entry_price + (risk * 2)
                    
                lots = self.calculate_lots(entry_price, sl_price)
                order = self.buy_stop(lots, entry_price, sl=sl_price, tp=tp_price)
                if order:
                    self.pending_order = order
                    self.state = 'PENDING'
                
            elif self.trend == 'BEARISH':
                # Entry 1 pip below rejection candle low
                entry_price = self.rejection_candle['low'] - (1 * pip)
                # SL 2 pips above pullback extreme
                sl_price = self.pullback_extreme + (2 * pip)
                
                risk = sl_price - entry_price
                if risk <= 0:
                    self.state = 'IDLE'
                    return
                    
                # Target previous low
                tp_price = self.last_ll['price']
                reward = entry_price - tp_price
                
                if reward < risk * 2:
                    tp_price = entry_price - (risk * 2)
                    
                lots = self.calculate_lots(entry_price, sl_price)
                order = self.sell_stop(lots, entry_price, sl=sl_price, tp=tp_price)
                if order:
                    self.pending_order = order
                    self.state = 'PENDING'
