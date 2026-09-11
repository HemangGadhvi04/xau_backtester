import pandas as pd
from typing import List, Dict, Any, Optional
from backend.config import SYMBOL_CONFIGS
from core.execution.models import OrderDirection
from core.execution.fills import (
    calculate_deterministic_slippage,
    calculate_market_fill,
    check_limit_order_trigger,
    check_stop_order_trigger
)
from core.execution.pnl import (
    calculate_trade_pnl,
    calculate_position_unrealized_pnl
)
from core.execution.risk import check_margin_available


class BacktestEngine:
    """
    Systematic Backtest Engine using shared core/execution primitives
    for deterministic fill calculations and risk/P&L accounting.
    """
    def __init__(
        self,
        initial_balance: float = 10000.0,
        leverage: float = 100.0,
        spread: Optional[float] = None,
        default_slippage: float = 0.02,
        symbol: str = "XAUUSD",
        use_random_slippage: bool = True,
        commission_per_lot: float = 0.0
    ):
        self.initial_balance: float = initial_balance
        self.balance: float = initial_balance
        self.equity: float = initial_balance
        self.leverage: float = leverage
        self.default_slippage: float = default_slippage
        self.symbol: str = symbol
        self.use_random_slippage: bool = use_random_slippage
        self.commission_per_lot: float = commission_per_lot

        cfg = SYMBOL_CONFIGS.get(symbol, SYMBOL_CONFIGS["XAUUSD"])
        self.pip_size: float = cfg["pipSize"]
        self.contract_size: float = cfg["contractSize"]
        self.precision: int = cfg["precision"]
        self.spread: float = cfg["defaultSpread"] if spread is None else spread

        self.candles: List[Dict[str, Any]] = []
        self.current_index: int = 0
        self.positions: List[Dict[str, Any]] = []
        self.pending_orders: List[Dict[str, Any]] = []
        self.trade_history: List[Dict[str, Any]] = []

        self.equity_curve: List[float] = []
        self.timestamps: List[int] = []
        self._order_counter: int = 0

    def load_data(self, data_list: List[Dict[str, Any]]):
        self.candles = data_list
        self.current_index = 0
        self.balance = self.initial_balance
        self.equity = self.initial_balance
        self.positions = []
        self.pending_orders = []
        self.trade_history = []
        self.equity_curve = [self.initial_balance]
        self.timestamps = []

    def get_slippage(self, timestamp: int, order_id: str = "bt_order") -> float:
        """Uses shared deterministic slippage model."""
        hour = (timestamp % 86400) // 3600
        is_overlap = 12 <= hour <= 16
        base_pips = 0.2 if is_overlap else 0.1
        if not self.use_random_slippage:
            random_pips = 0.4 if is_overlap else 0.15
            return (base_pips + random_pips) * self.pip_size

        return calculate_deterministic_slippage(
            session_id="systematic_backtest",
            order_id=order_id,
            timestamp=timestamp,
            execution_type="FILL",
            pip_size=self.pip_size
        )


    def place_order(
        self,
        direction: OrderDirection,
        lots: float,
        sl: Optional[float] = None,
        tp: Optional[float] = None,
        execution_price: Optional[float] = None
    ) -> Optional[Dict[str, Any]]:
        current_candle = self.candles[self.current_index]
        bid_price = current_candle['close'] if execution_price is None else execution_price
        timestamp = current_candle['time']

        self._order_counter += 1
        order_id = f"bt_{self._order_counter}"
        slippage = self.get_slippage(timestamp, order_id)

        fill_price, _ = calculate_market_fill(direction, bid_price, self.spread, slippage)

        # Margin check using shared risk primitive
        account_mock = type("Acc", (), {"free_margin": self.equity, "leverage": self.leverage})()
        if not check_margin_available(account_mock, fill_price, lots, self.contract_size):
            return None

        pos = {
            "id": self._order_counter,
            "direction": direction,
            "lots": lots,
            "entry_price": fill_price,
            "sl": sl,
            "tp": tp,
            "entry_time": timestamp
        }

        self.positions.append(pos)
        return pos

    def place_limit_order(self, direction: OrderDirection, lots: float, entry_price: float, sl: Optional[float] = None, tp: Optional[float] = None) -> Dict[str, Any]:
        self._order_counter += 1
        order = {
            "id": self._order_counter,
            "type": "LIMIT",
            "direction": direction,
            "lots": lots,
            "price": entry_price,
            "sl": sl,
            "tp": tp,
            "entry_time": self.candles[self.current_index]['time']
        }
        self.pending_orders.append(order)
        return order

    def place_stop_order(self, direction: OrderDirection, lots: float, entry_price: float, sl: Optional[float] = None, tp: Optional[float] = None) -> Dict[str, Any]:
        self._order_counter += 1
        order = {
            "id": self._order_counter,
            "type": "STOP",
            "direction": direction,
            "lots": lots,
            "price": entry_price,
            "sl": sl,
            "tp": tp,
            "entry_time": self.candles[self.current_index]['time']
        }
        self.pending_orders.append(order)
        return order

    def cancel_all_orders(self):
        self.pending_orders = []

    def close_all_positions(self, execution_price: Optional[float] = None):
        for pos in list(self.positions):
            price = self.candles[self.current_index]['close'] if execution_price is None else execution_price
            self._close_position(pos, price, "MANUAL")

    def _close_position(self, pos: Dict[str, Any], exit_bid: float, reason: str):
        current_candle = self.candles[self.current_index]
        timestamp = current_candle['time']
        slippage = self.get_slippage(timestamp, f"close_{pos['id']}")

        if pos['direction'] == "BUY":
            exit_price = exit_bid - slippage
        else:
            exit_price = exit_bid + self.spread + slippage

        pnl, commission = calculate_trade_pnl(
            direction=pos['direction'],
            entry_price=pos['entry_price'],
            exit_price=exit_price,
            lots=pos['lots'],
            contract_size=self.contract_size,
            commission_per_lot=self.commission_per_lot
        )
        self.balance += pnl

        closed_trade = {
            **pos,
            "exit_price": exit_price,
            "exit_time": timestamp,
            "pnl": round(pnl, 2),
            "commission": round(commission, 2),
            "outcome": reason
        }

        self.trade_history.append(closed_trade)
        if pos in self.positions:
            self.positions.remove(pos)

    def _mark_equity(self, bid: float):
        unrealized_total = 0.0
        for pos in self.positions:
            unrealized = calculate_position_unrealized_pnl(
                direction=pos['direction'],
                entry_price=pos['entry_price'],
                current_bid=bid,
                spread=self.spread,
                lots=pos['lots'],
                contract_size=self.contract_size,
                commission_per_lot=self.commission_per_lot
            )
            unrealized_total += unrealized
        self.equity = self.balance + unrealized_total

    def run(self, strategy):
        strategy.set_engine(self)
        if not self.candles:
            return

        for idx in range(len(self.candles)):
            self.current_index = idx
            current_candle = self.candles[idx]
            timestamp = current_candle['time']

            self._mark_equity(current_candle['open'])
            if hasattr(strategy, 'on_open'):
                strategy.on_open({'time': timestamp, 'open': current_candle['open']})

            if self.positions:
                self._check_sl_tp(current_candle)

            if self.pending_orders:
                self._check_pending_orders(current_candle)

            self._mark_equity(current_candle['close'])
            strategy.on_candle(current_candle)
            self._mark_equity(current_candle['close'])
            self.equity_curve.append(self.equity)
            self.timestamps.append(timestamp)

        self.close_all_positions()
        self.equity = self.balance
        if self.equity_curve:
            self.equity_curve[-1] = self.balance


    def _check_pending_orders(self, candle: Dict[str, Any]):
        timestamp = candle['time']
        for order in list(self.pending_orders):
            slippage = self.get_slippage(timestamp, f"pending_{order['id']}")
            triggered = False
            fill_price = None

            if order['type'] == "LIMIT":
                triggered, fill_price = check_limit_order_trigger(
                    order['direction'], order['price'], candle, self.spread, slippage
                )
            elif order['type'] == "STOP":
                triggered, fill_price = check_stop_order_trigger(
                    order['direction'], order['price'], candle, self.spread, slippage
                )

            if triggered and fill_price is not None:
                account_mock = type("Acc", (), {"free_margin": self.equity, "leverage": self.leverage})()
                if check_margin_available(account_mock, fill_price, order['lots'], self.contract_size):
                    pos = {
                        "id": order['id'],
                        "direction": order['direction'],
                        "lots": order['lots'],
                        "entry_price": fill_price,
                        "sl": order['sl'],
                        "tp": order['tp'],
                        "entry_time": timestamp
                    }

                    self.positions.append(pos)
                self.pending_orders.remove(order)

    def _check_sl_tp(self, candle: Dict[str, Any]):
        for pos in list(self.positions):
            hit_sl = False
            hit_tp = False

            if pos['direction'] == "BUY":
                if pos['sl'] and candle['low'] <= pos['sl']:
                    hit_sl = True
                if pos['tp'] and candle['high'] >= pos['tp']:
                    hit_tp = True
            else:
                ask_high = candle['high'] + self.spread
                ask_low = candle['low'] + self.spread
                if pos['sl'] and ask_high >= pos['sl']:
                    hit_sl = True
                if pos['tp'] and ask_low <= pos['tp']:
                    hit_tp = True

            if hit_sl or hit_tp:
                resolved_sl = hit_sl
                reason = "SL" if resolved_sl else "TP"

                if pos['direction'] == "BUY":
                    exit_bid = min(pos['sl'], candle['open']) if resolved_sl else pos['tp']
                else:
                    exit_ask = max(pos['sl'], candle['open'] + self.spread) if resolved_sl else pos['tp']
                    exit_bid = exit_ask - self.spread

                self._close_position(pos, exit_bid, reason)


    def calculate_metrics(self) -> Dict[str, Any]:
        if not self.trade_history:
            return {}

        df = pd.DataFrame(self.trade_history)
        total_trades = len(df)
        winning_trades = df[df['pnl'] > 0]
        losing_trades = df[df['pnl'] < 0]

        win_rate = (len(winning_trades) / total_trades * 100) if total_trades > 0 else 0
        gross_profit = winning_trades['pnl'].sum() if not winning_trades.empty else 0
        gross_loss = abs(losing_trades['pnl'].sum()) if not losing_trades.empty else 0
        net_profit = gross_profit - gross_loss

        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (gross_profit if gross_profit > 0 else 0.0)

        peak = self.equity_curve[0]
        max_dd = 0
        for equity in self.equity_curve:
            if equity > peak:
                peak = equity
            dd = (peak - equity)
            if dd > max_dd:
                max_dd = dd

        avg_win = winning_trades['pnl'].mean() if len(winning_trades) > 0 else 0
        avg_loss = abs(losing_trades['pnl'].mean()) if len(losing_trades) > 0 else 0

        max_win_streak = 0
        max_loss_streak = 0
        curr_win_streak = 0
        curr_loss_streak = 0
        for pnl in df['pnl']:
            if pnl > 0:
                curr_win_streak += 1
                curr_loss_streak = 0
                if curr_win_streak > max_win_streak:
                    max_win_streak = curr_win_streak
            elif pnl < 0:
                curr_loss_streak += 1
                curr_win_streak = 0
                if curr_loss_streak > max_loss_streak:
                    max_loss_streak = curr_loss_streak
            else:
                curr_win_streak = 0
                curr_loss_streak = 0

        win_rate_dec = win_rate / 100.0
        expectancy = (win_rate_dec * avg_win) - ((1 - win_rate_dec) * avg_loss)
        avg_rr = (avg_win / avg_loss) if avg_loss > 0 else 0

        std_pnl = df['pnl'].std()
        sharpe = (df['pnl'].mean() / std_pnl * (total_trades ** 0.5)) if std_pnl > 0 else 0

        return {
            "total_trades": total_trades,
            "win_rate": round(win_rate, 2),
            "net_profit": round(net_profit, 2),
            "gross_profit": round(gross_profit, 2),
            "gross_loss": round(gross_loss, 2),
            "profit_factor": round(profit_factor, 2) if isinstance(profit_factor, float) else profit_factor,
            "max_drawdown": round(max_dd, 2),
            "avg_win": round(avg_win, 2),
            "avg_loss": round(avg_loss, 2),
            "max_winning_streak": max_win_streak,
            "max_losing_streak": max_loss_streak,
            "expectancy": round(expectancy, 2),
            "avg_rr": round(avg_rr, 2),
            "sharpe_ratio": round(sharpe, 2)
        }
