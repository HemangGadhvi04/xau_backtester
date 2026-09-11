import os
import pandas as pd
import duckdb
from core.engine import BacktestEngine
from strategies.tbm_7ema_strategy import TBM7EMAStrategy
from backend.data_service import get_market_data


def run_tbm_backtest():
    print("==================================================")
    print("  RUNNING TBM 7 EMA STRATEGY BACKTEST (XAUUSD)")
    print("==================================================")

    # Load 15M candles from DuckDB / Parquet data pipeline
    candles = get_market_data(symbol="XAUUSD", timeframe="15m", limit=2000)
    if not candles:
        print("Error: No XAUUSD market data found. Generating sample data...")
        import subprocess
        subprocess.run([".venv_dev/bin/python3", "generate_dummy_data.py"])
        candles = get_market_data(symbol="XAUUSD", timeframe="15m", limit=2000)


    print(f"Loaded {len(candles)} 15-minute historical candles.")
    first_date = pd.to_datetime(candles[0]['time'], unit='s', utc=True).strftime('%Y-%m-%d')
    last_date = pd.to_datetime(candles[-1]['time'], unit='s', utc=True).strftime('%Y-%m-%d')
    print(f"Date Range: {first_date} to {last_date}")

    # Initialize Backtest Engine for XAUUSD
    engine = BacktestEngine(
        initial_balance=10000.0,
        leverage=100.0,
        symbol="XAUUSD",
        use_random_slippage=False
    )
    engine.load_data(candles)

    # Instantiate TBM 7 EMA Strategy (Target 1:3 RR)
    strategy = TBM7EMAStrategy(ema_fast=7, ema_slow=30, rr_ratio=3.0, lots=0.1)


    print("\nExecuting backtest...")
    engine.run(strategy)

    metrics = engine.calculate_metrics()

    print("\n==================================================")
    print("            BACKTEST PERFORMANCE RESULTS           ")
    print("==================================================")
    for key, value in metrics.items():
        print(f"{key.replace('_', ' ').title():<25}: {value}")
    print("==================================================")

    return metrics


if __name__ == "__main__":
    run_tbm_backtest()
