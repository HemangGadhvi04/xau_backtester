import os
import duckdb
import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
RAW_DIR = os.path.join(DATA_DIR, "raw")
PROC_DIR = os.path.join(DATA_DIR, "processed")

def precompute_timeframes(symbol: str):
    os.makedirs(PROC_DIR, exist_ok=True)
    base_file = os.path.join(RAW_DIR, f"{symbol}_bid_1m.parquet")
    if not os.path.exists(base_file):
        print(f"Base data {base_file} not found. Skipping {symbol}.")
        return

    print(f"Precomputing {symbol}...")
    
    # Standard timeframes
    timeframe_map = {
        "1m": "1 minute",
        "3m": "3 minutes",
        "5m": "5 minutes",
        "15m": "15 minutes",
        "30m": "30 minutes",
        "1h": "1 hour",
        "4h": "4 hours",
        "1d": "1 day",
        "1w": "7 days"
    }
    
    con = duckdb.connect(database=':memory:')
    con.execute(f"CREATE OR REPLACE TEMP VIEW raw_data AS SELECT * FROM read_parquet('{base_file}')")
    
    # Introspect columns
    cols_info = con.execute("PRAGMA table_info('raw_data')").fetchall()
    col_names = [c[1] for c in cols_info]
    
    time_col = next((c for c in ["Etc/UTC", "Datetime", "datetime", "time"] if c in col_names), col_names[0])
    open_col = next((c for c in col_names if c.lower() == "open"), "Open")
    high_col = next((c for c in col_names if c.lower() == "high"), "High")
    low_col = next((c for c in col_names if c.lower() == "low"), "Low")
    close_col = next((c for c in col_names if c.lower() == "close"), "Close")
    
    for tf_name, tf_interval in timeframe_map.items():
        out_file = os.path.join(PROC_DIR, f"{symbol}_{tf_name}.parquet")
        
        query = f"""
            SELECT 
                epoch(time_bucket(INTERVAL '{tf_interval}', CAST("{time_col}" AS TIMESTAMP WITH TIME ZONE))) AS time,
                first("{open_col}" ORDER BY "{time_col}") AS open,
                max("{high_col}") AS high,
                min("{low_col}") AS low,
                last("{close_col}" ORDER BY "{time_col}") AS close
            FROM raw_data
            WHERE "{time_col}" IS NOT NULL
            GROUP BY time
            ORDER BY time
        """
        
        print(f"  -> Aggregating {tf_name} to {out_file}...")
        con.execute(f"COPY ({query}) TO '{out_file}' (FORMAT PARQUET)")
        
    print(f"Done {symbol}.")

if __name__ == "__main__":
    for symbol in ["XAUUSD", "EURUSD", "BTCUSD"]:
        precompute_timeframes(symbol)
