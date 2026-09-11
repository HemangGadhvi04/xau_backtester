from strategies.base import BaseStrategy

class MACDADXStrategy(BaseStrategy):
    def __init__(self, fast_length=5, slow_length=13, signal_length=9, 
                 di_length=10, adx_smoothing=14, adx_threshold=25.0, lots=0.1, sl_pips=20, tp_pips=40):
        super().__init__()
        self.fast_length = fast_length
        self.slow_length = slow_length
        self.signal_length = signal_length
        self.di_length = di_length
        self.adx_smoothing = adx_smoothing
        self.adx_threshold = adx_threshold
        self.lots = lots
        self.sl_pips = sl_pips
        self.tp_pips = tp_pips
        
        self.is_lot_mode = True
        
        self.ema_fast = None
        self.ema_slow = None
        self.macd = None
        self.prev_macd = None
        self.signal_ema = None
        self.prev_signal_ema = None
        
        self.prev_close = None
        self.prev_high = None
        self.prev_low = None
        
        self.smoothed_tr = None
        self.smoothed_plus_dm = None
        self.smoothed_minus_dm = None
        
        self.adx = None

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
        
        # 1. MACD
        self.ema_fast = self.calculate_ema(self.ema_fast, close_price, self.fast_length)
        self.ema_slow = self.calculate_ema(self.ema_slow, close_price, self.slow_length)
        
        self.prev_macd = self.macd
        self.macd = self.ema_fast - self.ema_slow
        
        self.prev_signal_ema = self.signal_ema
        self.signal_ema = self.calculate_ema(self.signal_ema, self.macd, self.signal_length)
        
        # 2. True Range & Directional Movement
        if self.prev_close is not None:
            # TR
            tr1 = high_price - low_price
            tr2 = abs(high_price - self.prev_close)
            tr3 = abs(low_price - self.prev_close)
            tr = max(tr1, tr2, tr3)
            
            # DM
            up = high_price - self.prev_high
            down = self.prev_low - low_price
            
            plus_dm = up if (up > down and up > 0) else 0.0
            minus_dm = down if (down > up and down > 0) else 0.0
            
            # Smooth TR & DM
            self.smoothed_tr = self.calculate_rma(self.smoothed_tr, tr, self.di_length)
            self.smoothed_plus_dm = self.calculate_rma(self.smoothed_plus_dm, plus_dm, self.di_length)
            self.smoothed_minus_dm = self.calculate_rma(self.smoothed_minus_dm, minus_dm, self.di_length)
            
            # +DI and -DI
            if self.smoothed_tr == 0:
                plus_di = 0.0
                minus_di = 0.0
            else:
                plus_di = 100 * self.smoothed_plus_dm / self.smoothed_tr
                minus_di = 100 * self.smoothed_minus_dm / self.smoothed_tr
                
            # DX and ADX
            di_sum = plus_di + minus_di
            if di_sum == 0:
                di_sum = 1.0
            dx = abs(plus_di - minus_di) / di_sum * 100
            self.adx = self.calculate_rma(self.adx, dx, self.adx_smoothing)
            
        self.prev_close = close_price
        self.prev_high = high_price
        self.prev_low = low_price
        
        # We need enough prices to establish the initial values
        if self.adx is None or self.prev_macd is None or self.prev_signal_ema is None:
            return
            
        # 3. Check Signals
        bullish_cross = (self.prev_macd <= self.prev_signal_ema) and (self.macd > self.signal_ema)
        bearish_cross = (self.prev_macd >= self.prev_signal_ema) and (self.macd < self.signal_ema)
        
        bullish_signal = (self.adx > self.adx_threshold) and (self.macd < 0) and bullish_cross
        bearish_signal = (self.adx > self.adx_threshold) and (self.macd > 0) and bearish_cross
        
        if bullish_signal:
            self.close_all()  # Close any short positions
            sl = close_price - (self.sl_pips * self.engine.pip_size) if self.sl_pips else None
            tp = close_price + (self.tp_pips * self.engine.pip_size) if self.tp_pips else None
            self.buy(self.lots, sl=sl, tp=tp)
            
        elif bearish_signal:
            self.close_all()  # Close any long positions
            sl = close_price + (self.sl_pips * self.engine.pip_size) if self.sl_pips else None
            tp = close_price - (self.tp_pips * self.engine.pip_size) if self.tp_pips else None
            self.sell(self.lots, sl=sl, tp=tp)
