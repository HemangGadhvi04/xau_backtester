import pandas as pd
from datetime import datetime, timezone
from strategies.base import BaseStrategy

class GeometricRangeStrategy(BaseStrategy):
    """
    Geometric Range Grid Bot
    Anchors daily at 22:00 UTC (03:30 IST).
    Grid Unit = (PDH - PDL) / 4.618
    Levels at +/- 50%, 75%, 100%.
    Trades breakouts of levels with Limit entries on the breakout candle's body retracement.
    """
    def __init__(self, leverage=100, lots=1.0, sl_pips=35, tp_pips=100, strict_mode=False):
        super().__init__(leverage)
        self.lots = lots / 3.0  # Split into 3 limit orders (50, 67, 75)
        self.sl_pips = sl_pips
        self.tp_pips = tp_pips
        
        self.current_day_high = None
        self.current_day_low = None
        
        self.pdh = None
        self.pdl = None
        self.anchor_price = None
        self.grid_unit = None
        
        self.grid_levels = []
        self.broken_levels = set()
        
        self.pending_limits = []
        self.prev_candle = None

    def _update_daily_range(self, candle):
        high = candle['high']
        low = candle['low']
        
        if self.current_day_high is None or high > self.current_day_high:
            self.current_day_high = high
        if self.current_day_low is None or low < self.current_day_low:
            self.current_day_low = low

    def _anchor_session(self, candle):
        # Cancel any leftover limits from yesterday
        self.cancel_all()
        
        self.pdh = self.current_day_high
        self.pdl = self.current_day_low
        self.anchor_price = candle['open']
        
        # Reset for new day
        self.current_day_high = candle['high']
        self.current_day_low = candle['low']
        
        if self.pdh is not None and self.pdl is not None:
            range_val = self.pdh - self.pdl
            self.grid_unit = range_val / 4.618
            
            # Recalculate levels
            unit = self.grid_unit
            ap = self.anchor_price
            self.grid_levels = [
                {'price': ap + (unit * 1.00), 'id': 'UP_100'},
                {'price': ap + (unit * 0.75), 'id': 'UP_75'},
                {'price': ap + (unit * 0.50), 'id': 'UP_50'},
                {'price': ap - (unit * 0.50), 'id': 'DN_50'},
                {'price': ap - (unit * 0.75), 'id': 'DN_75'},
                {'price': ap - (unit * 1.00), 'id': 'DN_100'},
            ]
            self.broken_levels.clear()

    def calculate_geometric_lots(self, entry_price, sl_price):
        lots = self.calculate_lots(entry_price, sl_price)
        if not getattr(self, 'is_lot_mode', True):
            # Split risk across the 3 limit orders
            lots = lots / 3.0
        return max(0.01, round(lots, 2))

    def on_candle(self, candle):
        dt = datetime.fromtimestamp(candle['time'], tz=timezone.utc)
        
        # Check if we hit the anchor time (22:00 UTC)
        if dt.hour == 22 and dt.minute == 0:
            self._anchor_session(candle)
        else:
            self._update_daily_range(candle)
            
        if self.grid_unit is None or self.prev_candle is None:
            self.prev_candle = candle
            return
            
        # Check for breakouts
        curr_close = candle['close']
        prev_close = self.prev_candle['close']
        
        for level in self.grid_levels:
            lvl_price = level['price']
            lvl_id = level['id']
            
            if lvl_id in self.broken_levels:
                continue
                
            is_breakout = False
            direction = None
            
            # Bullish Breakout (Closed above level)
            if curr_close > lvl_price and prev_close <= lvl_price:
                is_breakout = True
                direction = 'BUY'
                
            # Bearish Breakout (Closed below level)
            elif curr_close < lvl_price and prev_close >= lvl_price:
                is_breakout = True
                direction = 'SELL'
                
            if is_breakout:
                self.broken_levels.add(lvl_id)
                body = abs(candle['close'] - candle['open'])
                
                # We only want to place limits if there's a valid body size
                if body < 0.2: 
                    continue
                
                if direction == 'BUY':
                    # Bullish candle. Close is top of body.
                    top = candle['close']
                    ret_50 = top - (body * 0.50)
                    ret_67 = top - (body * 0.67)
                    ret_75 = top - (body * 0.75)
                    
                    sl_dist = self.sl_pips * self.engine.pip_size
                    tp_dist = self.tp_pips * self.engine.pip_size
                    
                    self.buy_limit(self.calculate_geometric_lots(ret_50, ret_50 - sl_dist), ret_50, sl=ret_50 - sl_dist, tp=ret_50 + tp_dist)
                    self.buy_limit(self.calculate_geometric_lots(ret_67, ret_67 - sl_dist), ret_67, sl=ret_67 - sl_dist, tp=ret_67 + tp_dist)
                    self.buy_limit(self.calculate_geometric_lots(ret_75, ret_75 - sl_dist), ret_75, sl=ret_75 - sl_dist, tp=ret_75 + tp_dist)
                    
                elif direction == 'SELL':
                    # Bearish candle. Close is bottom of body.
                    bot = candle['close']
                    ret_50 = bot + (body * 0.50)
                    ret_67 = bot + (body * 0.67)
                    ret_75 = bot + (body * 0.75)
                    
                    sl_dist = self.sl_pips * self.engine.pip_size
                    tp_dist = self.tp_pips * self.engine.pip_size
                    
                    self.sell_limit(self.calculate_geometric_lots(ret_50, ret_50 + sl_dist), ret_50, sl=ret_50 + sl_dist, tp=ret_50 - tp_dist)
                    self.sell_limit(self.calculate_geometric_lots(ret_67, ret_67 + sl_dist), ret_67, sl=ret_67 + sl_dist, tp=ret_67 - tp_dist)
                    self.sell_limit(self.calculate_geometric_lots(ret_75, ret_75 + sl_dist), ret_75, sl=ret_75 + sl_dist, tp=ret_75 - tp_dist)

        self.prev_candle = candle
