from abc import ABC, abstractmethod

class BaseStrategy(ABC):
    def __init__(self, leverage=100):
        self.leverage = leverage
        self.engine = None  # Will be set by the Backtest Engine

    def set_engine(self, engine):
        self.engine = engine

    @abstractmethod
    def on_candle(self, candle):
        """
        Executed on every new candle.
        candle is a dictionary: { 'time': timestamp, 'open': O, 'high': H, 'low': L, 'close': C }
        """
        pass

    def calculate_lots(self, entry_price, sl_price):
        """Dynamically calculates position sizing based on risk percentage or static lots."""
        is_lot_mode = getattr(self, 'is_lot_mode', True)
        if is_lot_mode:
            return getattr(self, 'lots', 0.1)
            
        risk_percent = getattr(self, 'risk_percent', 1.0)
        risk_amount = self.engine.equity * (risk_percent / 100.0)
        
        sl_dist = abs(entry_price - sl_price)
        if sl_dist <= 0:
            return 0.01
            
        calculated_lots = risk_amount / (sl_dist * self.engine.contract_size)
        return max(0.01, round(calculated_lots, 2))

    def buy(self, lots, sl=None, tp=None):
        """Issues a market Buy signal to the execution engine."""
        if self.engine:
            return self.engine.place_order("BUY", lots, sl, tp)
        return None

    def sell(self, lots, sl=None, tp=None):
        """Issues a market Sell signal to the execution engine."""
        if self.engine:
            return self.engine.place_order("SELL", lots, sl, tp)
        return None

    def buy_limit(self, lots, price, sl=None, tp=None):
        if self.engine:
            return self.engine.place_limit_order("BUY", lots, price, sl, tp)
        return None

    def sell_limit(self, lots, price, sl=None, tp=None):
        if self.engine:
            return self.engine.place_limit_order("SELL", lots, price, sl, tp)
        return None

    def buy_stop(self, lots, price, sl=None, tp=None):
        if self.engine:
            return self.engine.place_stop_order("BUY", lots, price, sl, tp)
        return None

    def sell_stop(self, lots, price, sl=None, tp=None):
        if self.engine:
            return self.engine.place_stop_order("SELL", lots, price, sl, tp)
        return None

    def cancel_all(self):
        """Cancels all pending orders."""
        if self.engine:
            self.engine.cancel_all_orders()

    def close_all(self):
        """Closes all active positions."""
        if self.engine:
            self.engine.close_all_positions()
