import os
import pandas as pd
import numpy as np

class BacktestEngine:
    def __init__(self, initial_balance=10000, leverage=100, spread=0.20, default_slippage=0.02):
        self.initial_balance = initial_balance
        self.balance = initial_balance
        self.equity = initial_balance
        self.leverage = leverage
        self.spread = spread
        self.default_slippage = default_slippage
        
        self.candles = []
        self.current_index = 0
        self.positions = []
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
        self.trade_history = []
        self.equity_curve = [self.initial_balance]
        self.timestamps = []

    def get_slippage(self, timestamp):
        """NY Session Overlap slippage model matching frontend logic."""
        # Convert timestamp to UTC hour
        dt = pd.to_datetime(timestamp, unit='s', utc=True)
        hour = dt.hour
        is_overlap = 12 <= hour <= 16
        base_slippage = 0.02 if is_overlap else 0.01
        random_slippage = np.random.uniform(0, 0.08 if is_overlap else 0.03)
        return base_slippage + random_slippage

    def place_order(self, direction, lots, sl=None, tp=None):
        current_candle = self.candles[self.current_index]
        entry_bid = current_candle['close']
        timestamp = current_candle['time']
        
        slippage = self.get_slippage(timestamp)
        
        # Calculate Margin
        required_margin = (entry_bid * lots * 100) / self.leverage
        used_margin = sum((pos['entry_price'] * pos['lots'] * 100) / self.leverage for pos in self.positions)
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

    def close_all_positions(self):
        # Create a copy to prevent mutation issues during iteration
        for pos in list(self.positions):
            self._close_position(pos, self.candles[self.current_index]['close'], "MANUAL")

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

        pnl = price_diff * pos['lots'] * 100
        self.balance += pnl
        
        closed_trade = {
            **pos,
            "exit_price": exit_price,
            "exit_time": timestamp,
            "pnl": pnl,
            "outcome": reason
        }
        self.trade_history.append(closed_trade)
        if pos in self.positions:
            self.positions.remove(pos)

    def run(self, strategy):
        strategy.set_engine(self)
        
        if not self.candles:
            print("No data loaded into Backtester Engine.")
            return

        for idx in range(len(self.candles)):
            self.current_index = idx
            current_candle = self.candles[idx]
            timestamp = current_candle['time']
            
            # 1. Update active positions P&L and check SL/TP hits
            self._check_sl_tp(current_candle)
            
            # 2. Update equity curve
            unrealized_pnl = 0
            close_price = current_candle['close']
            for pos in self.positions:
                if pos['direction'] == "BUY":
                    price_diff = close_price - pos['entry_price']
                else:
                    price_diff = pos['entry_price'] - (close_price + self.spread)
                unrealized_pnl += price_diff * pos['lots'] * 100
            
            self.equity = self.balance + unrealized_pnl
            self.equity_curve.append(self.equity)
            self.timestamps.append(timestamp)
            
            # 3. Feed candle to strategy
            strategy.on_candle(current_candle)

        # Close any open positions at the end of the data feed
        self.close_all_positions()

    def _check_sl_tp(self, candle):
        timestamp = candle['time']
        slippage = self.get_slippage(timestamp)
        
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
                
                # Determine close price including slippage penalty
                if pos['direction'] == "BUY":
                    exit_price = (pos['sl'] - slippage) if resolved_sl else (pos['tp'] - slippage)
                else:
                    exit_price = (pos['sl'] + slippage) if resolved_sl else (pos['tp'] + slippage)
                
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

        return {
            "total_trades": total_trades,
            "win_rate": round(win_rate, 2),
            "net_profit": round(net_profit, 2),
            "gross_profit": round(gross_profit, 2),
            "gross_loss": round(gross_loss, 2),
            "profit_factor": round(profit_factor, 2) if isinstance(profit_factor, float) else profit_factor,
            "max_drawdown": round(max_dd, 2),
            "avg_win": round(avg_win, 2),
            "avg_loss": round(avg_loss, 2)
        }
