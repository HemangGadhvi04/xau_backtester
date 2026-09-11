import os
import pandas as pd
import numpy as np
from backend.config import SYMBOL_CONFIGS

class BacktestEngine:
    def __init__(self, initial_balance=10000, leverage=100, spread=None, default_slippage=0.02, symbol="XAUUSD", use_random_slippage=True, commission_per_lot=0.0):
        self.initial_balance = initial_balance
        self.balance = initial_balance
        self.equity = initial_balance
        self.leverage = leverage
        self.default_slippage = default_slippage
        self.symbol = symbol
        self.use_random_slippage = use_random_slippage
        self.commission_per_lot = commission_per_lot  # Round-trip USD per lot.
        
        cfg = SYMBOL_CONFIGS.get(symbol, SYMBOL_CONFIGS["XAUUSD"])
        self.pip_size = cfg["pipSize"]
        self.contract_size = cfg["contractSize"]
        self.precision = cfg["precision"]
        self.spread = cfg["defaultSpread"] if spread is None else spread
        
        self.candles = []
        self.current_index = 0
        self.positions = []
        self.pending_orders = []
        self.trade_history = []
        
        # Performance Tracking
        self.equity_curve = []
        self.timestamps = []

    def load_data(self, data_list):
        """Loads candles list of dicts: [{'time': ..., 'open': ...}]"""
        self.candles = data_list
        self.current_index = 0
        self.balance = self.initial_balance
        self.equity = self.initial_balance
        self.positions = []
        self.pending_orders = []
        self.trade_history = []
        self.equity_curve = [self.initial_balance]
        self.timestamps = []

    def get_slippage(self, timestamp):
        """NY Session Overlap slippage model matching frontend logic."""
        # Convert timestamp to UTC hour using integer math (much faster than pd.to_datetime)
        hour = (timestamp % 86400) // 3600
        is_overlap = 12 <= hour <= 16
        # Scale slippage based on pip size: XAU default was 0.01/0.02, which is 0.1/0.2 pips.
        # So slippage = pips * pip_size
        base_pips = 0.2 if is_overlap else 0.1
        if self.use_random_slippage:
            random_pips = np.random.uniform(0, 0.8 if is_overlap else 0.3)
        else:
            # Deterministic average slippage penalty
            random_pips = 0.4 if is_overlap else 0.15
        return (base_pips + random_pips) * self.pip_size

    def place_order(self, direction, lots, sl=None, tp=None, execution_price=None):
        current_candle = self.candles[self.current_index]
        entry_bid = current_candle['close'] if execution_price is None else execution_price
        timestamp = current_candle['time']
        
        slippage = self.get_slippage(timestamp)
        
        # Calculate Margin
        required_margin = (entry_bid * lots * self.contract_size) / self.leverage
        used_margin = sum((pos['entry_price'] * pos['lots'] * self.contract_size) / self.leverage for pos in self.positions)
        free_margin = self.equity - used_margin
        
        if required_margin > free_margin:
            # Margin call block
            return None

        if direction == "BUY":
            # BUY fills at Ask = Bid + Spread + Slippage
            entry_price = entry_bid + self.spread + slippage
        else:
            # SELL fills at Bid = Bid - Slippage
            entry_price = entry_bid - slippage

        pos_id = len(self.trade_history) + len(self.positions) + 1
        pos = {
            "id": pos_id,
            "direction": direction,
            "lots": lots,
            "entry_price": entry_price,
            "sl": sl,
            "tp": tp,
            "entry_time": timestamp
        }
        self.positions.append(pos)
        return pos

    def place_limit_order(self, direction, lots, entry_price, sl=None, tp=None):
        order = {
            "id": len(self.trade_history) + len(self.positions) + len(self.pending_orders) + 1,
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

    def place_stop_order(self, direction, lots, entry_price, sl=None, tp=None):
        order = {
            "id": len(self.trade_history) + len(self.positions) + len(self.pending_orders) + 1,
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

    def close_all_positions(self, execution_price=None):
        # Create a copy to prevent mutation issues during iteration
        for pos in list(self.positions):
            price = self.candles[self.current_index]['close'] if execution_price is None else execution_price
            self._close_position(pos, price, "MANUAL")

    def _close_position(self, pos, exit_bid, reason):
        current_candle = self.candles[self.current_index]
        timestamp = current_candle['time']
        slippage = self.get_slippage(timestamp)
        
        if pos['direction'] == "BUY":
            # BUY exits at Bid = Bid - Slippage
            exit_price = exit_bid - slippage
            price_diff = exit_price - pos['entry_price']
        else:
            # SELL exits at Ask = Bid + Spread + Slippage
            exit_price = exit_bid + self.spread + slippage
            price_diff = pos['entry_price'] - exit_price

        commission = pos['lots'] * self.commission_per_lot
        pnl = price_diff * pos['lots'] * self.contract_size - commission
        self.balance += pnl
        
        closed_trade = {
            **pos,
            "exit_price": exit_price,
            "exit_time": timestamp,
            "pnl": pnl,
            "commission": commission,
            "outcome": reason
        }
        self.trade_history.append(closed_trade)
        if pos in self.positions:
            self.positions.remove(pos)

    def _mark_equity(self, bid):
        unrealized_pnl = 0.0
        for pos in self.positions:
            price_diff = (bid - pos['entry_price'] if pos['direction'] == 'BUY'
                          else pos['entry_price'] - (bid + self.spread))
            unrealized_pnl += price_diff * pos['lots'] * self.contract_size
            unrealized_pnl -= pos['lots'] * self.commission_per_lot
        self.equity = self.balance + unrealized_pnl

    def run(self, strategy):
        strategy.set_engine(self)
        
        if not self.candles:
            print("No data loaded into Backtester Engine.")
            return

        for idx in range(len(self.candles)):
            self.current_index = idx
            current_candle = self.candles[idx]
            timestamp = current_candle['time']

            # Opening callbacks receive no information from the unfinished bar.
            self._mark_equity(current_candle['open'])
            if hasattr(strategy, 'on_open'):
                strategy.on_open({'time': timestamp, 'open': current_candle['open']})
            
            # 1. Update active positions P&L and check SL/TP hits
            if self.positions:
                self._check_sl_tp(current_candle)
                
            # 1.5 Check if pending orders triggered
            if self.pending_orders:
                self._check_pending_orders(current_candle)
            
            self._mark_equity(current_candle['close'])
            
            # 3. Feed candle to strategy
            strategy.on_candle(current_candle)
            self._mark_equity(current_candle['close'])
            self.equity_curve.append(self.equity)
            self.timestamps.append(timestamp)

        # Close any open positions at the end of the data feed
        self.close_all_positions()
        self.equity = self.balance
        self.equity_curve[-1] = self.balance

    def _check_pending_orders(self, candle):
        timestamp = candle['time']
        slippage = self.get_slippage(timestamp)
        
        for order in list(self.pending_orders):
            triggered = False
            fill_price = None
            
            if order['direction'] == "BUY":
                # Limit BUY triggers if candle low dips below limit price
                if order['type'] == "LIMIT" and candle['low'] <= order['price']:
                    triggered = True
                    fill_price = order['price'] + self.spread + slippage
                # Stop BUY triggers if candle high breaches stop price
                elif order['type'] == "STOP" and candle['high'] >= order['price']:
                    triggered = True
                    fill_price = order['price'] + self.spread + slippage
            else:
                ask_high = candle['high'] + self.spread
                ask_low = candle['low'] + self.spread
                if order['type'] == "LIMIT" and ask_high >= order['price']:
                    triggered = True
                    fill_price = order['price'] - slippage
                elif order['type'] == "STOP" and ask_low <= order['price']:
                    triggered = True
                    fill_price = order['price'] - slippage
                    
            if triggered:
                required_margin = (fill_price * order['lots'] * self.contract_size) / self.leverage
                used_margin = sum((pos['entry_price'] * pos['lots'] * self.contract_size) / self.leverage for pos in self.positions)
                free_margin = self.equity - used_margin
                
                if required_margin <= free_margin:
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

    def _check_sl_tp(self, candle):
        for pos in list(self.positions):
            hit_sl = False
            hit_tp = False
            
            if pos['direction'] == "BUY":
                # BUY exits at Bid (candle price is Bid)
                if pos['sl'] and candle['low'] <= pos['sl']:
                    hit_sl = True
                if pos['tp'] and candle['high'] >= pos['tp']:
                    hit_tp = True
            else:
                # SELL exits at Ask (Bid + Spread)
                ask_high = candle['high'] + self.spread
                ask_low = candle['low'] + self.spread
                if pos['sl'] and ask_high >= pos['sl']:
                    hit_sl = True
                if pos['tp'] and ask_low <= pos['tp']:
                    hit_tp = True

            if hit_sl or hit_tp:
                # Pessimistic execution: assume SL hit first if both are hit
                resolved_sl = hit_sl
                reason = "SL" if resolved_sl else "TP"
                
                # Gaps through stops fill at the opening quote; slippage is
                # applied exactly once by _close_position.
                if pos['direction'] == "BUY":
                    exit_price = min(pos['sl'], candle['open']) if resolved_sl else pos['tp']
                else:
                    exit_price = max(pos['sl'], candle['open'] + self.spread) if resolved_sl else pos['tp']
                
                self._close_position(pos, exit_price - (self.spread if pos['direction'] == 'SELL' else 0), reason)

    def calculate_metrics(self):
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
        
        # Calculate Max Drawdown based on equity curve
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

        # Calculate winning and losing streaks
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
                
        # Advanced Metrics
        win_rate_dec = win_rate / 100.0
        expectancy = (win_rate_dec * avg_win) - ((1 - win_rate_dec) * avg_loss)
        avg_rr = (avg_win / avg_loss) if avg_loss > 0 else 0
        
        std_pnl = df['pnl'].std()
        sharpe = (df['pnl'].mean() / std_pnl * np.sqrt(len(df))) if std_pnl > 0 else 0
        
        df['duration'] = (df['exit_time'] - df['entry_time']) / 60.0 # Duration in minutes
        avg_duration = df['duration'].mean() if not df.empty else 0

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
            "sharpe_ratio": round(sharpe, 2),
            "avg_trade_duration": round(avg_duration, 1)
        }
