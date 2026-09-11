import pandas as pd
import numpy as np
from datetime import datetime, timezone
from strategies.base import BaseStrategy

class SMCEmaStrategy(BaseStrategy):
    """
    Improved SMC + 9/15 EMA Pullback Strategy
    - Wait for Liquidity Sweep
    - Wait for Market Structure Shift (MSS)
    - Wait for 9/15 EMA crossover and alignment
    - Enter on Limit Pullback into the EMA zone
    - Target opposing liquidity with >1:2 RR
    """
    def __init__(self, leverage=100, lots=1.0, strict_mode=True, sl_pips=20, tp_pips=40):
        super().__init__(leverage)
        self.lots = lots
        self.strict_mode = strict_mode
        self.sl_pips = sl_pips
        self.tp_pips = tp_pips
        
        # State tracking
        self.candles_buffer = []
        
        # EMA State
        self.ema9 = None
        self.ema15 = None
        self.prev_ema9 = None
        self.prev_ema15 = None
        self.prev2_ema9 = None
        self.prev2_ema15 = None
        
        # SMC Context
        self.last_swing_high = None
        self.last_swing_low = None
        
        # Setup Tracking
        self.current_setup = None  # Dict to track active sweep -> MSS -> crossover
        
        # Active Order State
        self.pending_order = None

    def calculate_ema(self, prev_ema, price, period):
        if prev_ema is None:
            return price
        k = 2 / (period + 1)
        return (price * k) + (prev_ema * (1 - k))

    def update_swings(self):
        """Simple 3-candle swing detection on the buffer"""
        if len(self.candles_buffer) < 5:
            return
            
        c_left = self.candles_buffer[-4]
        c_mid = self.candles_buffer[-3]
        c_right = self.candles_buffer[-2]
        
        # Swing High
        if c_mid['high'] > c_left['high'] and c_mid['high'] > c_right['high']:
            self.last_swing_high = {
                'price': c_mid['high'],
                'time': c_mid['time'],
                'swept': False
            }
            
        # Swing Low
        if c_mid['low'] < c_left['low'] and c_mid['low'] < c_right['low']:
            self.last_swing_low = {
                'price': c_mid['low'],
                'time': c_mid['time'],
                'swept': False
            }

    def check_session(self, dt):
        """Returns True if within London or NY sessions (approx)"""
        h = dt.hour
        # London (7-11 UTC)
        if 7 <= h < 11: return True
        # NY AM (13-16 UTC)
        if 13 <= h < 16: return True
        # NY PM (18-20 UTC)
        if 18 <= h < 20: return True
        return False

    def on_candle(self, candle):
        curr = candle
        self.candles_buffer.append(curr)
        if len(self.candles_buffer) > 200:
            self.candles_buffer.pop(0)
            
        dt = datetime.fromtimestamp(curr['time'], tz=timezone.utc)
        
        # Update EMAs
        self.prev2_ema9 = self.prev_ema9
        self.prev2_ema15 = self.prev_ema15
        self.prev_ema9 = self.ema9
        self.prev_ema15 = self.ema15
        
        self.ema9 = self.calculate_ema(self.ema9, curr['close'], 9)
        self.ema15 = self.calculate_ema(self.ema15, curr['close'], 15)
        
        # Update Swings
        self.update_swings()
        
        # If we have an active position, let the engine handle SL/TP
        if len(self.engine.positions) > 0:
            self.current_setup = None
            self.pending_order = None
            return

        # Check pending limit order cancellation logic (execution is handled by engine)
        if self.pending_order:
            order = self.pending_order
            # If the engine removed it from active pending orders, it either filled or we cancelled it
            if order not in self.engine.pending_orders:
                self.pending_order = None
                self.current_setup = None
            else:
                # Cancel if we broke below origin (SL) before triggering
                if order['direction'] == 'BUY' and curr['close'] < order['sl']:
                    self.cancel_all()
                    self.pending_order = None
                elif order['direction'] == 'SELL' and curr['close'] > order['sl']:
                    self.cancel_all()
                    self.pending_order = None
            return

        # Need enough data
        if self.prev2_ema15 is None or self.last_swing_high is None or self.last_swing_low is None:
            return

        # Step 1: Detect Liquidity Sweep
        if not self.current_setup:
            if curr['low'] < self.last_swing_low['price'] and not self.last_swing_low['swept']:
                # Swept Sell-side liquidity
                self.last_swing_low['swept'] = True
                pip = self.engine.pip_size
                self.current_setup = {
                    'type': 'BULLISH',
                    'sweep_price': curr['low'],
                    'sweep_time': curr['time'],
                    'origin_sl': curr['low'] - (2 * pip), # Small wick buffer
                    'target_tp': self.last_swing_high['price'],
                    'stage': 'SWEPT'
                }
            elif curr['high'] > self.last_swing_high['price'] and not self.last_swing_high['swept']:
                # Swept Buy-side liquidity
                self.last_swing_high['swept'] = True
                pip = self.engine.pip_size
                self.current_setup = {
                    'type': 'BEARISH',
                    'sweep_price': curr['high'],
                    'sweep_time': curr['time'],
                    'origin_sl': curr['high'] + (2 * pip),
                    'target_tp': self.last_swing_low['price'],
                    'stage': 'SWEPT'
                }
            return

        setup = self.current_setup
        
        # Invalidate setup if price drops below sweep low (for bullish) or above sweep high (for bearish)
        if setup['type'] == 'BULLISH' and curr['close'] < setup['sweep_price']:
            self.current_setup = None
            return
        if setup['type'] == 'BEARISH' and curr['close'] > setup['sweep_price']:
            self.current_setup = None
            return

        # Step 2 & 3: Wait for MSS & EMA Crossover
        if setup['stage'] == 'SWEPT':
            if setup['type'] == 'BULLISH':
                # Check 9 crossed above 15
                if self.prev_ema9 <= self.prev_ema15 and self.ema9 > self.ema15:
                    # EMAs sloping up (or strict_mode is off)
                    if not self.strict_mode or (self.ema9 > self.prev_ema9 and self.ema15 > self.prev_ema15):
                        setup['stage'] = 'EMA_CROSSED'
            elif setup['type'] == 'BEARISH':
                # Check 9 crossed below 15
                if self.prev_ema9 >= self.prev_ema15 and self.ema9 < self.ema15:
                    # EMAs sloping down (or strict_mode is off)
                    if not self.strict_mode or (self.ema9 < self.prev_ema9 and self.ema15 < self.prev_ema15):
                        setup['stage'] = 'EMA_CROSSED'

        # Step 4: Setup Limit Order for Pullback
        if setup['stage'] == 'EMA_CROSSED':
            if self.strict_mode and not self.check_session(dt):
                return
                
            entry_price = self.ema9
            sl = setup['origin_sl']
            tp = setup['target_tp']
            
            # RR Filter (Must be >= 2)
            if setup['type'] == 'BULLISH':
                risk = entry_price - sl
                reward = tp - entry_price
                if risk > 0 and reward / risk >= 2.0:
                    lots = self.calculate_lots(entry_price, sl)
                    order = self.buy_limit(lots, entry_price, sl=sl, tp=tp)
                    if order:
                        self.pending_order = order
                        setup['stage'] = 'LIMIT_SET'
                else:
                    self.current_setup = None # Invalidated due to poor RR
                    
            elif setup['type'] == 'BEARISH':
                risk = sl - entry_price
                reward = entry_price - tp
                if risk > 0 and reward / risk >= 2.0:
                    lots = self.calculate_lots(entry_price, sl)
                    order = self.sell_limit(lots, entry_price, sl=sl, tp=tp)
                    if order:
                        self.pending_order = order
                        setup['stage'] = 'LIMIT_SET'
                else:
                    self.current_setup = None # Invalidated due to poor RR
