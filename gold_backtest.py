import argparse
import os
import sys
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt

def load_data(filepath):
    if not os.path.exists(filepath):
        print(f"Error: File '{filepath}' not found.")
        sys.exit(1)
    
    try:
        df = pd.read_csv(filepath)
    except Exception as e:
        print(f"Error reading file: {e}")
        sys.exit(1)
        
    if df.empty:
        print("Error: Dataset is empty.")
        sys.exit(1)

    col_map = {str(col).lower(): col for col in df.columns}
    required = ['open', 'high', 'low', 'close']
    missing = [col for col in required if col not in col_map]
    
    if missing:
        print(f"Error: Missing required columns: {missing}")
        sys.exit(1)
        
    df = df.rename(columns={col_map[k]: k.capitalize() for k in required})
    
    date_cols = [c for c in df.columns if str(c).lower() in ['date', 'datetime']]
    if not date_cols:
        print("Error: Missing Date or Datetime column.")
        sys.exit(1)
        
    date_col = date_cols[0]
    
    try:
        df['Date'] = pd.to_datetime(df[date_col])
    except Exception as e:
        print(f"Error: Invalid dates in the date column '{date_col}'.")
        sys.exit(1)
        
    if date_col != 'Date':
        df = df.drop(columns=[date_col])
        
    df = df.sort_values('Date')
    df = df.drop_duplicates(subset=['Date'])
    
    df = df.dropna(subset=['Open', 'High', 'Low', 'Close'])
    
    if len(df) < 50:
        print("Error: Insufficient candles for backtesting.")
        sys.exit(1)
        
    if (df[['Open', 'High', 'Low', 'Close']] <= 0).any().any():
        print("Error: Dataset contains zero or negative prices.")
        sys.exit(1)
        
    return df.reset_index(drop=True)

def rma(series, length):
    return series.ewm(alpha=1/length, adjust=False).mean()

def calculate_indicators(df, fast_length, slow_length, signal_length, di_length, adx_smoothing):
    close = df['Close']
    high = df['High']
    low = df['Low']
    
    # 1. MACD
    fast_ema = close.ewm(span=fast_length, adjust=False).mean()
    slow_ema = close.ewm(span=slow_length, adjust=False).mean()
    macd = fast_ema - slow_ema
    signal = macd.ewm(span=signal_length, adjust=False).mean()
    
    df['MACD'] = macd
    df['Signal'] = signal
    
    # 2. Directional movement
    up = high - high.shift(1)
    down = low.shift(1) - low
    
    plus_dm = np.where((up > down) & (up > 0), up, 0.0)
    minus_dm = np.where((down > up) & (down > 0), down, 0.0)
    
    # 3. True range
    tr1 = high - low
    tr2 = (high - close.shift(1)).abs()
    tr3 = (low - close.shift(1)).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    
    # 4. Wilder moving average
    smoothed_tr = rma(tr, di_length)
    smoothed_plus_dm = rma(pd.Series(plus_dm), di_length)
    smoothed_minus_dm = rma(pd.Series(minus_dm), di_length)
    
    plus_di = np.where(smoothed_tr == 0, 0, 100 * smoothed_plus_dm / smoothed_tr)
    minus_di = np.where(smoothed_tr == 0, 0, 100 * smoothed_minus_dm / smoothed_tr)
    
    # 5. ADX
    di_sum = plus_di + minus_di
    di_sum = np.where(di_sum == 0, 1, di_sum)
    dx = np.abs(plus_di - minus_di) / di_sum
    adx = 100 * rma(pd.Series(dx), adx_smoothing)
    
    df['ADX'] = adx
    return df

def generate_signals(df, adx_threshold):
    prev_macd = df['MACD'].shift(1)
    prev_signal = df['Signal'].shift(1)
    
    bullish_cross = (prev_macd <= prev_signal) & (df['MACD'] > df['Signal'])
    bearish_cross = (prev_macd >= prev_signal) & (df['MACD'] < df['Signal'])
    
    df['Bullish'] = (df['ADX'] > adx_threshold) & (df['MACD'] < 0) & bullish_cross
    df['Bearish'] = (df['ADX'] > adx_threshold) & (df['MACD'] > 0) & bearish_cross
    
    return df

