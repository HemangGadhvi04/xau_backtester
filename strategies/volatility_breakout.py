"""Experimental intraday XAUUSD strategy; no demonstrated profitability assumed.

Run: python -m strategies.volatility_breakout

Fixed research specification (15-minute bid candles):
  r_t = log(C_t / C_{t-1})
  M_t = sum(last 48 returns) / sqrt(sum(last 48 squared returns))
  ATR_t = mean(last 14 true ranges)
Buy when C_t exceeds the previous 20 highs and M_t > 1; sell symmetrically
below the previous 20 lows with M_t < -1. M is a descriptive trend score,
not a significance test or a predicted probability. Execute at the next open.
Stop distance = 2 ATR; target distance = 3 ATR. Risk budget = 0.25% equity,
including modeled spread, slippage and commission; floor to 0.01-lot steps
and skip undersized trades. Cap notional exposure at 3 times equity.
Enter 07:00-18:00 UTC, exit after 3 hours or at/after 20:00 UTC. Fixed UTC
hours do not track London/New York daylight saving. One position at a time.
Gaps can exceed the intended risk and holding time; no quotes means no fill.

Rationale: positive serial dependence can reward continuation; volatility
scaling reduces position size as price uncertainty grows. This intraday
adaptation is a hypothesis, not a result established by the research:
https://www.aqr.com/Insights/Research/Journal-Article/Time-Series-Momentum
That study examines much longer horizons and diversified markets.

Validation: fixed parameters, chronological 60/20/20 partitions, fresh account
in each partition, prior bars used only for indicator warmup. Report all
partitions at base and doubled costs, without selecting a winning variant.
The 95% interval resamples consecutive 5-day blocks of daily dollar P&L;
it is descriptive and cannot account for every regime shift or data error.
Require positive net expectancy with an interval above zero on unseen data
and robustness to higher costs before treating this as evidence of an edge.
Reusing these partitions to tune parameters invalidates their holdout status.

Initial local-data evaluation (2026-09-10; fixed rules, no parameter search):
  Partition     Trades   Net USD, base costs   Net USD, doubled costs
  Development      406              -281.55                  -574.57
  Validation       114              -224.57                  -261.16
  Holdout           56              -104.39                  -112.47
Trades shown are for base costs. Each partition starts with $10,000.
Holdout: 2026-01-26 through 2026-06-22; base-cost profit factor 0.83,
max equity drawdown 1.75%, daily mean P&L 95% interval [-2.93, 1.22] USD.
Conclusion: rejected as a demonstrated profitable strategy. Data quality and
actual broker spreads/commissions remain unverified. These results are tied
to the local dataset and assumptions, not a claim about future performance.
"""

import argparse
from collections import deque
from datetime import datetime, timezone
import math

from strategies.base import BaseStrategy


class VolatilityBreakoutStrategy(BaseStrategy):
    def __init__(self, risk_percent=0.25, trade_start=None, cost_multiplier=1.0):
        super().__init__()
        if not math.isfinite(risk_percent) or not 0 < risk_percent <= 1:
            raise ValueError('risk_percent must be between 0 and 1')
        if not math.isfinite(cost_multiplier) or cost_multiplier <= 0:
            raise ValueError('cost_multiplier must be positive')
        self.risk_percent = risk_percent
        self.trade_start = trade_start
        self.cost_multiplier = cost_multiplier
        self.history = deque(maxlen=49)
        self.signal = None

    def on_candle(self, candle):
        self.signal = None
        previous = list(self.history)
        self.history.append(candle)
        if len(previous) < 48 or self.engine.positions:
            return
        if self.trade_start is not None and candle['time'] < self.trade_start:
            return
        bars = previous[-48:] + [candle]
        returns = [math.log(b['close'] / a['close']) for a, b in zip(bars, bars[1:])]
        denominator = math.sqrt(sum(r * r for r in returns))
        if denominator == 0:
            return
        momentum = sum(returns) / denominator
        true_ranges = [max(b['high'] - b['low'], abs(b['high'] - a['close']),
                           abs(b['low'] - a['close']))
                       for a, b in zip(bars[-15:], bars[-14:])]
        atr = sum(true_ranges) / 14
        if atr <= 0:
            return
        direction = None
        if candle['close'] > max(b['high'] for b in previous[-20:]) and momentum > 1:
            direction = 'BUY'
        elif candle['close'] < min(b['low'] for b in previous[-20:]) and momentum < -1:
            direction = 'SELL'
        if direction:
            self.signal = {'direction': direction, 'atr': atr, 'time': candle['time']}

    def on_open(self, candle):
        signal, self.signal = self.signal, None
        hour = (candle['time'] % 86400) // 3600
        if self.engine.positions:
            entry_time = self.engine.positions[0]['entry_time']
            if hour >= 20 or candle['time'] - entry_time >= 3 * 3600:
                self.engine.close_all_positions(execution_price=candle['open'])
            return
        if not signal or not 7 <= hour < 18:
            return
        if candle['time'] - signal['time'] != 15 * 60:
            return  # Do not carry a stale signal across missing bars/weekends.
        if self.trade_start is not None and candle['time'] < self.trade_start:
            return
        equity = self.engine.equity
        price = candle['open']
        distance = 2 * signal['atr']
        # Highest deterministic exit slippage in the engine's session model.
        costs = (self.engine.spread + self.engine.get_slippage(candle['time'])
                 + 0.6 * self.engine.pip_size * self.cost_multiplier
                 + self.engine.commission_per_lot / self.engine.contract_size)
        risk_lots = equity * self.risk_percent / 100 / ((distance + costs) * self.engine.contract_size)
        exposure_lots = equity * 3 / ((price + self.engine.spread) * self.engine.contract_size)
        lots = math.floor(min(risk_lots, exposure_lots) * 100) / 100
        if lots < 0.01:
            return
        if signal['direction'] == 'BUY':
            sl, tp = price - distance, price + 3 * signal['atr']
        else:
            sl = price + self.engine.spread + distance
            tp = price + self.engine.spread - 3 * signal['atr']
        self.engine.place_order(signal['direction'], lots, sl=sl, tp=tp, execution_price=price)


