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

    def cancel_all(self):
        """Cancels all pending orders."""
        if self.engine:
            self.engine.cancel_all_orders()

    def close_all(self):
        """Closes all active positions."""
        if self.engine:
            self.engine.close_all_positions()