def run_backtest(df, initial_capital, commission_pct, slippage_pct):
    POSITION_SIZE_PERCENT = 100
    trades = []
    equity = initial_capital
    equity_curve = [initial_capital]
    
    pos_dir = 0 # 1 for long, -1 for short
    entry_price = 0
    quantity = 0
    entry_time = None
    signal_time = None
    
    comm_rate = commission_pct / 100
    slip_rate = slippage_pct / 100
    pos_size_ratio = POSITION_SIZE_PERCENT / 100
    
    for i in range(1, len(df)):
        open_p = df.at[i, 'Open']
        date = df.at[i, 'Date']
        
        bullish = df.at[i-1, 'Bullish']
        bearish = df.at[i-1, 'Bearish']
        
        close_long = pos_dir == 1 and bearish
        close_short = pos_dir == -1 and bullish
        open_long = pos_dir == 0 and bullish
        open_short = pos_dir == 0 and bearish
        
        close_pos = False
        is_end = (i == len(df) - 1)
        
        if close_long or close_short or (is_end and pos_dir != 0):
            close_pos = True
            
        # Execute closing
        if close_pos:
            exit_price = open_p if not is_end else df.at[i, 'Close']
            exit_price = exit_price * (1 - slip_rate) if pos_dir == 1 else exit_price * (1 + slip_rate)
            
            pnl = quantity * (exit_price - entry_price) if pos_dir == 1 else quantity * (entry_price - exit_price)
            comm = (entry_price * quantity * comm_rate) + (exit_price * quantity * comm_rate)
            net_pnl = pnl - comm
            
            ret_pct = (net_pnl / (entry_price * quantity)) * 100
            
            equity += net_pnl
            
            trades.append({
                'Trade Number': len(trades) + 1,
                'Direction': 'Long' if pos_dir == 1 else 'Short',
                'Signal Time': signal_time,
                'Entry Time': entry_time,
                'Entry Price': entry_price,
                'Exit Time': date,
                'Exit Price': exit_price,
                'Quantity': quantity,
                'Gross PnL': pnl,
                'Commission': comm,
                'Net PnL': net_pnl,
                'Return %': ret_pct,
                'Exit Reason': 'Signal' if not is_end else 'End of Data',
                'Equity After Trade': equity
            })
            pos_dir = 0
            
        # Execute opening
        if (close_long or open_short) and not is_end:
            pos_dir = -1
            signal_time = df.at[i-1, 'Date']
            entry_time = date
            entry_price = open_p * (1 - slip_rate)
            quantity = (equity * pos_size_ratio) / entry_price
        elif (close_short or open_long) and not is_end:
            pos_dir = 1
            signal_time = df.at[i-1, 'Date']
            entry_time = date
            entry_price = open_p * (1 + slip_rate)
            quantity = (equity * pos_size_ratio) / entry_price
            
        # Record equity curve
        if pos_dir == 1:
            unrealized = quantity * (df.at[i, 'Close'] - entry_price)
            equity_curve.append(equity + unrealized)
        elif pos_dir == -1:
            unrealized = quantity * (entry_price - df.at[i, 'Close'])
            equity_curve.append(equity + unrealized)
        else:
            equity_curve.append(equity)
            
    df_trades = pd.DataFrame(trades)
    if not df_trades.empty:
        # Ensure correct column order
        cols = [
            'Trade Number', 'Direction', 'Signal Time', 'Entry Time', 'Entry Price', 
            'Exit Time', 'Exit Price', 'Quantity', 'Gross PnL', 'Commission', 
            'Net PnL', 'Return %', 'Exit Reason', 'Equity After Trade'
        ]
        df_trades = df_trades[cols]
    
    df_eq = pd.DataFrame({
        'Date': df['Date'],
        'Equity': equity_curve
    })
    
    return df_trades, df_eq

