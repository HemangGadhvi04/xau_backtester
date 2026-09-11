import os
import sys
import pandas as pd
from datetime import datetime

# Adjust Python path to include the backend folder
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.engine import BacktestEngine
from strategies.ema_final_boss import EMAFinalBossStrategy
from backend.data_service import get_market_data as get_xauusd_data

def format_perf_report(metrics):
    if not metrics:
        return "No trades executed."
    
    report = "="*50 + "\n"
    report += "         SYSTEMATIC PERFORMANCE REPORT          \n"
    report += "="*50 + "\n"
    report += f"Total Trades Executed : {metrics['total_trades']}\n"
    report += f"Win Rate              : {metrics['win_rate']}%\n"
    report += f"Net Profit / Loss     : ${metrics['net_profit']}\n"
    report += f"Gross Profit          : ${metrics['gross_profit']}\n"
    report += f"Gross Loss            : ${metrics['gross_loss']}\n"
    report += f"Profit Factor         : {metrics['profit_factor']}\n"
    report += f"Max Equity Drawdown   : ${metrics['max_drawdown']}\n"
    report += f"Average Win           : ${metrics['avg_win']}\n"
    report += f"Average Loss          : ${metrics['avg_loss']}\n"
    report += "="*50
    return report

def main():
    print("Loading historical candles via DuckDB OLAP engine...")
    # Load 15m candles for backtesting
    candles = get_xauusd_data(timeframe="15m")
    
    if not candles:
        print("Error: No candle data available in data/raw/. Please ensure the downloader is running.")
        sys.exit(1)
        
    print(f"Successfully loaded {len(candles)} 15-minute historical candles.")
    
    # Initialize Backtest Engine
    engine = BacktestEngine(
        initial_balance=10000, 
        leverage=100, 
        spread=0.20
    )
    
    # Set data
    engine.load_data(candles)
    
    # Instantiate Strategy (7 EMA Final Boss)
    strategy = EMAFinalBossStrategy(
        ema_len=7,
        htf_multiplier=4,
        adx_len=14,
        adx_threshold=25.0,
        rr=3.0,
        lots=0.1
    )
    
    print("\nRunning Event-Driven Backtesting Loop...")
    engine.run(strategy)
    
    # Calculate performance metrics
    metrics = engine.calculate_metrics()
    print("\n" + format_perf_report(metrics))

if __name__ == "__main__":
    main()
