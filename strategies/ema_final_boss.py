from strategies.base import BaseStrategy

class EMAFinalBossStrategy(BaseStrategy):
    def __init__(self, ema_len=7, htf_multiplier=4, adx_len=14, adx_threshold=25.0, rr=3.0, lots=0.1):
        super().__init__()
        self.ema_len = ema_len
        self.htf_ema_len = ema_len * htf_multiplier
        self.adx_len = adx_len
        self.adx_threshold = adx_threshold
        self.rr = rr
        self.lots = lots
        self.is_lot_mode = True
        
        self.ema_ltf = None
        self.ema_htf = None
        
        self.prev_close = None
        self.prev_high = None
        self.prev_low = None
        
        self.smoothed_tr = None
        self.smoothed_plus_dm = None
        self.smoothed_minus_dm = None
        self.adx = None
        
        self.lows = []
        self.highs = []

    def calculate_ema(self, prev_ema, current_value, period):
        k = 2 / (period + 1)
        if prev_ema is None:
            return current_value
        return (current_value * k) + (prev_ema * (1 - k))
        
    def calculate_rma(self, prev_rma, current_value, period):
        alpha = 1 / period
        if prev_rma is None:
            return current_value
        return (current_value * alpha) + (prev_rma * (1 - alpha))

    def on_candle(self, candle):
        close_price = candle['close']
        high_price = candle['high']
        low_price = candle['low']
        
        self.lows.append(low_price)
        self.highs.append(high_price)
        
        if len(self.lows) > 5:
            self.lows.pop(0)
            self.highs.pop(0)
            
        # EMA Calculations
        self.ema_ltf = self.calculate_ema(self.ema_ltf, close_price, self.ema_len)
        self.ema_htf = self.calculate_ema(self.ema_htf, close_price, self.htf_ema_len)
        
        # ADX Calculation
        if self.prev_close is not None:
            tr1 = high_price - low_price
            tr2 = abs(high_price - self.prev_close)
            tr3 = abs(low_price - self.prev_close)
            tr = max(tr1, tr2, tr3)
            
            up = high_price - self.prev_high
            down = self.prev_low - low_price
            
            plus_dm = up if (up > down and up > 0) else 0.0
            minus_dm = down if (down > up and down > 0) else 0.0
            
            self.smoothed_tr = self.calculate_rma(self.smoothed_tr, tr, self.adx_len)
            self.smoothed_plus_dm = self.calculate_rma(self.smoothed_plus_dm, plus_dm, self.adx_len)
            self.smoothed_minus_dm = self.calculate_rma(self.smoothed_minus_dm, minus_dm, self.adx_len)
            
            if self.smoothed_tr == 0:
                plus_di = 0.0
                minus_di = 0.0
            else:
                plus_di = 100 * self.smoothed_plus_dm / self.smoothed_tr
                minus_di = 100 * self.smoothed_minus_dm / self.smoothed_tr
                
            di_sum = plus_di + minus_di
            if di_sum == 0:
                di_sum = 1.0
            dx = abs(plus_di - minus_di) / di_sum * 100
            self.adx = self.calculate_rma(self.adx, dx, self.adx_len)
            
        self.prev_close = close_price
        self.prev_high = high_price
        self.prev_low = low_price
        
        if self.adx is None or len(self.lows) < 5:
            return
            
        # Strategy Logic
        if self.engine and len(self.engine.positions) > 0:
            return # Wait for SL/TP to hit
            
        if self.adx > self.adx_threshold:
            # LONG
            if close_price > self.ema_htf and low_price <= self.ema_ltf and close_price > self.ema_ltf:
                sl = min(self.lows)
                if sl < close_price:
                    risk = close_price - sl
                    tp = close_price + (risk * self.rr)
                    self.buy(self.lots, sl=sl, tp=tp)
                    
            # SHORT
            elif close_price < self.ema_htf and high_price >= self.ema_ltf and close_price < self.ema_ltf:
                sl = max(self.highs)
                if sl > close_price:
                    risk = sl - close_price
                    tp = close_price - (risk * self.rr)
                    self.sell(self.lots, sl=sl, tp=tp)