def calculate_metrics(df_trades, equity_curve, initial_capital, df):
    final_equity = equity_curve['Equity'].iloc[-1]
    total_return = (final_equity / initial_capital - 1) * 100
    
    first_close = df['Close'].iloc[0]
    last_close = df['Close'].iloc[-1]
    bnh_return = (last_close / first_close - 1) * 100
    
    total_trades = len(df_trades)
    if total_trades > 0:
        winning = df_trades[df_trades['Net PnL'] > 0]
        losing = df_trades[df_trades['Net PnL'] <= 0]
        
        win_rate = len(winning) / total_trades * 100
        gross_profit = winning['Gross PnL'].sum()
        gross_loss = abs(losing['Gross PnL'].sum())
        net_profit = df_trades['Net PnL'].sum()
        profit_factor = gross_profit / gross_loss if gross_loss != 0 else float('inf')
        
        avg_ret = df_trades['Return %'].mean()
        avg_win = winning['Net PnL'].mean() if len(winning) > 0 else 0
        avg_loss = losing['Net PnL'].mean() if len(losing) > 0 else 0
        
        best_trade = df_trades['Net PnL'].max()
        worst_trade = df_trades['Net PnL'].min()
        
        longs = df_trades[df_trades['Direction'] == 'Long']
        shorts = df_trades[df_trades['Direction'] == 'Short']
        
        long_np = longs['Net PnL'].sum() if len(longs) > 0 else 0
        short_np = shorts['Net PnL'].sum() if len(shorts) > 0 else 0
        
        in_pos_time = 0
        for idx, row in df_trades.iterrows():
            in_pos_time += len(df[(df['Date'] >= row['Entry Time']) & (df['Date'] <= row['Exit Time'])])
        exposure_pct = min(100.0, (in_pos_time / len(df)) * 100)
    else:
        win_rate = gross_profit = gross_loss = net_profit = 0
        profit_factor = avg_ret = avg_win = avg_loss = 0
        best_trade = worst_trade = 0
        long_np = short_np = exposure_pct = 0
        winning = losing = longs = shorts = []
        
    running_max = equity_curve['Equity'].cummax()
    drawdown = equity_curve['Equity'] / running_max - 1
    max_dd_pct = drawdown.min() * 100
    
    dd_amount = running_max - equity_curve['Equity']
    max_dd_amt = dd_amount.max()
    
    metrics_dict = {
        "Initial Capital": initial_capital,
        "Final Equity": final_equity,
        "Total Return %": total_return,
        "Buy and Hold Return %": bnh_return,
        "Total Trades": total_trades,
        "Winning Trades": len(winning),
        "Losing Trades": len(losing),
        "Win Rate %": win_rate,
        "Gross Profit": gross_profit,
        "Gross Loss": gross_loss,
        "Net Profit": net_profit,
        "Profit Factor": profit_factor,
        "Average Trade Return %": avg_ret,
        "Average Winning Trade": avg_win,
        "Average Losing Trade": avg_loss,
        "Best Trade": best_trade,
        "Worst Trade": worst_trade,
        "Maximum Drawdown %": max_dd_pct,
        "Maximum Drawdown Amount": max_dd_amt,
        "Long Trades": len(longs),
        "Short Trades": len(shorts),
        "Long Net Profit": long_np,
        "Short Net Profit": short_np,
        "Exposure %": exposure_pct
    }
    
    # Format and print exactly as requested
    print(f"Initial Capital: ${initial_capital:,.2f}")
    print(f"Final Equity: ${final_equity:,.2f}")
    print(f"Total Return %: {total_return:.2f}%")
    print(f"Buy and Hold Return %: {bnh_return:.2f}%")
    print(f"Total Trades: {total_trades}")
    print(f"Winning Trades: {len(winning)}")
    print(f"Losing Trades: {len(losing)}")
    print(f"Win Rate %: {win_rate:.2f}%")
    print(f"Gross Profit: ${gross_profit:,.2f}")
    print(f"Gross Loss: ${gross_loss:,.2f}")
    print(f"Net Profit: ${net_profit:,.2f}")
    print(f"Profit Factor: {profit_factor:.2f}")
    print(f"Average Trade Return %: {avg_ret:.2f}%")
    print(f"Average Winning Trade: ${avg_win:,.2f}")
    print(f"Average Losing Trade: ${avg_loss:,.2f}")
    print(f"Best Trade: ${best_trade:,.2f}")
    print(f"Worst Trade: ${worst_trade:,.2f}")
    print(f"Maximum Drawdown %: {max_dd_pct:.2f}%")
    print(f"Maximum Drawdown Amount: ${max_dd_amt:,.2f}")
    print(f"Long Trades: {len(longs)}")
    print(f"Short Trades: {len(shorts)}")
    print(f"Long Net Profit: ${long_np:,.2f}")
    print(f"Short Net Profit: ${short_np:,.2f}")
    print(f"Exposure %: {exposure_pct:.2f}%")
    
    return metrics_dict

