from typing import List, Dict, Any, Optional
from backend.config import SYMBOL_CONFIGS
from core.execution.models import OrderDirection, OrderType
from core.execution.fills import (
    calculate_deterministic_slippage,
    calculate_market_fill,
    check_limit_order_trigger,
    check_stop_order_trigger
)
from core.execution.pnl import (
    calculate_trade_pnl,
    update_account_state
)
from core.execution.risk import check_margin_available
from core.replay.clock import ReplayClock
from core.replay.state import ReplayStateStore


class ReplayEngine:
    """
    Authoritative Replay Engine managing replay execution, deterministic fills,
    pending orders, SL/TP monitoring, and true state rewind.
    """
    def __init__(
        self,
        session_id: str,
        initial_balance: float = 10000.0,
        leverage: float = 100.0,
        symbol: str = "XAUUSD",
        spread: Optional[float] = None,
        commission_per_lot: float = 0.0,
        snapshot_interval: int = 50
    ):
        self.session_id: str = session_id
        self.symbol: str = symbol
        self.commission_per_lot: float = commission_per_lot
        self.snapshot_interval: int = snapshot_interval

        cfg = SYMBOL_CONFIGS.get(symbol, SYMBOL_CONFIGS["XAUUSD"])
        self.pip_size: float = cfg["pipSize"]
        self.contract_size: float = cfg["contractSize"]
        self.precision: int = cfg["precision"]
        self.spread: float = cfg["defaultSpread"] if spread is None else spread

        self.clock: ReplayClock = ReplayClock()
        self.state_store: ReplayStateStore = ReplayStateStore(
            session_id=session_id,
            initial_balance=initial_balance,
            leverage=leverage
        )
        self._order_counter: int = 0

    def load_data(self, candles: List[Dict[str, Any]], start_index: int = 0):
        self.clock.load_data(candles, start_index)
        self.state_store.reset_to_initial()
        self.state_store.save_snapshot(0, self.clock.current_time)


    def _next_order_id(self) -> str:
        self._order_counter += 1
        return f"ord_{self._order_counter}"

    def get_state(self) -> Dict[str, Any]:
        """Returns authoritative replay state summary for frontend consumption."""
        current_candle = self.clock.current_candle
        current_bid = current_candle['close'] if current_candle else 0.0

        # Mark account equity up to current candle close
        update_account_state(
            account=self.state_store.account,
            positions=self.state_store.positions,
            current_bid=current_bid,
            spread=self.spread,
            contract_size=self.contract_size,
            commission_per_lot=self.commission_per_lot
        )

        return {
            "session_id": self.session_id,
            "symbol": self.symbol,
            "cursor_index": self.clock.cursor_index,
            "total_bars": self.clock.total_bars,
            "current_time": self.clock.current_time,
            "current_candle": current_candle,
            "spread": self.spread,
            "account": {
                "balance": round(self.state_store.account.balance, 2),
                "equity": round(self.state_store.account.equity, 2),
                "used_margin": round(self.state_store.account.used_margin, 2),
                "free_margin": round(self.state_store.account.free_margin, 2),
                "unrealized_pnl": round(self.state_store.account.unrealized_pnl, 2),
                "leverage": self.state_store.account.leverage
            },
            "positions": self.state_store.positions,
            "pending_orders": self.state_store.pending_orders,
            "trade_history": self.state_store.trade_history,
            "is_end_of_data": self.clock.is_end_of_data
        }

    def place_order(
        self,
        direction: OrderDirection,
        order_type: OrderType,
        lots: float,
        price: Optional[float] = None,
        sl: Optional[float] = None,
        tp: Optional[float] = None
    ) -> Dict[str, Any]:
        """Submits an order to the authoritative ReplayEngine."""
        current_candle = self.clock.current_candle
        if not current_candle:
            raise ValueError("No market data loaded in ReplayEngine.")

        order_id = self._next_order_id()
        timestamp = self.clock.current_time

        if order_type == "MARKET":
            # Determine fill price deterministically
            bid_price = current_candle['close']
            slippage = calculate_deterministic_slippage(
                session_id=self.session_id,
                order_id=order_id,
                timestamp=timestamp,
                execution_type="MARKET",
                pip_size=self.pip_size
            )
            fill_price, _ = calculate_market_fill(direction, bid_price, self.spread, slippage)

            # Check margin
            if not check_margin_available(self.state_store.account, fill_price, lots, self.contract_size):
                return {"status": "REJECTED", "reason": "Insufficient free margin"}

            position = {
                "id": f"pos_{order_id}",
                "order_id": order_id,
                "direction": direction,
                "lots": lots,
                "entry_price": round(fill_price, self.precision),
                "entry_time": timestamp,
                "sl": sl,
                "tp": tp,
                "status": "OPEN",
                "slippage": slippage
            }
            self.state_store.positions.append(position)
            self.state_store.record_event("PLACE_MARKET_ORDER", position, timestamp, self.clock.cursor_index)
            self.state_store.save_snapshot(self.clock.cursor_index, timestamp)
            return {"status": "FILLED", "position": position}

        else:  # LIMIT or STOP
            if price is None:
                raise ValueError("Price is required for LIMIT or STOP orders.")

            order = {
                "id": order_id,
                "order_type": order_type,
                "direction": direction,
                "lots": lots,
                "price": price,
                "sl": sl,
                "tp": tp,
                "created_time": timestamp,
                "status": "PENDING"
            }
            self.state_store.pending_orders.append(order)
            self.state_store.record_event("PLACE_PENDING_ORDER", order, timestamp, self.clock.cursor_index)
            self.state_store.save_snapshot(self.clock.cursor_index, timestamp)
            return {"status": "PENDING", "order": order}

    def cancel_order(self, order_id: str) -> bool:
        """Cancels a pending order."""
        for order in list(self.state_store.pending_orders):
            if order["id"] == order_id:
                self.state_store.pending_orders.remove(order)
                self.state_store.record_event(
                    "CANCEL_ORDER",
                    {"order_id": order_id},
                    self.clock.current_time,
                    self.clock.cursor_index
                )
                self.state_store.save_snapshot(self.clock.cursor_index, self.clock.current_time)
                return True
        return False


    def close_position(self, position_id: str, reason: str = "MANUAL") -> Optional[Dict[str, Any]]:
        """Closes an open position immediately at market price."""
        current_candle = self.clock.current_candle
        if not current_candle:
            return None

        for pos in list(self.state_store.positions):
            if pos["id"] == position_id:
                return self._execute_close(pos, current_candle['close'], reason)
        return None

    def _execute_close(self, pos: Dict[str, Any], exit_bid: float, reason: str) -> Dict[str, Any]:
        timestamp = self.clock.current_time
        slippage = calculate_deterministic_slippage(
            session_id=self.session_id,
            order_id=pos["id"],
            timestamp=timestamp,
            execution_type="CLOSE",
            pip_size=self.pip_size
        )

        if pos["direction"] == "BUY":
            exit_price = exit_bid - slippage
        else:
            exit_price = exit_bid + self.spread + slippage

        pnl, commission = calculate_trade_pnl(
            direction=pos["direction"],
            entry_price=pos["entry_price"],
            exit_price=exit_price,
            lots=pos["lots"],
            contract_size=self.contract_size,
            commission_per_lot=self.commission_per_lot
        )

        self.state_store.account.balance += pnl

        closed_trade = {
            **pos,
            "exit_price": round(exit_price, self.precision),
            "exit_time": timestamp,
            "pnl": round(pnl, 2),
            "commission": round(commission, 2),
            "close_reason": reason,
            "status": "CLOSED"
        }

        self.state_store.trade_history.append(closed_trade)
        if pos in self.state_store.positions:
            self.state_store.positions.remove(pos)

        self.state_store.record_event("CLOSE_POSITION", closed_trade, timestamp, self.clock.cursor_index)
        self.state_store.save_snapshot(self.clock.cursor_index, timestamp)
        return closed_trade


    def step(self, count: int = 1) -> Dict[str, Any]:
        """Advances the replay clock by `count` bars, evaluating orders and SL/TP hits."""
        for _ in range(count):
            if self.clock.is_end_of_data:
                break

            self.clock.step(1)
            candle = self.clock.current_candle
            if not candle:
                continue

            # 1. Evaluate pending order triggers
            self._process_pending_orders(candle)

            # 2. Evaluate active SL/TP hits
            self._process_sl_tp_hits(candle)

            # Periodic snapshot for deterministic rewind
            if self.clock.cursor_index % self.snapshot_interval == 0:
                self.state_store.save_snapshot(self.clock.cursor_index, self.clock.current_time)

        return self.get_state()

    def _process_pending_orders(self, candle: Dict[str, Any]):
        timestamp = candle['time']
        for order in list(self.state_store.pending_orders):
            slippage = calculate_deterministic_slippage(
                session_id=self.session_id,
                order_id=order["id"],
                timestamp=timestamp,
                execution_type=order["order_type"],
                pip_size=self.pip_size
            )

            triggered = False
            fill_price = None

            if order["order_type"] == "LIMIT":
                triggered, fill_price = check_limit_order_trigger(
                    order["direction"], order["price"], candle, self.spread, slippage
                )
            elif order["order_type"] == "STOP":
                triggered, fill_price = check_stop_order_trigger(
                    order["direction"], order["price"], candle, self.spread, slippage
                )

            if triggered and fill_price is not None:
                if check_margin_available(self.state_store.account, fill_price, order["lots"], self.contract_size):
                    pos = {
                        "id": f"pos_{order['id']}",
                        "order_id": order["id"],
                        "direction": order["direction"],
                        "lots": order["lots"],
                        "entry_price": round(fill_price, self.precision),
                        "entry_time": timestamp,
                        "sl": order["sl"],
                        "tp": order["tp"],
                        "status": "OPEN",
                        "slippage": slippage
                    }
                    self.state_store.positions.append(pos)
                    self.state_store.record_event("TRIGGER_PENDING_ORDER", pos, timestamp, self.clock.cursor_index)

                self.state_store.pending_orders.remove(order)

    def _process_sl_tp_hits(self, candle: Dict[str, Any]):
        for pos in list(self.state_store.positions):
            hit_sl = False
            hit_tp = False

            if pos["direction"] == "BUY":
                if pos["sl"] and candle["low"] <= pos["sl"]:
                    hit_sl = True
                if pos["tp"] and candle["high"] >= pos["tp"]:
                    hit_tp = True
            else:
                ask_high = candle["high"] + self.spread
                ask_low = candle["low"] + self.spread
                if pos["sl"] and ask_high >= pos["sl"]:
                    hit_sl = True
                if pos["tp"] and ask_low <= pos["tp"]:
                    hit_tp = True

            if hit_sl or hit_tp:
                # Pessimistic execution: SL prioritized over TP if both hit on same candle
                resolved_sl = hit_sl
                reason = "SL" if resolved_sl else "TP"

                if pos["direction"] == "BUY":
                    exit_bid = min(pos["sl"], candle["open"]) if resolved_sl else pos["tp"]
                else:
                    exit_bid = max(pos["sl"], candle["open"]) if resolved_sl else pos["tp"]

                self._execute_close(pos, exit_bid, reason)

    def seek_to_index(self, target_index: int) -> Dict[str, Any]:
        """
        Rewinds or fast-forwards to target_index using snapshot restoration and event replay.
        Guarantees strict equivalence: Replay to T = Replay to T+100 and rewind to T.
        """
        if not self.clock.candles:
            return self.get_state()

        target_index = max(0, min(target_index, len(self.clock.candles) - 1))

        # Check if we have a saved snapshot at or before target_index
        snapshot = self.state_store.get_latest_snapshot_before(target_index)
        if snapshot:
            self.state_store.restore_from_snapshot(snapshot)
            start_index = snapshot.cursor_index
        else:
            self.state_store.reset_to_initial()
            start_index = 0

        self.clock.seek_to_index(start_index)

        # Fast-forward from snapshot to target_index
        bars_to_step = target_index - start_index
        if bars_to_step > 0:
            self.step(bars_to_step)
        else:
            self.clock.seek_to_index(target_index)

        return self.get_state()

    def seek_to_timestamp(self, timestamp: int) -> Dict[str, Any]:
        """Rewinds or fast-forwards to a target candle timestamp."""
        target_index = 0
        if self.clock.candles:
            low, high = 0, len(self.clock.candles) - 1
            while low <= high:
                mid = (low + high) // 2
                if self.clock.candles[mid]['time'] <= timestamp:
                    target_index = mid
                    low = mid + 1
                else:
                    high = mid - 1
        return self.seek_to_index(target_index)