def evaluate(candles, start, end, cost_multiplier, spread, commission):
    import numpy as np
    import pandas as pd
    from core.engine import BacktestEngine

    engine = BacktestEngine(spread=spread * cost_multiplier, use_random_slippage=False,
                            commission_per_lot=commission * cost_multiplier)
    base_slippage = engine.get_slippage
    engine.get_slippage = lambda timestamp: base_slippage(timestamp) * cost_multiplier
    warmup = max(0, start - 49)
    engine.load_data(candles[warmup:end])
    engine.run(VolatilityBreakoutStrategy(trade_start=candles[start]['time'],
                                          cost_multiplier=cost_multiplier))
    equity = np.array(engine.equity_curve[start - warmup + 1:])
    curve = np.r_[engine.initial_balance, equity]
    peaks = np.maximum.accumulate(curve)
    drawdown = float(np.max(1 - curve / peaks) * 100)
    dates = pd.to_datetime([c['time'] for c in candles[start:end]], unit='s', utc=True)
    daily_equity = pd.Series(equity, index=dates).resample('1D').last().dropna()
    daily_pnl = np.diff(np.r_[engine.initial_balance, daily_equity.to_numpy()])
    rng = np.random.default_rng(42)
    count = len(daily_pnl)
    interval = None
    if count >= 30:
        blocks = rng.integers(0, count, size=(2000, math.ceil(count / 5)))
        indices = (blocks[:, :, None] + np.arange(5)) % count
        samples = daily_pnl[indices.reshape(2000, -1)[:, :count]].mean(axis=1)
        interval = np.percentile(samples, [2.5, 97.5])
    pnls = [trade['pnl'] for trade in engine.trade_history]
    gains = sum(p for p in pnls if p > 0)
    losses = -sum(p for p in pnls if p < 0)
    factor = gains / losses if losses else (math.inf if gains else math.nan)
    return {'trades': len(pnls), 'net': engine.balance - engine.initial_balance,
            'expectancy': sum(pnls) / len(pnls) if pnls else 0.0,
            'profit_factor': factor, 'drawdown': drawdown, 'daily_interval': interval}


def main():
    from backend.data_service import get_market_data

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--spread', type=float, default=0.20, help='Fixed bid/ask spread in USD per ounce')
    parser.add_argument('--commission', type=float, default=7.0, help='Round-trip USD commission per lot')
    args = parser.parse_args()
    if any(not math.isfinite(value) or value < 0 for value in (args.spread, args.commission)):
        parser.error('Costs must be finite and nonnegative')
    candles = get_market_data(symbol='XAUUSD', timeframe='15m')
    if len(candles) < 500:
        raise SystemExit('Need at least 500 local XAUUSD 15-minute candles.')
    for index, candle in enumerate(candles):
        values = [candle[key] for key in ('open', 'high', 'low', 'close')]
        if (any(not math.isfinite(v) or v <= 0 for v in values)
                or candle['low'] > min(candle['open'], candle['close'])
                or candle['high'] < max(candle['open'], candle['close'])
                or (index and candle['time'] <= candles[index - 1]['time'])):
            raise SystemExit(f'Invalid or unordered candle at index {index}.')
    # The last aggregate may be unfinished. Conservatively exclude it.
    candles = candles[:-1]
    n = len(candles)
    bounds = (49, int(n * 0.6), int(n * 0.8), n)
    stamp = lambda index: datetime.fromtimestamp(candles[index]['time'], timezone.utc).isoformat()
    print(f'XAUUSD 15m | {n} bars | {stamp(0)} through {stamp(n - 1)}')
    print(f'Fixed rules; $10,000 accounts; spread ${args.spread:.2f}; commission ${args.commission:.2f}/lot round trip.')
    print('Slippage: $0.025-$0.060/oz per fill. Stress doubles spread, slippage and commission.')
    print('Data provenance/completeness and broker cost assumptions require independent verification.')
    for label, start, end in zip(('Development', 'Validation', 'Holdout'), bounds, bounds[1:]):
        print(f'\n{label}: {stamp(start)} through {stamp(end - 1)}')
        for multiplier in (1.0, 2.0):
            result = evaluate(candles, start, end, multiplier, args.spread, args.commission)
            print(f"  Costs {multiplier:.0f}x | trades {result['trades']} | net ${result['net']:.2f}"
                  f" | expectancy ${result['expectancy']:.2f}/trade | PF {result['profit_factor']:.2f}"
                  f" | max equity DD {result['drawdown']:.2f}%")
            interval = result['daily_interval']
            print('  95% block-bootstrap mean daily P&L interval: '
                  + (f'${interval[0]:.2f} to ${interval[1]:.2f}' if interval is not None else 'insufficient days'))
    print('\nExperimental results only. Do not tune on the holdout and continue calling it unseen.')


if __name__ == '__main__':
    main()
