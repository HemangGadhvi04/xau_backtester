import unittest

from core.engine import BacktestEngine
from strategies.base import BaseStrategy
from strategies.volatility_breakout import VolatilityBreakoutStrategy


def bar(index, price=2000, **overrides):
    candle = {'time': 7 * 3600 + index * 900, 'open': price,
              'high': price + 0.5, 'low': price - 0.5, 'close': price}
    candle.update(overrides)
    return candle


def engine_with(candles, **kwargs):
    engine = BacktestEngine(use_random_slippage=False, **kwargs)
    engine.load_data(candles)
    return engine


class OneTrade(BaseStrategy):
    def __init__(self, direction='BUY', sl=None, tp=None):
        super().__init__()
        self.direction, self.sl, self.tp = direction, sl, tp

    def on_candle(self, candle):
        if self.engine.current_index == 0:
            self.engine.place_order(self.direction, 1, self.sl, self.tp)


class ExecutionTests(unittest.TestCase):
    def test_equity_includes_open_loss_and_final_costs(self):
        engine = engine_with([bar(0), bar(1, 1995), bar(2, 2001)], commission_per_lot=7)
        engine.run(OneTrade())
        self.assertAlmostEqual(engine.equity_curve[2], 10000 - 522.5 - 7)
        self.assertAlmostEqual(engine.equity, engine.balance)
        self.assertAlmostEqual(engine.equity_curve[-1], engine.balance)
        self.assertAlmostEqual(engine.balance, 10000 + 75 - 7)

    def test_explicit_spread_is_used(self):
        engine = engine_with([bar(0)], spread=0.8)
        position = engine.place_order('BUY', 1)
        self.assertAlmostEqual(position['entry_price'], 2000.825)

    def test_stop_slippage_charged_once_both_directions(self):
        for direction, stop, second, expected in (
            ('BUY', 1998, bar(1, low=1997), 1997.975),
            ('SELL', 2002, bar(1, high=2003), 2002.025),
        ):
            with self.subTest(direction=direction):
                engine = engine_with([bar(0), second])
                engine.run(OneTrade(direction, stop))
                self.assertAlmostEqual(engine.trade_history[0]['exit_price'], expected)

    def test_gap_stops_use_opening_quote(self):
        for direction, stop, price, expected in (
            ('BUY', 1998, 1990, 1989.975),
            ('SELL', 2002, 2010, 2010.225),
        ):
            with self.subTest(direction=direction):
                engine = engine_with([bar(0), bar(1, price)])
                engine.run(OneTrade(direction, stop))
                self.assertAlmostEqual(engine.trade_history[0]['exit_price'], expected)

    def test_ambiguous_bar_uses_stop_first(self):
        engine = engine_with([bar(0), bar(1, high=2005, low=1995)])
        engine.run(OneTrade(sl=1998, tp=2003))
        self.assertEqual(engine.trade_history[0]['outcome'], 'SL')


class StrategyTests(unittest.TestCase):
    def test_breakout_signal_is_causal_and_both_directions_work(self):
        for sign, direction in ((1, 'BUY'), (-1, 'SELL')):
            with self.subTest(direction=direction):
                strategy = VolatilityBreakoutStrategy()
                strategy.set_engine(engine_with([]))
                for i in range(48):
                    strategy.on_candle(bar(i, 2000 + sign * i))
                    self.assertIsNone(strategy.signal)
                strategy.on_candle(bar(48, 2000 + sign * 48))
                self.assertEqual(strategy.signal['direction'], direction)
                self.assertFalse(strategy.engine.positions)

    def test_flat_prices_never_signal(self):
        strategy = VolatilityBreakoutStrategy()
        strategy.set_engine(engine_with([]))
        for i in range(100):
            strategy.on_candle(bar(i))
        self.assertIsNone(strategy.signal)

    def test_next_open_entry_risk_budget_and_same_bar_stop(self):
        engine = engine_with([bar(0), bar(1, 2005, low=2000)], commission_per_lot=7)
        strategy = VolatilityBreakoutStrategy()
        strategy.set_engine(engine)
        strategy.signal = {'direction': 'BUY', 'atr': 1, 'time': bar(0)['time']}
        engine.current_index = 1
        strategy.on_open({'time': bar(1)['time'], 'open': 2005})
        self.assertAlmostEqual(engine.positions[0]['entry_price'], 2005.225)
        engine._check_sl_tp(engine.candles[1])
        self.assertEqual(engine.trade_history[0]['outcome'], 'SL')
        self.assertLessEqual(-engine.trade_history[0]['pnl'], 25)

    def test_undersized_trade_is_skipped(self):
        engine = engine_with([bar(0)], initial_balance=10)
        strategy = VolatilityBreakoutStrategy()
        strategy.set_engine(engine)
        strategy.signal = {'direction': 'BUY', 'atr': 1, 'time': bar(0)['time'] - 900}
        strategy.on_open({'time': bar(0)['time'], 'open': 2000})
        self.assertFalse(engine.positions)

    def test_stale_and_out_of_session_signals_are_discarded(self):
        for timestamp in (9 * 3600, 19 * 3600):
            engine = engine_with([bar(0)])
            strategy = VolatilityBreakoutStrategy()
            strategy.set_engine(engine)
            strategy.signal = {'direction': 'BUY', 'atr': 1, 'time': 7 * 3600}
            strategy.on_open({'time': timestamp, 'open': 2000})
            self.assertFalse(engine.positions)
            self.assertIsNone(strategy.signal)

    def test_time_exit_and_open_callback_visibility(self):
        class AtOpen(VolatilityBreakoutStrategy):
            def on_open(self, candle):
                self.seen_keys = set(candle)
                super().on_open(candle)

            def on_candle(self, candle):
                if self.engine.current_index == 0:
                    self.signal = {'direction': 'BUY', 'atr': 10, 'time': candle['time']}

        strategy = AtOpen()
        engine = engine_with([bar(i) for i in range(15)])
        engine.run(strategy)
        self.assertEqual(strategy.seen_keys, {'open', 'time'})
        trade = engine.trade_history[0]
        self.assertEqual(trade['entry_time'], bar(1)['time'])
        self.assertEqual(trade['exit_time'] - trade['entry_time'], 3 * 3600)

    def test_future_candle_changes_do_not_change_earlier_trades(self):
        candles = [bar(i, 2000 + i) for i in range(120)]
        # Begin at midnight so the warmed-up breakout occurs during entry hours.
        for candle in candles:
            candle['time'] -= 7 * 3600
        first = engine_with(candles)
        first.run(VolatilityBreakoutStrategy())
        changed = [dict(candle) for candle in candles]
        for candle in changed[100:]:
            for key in ('open', 'high', 'low', 'close'):
                candle[key] += 300
        second = engine_with(changed)
        second.run(VolatilityBreakoutStrategy())
        cutoff = candles[100]['time']
        before = lambda engine: [trade for trade in engine.trade_history if trade['exit_time'] < cutoff]
        self.assertTrue(before(first))
        self.assertEqual(before(first), before(second))


if __name__ == '__main__':
    unittest.main()
