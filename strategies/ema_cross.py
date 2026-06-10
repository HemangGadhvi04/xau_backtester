from strategies.base import BaseStrategy

class EMACrossoverStrategy(BaseStrategy):
    def __init__(self, fast_period=9, slow_period=15, lots=0.1, sl_pips=20, tp_pips=40):
        super().__init__()
        self.fast_period = fast_period
        self.slow_period = slow_period
        self.lots = lots
        self.sl_pips = sl_pips
        self.tp_pips = tp_pips
        
        self.prices = []
        self.ema_fast = None
        self.ema_slow = None
        
        # Track crossover states
        self.prev_ema_fast = None
        self.prev_ema_slow = None

    def calculate_ema(self, prev_ema, current_price, period):
        k = 2 / (period + 1)
        if prev_ema is None:
            return current_price
        return (current_price * k) + (prev_ema * (1 - k))

    def on_candle(self, candle):
        close_price = candle['close']
        self.prices.append(close_price)
        
        # Calculate fast & slow EMAs
        self.prev_ema_fast = self.ema_fast
        self.prev_ema_slow = self.ema_slow
        
        self.ema_fast = self.calculate_ema(self.ema_fast, close_price, self.fast_period)
        self.ema_slow = self.calculate_ema(self.ema_slow, close_price, self.slow_period)

        # We need enough prices to establish the initial EMA values
        if len(self.prices) < self.slow_period:
            return

        # Check for crossover signals
        if self.prev_ema_fast is not None and self.prev_ema_slow is not None:
            # 9 EMA crosses ABOVE 15 EMA -> BUY
            if self.prev_ema_fast <= self.prev_ema_slow and self.ema_fast > self.ema_slow:
                # Close any existing Sell positions
                self.close_all()
                # Place new Buy position
                sl = close_price - (self.sl_pips * 0.1)
                tp = close_price + (self.tp_pips * 0.1)
                self.buy(self.lots, sl=sl, tp=tp)
                
            # 9 EMA crosses BELOW 15 EMA -> SELL
            elif self.prev_ema_fast >= self.prev_ema_slow and self.ema_fast < self.ema_slow:
                # Close any existing Buy positions
                self.close_all()
                # Place new Sell position
                sl = close_price + (self.sl_pips * 0.1)
                tp = close_price - (self.tp_pips * 0.1)
                self.sell(self.lots, sl=sl, tp=tp)