def plot_results(df, df_trades, equity_curve):
    drawdown = equity_curve['Equity'] / equity_curve['Equity'].cummax() - 1
    
    # 1. Gold closing price with long-entry markers and short-entry markers
    fig1 = plt.figure(figsize=(12, 6))
    plt.plot(df['Date'], df['Close'], label='Close Price', color='black', alpha=0.7)
    
    if not df_trades.empty:
        longs = df_trades[df_trades['Direction'] == 'Long']
        shorts = df_trades[df_trades['Direction'] == 'Short']
        
        if not longs.empty:
            plt.scatter(longs['Entry Time'], longs['Entry Price'], marker='^', color='green', label='Long Entry', s=100, zorder=5)
        if not shorts.empty:
            plt.scatter(shorts['Entry Time'], shorts['Entry Price'], marker='v', color='red', label='Short Entry', s=100, zorder=5)
            
    plt.title('Gold Price with Strategy Entries')
    plt.xlabel('Date')
    plt.ylabel('Price')
    plt.legend()
    plt.grid(True, alpha=0.3)
    fig1.savefig('gold_strategy_backtest.png')
    
    # 2. Strategy equity curve compared with buy-and-hold equity
    fig2 = plt.figure(figsize=(12, 6))
    plt.plot(equity_curve['Date'], equity_curve['Equity'], label='Strategy Equity', color='blue')
    
    initial_cap = equity_curve['Equity'].iloc[0]
    bnh = initial_cap * (df['Close'] / df['Close'].iloc[0])
    plt.plot(df['Date'], bnh, label='Buy and Hold', color='orange', alpha=0.7)
    
    plt.title('Strategy vs Buy and Hold Equity')
    plt.xlabel('Date')
    plt.ylabel('Equity')
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    # 3. Drawdown percentage over time
    fig3 = plt.figure(figsize=(12, 6))
    plt.fill_between(equity_curve['Date'], drawdown * 100, 0, color='red', alpha=0.3)
    plt.title('Strategy Drawdown %')
    plt.xlabel('Date')
    plt.ylabel('Drawdown %')
    plt.grid(True, alpha=0.3)

def main():
    parser = argparse.ArgumentParser(description='Gold Strategy Backtester')
    parser.add_argument('csv_path', type=str, help='Path to Gold OHLC CSV file')
    parser.add_argument('--initial-capital', type=float, default=100000)
    parser.add_argument('--commission', type=float, default=0.0)
    parser.add_argument('--slippage', type=float, default=0.0)
    parser.add_argument('--fast-length', type=int, default=5)
    parser.add_argument('--slow-length', type=int, default=13)
    parser.add_argument('--signal-length', type=int, default=9)
    parser.add_argument('--di-length', type=int, default=10)
    parser.add_argument('--adx-smoothing', type=int, default=14)
    parser.add_argument('--adx-threshold', type=float, default=25.0)
    
    args = parser.parse_args()
    
    print("Loading data...")
    df = load_data(args.csv_path)
    
    print("Calculating indicators...")
    df = calculate_indicators(
        df, 
        args.fast_length, 
        args.slow_length, 
        args.signal_length, 
        args.di_length, 
        args.adx_smoothing
    )
    
    print("Generating signals...")
    df = generate_signals(df, args.adx_threshold)
    
    print("Running backtest...")
    df_trades, equity_curve = run_backtest(
        df, 
        args.initial_capital, 
        args.commission, 
        args.slippage
    )
    
    print("Calculating metrics...\n")
    metrics_dict = calculate_metrics(df_trades, equity_curve, args.initial_capital, df)
    
    print("\nPlotting results...")
    plot_results(df, df_trades, equity_curve)
    
    print("Exporting files...")
    df_trades.to_csv('trade_log.csv', index=False)
    equity_curve.to_csv('equity_curve.csv', index=False)
    
    metrics_df = pd.DataFrame(list(metrics_dict.items()), columns=['Metric', 'Value'])
    metrics_df.to_csv('backtest_results.csv', index=False)
    
    print("Backtest complete! Results saved.")

if __name__ == "__main__":
    main()
